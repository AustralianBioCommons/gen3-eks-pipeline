#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { SSMClient, GetParameterCommand, ParameterNotFound } from "@aws-sdk/client-ssm";
import { Gen3EksPipelineStack } from "../lib/gen3-eks-pipeline-stack";
import { Gen3EksBlueprintsStack } from "../lib/gen3-eks-blueprints-stack";
import { loadEnvConfig, loadClusterConfig } from "../lib/loadConfig";

async function getOptionalSSMParameter(parameterName: string, region?: string): Promise<string | null> {
  const ssmClient = new SSMClient({ region });

  try {
    const command = new GetParameterCommand({
      Name: parameterName,
      WithDecryption: false // Set to true if you need encrypted parameters
    });

    const response = await ssmClient.send(command);
    const value = response.Parameter?.Value?.trim();

    if (value && value.length > 0) {
      console.log(`ℹ️  Found SSM parameter '${parameterName}': ${value}`);
      return value;
    } else {
      console.log(`ℹ️  SSM parameter '${parameterName}' exists but is empty`);
      return null;
    }
  } catch (error) {
    if (error instanceof ParameterNotFound) {
      console.log(`ℹ️  SSM parameter '${parameterName}' not found`);
      return null;
    } else {
      console.error(`⚠️  Error accessing SSM parameter '${parameterName}':`, error);
      return null;
    }
  }
}

async function main() {
  const app = new cdk.App();

  // Automatically detect if running in a CI/CD pipeline
  const isPipelineEnv =
    process.env.CODEBUILD_BUILD_ID ||
    process.env.GITHUB_ACTIONS ||
    process.env.CI;

  // Default to pipeline mode if in a CI/CD environment
  const usePipeline = isPipelineEnv || app.node.tryGetContext("usePipeline") === "true";

  if (usePipeline) {
    const lookupEnv = {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: process.env.CDK_DEFAULT_REGION,
    };

    // Optional SSM parameter with fallback to default
    const DEFAULT_STACK_NAME = "Gen3-Eks-pipeline";
    const PARAM = "/gen3/blueprint-codepipeline-stackname";

    // Try to get the stack name from SSM parameter
    const ssmStackName = await getOptionalSSMParameter(PARAM, lookupEnv.region);
    const stackName = ssmStackName || DEFAULT_STACK_NAME;

    if (!ssmStackName) {
      console.log(`ℹ️  Using default stackName: ${stackName}`);
    }

    const props: cdk.StackProps & { envName: string } = {
      env: lookupEnv,
      envName: "tools",
      stackName
    };

    console.log(`🚀 Deploying EKS with CI/CD Pipeline as '${stackName}'...`);
    new Gen3EksPipelineStack().buildAsync(app, `Gen3-Eks-pipeline`, props);

  } else {
    const envName = app.node.tryGetContext("envName") || "uat";
    const envConfig = loadEnvConfig(envName);
    loadClusterConfig(envName);

    const stackName = `Gen3-Eks-Blueprint-${envName}`;
    const props: cdk.StackProps & { envName: string; project: string } = {
      env: { account: envConfig.aws.account, region: envConfig.aws.region },
      envName,
      project: "gen3",
      stackName,
    };

    console.log(`🚀 Deploying EKS without Pipeline as '${stackName}'...`);
    new Gen3EksBlueprintsStack(app, "BlueprintConstructId", props);
  }
}

main().catch((error) => {
  console.error("❌ Failed to initialize CDK app:", error);
  process.exit(1);
});