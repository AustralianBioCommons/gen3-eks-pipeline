import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as cr from "aws-cdk-lib/custom-resources";
import * as iam from "aws-cdk-lib/aws-iam";
import * as fs from "fs";
import * as yaml from "yaml";
import * as path from "path";
import { CfnJson } from "aws-cdk-lib";


export interface IamRolesStackProps extends cdk.StackProps {
  env: cdk.Environment
  buildEnv: any
}

export class IamRolesStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: IamRolesStackProps) {
    super(scope, id, props);

    const clusterName = props.buildEnv.clusterName
    const namespace = props.buildEnv.namespace

    // Load and parse the YAML configuration file
    const configPath = path.resolve(__dirname, 'config/gen3/services-permissions.yaml');
    const configFile = fs.readFileSync(configPath, "utf8");
    const permissionsConfig = yaml.parse(configFile);

    // Lambda function for custom resource provider
    const providerLambda = new lambda.Function(this, "FetchOidcFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromAsset("lib/oidc-resource-provider"),
      handler: "index.handler",
      environment: {
        CLUSTER_NAME: clusterName,
      },
      initialPolicy: [
        new iam.PolicyStatement({
          actions: ["eks:DescribeCluster"],
          resources: ["*"],
        }),
      ],
    });

    // Create the custom resource to fetch OIDC information
    const customResource = new cr.AwsCustomResource(this, "FetchOidc", {
      onCreate: {
        service: "Lambda",
        action: "invoke",
        parameters: {
          FunctionName: providerLambda.functionArn,
          Payload: JSON.stringify({
            ResourceProperties: {
              ClusterName: clusterName,
            },
          }),
        },
        physicalResourceId: cr.PhysicalResourceId.of(clusterName),
      },
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ["lambda:InvokeFunction"],
          resources: [providerLambda.functionArn],
        }),
      ]),
    });

    // Get OIDC issuer from custom resource response
    const oidcIssuer = customResource.getResponseField("Data.OIDC");

    // Loop through services defined in the configuration file
  for (const serviceName in permissionsConfig.services) {
    const permissions = permissionsConfig.services[serviceName];

    // Validate each permission statement
    if (!permissions || permissions.length === 0) {
      throw new Error(`No permissions specified for service ${serviceName}`);
    }

    for (const permission of permissions) {
      if (!permission.Action || permission.Action.length === 0) {
        throw new Error(
          `Permission for service ${serviceName} is missing 'Action'`
        );
      }
      if (!permission.Resource || permission.Resource.length === 0) {
        throw new Error(
          `Permission for service ${serviceName} is missing 'Resource'`
        );
      }
    }

    // Create dynamic OIDC conditions using CfnJson
    const oidcIssuer = customResource.getResponseField("Data.OIDC");

    const conditionJson = new CfnJson(this, `${clusterName}-${serviceName}-condition`, {
      value: {
        [`${oidcIssuer}:sub`]: `system:serviceaccount:${namespace}:${serviceName}`,
        [`${oidcIssuer}:aud`]: "sts.amazonaws.com",
      },
    });

    // Create the IAM role
    const role = new iam.Role(this, `${clusterName}-${serviceName}-role`, {
      assumedBy: new iam.WebIdentityPrincipal(oidcIssuer).withConditions({
        StringEquals: conditionJson,
      }),
    });

    // Attach permissions to the role
    for (const permission of permissions) {
      console.log(`Attaching permission to ${serviceName} role:`, permission);
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
