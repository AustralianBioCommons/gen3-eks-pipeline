import * as blueprints from "@aws-quickstart/eks-blueprints";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import {
  CapacityType,
  EndpointAccess,
  KubernetesVersion,
  NodegroupAmiType,
  TaintEffect,
} from "aws-cdk-lib/aws-eks";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import {
  ClusterConfigDetails,
  NodeGroupTaintConfig,
} from "../environments/config-interfaces";

/**
 * Builds the EKS cluster provider from a pre-fetched cluster config:
 *
 * - the general-purpose Gen3 managed node group. Its logical id defaults
 *   to `mng-<env>-1` (the id deployed by the iam-roles-removal branch);
 *   envs deployed from main/v1.3.3 must set
 *   `generalNodeGroupId: "mng-<env>-general"` in their SSM cluster-config
 *   or the node group will be REPLACED; and
 * - an optional dedicated workspace managed node group (additive; only
 *   created when `workspaceNodeGroup` is present and not disabled).
 */
export function buildClusterProviderFromConfig(
  env: string,
  clusterName: string,
  clusterConfig: ClusterConfigDetails,
  vpcSubnets?: ec2.SubnetSelection,
  nodeGroupSubnets?: ec2.SubnetSelection
) {
  validateClusterConfig(clusterConfig);

  const version = getKubernetesVersion(clusterConfig.version);

  const generalNodeGroupId =
    clusterConfig.generalNodeGroupId ?? `mng-${env.toLowerCase()}-1`;

  const managedNodeGroups: blueprints.ManagedNodeGroup[] = [
    // General node group: kept byte-for-byte compatible with what the
    // iam-roles-removal branch deployed (aside from the configurable id).
    {
      id: generalNodeGroupId,
      minSize: clusterConfig.minSize,
      maxSize: clusterConfig.maxSize,
      desiredSize: clusterConfig.desiredSize,
      instanceTypes: [new ec2.InstanceType(clusterConfig.instanceType)],
      amiType: NodegroupAmiType.AL2023_X86_64_STANDARD,
      nodeGroupCapacityType: CapacityType.ON_DEMAND,
      nodeGroupSubnets: nodeGroupSubnets || undefined,
      launchTemplate: createLaunchTemplate(clusterConfig.diskSize),
      amiReleaseVersion: clusterConfig.amiReleaseVersion,
      tags: clusterConfig.tags,
    },
  ];

  const workspaceConfig = clusterConfig.workspaceNodeGroup;

  if (workspaceConfig && workspaceConfig.enabled !== false) {
    managedNodeGroups.push({
      id: `mng-${env.toLowerCase()}-workspace`,
      minSize: workspaceConfig.minSize,
      maxSize: workspaceConfig.maxSize,
      desiredSize: workspaceConfig.desiredSize,
      amiReleaseVersion: workspaceConfig.amiReleaseVersion,
      instanceTypes: workspaceConfig.instanceTypes.map(
        (instanceType) => new ec2.InstanceType(instanceType)
      ),

      amiType: NodegroupAmiType.AL2023_X86_64_STANDARD,

      nodeGroupCapacityType:
        workspaceConfig.capacityType === "SPOT"
          ? CapacityType.SPOT
          : CapacityType.ON_DEMAND,

      nodeGroupSubnets: nodeGroupSubnets || undefined,

      labels: {
        workload: "workspace",
        ...(workspaceConfig.labels ?? {}),
      },

      taints: (
        workspaceConfig.taints ?? [
          {
            key: "workload",
            value: "workspace",
            effect: "NO_SCHEDULE",
          },
        ]
      ).map((taint) => ({
        key: taint.key,
        value: taint.value,
        effect: mapTaintEffect(taint.effect as NodeGroupTaintConfig["effect"]),
      })),

      launchTemplate: createLaunchTemplate(workspaceConfig.diskSize),

      tags: {
        ...(workspaceConfig.tags ?? {}),
        NodeGroup: "workspace",
      },
    });
  }

  return new blueprints.GenericClusterProvider({
    version: version,
    clusterName: clusterName,
    endpointAccess: EndpointAccess.PRIVATE,
    vpcSubnets: vpcSubnets ? [vpcSubnets] : undefined,
    managedNodeGroups,
  });
}

