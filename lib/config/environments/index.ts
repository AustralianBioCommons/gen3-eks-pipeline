import * as cdk from "aws-cdk-lib";

export const Project = "cad";

export const toolsRegion = "ap-southeast-2"


export interface Gen3BuildEnv {
  name: string;
  aws: cdk.Environment;
  platformRoleName: string;
  vpcId: string;
  namespace: string;
}

interface BuildEnvMap {
  [key: string]: Gen3BuildEnv;
}

export const EksPipelineRepo = {
  gitRepoOwner: "AustralianBioCommons",
  repoUrl: "gen3-eks-pipeline",
  tagRevision: "main",
  credentialsSecretName: "github-token",
};
