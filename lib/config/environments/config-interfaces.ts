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
  managedAddons?: ManagedAddonConfig;
  helmAddons?: HelmAddonConfig;
}

export interface ClusterConfig {
  clusters: { [key: string]: ClusterConfigDetails };
}

export interface ManagedAddonConfig {
  vpcCniVersion?: string;
  kubeProxyVersion?: string;
  coreDnsVersion?: string;
  ebsCsiVersion?: string;
}

export interface HelmAddonConfig {
  calicoChartVersion?: string;
  argoCdChartVersion?: string;
  awsLoadBalancerControllerChartVersion?: string;
  awsFluentBitChartVersion?: string;
  clusterAutoscalerChartVersion?: string;
  externalSecretsChartVersion?: string;
  metricsServerChartVersion?: string;
  secretsStoreCsiDriverChartVersion?: string;
  certManagerChartVersion?: string;
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
