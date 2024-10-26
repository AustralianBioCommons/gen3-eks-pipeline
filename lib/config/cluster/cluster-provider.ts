import * as blueprints from "@aws-quickstart/eks-blueprints";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import {
  CapacityType,
  EndpointAccess,
  KubernetesVersion,
  NodegroupAmiType,
} from "aws-cdk-lib/aws-eks";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

// Create an SSM client
const ssmClient = new SSMClient({});

// Generic cluster provider function
export async function gen3ClusterProvider(
  env: string,
  clusterName: string,
  vpcSubnets?: ec2.SubnetSelection,
  nodeGroupSubnets?: ec2.SubnetSelection
) {
  const clusterConfig = await getClusterConfig(env);

  const versionString = clusterConfig["version"];
  const version = getKubernetesVersion(versionString);

  return new blueprints.GenericClusterProvider({
    version: version,
    clusterName: clusterName,
    endpointAccess: EndpointAccess.PRIVATE,
    vpcSubnets: vpcSubnets ? [vpcSubnets] : undefined,
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
        nodeGroupSubnets: nodeGroupSubnets || undefined,
        tags: clusterConfig.tags,
      },
    ],
  });
}

// Function to retrieve cluster configuration from Parameter Store
async function getClusterConfig(env: string) {
  const paramName = `/gen3/${env}/cluster-config`; 
  const command = new GetParameterCommand({
    Name: paramName,
    WithDecryption: true,
  });

  try {
    const response = await ssmClient.send(command);
    return JSON.parse(response.Parameter?.Value || "{}");
  } catch (error) {
    throw new Error(`Error retrieving parameter: ${error}`);
  }
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
