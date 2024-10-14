import {
  getSecretValue,
  validateSecret,
} from "@aws-quickstart/eks-blueprints/dist/utils/secrets-manager-utils";
import * as cdk from "aws-cdk-lib";
import * as rds from "aws-cdk-lib/aws-rds";

export const Project = "cad";

export interface Gen3BuildEnv {
  name: string;
  aws: cdk.Environment;
  platformRoleName: string;
  hostname: string;
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

export const BuildEnv: BuildEnvMap = {
  uat: {
    name: "uat",
    hostname: "data.test.biocommons.org.au",
    namespace: "cad",
    aws: {
      account: "232870232581",
      region: "ap-southeast-2",
    },
    platformRoleName: "AWSReservedSSO_AWSAdministratorAccess_e857afb345dbe57a",
  },
  staging: {
    name: "staging",
    hostname: "cad.staging.biocommons.org.au",
    namespace: "cad",
    aws: {
      account: "026090528544",
      region: "ap-southeast-2",
    },
    platformRoleName: "AWSReservedSSO_AWSAdministratorAccess_3e5796e186c6a821",
  },
  prod: {
    name: "prod",
    hostname: "acdc.baker.edu.au",
    namespace: "cad",
    aws: {
      account: "690491147947",
      region: "ap-southeast-2",
    },
    platformRoleName: "AWSReservedSSO_AWSAdministratorAccess_ecbf315a4635ea96",
  },
  tools: {
    name: "tools",
    hostname: "",
    namespace: "",
    aws: {
      account: "891377157203",
      region: "ap-southeast-2",
    },
    platformRoleName: "AWSReservedSSO_AWSAdministratorAccess_ecbf315a4635ea96",
  },
};
