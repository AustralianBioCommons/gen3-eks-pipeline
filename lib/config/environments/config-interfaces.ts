//TODO: create library for interfaces/types, to avoid code repetition
export interface AwsConfig {
  account: string;
  region: string;
}

export interface EnvironmentConfig {
  name: string;
  clusterName: string;
  aws: AwsConfig;
  platformRoleName?: string;
  vpcId: string;
  namespace: string;
  project: string;
  hostname: string;
  clusterSubnets?: string[];
  nodeGroupSubnets?: string[];
  workloadRepoUrl: string;
  targetRevision: string;
  argocdServiceType?: string;
}

export interface Config {
  [key: string]: EnvironmentConfig;
}

export interface IamRoleConfig {
  serviceName: string;
  policies: string[];
}

export interface IamRolesConfig {
  services: { [key: string]: { [key: string]: IamRoleConfig[] } };
}

export interface ClusterConfigDetails {
  version: string;
  minSize: number;
  maxSize: number;
  desiredSize: number;
  diskSize: number;
  amiReleaseVersion: string;
  instanceType: string;
  tags: Record<string, string>;
}

export interface ClusterConfig {
  clusters: { [key: string]: ClusterConfigDetails };
}

export interface RepoConfigBase {
  gitRepoOwner: string;
  repoUrl: string;
  targetRevision: string;
}

export type RepoConfig =
  | (RepoConfigBase & {
      codeStarConnectionArn: string;
      credentialsSecretName?: undefined;
    })
  | (RepoConfigBase & {
      credentialsSecretName: string;
      codeStarConnectionArn?: undefined;
    });