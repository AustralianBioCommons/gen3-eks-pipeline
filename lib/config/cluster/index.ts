import * as blueprints from "@aws-quickstart/eks-blueprints";

import { toolsRegion } from "../environments";
import {
  ClusterConfigDetails,
  HelmAddonConfig,
  ManagedAddonConfig,
} from "../environments/config-interfaces";
import { getClusterConfig } from "./cluster-provider";

import { ExtendedEbsCsiDriverAddOn } from "../../addons/extended-ebscsi-driver-addon";

// ArgoCd credential prefix in secret Manager
const argocdCredentialName = "argocdAdmin";

// Function to configure the bootstrap repository for ArgoCD
const bootstrapRepo = (
  env: string,
  targetRevision: string,
  workloadRepoUrl: string
): blueprints.ApplicationRepository => ({
  repoUrl: workloadRepoUrl,
  credentialsSecretName: "gen3-argocd",
  credentialsType: "TOKEN",
  targetRevision: targetRevision,
  path: `environments/${env.toLowerCase()}`,
});

/**
 * Spread helper for optional chart/addon versions.
 *
 * Returns `{ version }` only when a version is configured, so an addon
 * keeps its currently deployed (default) behaviour when no version is
 * pinned in SSM. A missing or partial `managedAddons`/`helmAddons` block
 * must never change what is deployed today, and must NEVER cause an
 * addon to be omitted.
 */
function helmVersion(version?: string): { version: string } | undefined {
  return version ? { version } : undefined;
}

// Function to create the external secrets add-on configuration.
// NOTE: 0.16.1 is the pin currently deployed by the iam-roles-removal
// branch; it stays the fallback so an empty helmAddons block is a no-op.
const externalSecretAddon = (
  helm: HelmAddonConfig = {}
): blueprints.addons.ExternalsSecretsAddOn =>
  new blueprints.addons.ExternalsSecretsAddOn({
    version: helm.externalSecretsChartVersion ?? "0.16.1",
    values: {
      installCRDs: true,
      webhook: { service: { enabled: true } },
      crds: {
        createClusterSecretStore: true,
      },
      secretStore: { create: true, name: "gen3-secret-store" }
    },
  });

// Function to configure the ArgoCD add-on for a specific environment.
// Values shape is kept exactly as deployed by the iam-roles-removal
// branch (configs at the top level, valueFiles including
// gen3-values.yaml).
const argoCdAddon = (
  env: string,
  targetRevision: string,
  workloadRepoUrl: string,
  helm: HelmAddonConfig = {},
  serviceType?: string
): blueprints.addons.ArgoCDAddOn =>
  new blueprints.addons.ArgoCDAddOn({
    ...helmVersion(helm.argoCdChartVersion),
    adminPasswordSecretName: `${argocdCredentialName}-${env.toLowerCase()}`,
    name: `${env}-Gen3Cluster`,
    bootstrapRepo: bootstrapRepo(env, targetRevision, workloadRepoUrl),
    values: {
      server: {
        service: {
          type: serviceType || "NodePort",
        },
      },
      configs: {
        cm: { create: helm.argoCdManageConfigMaps ?? false },
        rbac: { create: helm.argoCdManageConfigMaps ?? false },
      },
      notifications: {
        enabled: true,
        livenessProbe: { enabled: true },
        readinessProbe: { enabled: true },
      },
      commitServer: { enabled: false },
      helm: {
        valueFiles: ["values.yaml", "gen3-values.yaml"],
      },
    },
  });

/**
 * Fail-open cluster-config fetch for addon/helm version lookups: a
 * missing or unreadable parameter yields `{}`, i.e. every addon at its
 * currently deployed default version. (The cluster provider path uses
 * the strict `getClusterConfig`, which throws, because node group config
 * is mandatory.)
 */
export async function getClusterConfigForEnv(
  env: string
): Promise<Partial<ClusterConfigDetails>> {
  try {
    return await getClusterConfig(env, toolsRegion);
  } catch {
    return {};
  }
}

