import * as cdk from "aws-cdk-lib";
import { TeamPlatform } from "../../teams";
import {
  getSecretValue,
} from "@aws-quickstart/eks-blueprints/dist/utils/secrets-manager-utils";
import { ExternalSecretsSa } from "../../teams/service-accounts.ts";
import * as clusterConfig from "../../config/cluster";

/**
 * This module defines the configuration for the Gen3 EKS environments, including
 * the UAT, staging, and production stages. Users can customize and define their own 
 * environments within this module. It imports necessary libraries and utilities for 
 * handling AWS resources and secret management.
 *
 * The `Gen3BuildEnv` interface specifies the required properties for the build 
 * environment, including the AWS account environment, VPC ID, and platform role name.
 * 
 * The `EksPipelineRepo` object contains metadata for the EKS pipeline repository,
 * such as the repository owner, URL, and the name of the GitHub secret used for
 * authentication.
 *
 * The `getStages` function retrieves the environment values from AWS Secrets Manager,
 * parses them, and constructs an array of environment stage configurations. Each 
 * stage configuration includes its ID, environment settings, associated teams, 
 * external secret configurations, and any required add-ons from the cluster configuration.
 *
 * The defined stages (UAT, staging, and production) are returned for further use 
 * in the deployment process. You can modify these to suit your requirements.
 */


export const toolsRegion = "ap-southeast-2"

// Project id, which can be used easily identify your stacks
export const project = "cad"

export interface Gen3BuildEnv {
  name: string;
  clusterName: string;
  aws: cdk.Environment;
  platformRoleName: string;
  vpcId: string;
  namespace: string;
}

export const EksPipelineRepo = {
  gitRepoOwner: "AustralianBioCommons",
  repoUrl: "gen3-eks-pipeline",
  tagRevision: "main",
  credentialsSecretName: "github-token",
};

// Function to retrieve the environment values
export async function getStages() {
  const envValues = JSON.parse(
    await getSecretValue("gen3-env-credentials", toolsRegion)
  );

  // Define environment stages
  const stages = [
    {
      id: "uat",
      env: envValues.uat,
      teams: [new TeamPlatform(envValues.uat)],
      externalSecret: new ExternalSecretsSa(envValues.uat),
      addons: clusterConfig.uatClusterAddons,
    },
    {
      id: "staging",
      env: envValues.staging,
      teams: [new TeamPlatform(envValues.staging)],
      externalSecret: new ExternalSecretsSa(envValues.staging),
      addons: clusterConfig.stagingClusterAddons,
    },
    {
      id: "prod",
      env: envValues.prod,
      teams: [new TeamPlatform(envValues.prod)],
      externalSecret: new ExternalSecretsSa(envValues.prod),
      addons: clusterConfig.prodClusterAddons,
    },
  ];

  return stages;
}