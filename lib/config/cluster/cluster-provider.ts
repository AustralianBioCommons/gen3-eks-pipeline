import * as blueprints from "@aws-quickstart/eks-blueprints";
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import {
  CapacityType,
  EndpointAccess,
  KubernetesVersion,
  NodegroupAmiType,
  TaintEffect,
} from "aws-cdk-lib/aws-eks";
import { Construct } from "constructs";

import {
  ClusterConfigDetails,
  NodeGroupTaintConfig,
  WorkspaceSubnetNodeGroupConfig,
} from "../environments/config-interfaces";

/**
 * Builds an EKS cluster provider from a pre-fetched cluster configuration.
 *
 * The provider creates:
 *
 * 1. A general-purpose Gen3 managed node group.
 * 2. Optional workspace managed node groups.
 *
 * Workspace node groups are created one per configured subnet. Because an
 * individual subnet belongs to one Availability Zone, this ensures each
 * workspace node group is zonal and compatible with EBS-backed workspace PVCs.
 */
export function buildClusterProviderFromConfig(
  scope: Construct,
  env: string,
  clusterName: string,
  clusterConfig: ClusterConfigDetails,
  vpcSubnets?: ec2.SubnetSelection,
  nodeGroupSubnets?: ec2.SubnetSelection
): blueprints.GenericClusterProvider {
  validateClusterConfig(clusterConfig);

  const environmentName = env.toLowerCase();
  const version = getKubernetesVersion(clusterConfig.version);

  const generalNodeGroupId =
    clusterConfig.generalNodeGroupId ??
    `mng-${environmentName}-1`;

  const managedNodeGroups: blueprints.ManagedNodeGroup[] = [
    {
      id: generalNodeGroupId,

      minSize: clusterConfig.minSize,
      maxSize: clusterConfig.maxSize,
      desiredSize: clusterConfig.desiredSize,

      instanceTypes: [
        new ec2.InstanceType(clusterConfig.instanceType),
      ],

      amiType: NodegroupAmiType.AL2023_X86_64_STANDARD,

      amiReleaseVersion:
        clusterConfig.amiReleaseVersion,

      nodeGroupCapacityType:
        CapacityType.ON_DEMAND,

      nodeGroupSubnets,

      launchTemplate: createLaunchTemplate(
        clusterConfig.diskSize
      ),

      tags: clusterConfig.tags,
    },
  ];

  const workspaceConfig =
    clusterConfig.workspaceNodeGroup;

  if (
    workspaceConfig &&
    workspaceConfig.enabled !== false
  ) {
    const workspaceLabels = {
      ...(workspaceConfig.labels ?? {}),

      // Hatchery requires this label for non-GPU workspaces.
      role: "jupyter",
    };

    const workspaceTaints = (
      workspaceConfig.taints ?? [
        {
          key: "role",
          value: "jupyter",
          effect: "NO_SCHEDULE" as const,
        },
      ]
    ).map((taint) => ({
      key: taint.key,
      value: taint.value,
      effect: mapTaintEffect(taint.effect),
    }));

    for (const subnetGroup of workspaceConfig.subnetGroups) {
      const groupName = normaliseNodeGroupName(
        subnetGroup.name
      );

      const constructId = normaliseConstructId(
        subnetGroup.name
      );

      /*
       * CDK imported resources are constructs and therefore require a unique
       * construct ID within the parent scope.
       *
       * Include the cluster name and subnet ID so that different clusters or
       * environments can safely use names such as "2a", "2b" and "2c".
       */
      const subnetConstructId = [
        "WorkspaceSubnet",
        normaliseConstructId(clusterName),
        constructId,
        normaliseConstructId(subnetGroup.subnetId),
      ].join("");

      /*
       * Reuse the imported subnet if this provider-building function is invoked
       * more than once under the same CDK scope.
       */
      const existingSubnet = scope.node.tryFindChild(
        subnetConstructId
      ) as ec2.ISubnet | undefined;

      const workspaceSubnet =
        existingSubnet ??
        ec2.Subnet.fromSubnetId(
          scope,
          subnetConstructId,
          subnetGroup.subnetId
        );

      const scaling = resolveWorkspaceScaling(
        workspaceConfig.minSize,
        workspaceConfig.maxSize,
        workspaceConfig.desiredSize,
        subnetGroup
      );

      managedNodeGroups.push({
        id: `mng-${environmentName}-workspace-${groupName}`,

        minSize: scaling.minSize,
        maxSize: scaling.maxSize,
        desiredSize: scaling.desiredSize,

        amiReleaseVersion:
          workspaceConfig.amiReleaseVersion ??
          clusterConfig.amiReleaseVersion,

        instanceTypes:
          workspaceConfig.instanceTypes.map(
            (instanceType) =>
              new ec2.InstanceType(instanceType)
          ),

        amiType:
          NodegroupAmiType.AL2023_X86_64_STANDARD,

        nodeGroupCapacityType:
          workspaceConfig.capacityType === "SPOT"
            ? CapacityType.SPOT
            : CapacityType.ON_DEMAND,

        nodeGroupSubnets: {
          subnets: [workspaceSubnet],
        },

        labels: workspaceLabels,

        taints: workspaceTaints,

        launchTemplate: createLaunchTemplate(
          workspaceConfig.diskSize
        ),

        tags: {
          ...(workspaceConfig.tags ?? {}),
          ...(subnetGroup.tags ?? {}),
          NodeGroup: `workspace-${groupName}`,
          WorkspaceSubnetId: subnetGroup.subnetId,
        },
      });
    }
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

/**
 * Resolves the scaling configuration for a specific zonal workspace node group.
 *
 * Per-subnet values override the shared workspace values.
 */
function resolveWorkspaceScaling(
  defaultMinSize: number,
  defaultMaxSize: number,
  defaultDesiredSize:
    | number
    | undefined,
  subnetGroup: WorkspaceSubnetNodeGroupConfig
): {
  minSize: number;
  maxSize: number;
  desiredSize: number | undefined;
} {
  const minSize =
    subnetGroup.minSize ?? defaultMinSize;

  const maxSize =
    subnetGroup.maxSize ?? defaultMaxSize;

  const desiredSize =
    subnetGroup.desiredSize ??
    defaultDesiredSize;

  validateScalingConfig(
    `workspace node group ${subnetGroup.name}`,
    minSize,
    maxSize,
    desiredSize
  );

  return {
    minSize,
    maxSize,
    desiredSize,
  };
}

/**
 * Converts a configured name into a safe EKS managed node-group identifier
 * suffix.
 */
function normaliseNodeGroupName(
  value: string
): string {
  const normalised = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (!normalised) {
    throw new Error(
      `Invalid workspace node group name: ${value}`
    );
  }

  return normalised;
}

/**
 * Converts a configured name into a safe CDK construct identifier.
 */
function normaliseConstructId(
  value: string
): string {
  const normalised = value
    .trim()
    .replace(/[^A-Za-z0-9]/g, "");

  if (!normalised) {
    throw new Error(
      `Invalid workspace subnet construct name: ${value}`
    );
  }

  return normalised;
}

/**
 * Creates a launch template configuration with an encrypted GP3 root disk.
 */
function createLaunchTemplate(
  diskSize: number
): blueprints.LaunchTemplateProps {
  return {
    blockDevices: [
      {
        deviceName: "/dev/xvda",

        volume: ec2.BlockDeviceVolume.ebs(
          diskSize,
          {
            encrypted: true,
            volumeType:
              ec2.EbsDeviceVolumeType.GP3,
            deleteOnTermination: true,
          }
        ),
      },
    ],
  };
}

/**
 * Maps the configuration taint effect to the AWS CDK taint effect.
 */
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

      throw new Error(
        `Unsupported node taint effect: ${exhaustiveCheck}`
      );
    }
  }
}