function createLaunchTemplate(
  diskSize: number
): blueprints.LaunchTemplateProps {
  return {
    blockDevices: [
      {
        deviceName: "/dev/xvda",
        volume: ec2.BlockDeviceVolume.ebs(diskSize, {
          encrypted: true,
          volumeType: ec2.EbsDeviceVolumeType.GP3,
          deleteOnTermination: true,
        }),
      },
    ],
  };
}

function mapTaintEffect(
  effect: NodeGroupTaintConfig["effect"]
): TaintEffect {
  switch (effect) {
    case "NO_SCHEDULE":
      return TaintEffect.NO_SCHEDULE;
    case "NO_EXECUTE":
      return TaintEffect.NO_EXECUTE;
    case "PREFER_NO_SCHEDULE":
      return TaintEffect.PREFER_NO_SCHEDULE;
    default: {
      const exhaustiveCheck: never = effect;
      throw new Error(`Unsupported node taint effect: ${exhaustiveCheck}`);
    }
  }
}

function validateClusterConfig(config: ClusterConfigDetails): void {
  if (!config.version) {
    throw new Error("Cluster configuration is missing version");
  }

  validateScalingConfig(
    "general node group",
    config.minSize,
    config.maxSize,
    config.desiredSize
  );

  if (!config.instanceType) {
    throw new Error("General node group requires instanceType");
  }

  if (!Number.isInteger(config.diskSize) || config.diskSize <= 0) {
    throw new Error("General node group diskSize must be a positive integer");
  }

  const workspace = config.workspaceNodeGroup;

  if (workspace && workspace.enabled !== false) {
    validateScalingConfig(
      "workspace node group",
      workspace.minSize,
      workspace.maxSize,
      workspace.desiredSize
    );

    if (!workspace.instanceTypes || workspace.instanceTypes.length === 0) {
      throw new Error(
        "Workspace node group requires at least one instance type"
      );
    }

    if (!Number.isInteger(workspace.diskSize) || workspace.diskSize <= 0) {
      throw new Error(
        "Workspace node group diskSize must be a positive integer"
      );
    }
  }
}

function validateScalingConfig(
  nodeGroupName: string,
  minSize: number,
  maxSize: number,
  desiredSize?: number
): void {
  if (minSize < 0) {
    throw new Error(`${nodeGroupName} minSize cannot be negative`);
  }

  if (maxSize < minSize) {
    throw new Error(`${nodeGroupName} maxSize cannot be less than minSize`);
  }

  if (
    desiredSize !== undefined &&
    (desiredSize < minSize || desiredSize > maxSize)
  ) {
    throw new Error(
      `${nodeGroupName} desiredSize must be between minSize and maxSize`
    );
  }
}

// Function to retrieve cluster configuration from Parameter Store
export async function getClusterConfig(
  env: string,
  region: string
): Promise<ClusterConfigDetails> {
  const paramName = `/gen3/${env.toLowerCase()}/cluster-config`;
  const ssmClient = new SSMClient({ region });
  const command = new GetParameterCommand({
    Name: paramName,
    WithDecryption: true,
  });

  try {
    const response = await ssmClient.send(command);
    return JSON.parse(
      response.Parameter?.Value || "{}"
    ) as ClusterConfigDetails;
  } catch (error) {
    throw new Error(`Error retrieving parameter, ${paramName}: ${error}`);
  }
}

// Function to map version string to KubernetesVersion enum
export function getKubernetesVersion(version: string): KubernetesVersion {
  switch (version) {
    case "1.35":
      return KubernetesVersion.V1_35;
    case "1.34":
      return KubernetesVersion.V1_34;
    case "1.33":
      return KubernetesVersion.V1_33;
    case "1.32":
      return KubernetesVersion.V1_32;
    case "1.31":
      return KubernetesVersion.V1_31;
    case "1.30":
      return KubernetesVersion.V1_30;
    case "1.29":
      return KubernetesVersion.V1_29;
    case "1.28":
      return KubernetesVersion.V1_28;
    default:
      throw new Error(`Unsupported Kubernetes version: ${version}`);
  }
}
