import * as cdk from 'aws-cdk-lib';
import * as events from 'aws-cdk-lib/aws-events';
import { Construct } from 'constructs';
import { Config } from "./config/environments/config-interfaces";
import * as iam from 'aws-cdk-lib/aws-iam';
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as path from 'path';
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";



export interface Gen3ConfigEventsStackProps extends cdk.StackProps {
  env: cdk.Environment; //Tools/Management Account
  envConfigs: Config
}

export class Gen3ConfigEventsStack extends cdk.Stack {
    constructor(
      scope: Construct,
      id: string,
      props?: Gen3ConfigEventsStackProps
    ) {
      super(scope, id, props);

      const environments = props?.envConfigs ?? ((): Config => {
        throw new Error("envConfigs is required.");
      })();


        // Define a Lambda function to handle stack updates when the configuration changes
      const updateLambda = new NodejsFunction(this, "UpdateLambdaFunction", {
        runtime: lambda.Runtime.NODEJS_20_X,
        entry: path.join(__dirname, "./lambda/stack-updater/update.ts"),
        handler: "handler",
        timeout: cdk.Duration.minutes(15),
        environment: {
          PIPELINE_NAME: `gen3-eks-${environments.tools.name}`,
        },
        bundling: {
          externalModules: [],
        },
      });

        // Grant the Lambda function permission to read from SSM Parameter Store
        updateLambda.addToRolePolicy(
          new iam.PolicyStatement({
            actions: ["codepipeline:StartPipelineExecution"],
            resources: [
              `arn:aws:codepipeline:${props?.env.region}:${props?.env.account}:gen3-eks-${environments.tools.name}`,
            ],
          })
        );

    // Create an EventBridge rule to detect changes in SSM Parameter Store
      Object.entries(environments).forEach(([envName]) => {
        const rule = new events.Rule(this, `${envName}ParameterStoreChangeRule`, {
          eventPattern: {
            source: ["aws.ssm"], // Specify that the event comes from SSM
            detailType: ["Parameter Store Change"], // Detect parameter store changes
            detail: {
              name: [
                `/gen3/${envName}/iamRolesConfig`,
                `/gen3/${envName}/cluster-config`
              ], // Parameter to monitor
            },
          },
        });
        // Add the update Lambda function as a target for the EventBridge rule
        rule.addTarget(new targets.LambdaFunction(updateLambda));
      });   
  }
}