/**
 * Validates that a pinned AMI release matches the EKS control-plane version.
 */
function validateAmiReleaseVersion(
  nodeGroupName: string,
  amiReleaseVersion: string | undefined,
  clusterVersion: string
): void {
  /*
   * An undefined AMI release means EKS will use the latest compatible
   * release when launching nodes.
   */
  if (!amiReleaseVersion) {
    return;
  }

  if (
    !amiReleaseVersion.startsWith(
      `${clusterVersion}.`
    )
  ) {
    throw new Error(
      `${nodeGroupName} amiReleaseVersion ` +
      `${amiReleaseVersion} does not match EKS ` +
      `${clusterVersion}. Expected a version beginning ` +
      `with ${clusterVersion}.`
    );
  }
}

/**
 * Validates the complete cluster configuration.
 */
function validateClusterConfig(
  config: ClusterConfigDetails
): void {
  if (!config.version) {
    throw new Error(
      "Cluster configuration is missing version"
    );
  }

  validateScalingConfig(
    "general node group",
    config.minSize,
    config.maxSize,
    config.desiredSize
  );

  if (!config.instanceType) {
    throw new Error(
      "General node group requires instanceType"
    );
  }

  if (
    !Number.isInteger(config.diskSize) ||
    config.diskSize <= 0
  ) {
    throw new Error(
      "General node group diskSize must be a positive integer"
    );
  }

  validateAmiReleaseVersion(
    "general node group",
    config.amiReleaseVersion,
    config.version
  );

  const workspace =
    config.workspaceNodeGroup;

  if (
    !workspace ||
    workspace.enabled === false
  ) {
    return;
  }

  validateScalingConfig(
    "workspace node group defaults",
    workspace.minSize,
    workspace.maxSize,
    workspace.desiredSize
  );

  validateAmiReleaseVersion(
    "workspace node group",
    workspace.amiReleaseVersion ??
    config.amiReleaseVersion,
    config.version
  );

  if (
    !workspace.instanceTypes ||
    workspace.instanceTypes.length === 0
  ) {
    throw new Error(
      "Workspace node group requires at least one instance type"
    );
  }

  for (
    const instanceType of workspace.instanceTypes
  ) {
    if (
      !instanceType ||
      instanceType.trim().length === 0
    ) {
      throw new Error(
        "Workspace node group instanceTypes cannot contain empty values"
      );
    }
  }

  if (
    !Number.isInteger(workspace.diskSize) ||
    workspace.diskSize <= 0
  ) {
    throw new Error(
      "Workspace node group diskSize must be a positive integer"
    );
  }

  if (
    !workspace.subnetGroups ||
    workspace.subnetGroups.length === 0
  ) {
    throw new Error(
      "Workspace node group requires at least one subnetGroups entry"
    );
  }

  validateWorkspaceSubnetGroups(
    workspace.subnetGroups,
    workspace.minSize,
    workspace.maxSize,
    workspace.desiredSize
  );

  if (workspace.taints) {
    if (workspace.taints.length === 0) {
      throw new Error(
        "Workspace node group taints, when set, cannot be empty; " +
        "omit the field to use role=jupyter:NoSchedule"
      );
    }

    for (const taint of workspace.taints) {
      if (
        !taint.key ||
        taint.key.trim().length === 0
      ) {
        throw new Error(
          "Workspace node group taints cannot contain empty keys"
        );
      }

      if (
        taint.value === undefined ||
        taint.value.trim().length === 0
      ) {
        throw new Error(
          `Workspace node group taint ${taint.key} requires a value`
        );
      }
    }
  }
}

