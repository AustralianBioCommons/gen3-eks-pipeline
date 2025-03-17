#!/usr/bin/env node

import * as cdk from 'aws-cdk-lib';
import { Gen3EksPipelineStack } from '../lib/gen3-eks-pipeline-stack';
import { Gen3EksBlueprintsStack } from "../lib/gen3-eks-blueprints-stack";
import { loadEnvConfig, loadClusterConfig } from "../lib/loadConfig";

const app = new cdk.App();

// Get deployment mode (pipeline or not)
const usePipeline = app.node.tryGetContext("usePipeline") === "true";

// Get environment name (default: "dev")
const envName = app.node.tryGetContext("envName") || "dev";
const envConfig = loadEnvConfig(envName);
const clusterConfig = loadClusterConfig(envName);

const commonProps = {
    env: {
      account: envConfig.aws.account,
      region: envConfig.aws.region,
    },
    envName,
    project: "OMIX3",
  };
  
  if (usePipeline) {
    console.log(`Deploying EKS with CI/CD Pipeline for environment: ${envName}...`);
    new Gen3EksPipelineStack().buildAsync(app, `Gen3-Eks-Pipeline-${envName}`, commonProps);
  } else {
    console.log(`Deploying EKS without Pipeline for environment: ${envName}...`);
    new Gen3EksBlueprintsStack(app, `Gen3-Eks-Blueprint-${envName}`, commonProps);
  }
  
  app.synth();