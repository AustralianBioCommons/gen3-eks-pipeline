import * as fs from "fs";
import * as path from "path";

export interface EnvConfig {
  name: string;
  clusterName: string;
  aws: {
    account: string;
    region: string;
  };
  platformRoleName?: string;
  vpcId?: string;
  namespace?: string;
  clusterSubnets?: string[];
  nodeGroupSubnets?: string[];
  workloadRepoUrl?: string;
  targetRevision?: string;
}

export interface ClusterConfig {
  version: string;
  minSize: number;
  maxSize: number;
  desiredSize: number;
  diskSize: number;
  amiReleaseVersion: string;
  instanceType: string;
  tags: Record<string, string>;
}

const filePath = path.resolve(__dirname, "config");

// Load environment configuration from `envConfig.json`
export function loadEnvConfig(envName: string): EnvConfig {
  const envConfigJson = fs.readFileSync(`${filePath}/envConfig.json`, "utf8");
  const envConfig = JSON.parse(envConfigJson);

  if (!envConfig[envName]) {
    throw new Error(`Environment "${envName}" not found in envConfig.json`);
  }
  return envConfig[envName] as EnvConfig;
}

// Load cluster configuration from `clusterConfig.json`
export function loadClusterConfig(envName: string): ClusterConfig {
  const clusterConfigJson = fs.readFileSync(`${filePath}/clusterConfig.json`, "utf8");
  const clusterConfig = JSON.parse(clusterConfigJson);

  if (!clusterConfig.clusters[envName]) {
    throw new Error(`Cluster config for "${envName}" not found in clusterConfig.json`);
  }
  return clusterConfig.clusters[envName] as ClusterConfig;
}
