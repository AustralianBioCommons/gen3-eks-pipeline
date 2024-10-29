import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import * as yaml from "yaml";
import { CfnJson } from "aws-cdk-lib";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { EnvironmentConfig } from "./config/environments/config-interfaces";
import { OidcIssuerStack } from "./oidc-issuer-stack";

export interface IamRolesStackProps extends cdk.StackProps {
  env: cdk.Environment;
  buildEnv: EnvironmentConfig;
  oidcIssuerStack: OidcIssuerStack;
}

interface PermissionsConfig {
  [serviceName: string]: {
    Action: string[];
    Resource: string[];
  }[];
}

export class IamRolesStack extends cdk.Stack {
  public readonly env: cdk.Environment;

  constructor(scope: Construct, id: string, props: IamRolesStackProps) {
    super(scope, id, props);

    this.addDependency(props.oidcIssuerStack);

    this.env = props.buildEnv.aws;

    const namespace = props.buildEnv.namespace;
    const oidcIssuerParameter = `/gen3/${props.buildEnv.name}/oidcIssuer`;
    const permissionsConfigParameter = `/gen3/${props.buildEnv.name}/iamRolesConfig`;

    // Retrieve oidcIssuer and permissionsConfig synchronously
    const oidcIssuer = ssm.StringParameter.valueForStringParameter(
      this,
      oidcIssuerParameter
    );

    // Helper function to fetch IAM roles permissions configuration from SSM
    const fetchPermissionsConfig = async (
      parameterName: string
    ): Promise<PermissionsConfig> => {
      const ssmClient = new SSMClient({ region: this.region });
      const command = new GetParameterCommand({
        Name: parameterName,
        WithDecryption: true,
      });
      const response = await ssmClient.send(command);
      const parameterValue = response.Parameter?.Value;
      if (!parameterValue)
        throw new Error("Parameter value is undefined or empty.");
      return yaml.parse(parameterValue) as PermissionsConfig;
    };

    fetchPermissionsConfig(permissionsConfigParameter).then((permissionsConfig) => {
      for (const serviceName in permissionsConfig) {
        const permissions = permissionsConfig[serviceName];

        const conditionsJson = new CfnJson(
          this,
          `ConditionsJson-${serviceName}`,
          {
            value: {
              [`${oidcIssuer}:aud`]: "sts.amazonaws.com",
              [`${oidcIssuer}:sub`]: `system:serviceaccount:${namespace}:${serviceName}-sa`,
            },
          }
        );

        const principal = new iam.FederatedPrincipal(
          `arn:aws:iam::${this.account}:oidc-provider/${oidcIssuer}`,
          {},
          "sts:AssumeRoleWithWebIdentity"
        );

        const principalWithConditions = new iam.PrincipalWithConditions(
          principal,
          {
            StringEquals: conditionsJson,
          }
        );

        const role = new iam.Role(
          this,
          `${props.buildEnv.name}-${serviceName}-service-role`,
          {
            assumedBy: principalWithConditions,
            roleName: `${props?.buildEnv.name}-${serviceName}-service-role`,
            description: "Gen3 Services",
          }
        );

        for (const permission of permissions) {
          role.addToPolicy(
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: permission.Action,
              resources: permission.Resource,
            })
          );
        }
      }
    }).catch((error) => {
      console.error("Error fetching permissions config:", error);
    });
  }
}
