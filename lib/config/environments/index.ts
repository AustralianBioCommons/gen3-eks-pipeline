import * as cdk from "aws-cdk-lib";
import { TeamPlatform } from "../../teams";
import { ExternalSecretsSa } from "../../teams/service-accounts.ts";
import * as clusterConfig from "../../config/cluster";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { EnvironmentConfig } from "./config-interfaces";

/**
 * This module defines the configuration for the Gen3 EKS environments, including
 * the all stages defined in configuration files. Users can customize and define their own 
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

// Project id, which can be used to easily identify your stacks
export const project = "cad"

export interface Gen3Stage {
  id: string;
  env: EnvironmentConfig;
  teams: TeamPlatform[];
  externalSecret: ExternalSecretsSa;
  addons: any; 
}

export const EksPipelineRepo = {
  gitRepoOwner: "AustralianBioCommons",
  repoUrl: "gen3-eks-pipeline",
  tagRevision: "main",
  credentialsSecretName: "github-token",
};

// Function to retrieve the environment values
export async function getStages() {
  const envValues = JSON.parse(await getAwsConfig(toolsRegion));

  // Define environment stages
  const stages: Gen3Stage[] = [
    {
      id: "uat",
      env: envValues.uat,
      teams: [new TeamPlatform(envValues.uat)],
      externalSecret: new ExternalSecretsSa(envValues.uat),
      addons: clusterConfig.createClusterAddons(
            "uat",  // Env
            envValues.uat.clusterName, // cluster name
            "testing" //Workloads repo tag/branch
  
      ),
    },
    {
      id: "staging",
      env: envValues.staging,
      teams: [new TeamPlatform(envValues.staging)],
      externalSecret: new ExternalSecretsSa(envValues.staging),
      addons: clusterConfig.createClusterAddons(
            "staging",
            envValues.staging.clusterName,
            "main" //Workloads repo tag/branch
          )
    },
    {
      id: "prod",
      env: envValues.prod,
      teams: [new TeamPlatform(envValues.prod)],
      externalSecret: new ExternalSecretsSa(envValues.prod),
      addons: clusterConfig.createClusterAddons(
        "prod",
        envValues.prod.clusterName,
        "main" //Workloads repo tag/branch
      ),
    },
  ];

  return stages;
}

export async function validateParameter(parameterName: string): Promise<boolean> {
  const ssmClient = new SSMClient({ region: toolsRegion });
  try {
    const command = new GetParameterCommand({ Name: parameterName });
    await ssmClient.send(command);
    return true;
  } catch (error) {
    if (error instanceof Error) {
      console.log(`Error for Parameter: ${parameterName}, ${error.name}`)
      throw error;
    }
    throw error;
  }
}

// Function to retrieve aws  configuration from Parameter Store
export async function getAwsConfig(region: string) {
  const paramName = "/gen3/config"; 
  const command = new GetParameterCommand({
    Name: paramName,
    WithDecryption: true,
  });

  try {
    const ssmClient = new SSMClient({ region });
    const response = await ssmClient.send(command)
    return response.Parameter?.Value || "{}";
  } catch (error) {
    throw new Error(`Error retrieving parameter: ${error}`);
  }
}