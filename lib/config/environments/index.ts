import { TeamPlatform } from "../../teams";
import { ExternalSecretsSa } from "../../teams/service-accounts.ts";
import * as clusterConfig from "../../config/cluster";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { EnvironmentConfig, RepoConfig, RepoConfigBase } from "./config-interfaces";
import * as blueprints from "@aws-quickstart/eks-blueprints";

/**
 * This module configures the Gen3 EKS environments by dynamically retrieving 
 * and constructing environment stage configurations from Parameter Store.
 * Users can customize environments by defining additional stages in the configuration.
 * The module handles integrations with AWS resources, secret management, 
 * and GitHub repository metadata for the EKS pipeline.
 *
 * - `Gen3Stage` interface: Specifies properties for each stage configuration, 
 *    including AWS account environment, VPC ID, platform role name, and add-ons.
 * - `toolsRegion`: Sets the tools region, defaulting to `AWS_DEFAULT_REGION` or `AWS_REGION` 
 *    from the environment variables, ensuring compatibility with the CodePipeline region.
 * - `getGithubRepoConfig`: Retrieves the EKS pipeline repository configuration from 
 *    Parameter Store, falling back to default values if the parameter is not found.
 * - `getStages`: Dynamically retrieves all stages from configuration in Parameter Store, 
 *    excluding the "tools" environment. Each stage is configured with its environment 
 *    settings, associated teams, external secrets, and necessary add-ons.
 * - `validateParameter`: Checks for the existence of a parameter in Parameter Store 
 *    for a specified region, throwing an error if it does not exist.
 * - `getAwsConfig`: Retrieves and decrypts AWS configurations from Parameter Store, 
 *    returning an empty object if the specified parameter does not exist.
 * - `addCredentialsOrConnectionArn`: Adds either `credentialsSecretName` or 
 *    `codeStarConnectionArn` to the provided repository configuration, ensuring 
 *    that at least one authentication method is included.
 *
 * This setup allows for flexible, region-agnostic deployments of Gen3 EKS environments.
 */


// This is the region where you would deploy the pipeline, configuration in SSM
export const toolsRegion = process.env.AWS_DEFAULT_REGION || process.env.AWS_REGION as string;

export interface Gen3Stage {
  id: string;
  env: EnvironmentConfig;
  teams?: TeamPlatform[];
  externalSecret: ExternalSecretsSa;
  addons: Array<blueprints.ClusterAddOn>; 
}

export async function getGithubRepoConfig(region: string) {
  try {
    const repoConfigParameter = await getAwsConfig(
      "/gen3/eks-blueprint-repo",
      region
    );
    if (repoConfigParameter) {
      const repoConfig = JSON.parse(repoConfigParameter) as RepoConfig;
      return repoConfig
    } else {
      throw new Error("Repo configuration not found")
    }
  } catch(error) {
    console.log(
      "** WARNING Repo information was not found in SSM Parameter store /gen3/eks-blueprint-repo **"
    );
    throw error
  }
}

// Function to dynamically retrieve the stages from configuration
export async function getStages(region: string): Promise<Gen3Stage[]> {
  const envValuesString = await getAwsConfig("/gen3/config", region);
  const envValues = JSON.parse(envValuesString);

  const stages: Gen3Stage[] = [];

  for (const [envName, envConfig] of Object.entries(envValues)) {
    if (envName === "tools") continue;

    const typedEnvConfig = envConfig as EnvironmentConfig;

    // Conditionally include teams only if platformRoleName is present
    const stage: Gen3Stage = {
      id: envName,
      env: typedEnvConfig,
      addons: clusterConfig.createClusterAddons(
        envName,
        typedEnvConfig.clusterName,
        typedEnvConfig.targetRevision,
        typedEnvConfig.workloadRepoUrl
      ),
      externalSecret: new ExternalSecretsSa(typedEnvConfig),
    };

    if (typedEnvConfig.platformRoleName) {
      stage.teams = [new TeamPlatform(typedEnvConfig)];
    }

    stages.push(stage);
  }

  return stages;
}

export async function validateParameter(parameterName: string, region: string): Promise<boolean> {
  const ssmClient = new SSMClient({ region: region});
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
export async function getAwsConfig(
  parameterName: string,
  region: string
): Promise<string> {
  const ssm = new SSMClient({ region });
  try {
    const response = await ssm.send(
      new GetParameterCommand({ Name: parameterName })
    );
        // Check if the parameter exists
    if (response.Parameter && response.Parameter.Value) {
      return response.Parameter.Value;
    } else  {
      throw Error(`Parameter ${parameterName} not found`)
    }
  } catch (error) {

    console.log(
      `Parameter ${parameterName}: ${error}.`
    );
    throw error; 
  }
}

// Function to add either `credentialsSecretName` or `codeStarConnectionArn`
export function addCredentialsOrConnectionArn(
  config: RepoConfigBase,
  options: { credentialsSecretName?: string; codeStarConnectionArn?: string }
): RepoConfig {
  if (options.credentialsSecretName) {
    return { ...config, credentialsSecretName: options.credentialsSecretName };
  } else if (options.codeStarConnectionArn) {
    return { ...config, codeStarConnectionArn: options.codeStarConnectionArn };
  } else {
    throw new Error("Either credentialsSecretName or codeStarConnectionArn must be provided.");
  }
}
