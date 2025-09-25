#!/usr/bin/env node

import * as cdk from "aws-cdk-lib";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { Gen3EksPipelineStack } from "../lib/gen3-eks-pipeline-stack";
import { Gen3EksBlueprintsStack } from "../lib/gen3-eks-blueprints-stack";
import { loadEnvConfig, loadClusterConfig } from "../lib/loadConfig";

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
  const lookup = new cdk.Stack(app, "Lookup-For-SSM", { env: lookupEnv });
  // Try to read SSM parameter for stackName, fallback if not found
  // For backward compatibility, we use a default stack name if the parameter is not set
  const DEFAULT_STACK_NAME = "Gen3-Eks-pipeline";
  const PARAM = "/gen3/blueprint-codepipeline-stackname";

  // Read once
  const raw = ssm.StringParameter.valueFromLookup(lookup, PARAM);

  // Helper: detect CDK’s placeholder
  const isDummy = (v?: string) =>
    !v || v.trim() === "" || v.startsWith("dummy-value-for-");

  let stackName = DEFAULT_STACK_NAME;
  if (!isDummy(raw)) {
    stackName = raw.trim();
    console.log(`ℹ️ Using stackName from SSM: ${stackName}`);
  } else {
    console.log(`⚠️ SSM param missing/unresolvable — falling back to: ${stackName}`);
  }

  const props: cdk.StackProps & { envName: string } = {
    env: lookupEnv,
    envName: "tools",
    stackName
  };

  console.log(`🚀 Deploying EKS with CI/CD Pipeline...`);
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

  console.log(`🚀 Deploying EKS without Pipeline as ${stackName}...`);
  new Gen3EksBlueprintsStack(app, "BlueprintConstructId", props);
}