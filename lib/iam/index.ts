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
      "codebuild:BatchGetBuilds",
      "codebuild:StartBuild",
      "codebuild:StopBuild",
      "codestar-connections:UseConnection",
      "sts:AssumeRole",
      "secretsmanager:GetSecretValue",
      "secretsmanager:DescribeSecret",
      "ssm:GetParameter",
      "cloudformation:CreateStack",
      "cloudformation:UpdateStack",
      "cloudformation:DeleteStack",
      "eks:DescribeAddonVersions",
      "eks:DescribeCluster",
      "eks:ListAddons",
      "eks:DescribeAddon",     
    ],
    resources: ["*"], // Optionally refine specific resources where possible.
  }),

  new iam.PolicyStatement({
    effect: iam.Effect.ALLOW,
    actions: ["sts:GetServiceBearerToken"],
    resources: ["*"], // Optionally refine specific resources where possible.
  }),
];