/**
 * Common add-ons to be included in all clusters.
 *
 * Same addon set — and same order — as deployed today: the AWS Load
 * Balancer Controller (previously added on the parent builder) followed
 * by the static `commonAddons` list. Versions from
 * `/gen3/<env>/cluster-config` (`managedAddons` / `helmAddons`) are
 * applied when present; when absent an addon is installed with its
 * current default version — it is NEVER omitted. Do not make addon
 * installation conditional on a version being configured; that silently
 * uninstalls addons from running clusters.
 */
export function commonAddonsFromConfig(
  cfg: Partial<ClusterConfigDetails>
): blueprints.ClusterAddOn[] {
  const managed: ManagedAddonConfig = cfg.managedAddons ?? {};
  const helm: HelmAddonConfig = cfg.helmAddons ?? {};

  const requiredManagedAddons = {
    vpcCniVersion: managed.vpcCniVersion,
    kubeProxyVersion: managed.kubeProxyVersion,
    coreDnsVersion: managed.coreDnsVersion,
    ebsCsiVersion: managed.ebsCsiVersion,
  };

  const missingManagedAddons = Object.entries(requiredManagedAddons)
    .filter(([, version]) => !version)
    .map(([name]) => name);

  if (missingManagedAddons.length > 0) {
    throw new Error(
      `Missing managed add-on versions: ${missingManagedAddons.join(", ")}. ` +
      "Managed add-on versions must be pinned for EKS Blueprints pipeline stages."
    );
  }

  validateKubeProxyVersion(
    cfg.version,
    managed.kubeProxyVersion
  );

  return [
    new blueprints.addons.AwsLoadBalancerControllerAddOn({
      enableWafv2: true,
      ...helmVersion(helm.awsLoadBalancerControllerChartVersion),
    } as any),

    new blueprints.addons.VpcCniAddOn({
      version: managed.vpcCniVersion!,
    }),

    new blueprints.addons.KubeProxyAddOn(
      managed.kubeProxyVersion!
    ),

    new blueprints.addons.CoreDnsAddOn(
      managed.coreDnsVersion!
    ),

    new blueprints.addons.CertManagerAddOn(
      helmVersion(helm.certManagerChartVersion) as any
    ),

    new blueprints.addons.MetricsServerAddOn(
      helmVersion(helm.metricsServerChartVersion) as any
    ),

    new blueprints.addons.CalicoOperatorAddOn(
      helmVersion(helm.calicoChartVersion) as any
    ),

    new ExtendedEbsCsiDriverAddOn({
      version: managed.ebsCsiVersion!,
    }),

    new blueprints.addons.SecretsStoreAddOn(
      helmVersion(helm.secretsStoreCsiDriverChartVersion) as any
    ),

    new blueprints.addons.SSMAgentAddOn(),

    new blueprints.addons.ClusterAutoScalerAddOn(
      helmVersion(helm.clusterAutoscalerChartVersion) as any
    ),
  ];
}

// Function to create cluster-specific add-ons for different environments
export function createClusterAddons(
  env: string,
  clusterName: string,
  targetRevision: string,
  workloadRepoUrl: string,
  argocdServiceType?: string,
  helm: HelmAddonConfig = {},
): Array<blueprints.ClusterAddOn> {
  return [
    new blueprints.addons.CloudWatchLogsAddon({
      ...helmVersion(helm.awsFluentBitChartVersion),
      namespace: "aws-for-fluent-bit",
      createNamespace: true,
      serviceAccountName: "aws-fluent-bit-for-cw-sa",
      logGroupPrefix: `/aws/eks/${env.toLowerCase()}-${clusterName}`,
      logRetentionDays: 90,
    } as any),
    externalSecretAddon(helm),
    argoCdAddon(env, targetRevision, workloadRepoUrl, helm, argocdServiceType),
  ];
}

function validateKubeProxyVersion(
  kubernetesVersion: string | undefined,
  kubeProxyVersion: string | undefined
): void {
  if (!kubernetesVersion || !kubeProxyVersion) {
    return;
  }

  const expectedPrefix = `v${kubernetesVersion}.`;

  if (!kubeProxyVersion.startsWith(expectedPrefix)) {
    throw new Error(
      `kube-proxy ${kubeProxyVersion} does not match EKS ${kubernetesVersion}. ` +
      `Expected a version beginning with ${expectedPrefix}`
    );
  }
}
