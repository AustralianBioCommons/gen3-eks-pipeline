// oidc-issuer-stack.ts
import * as cdk from "aws-cdk-lib";
import * as cr from "aws-cdk-lib/custom-resources";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as path from "path";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";
import { CfnOutput } from "aws-cdk-lib";

export interface OidcIssuerStackProps extends cdk.StackProps {
  env: cdk.Environment;
  clusterName: string;
  namespace: string;
  oidcIssuerParameter: string;
  refreshToken?: string;
}

export class OidcIssuerStack extends cdk.Stack {
  public readonly oidcIssuer: string;
  public readonly env: cdk.Environment;

  constructor(scope: Construct, id: string, props: OidcIssuerStackProps) {
    super(scope, id, props);

    const { clusterName, oidcIssuerParameter } = props;
    this.env = props.env

    const envKey = `${props.namespace}-${props.clusterName}`;

    // Lambda function to fetch OIDC issuer and set in SSM
    const fetchOidcIssuerLambda = new NodejsFunction(
      this,
      "FetchOidcIssuerFunction",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.minutes(2),
        entry: path.join(
          __dirname,
          "./lambda/oidc-resource-provider/fetch-oidc-issuer.ts"
        ),
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

    // Grant permissions for Lambda to write to SSM
    fetchOidcIssuerLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "ssm:PutParameter",
          "eks:DescribeCluster",
          "ssm:GetParameter",
          "ssm:GetParameters",
        ],
        resources: [
          `arn:aws:ssm:${this.region}:${this.account}:parameter${oidcIssuerParameter}`,
          `arn:aws:eks:${this.region}:${this.account}:cluster/${clusterName}`,
        ],
        effect: iam.Effect.ALLOW,
      })
    );

    // Custom resource to invoke Lambda and fetch OIDC issuer
    const oidcIssuerResource = new cr.AwsCustomResource(
      this,
      "OidcIssuerResource",
      {
        onUpdate: {
          service: "Lambda",
          action: "invoke",
          parameters: {
            FunctionName: fetchOidcIssuerLambda.functionName,
            Payload: JSON.stringify({
              ResourceProperties: {
                ClusterName: clusterName,
              },
            }),
          },
          physicalResourceId: cr.PhysicalResourceId.of(`Gen3Oidc-${envKey}-${props.refreshToken ?? "static"}`),
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

    // Export the OIDC issuer value
    this.oidcIssuer = oidcIssuerResource.getResponseField("Payload");

    new CfnOutput(this, "OidcIssuerOutput", {
      value: this.oidcIssuer,
      description: "The OIDC issuer fetched by the Lambda function.",
    });
  }
}
