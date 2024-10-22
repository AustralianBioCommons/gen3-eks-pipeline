import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as cr from "aws-cdk-lib/custom-resources";
import * as iam from "aws-cdk-lib/aws-iam";
import { CfnJson } from "aws-cdk-lib";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import * as yaml from "yaml";
import * as path from 'path';
import { EnvironmentConfig } from "./config/environments/config-interfaces";

/**
 * This stack automates the creation and updating of IAM roles in an EKS cluster, 
 * enabling OIDC-based role assumptions for Kubernetes service accounts, 
 * and integrates with AWS services like SSM, Lambda, and 
 * EventBridge to ensure dynamic, event-driven updates to IAM roles.
 */
export interface IamRolesStackProps extends cdk.StackProps {
  env: cdk.Environment;
  buildEnv: EnvironmentConfig;
}

export class IamRolesStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: IamRolesStackProps) {
    super(scope, id, props);

    // Extracting cluster name and namespace from the environment props
    const clusterName = props.buildEnv.clusterName;
    const namespace = props.buildEnv.namespace;

    // Define SSM Parameter Store path for retrieving IAM roles configuration
    const permissionsConfigParameter = `/gen3/${props.buildEnv.name}/iamRolesConfig`;

    // Initialize SSM client from AWS SDK v3 to interact with Parameter Store
    const ssmClient = new SSMClient({ region: this.region });

    // Function to fetch IAM roles configuration from SSM Parameter Store
    const fetchPermissionsConfig = async (parameterName: string) => {
      const command = new GetParameterCommand({
        Name: parameterName,
        WithDecryption: true, // Ensure values are decrypted if stored as encrypted
      });

      try {
        // Send the command to fetch the parameter
        const response = await ssmClient.send(command);
        const parameterValue = response.Parameter?.Value;
        if (parameterValue) {
          // Parse the fetched YAML configuration
          return yaml.parse(parameterValue);
        } else {
          throw new Error("Parameter value is undefined or empty.");
        }
      } catch (error) {
        console.error("Error fetching parameter:", error);
        throw error;
      }
    };

    // Fetch IAM roles permissions configuration from SSM Parameter Store
    const permissionsConfig = fetchPermissionsConfig(
      permissionsConfigParameter
    );

    // Define a Lambda function that acts as a custom resource provider
    const providerLambda = new NodejsFunction(this, "FetchOidcFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(
        __dirname,
        "./lambda/oidc-resource-provider/fetch-oidc-issuer.ts"
      ),
      handler: "handler",
      timeout: cdk.Duration.minutes(15),
      environment: {
        CLUSTER_NAME: clusterName,
      },
      bundling: {
        externalModules: [],
      },
      initialPolicy: [
        new iam.PolicyStatement({
          actions: ["eks:DescribeCluster"],
          resources: ["*"],
        }),
      ],
    });

    // Create a custom resource to fetch OIDC information for the cluster
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
          actions: ["lambda:InvokeFunction"], // Grant invoke permissions for the Lambda function
          resources: [providerLambda.functionArn],
        }),
      ]),
    });

    // Once the permissions configuration is fetched, process the services
    permissionsConfig.then((config) => {
      // Iterate through the services defined in the IAM roles configuration
      for (const serviceName in config.services) {
        const permissions = config.services[serviceName];

        // Validate that permissions are defined for each service
        if (!permissions || permissions.length === 0) {
          throw new Error(
            `No permissions specified for service ${serviceName}`
          );
        }

        // Validate each permission to ensure actions and resources are defined
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

        // Create dynamic OIDC conditions using CfnJson for WebIdentityPrincipal
        const oidcIssuer = customResource.getResponseField("Data.OIDC");

        const conditionJson = new CfnJson(
          this,
          `${clusterName}-${serviceName}-condition`,
          {
            value: {
              [`${oidcIssuer}:sub`]: `system:serviceaccount:${namespace}:${serviceName}`, // Service account subject
              [`${oidcIssuer}:aud`]: "sts.amazonaws.com", // Audience for AWS STS
            },
          }
        );

        // Create an IAM role with conditions based on OIDC identity
        const role = new iam.Role(this, `${clusterName}-${serviceName}-role`, {
          assumedBy: new iam.WebIdentityPrincipal(oidcIssuer).withConditions({
            StringEquals: conditionJson, // Attach the OIDC conditions to the role
          }),
        });

        // Attach permissions to the IAM role
        for (const permission of permissions) {
          console.log(
            `Attaching permission to ${serviceName} role:`,
            permission
          );
          role.addToPolicy(
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW, 
              actions: permission.Action, 
              resources: permission.Resource,
            })
          );
        }
      }
    });

    // Define a Lambda function to handle IAM role updates when the configuration changes
    const updateLambda = new NodejsFunction(this, "UpdateLambdaFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, "./lambda/iam-roles/iam-roles.ts"),
      handler: "handler",
      timeout: cdk.Duration.minutes(15),
      environment: {
        CLUSTER_NAME: clusterName,
      },
      bundling: {
        externalModules: []
      },
    });

    // Grant the Lambda function permission to read from SSM Parameter Store
    updateLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["ssm:GetParameter"], // Allow reading the parameter
        resources: ["*"], // Adjust this to the specific SSM parameter if needed
      })
    );

    // Create an EventBridge rule to detect changes in SSM Parameter Store
    const rule = new events.Rule(this, "ParameterStoreChangeRule", {
      eventPattern: {
        source: ["aws.ssm"], // Specify that the event comes from SSM
        detailType: ["Parameter Store Change"], // Detect parameter store changes
        detail: {
          name: [permissionsConfigParameter], // Specify the parameter to monitor
        },
      },
    });

    // Add the update Lambda function as a target for the EventBridge rule
    rule.addTarget(new targets.LambdaFunction(updateLambda));
  }
}
