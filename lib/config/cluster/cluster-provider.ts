import * as blueprints from "@aws-quickstart/eks-blueprints";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import {
  CapacityType,
  EndpointAccess,
  KubernetesVersion,
  NodegroupAmiType,
} from "aws-cdk-lib/aws-eks";
import * as yaml from "yaml";
import * as fs from "fs";
import * as path from "path";

// Load and parse the YAML configuration file
const configPath = path.resolve(__dirname, "config.yaml");
const configFile = fs.readFileSync(configPath, "utf8");
const config = yaml.parse(configFile);

// Generic cluster provider function
export function gen3ClusterProvider(
  env: string,
  clusterName: string,
  vpcSubnets: ec2.SubnetSelection,
  nodeGroupSubnets: ec2.SubnetSelection,
) {
  const clusterConfig = config.clusters[env];

  if (!clusterConfig) {
    throw new Error(`No configuration found for environment: ${env}`);
  }

  const versionString = clusterConfig["version"]

  const version = getKubernetesVersion(versionString); ;

  return new blueprints.GenericClusterProvider({
    version: version,
    clusterName: clusterName,
    endpointAccess: EndpointAccess.PRIVATE,
    vpcSubnets: [vpcSubnets],
    managedNodeGroups: [
      {
        id: `mng-${env}`,
        minSize: clusterConfig.minSize,
        maxSize: clusterConfig.maxSize,
        desiredSize: clusterConfig.desiredSize,
        diskSize: clusterConfig.diskSize,
        instanceTypes: [new ec2.InstanceType(clusterConfig.instanceType)],
        amiType: NodegroupAmiType.AL2_X86_64,
        nodeGroupCapacityType: CapacityType.ON_DEMAND,
        amiReleaseVersion: clusterConfig.amiReleaseVersion,
        nodeGroupSubnets,
        tags: clusterConfig.tags,
      },
    ],
  });
}

// Function to map version string to KubernetesVersion enum
function getKubernetesVersion(version: string): KubernetesVersion {
    switch (version) {
        case "1.30":
            return KubernetesVersion.V1_30;
        case "1.29":
            return KubernetesVersion.V1_29;
        case "1.28":
            return KubernetesVersion.V1_28;
        // Add more cases as needed
        default:
            throw new Error(`Unsupported Kubernetes version: ${version}`);
    }
}