/**
 * Validates the subnet-specific workspace node groups.
 */
function validateWorkspaceSubnetGroups(
  subnetGroups:
    WorkspaceSubnetNodeGroupConfig[],
  defaultMinSize: number,
  defaultMaxSize: number,
  defaultDesiredSize:
    | number
    | undefined
): void {
  const names = new Set<string>();
  const subnetIds = new Set<string>();

  for (const group of subnetGroups) {
    if (
      !group.name ||
      group.name.trim().length === 0
    ) {
      throw new Error(
        "Workspace subnet group requires a name"
      );
    }

    const normalisedName =
      normaliseNodeGroupName(group.name);

    if (names.has(normalisedName)) {
      throw new Error(
        `Duplicate workspace subnet group name: ${group.name}`
      );
    }

    names.add(normalisedName);

    if (
      !group.subnetId ||
      group.subnetId.trim().length === 0
    ) {
      throw new Error(
        `Workspace subnet group ${group.name} requires subnetId`
      );
    }

    if (
      !group.subnetId.startsWith("subnet-")
    ) {
      throw new Error(
        `Workspace subnet group ${group.name} has invalid subnetId ` +
        `${group.subnetId}`
      );
    }

    if (subnetIds.has(group.subnetId)) {
      throw new Error(
        `Workspace subnet ${group.subnetId} is configured more than once`
      );
    }

    subnetIds.add(group.subnetId);

    const minSize =
      group.minSize ?? defaultMinSize;

    const maxSize =
      group.maxSize ?? defaultMaxSize;

    const desiredSize =
      group.desiredSize ??
      defaultDesiredSize;

    validateScalingConfig(
      `workspace node group ${group.name}`,
      minSize,
      maxSize,
      desiredSize
    );
  }
}

/**
 * Validates a node group's scaling configuration.
 */
function validateScalingConfig(
  nodeGroupName: string,
  minSize: number,
  maxSize: number,
  desiredSize?: number
): void {
  if (!Number.isInteger(minSize)) {
    throw new Error(
      `${nodeGroupName} minSize must be an integer`
    );
  }

  if (!Number.isInteger(maxSize)) {
    throw new Error(
      `${nodeGroupName} maxSize must be an integer`
    );
  }

  if (
    desiredSize !== undefined &&
    !Number.isInteger(desiredSize)
  ) {
    throw new Error(
      `${nodeGroupName} desiredSize must be an integer`
    );
  }

  if (minSize < 0) {
    throw new Error(
      `${nodeGroupName} minSize cannot be negative`
    );
  }

  if (maxSize < minSize) {
    throw new Error(
      `${nodeGroupName} maxSize cannot be less than minSize`
    );
  }

  if (
    desiredSize !== undefined &&
    (
      desiredSize < minSize ||
      desiredSize > maxSize
    )
  ) {
    throw new Error(
      `${nodeGroupName} desiredSize must be between minSize and maxSize`
    );
  }
}

/**
 * Retrieves the cluster configuration from AWS Systems Manager Parameter
 * Store.
 */
export async function getClusterConfig(
  env: string,
  region: string
): Promise<ClusterConfigDetails> {
  const paramName =
    `/gen3/${env.toLowerCase()}/cluster-config`;

  const ssmClient = new SSMClient({
    region,
  });

  const command =
    new GetParameterCommand({
      Name: paramName,
      WithDecryption: true,
    });

  try {
    const response =
      await ssmClient.send(command);

    const parameterValue =
      response.Parameter?.Value;

    if (!parameterValue) {
      throw new Error(
        `Parameter ${paramName} has no value`
      );
    }

    return JSON.parse(
      parameterValue
    ) as ClusterConfigDetails;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    throw new Error(
      `Error retrieving parameter ${paramName}: ${message}`
    );
  }
}

/**
 * Maps the configured Kubernetes version to the corresponding CDK constant.
 */
export function getKubernetesVersion(
  version: string
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
        `Unsupported Kubernetes version: ${version}`
      );
  }
}