import * as blueprints from "@aws-quickstart/eks-blueprints";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import {
  CapacityType,
  EndpointAccess,
  KubernetesVersion,
  NodegroupAmiType,
  TaintEffect,
} from "aws-cdk-lib/aws-eks";
import {
  GetParameterCommand,
  SSMClient,
} from "@aws-sdk/client-ssm";

import { toolsRegion } from "../environments";

interface NodeGroupTaintConfig {
  key: string;
  value?: string;
  effect: "NO_SCHEDULE" | "NO_EXECUTE" | "PREFER_NO_SCHEDULE";
}

interface WorkspaceNodeGroupConfig {
  enabled?: boolean;
  minSize: number;
  maxSize: number;
  desiredSize?: number;
  diskSize: number;
  instanceTypes: string[];
  capacityType?: "ON_DEMAND" | "SPOT";
  labels?: Record<string, string>;
  taints?: NodeGroupTaintConfig[];
  tags?: Record<string, string>;
}

interface ClusterConfig {
  version: string;

  minSize: number;
  maxSize: number;
  desiredSize?: number;
  diskSize: number;
  instanceType: string;

  tags?: Record<string, string>;
  workspaceNodeGroup?: WorkspaceNodeGroupConfig;
}

/**
 * Creates the EKS cluster provider, including:
 *
 * - the general-purpose Gen3 managed node group; and
 * - an optional dedicated workspace managed node group.
 */
export async function gen3ClusterProvider(
  env: string,
  clusterName: string,
  vpcSubnets?: ec2.SubnetSelection,
  nodeGroupSubnets?: ec2.SubnetSelection,
) {
  const clusterConfig = await getClusterConfig(env, toolsRegion);
  validateClusterConfig(clusterConfig);

  const version = getKubernetesVersion(clusterConfig.version);

  const managedNodeGroups: blueprints.ManagedNodeGroup[] = [
    {
      id: `mng-${env.toLowerCase()}-general`,
      minSize: clusterConfig.minSize,
      maxSize: clusterConfig.maxSize,
      desiredSize: clusterConfig.desiredSize,

      instanceTypes: [
        new ec2.InstanceType(clusterConfig.instanceType),
      ],

      amiType: NodegroupAmiType.AL2023_X86_64_STANDARD,
      nodeGroupCapacityType: CapacityType.ON_DEMAND,
      nodeGroupSubnets: nodeGroupSubnets,

      launchTemplate: createLaunchTemplate(
        clusterConfig.diskSize,
        clusterConfig.tags,
      ),

      tags: {
        ...(clusterConfig.tags ?? {}),
        NodeGroup: "general",
      },
    },
  ];

  const workspaceConfig = clusterConfig.workspaceNodeGroup;

  if (workspaceConfig?.enabled !== false && workspaceConfig) {
    managedNodeGroups.push({
      id: `mng-${env.toLowerCase()}-workspace`,
      minSize: workspaceConfig.minSize,
      maxSize: workspaceConfig.maxSize,
      desiredSize: workspaceConfig.desiredSize,

      instanceTypes: workspaceConfig.instanceTypes.map(
        (instanceType) => new ec2.InstanceType(instanceType),
      ),

      amiType: NodegroupAmiType.AL2023_X86_64_STANDARD,

      nodeGroupCapacityType:
        workspaceConfig.capacityType === "SPOT"
          ? CapacityType.SPOT
          : CapacityType.ON_DEMAND,

      nodeGroupSubnets: nodeGroupSubnets,

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
        effect: mapTaintEffect(taint.effect),
      })),

      launchTemplate: createLaunchTemplate(
        workspaceConfig.diskSize,
        workspaceConfig.tags,
      ),

      tags: {
        ...(workspaceConfig.tags ?? {}),
        NodeGroup: "workspace",
      },
    });
  }

  return new blueprints.GenericClusterProvider({
    version,
    clusterName,
    endpointAccess: EndpointAccess.PRIVATE,

    vpcSubnets: vpcSubnets
      ? [vpcSubnets]
      : undefined,

    managedNodeGroups,
  });
}

function createLaunchTemplate(
  diskSize: number,
  tags?: Record<string, string>,
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

    // This is needed if you want tags such as Name to appear
    // directly on the EC2 instances and their volumes.
    // tagSpecifications: [
    //   {
    //     resourceType: ec2.ResourceType.INSTANCE,
    //     tags: tags ?? {},
    //   },
    //   {
    //     resourceType: ec2.ResourceType.VOLUME,
    //     tags: tags ?? {},
    //   },
    // ],
  };
}

function mapTaintEffect(
  effect: NodeGroupTaintConfig["effect"],
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
      throw new Error(
        `Unsupported node taint effect: ${exhaustiveCheck}`,
      );
    }
  }
}

/**
 * Retrieves the cluster configuration from SSM Parameter Store.
 */
async function getClusterConfig(
  env: string,
  region: string,
): Promise<ClusterConfig> {
  const paramName =
    `/gen3/${env.toLowerCase()}/cluster-config`;

  const ssmClient = new SSMClient({ region });

  try {
    const response = await ssmClient.send(
      new GetParameterCommand({
        Name: paramName,
        WithDecryption: true,
      }),
    );

    const value = response.Parameter?.Value;

    if (!value) {
      throw new Error("Parameter exists but has no value");
    }

    return JSON.parse(value) as ClusterConfig;
  } catch (error) {
    throw new Error(
      `Error retrieving or parsing parameter ${paramName}: ${error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function validateClusterConfig(
  config: ClusterConfig,
): void {
  if (!config.version) {
    throw new Error(
      "Cluster configuration is missing version",
    );
  }

  validateScalingConfig(
    "general node group",
    config.minSize,
    config.maxSize,
    config.desiredSize,
  );

  if (!config.instanceType) {
    throw new Error(
      "General node group requires instanceType",
    );
  }

  if (!Number.isInteger(config.diskSize) || config.diskSize <= 0) {
    throw new Error(
      "General node group diskSize must be a positive integer",
    );
  }

  const workspace = config.workspaceNodeGroup;

  if (workspace && workspace.enabled !== false) {
    validateScalingConfig(
      "workspace node group",
      workspace.minSize,
      workspace.maxSize,
      workspace.desiredSize,
    );

    if (
      !workspace.instanceTypes ||
      workspace.instanceTypes.length === 0
    ) {
      throw new Error(
        "Workspace node group requires at least one instance type",
      );
    }

    if (
      !Number.isInteger(workspace.diskSize) ||
      workspace.diskSize <= 0
    ) {
      throw new Error(
        "Workspace node group diskSize must be a positive integer",
      );
    }
  }
}

function validateScalingConfig(
  nodeGroupName: string,
  minSize: number,
  maxSize: number,
  desiredSize?: number,
): void {
  if (minSize < 0) {
    throw new Error(
      `${nodeGroupName} minSize cannot be negative`,
    );
  }

  if (maxSize < minSize) {
    throw new Error(
      `${nodeGroupName} maxSize cannot be less than minSize`,
    );
  }

  if (
    desiredSize !== undefined &&
    (desiredSize < minSize || desiredSize > maxSize)
  ) {
    throw new Error(
      `${nodeGroupName} desiredSize must be between minSize and maxSize`,
    );
  }
}

export function getKubernetesVersion(
  version: string,
): KubernetesVersion {
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
      throw new Error(
        `Unsupported Kubernetes version: ${version}`,
      );
  }
}