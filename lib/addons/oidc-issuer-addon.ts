// oidc-issuer-addon.ts
import * as blueprints from "@aws-quickstart/eks-blueprints";
import * as cdk from "aws-cdk-lib";
import * as cr from "aws-cdk-lib/custom-resources";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as path from "path";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";

export class OidcIssuerAddOn implements blueprints.ClusterAddOn {
  constructor(
    private envKey: string,
    private oidcIssuerParameter: string,
    private eksEnv: cdk.Environment,
    private concreteClusterName: string
  ) { }

  deploy(clusterInfo: blueprints.ClusterInfo): void {
    const stack = clusterInfo.cluster.stack;
    const envKey = this.envKey;

    // Create Lambda directly in the cluster stack scope (not a new Stack)
    const fetchOidcIssuerLambda = new NodejsFunction(
      stack,
      `${envKey}-FetchOidcIssuerFunction`,
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.minutes(2),
        entry: path.join(__dirname, "../lambda/oidc-resource-provider/fetch-oidc-issuer.ts"),
        handler: "handler",
        environment: {
          ENV_KEY: envKey,
        },
        bundling: {
          minify: true,
        },
        logRetention: logs.RetentionDays.ONE_WEEK,
      }
    );

    fetchOidcIssuerLambda.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "ssm:PutParameter",
          "ssm:GetParameter",
          "ssm:GetParameters",
          "ssm:DeleteParameter",
          "ssm:AddTagsToResource",
        ],
        resources: [
          stack.formatArn({
            service: "ssm",
            resource: "parameter",
            resourceName: `gen3/*`,
          }),
        ],
      })
    );

    fetchOidcIssuerLambda.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["eks:DescribeCluster"],
        resources: [
          stack.formatArn({
            service: "eks",
            resource: "cluster",
            resourceName: this.concreteClusterName,
          }),
        ],
      })
    );

    new cr.AwsCustomResource(
      stack,
      `${envKey}-OidcIssuerResource`,
      {
        onCreate: {
          service: "Lambda",
          action: "invoke",
          parameters: {
            FunctionName: fetchOidcIssuerLambda.functionName,
            Payload: JSON.stringify({
              ResourceProperties: {
                ClusterName: this.concreteClusterName,
              },
            }),
          },
          physicalResourceId: cr.PhysicalResourceId.of(
            `Gen3Oidc-${envKey}`
          ),
        },
        onUpdate: {
          service: "Lambda",
          action: "invoke",
          parameters: {
            FunctionName: fetchOidcIssuerLambda.functionName,
            Payload: JSON.stringify({
              ResourceProperties: {
                ClusterName: this.concreteClusterName,
              },
            }),
          },
          physicalResourceId: cr.PhysicalResourceId.of(
            `Gen3Oidc-${envKey}`
          ),
        },
        policy: cr.AwsCustomResourcePolicy.fromStatements([
          new iam.PolicyStatement({
            actions: ["lambda:InvokeFunction"],
            resources: [fetchOidcIssuerLambda.functionArn],
            effect: iam.Effect.ALLOW,
          }),
        ]),
      }
    );
  }
}