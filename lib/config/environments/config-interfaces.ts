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
  /**
   * Logical id of the general managed node group. MUST match what is
   * already deployed for this env, because changing it REPLACES the
   * node group:
   *   - envs deployed from the iam-roles-removal branch: "mng-<env>-1"
   *     (this is also the default when the field is omitted)
   *   - envs deployed from main/v1.3.3: "mng-<env>-general"
   * Check with: aws eks list-nodegroups --cluster-name <cluster>
   */
  generalNodeGroupId?: string;
  /**
   * Whether this env's IRSA service roles are created by THIS stack
   * (legacy) or managed externally. Scoped per project automatically,
   * because each project's pipeline reads its own tools-account SSM —
   * unlike the cdk.json allowlist, which is shared by every pipeline
   * deploying from this repo and is keyed on env name only.
   *
   *   true      -> embed IamRolesStack (env still on legacy roles)
   *   false     -> skip (roles managed externally)
   *   undefined -> fall back to cdk.json `embedIamRolesAllowlist`
   *
   * MUST match deployed reality before the first deploy of this branch:
   * an env with live embedded roles that resolves to `false` here gets
   * those roles DELETED (unless DeletionPolicy Retain has already been
   * deployed there). Set it explicitly for every env.
   */
  embedIamRoles?: boolean;
  workspaceNodeGroup?: WorkspaceNodeGroupConfig;
  managedAddons?: ManagedAddonConfig;
  helmAddons?: HelmAddonConfig;
}

/**
 * Optional version pins for EKS managed add-ons, read from
 * `/gen3/<env>/cluster-config`. Any field left unset means "use the
 * current default version" — the addon is still installed.
 */
export interface ManagedAddonConfig {
  vpcCniVersion?: string;
  kubeProxyVersion?: string;
  coreDnsVersion?: string;
  ebsCsiVersion?: string;
}

/**
 * Optional chart version pins for Helm-based add-ons. Same semantics as
 * ManagedAddonConfig: unset fields fall back to default versions.
 * (external-secrets falls back to the 0.16.1 pin that is currently
 * deployed, not to the blueprints default.)
 */
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

export interface NodeGroupTaintConfig {
  key: string;
  value?: string;
  effect: "NO_SCHEDULE" | "NO_EXECUTE" | "PREFER_NO_SCHEDULE";
}

/**
 * Optional dedicated workspace node group (Gen3 workspaces / hatchery
 * workloads). Additive: envs without this block keep exactly one node
 * group, as deployed today.
 */
export interface WorkspaceNodeGroupConfig {
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