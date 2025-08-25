import * as blueprints from "@aws-quickstart/eks-blueprints";
import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import { CfnJson } from "aws-cdk-lib";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import * as yaml from "yaml";

interface PermissionsConfig {
  [serviceName: string]: {
    Action: string[];
    Resource: string[];
  }[];
}

export class IamRolesAddOn implements blueprints.ClusterAddOn {
  private readonly namespace: string;
  private readonly oidcIssuerParameter: string;
  private readonly permissionsConfigParameter: string;
  private readonly envName: string;

  constructor(envName: string, namespace: string) {
    this.namespace = namespace;
    this.envName = envName;
    this.oidcIssuerParameter = `/gen3/${namespace}-${envName}/oidcIssuer`;
    this.permissionsConfigParameter = `/gen3/${namespace}-${envName}/iamRolesConfig`;
  }

  async deploy(clusterInfo: blueprints.ClusterInfo): Promise<Construct> {
    const stack = clusterInfo.cluster.stack;
    const account = stack.account;
    const region = stack.region;
    const namespace = this.namespace;

    // Fetch OIDC issuer URL from SSM Parameter Store
    const oidcIssuer = ssm.StringParameter.valueForStringParameter(
      stack,
      this.oidcIssuerParameter
    );

    // Fetch IAM permissions config
    const permissionsConfig = await this.fetchPermissionsConfig(region);

    // IAM Role Stack
    class IamRolesStack extends cdk.NestedStack {
      constructor(scope: Construct, id: string, namespace: string) {
        super(scope, id); 

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
            `arn:aws:iam::${account}:oidc-provider/${oidcIssuer}`,
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
            `${namespace}-${serviceName}-service-role`,
            {
              assumedBy: principalWithConditions,
              roleName: `${namespace}-${serviceName}-service-role`,
              description: "IAM role for Gen3 services",
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
      }
    }

    // Deploy IAM Roles Stack and return it
    return new IamRolesStack(stack, "IamRolesStack", namespace);
  }

  // Helper function to fetch permissions config from SSM
  private async fetchPermissionsConfig(
    region: string
  ): Promise<PermissionsConfig> {
    const ssmClient = new SSMClient({ region });
    const command = new GetParameterCommand({
      Name: this.permissionsConfigParameter,
      WithDecryption: true,
    });

    const response = await ssmClient.send(command);
    const parameterValue = response.Parameter?.Value;
    if (!parameterValue) {
      throw new Error(
        "Permissions config parameter value is undefined or empty."
      );
    }

    return yaml.parse(parameterValue) as PermissionsConfig;
  }
}
