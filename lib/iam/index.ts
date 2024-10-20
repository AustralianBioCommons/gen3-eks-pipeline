import * as iam from "aws-cdk-lib/aws-iam";

// Define an array of IAM policy statements for CodePipeline permissions
export const buildPolicyStatements = [
  new iam.PolicyStatement({
    effect: iam.Effect.ALLOW,
    actions: [
      "codeartifact:GetAuthorizationToken",
      "codeartifact:GetRepositoryEndpoint",
      "codeartifact:ReadFromRepository",
      "cloudformation:DescribeStacks",
      "cloudformation:DescribeStacks",
      "codebuild:BatchGetBuilds",
      "codebuild:StartBuild",
      "codebuild:StopBuild",
      "codestar-connections:UseConnection",
      "sts:AssumeRole",
      "secretsmanager:GetSecretValue",
      "secretsmanager:DescribeSecret",
      "cloudformation:*", // Use with caution; this grants permissions for all CloudFormation actions, consider restricting as needed
    ],
    resources: ["*"],
  }),

  new iam.PolicyStatement({
    effect: iam.Effect.ALLOW,
    actions: ["sts:GetServiceBearerToken"],
    resources: ["*"],
  }),
];
