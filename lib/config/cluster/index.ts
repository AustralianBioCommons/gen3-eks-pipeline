import * as blueprints from "@aws-quickstart/eks-blueprints";
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";

import { toolsRegion } from "../environments";
import {
  ClusterConfigDetails,
  HelmAddonConfig,
} from "../environments/config-interfaces";

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

// Function to create the external secrets add-on configuration
function helmVersion(version?: string): { version: string } | undefined {
  return version ? { version } : undefined;
}

const externalSecretAddon = (
  helm: HelmAddonConfig
): blueprints.addons.ExternalsSecretsAddOn =>
  new blueprints.addons.ExternalsSecretsAddOn({
    ...helmVersion(helm.externalSecretsChartVersion),
    values: {
      installCRDs: true,
      webhook: { service: { enabled: true } },
      crds: {
        createClusterSecretStore: true,
      },
      configs: {
        cm: { create: false },
        rbac: { create: false }
      },
      secretStore: { create: true, name: "gen3-secret-store" }
    },
  });




// Function to configure the ArgoCD add-on for a specific environment
const argoCdAddon = (
  env: string,
  targetRevision: string,
  workloadRepoUrl: string,
  helm: HelmAddonConfig,
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
        configs: {
          cm: { create: false },
          rbac: { create: false }
        },
      },
      notifications: { enabled: true, livenessProbe: { enabled: true }, readinessProbe: { enabled: true } },
      commitServer: { enabled: false },
    },
  });

async function getClusterConfig(env: string, region: string): Promise<ClusterConfigDetails> {
  const paramName = `/gen3/${env.toLowerCase()}/cluster-config`;
  const ssmClient = new SSMClient({ region });

  try {
    const response = await ssmClient.send(
      new GetParameterCommand({
        Name: paramName,
        WithDecryption: true,
      })
    );
    return JSON.parse(response.Parameter?.Value || "{}") as ClusterConfigDetails;
  } catch {
    return {} as ClusterConfigDetails;
  }
}

export async function getClusterConfigForEnv(env: string): Promise<ClusterConfigDetails> {
  return getClusterConfig(env, toolsRegion);
}

// Common add-ons to be included in all clusters
export async function commonAddonsForEnv(env: string): Promise<blueprints.ClusterAddOn[]> {
  const clusterConfig = await getClusterConfig(env, toolsRegion);
  const managed = clusterConfig.managedAddons || {};
  const helm = clusterConfig.helmAddons || {};
  const addons: blueprints.ClusterAddOn[] = [];

  if (helm.awsLoadBalancerControllerChartVersion) {
    addons.push(
      new blueprints.addons.AwsLoadBalancerControllerAddOn({
        enableWafv2: true,
        ...helmVersion(helm.awsLoadBalancerControllerChartVersion),
      } as any)
    );
  }

  if (managed.vpcCniVersion) {
    addons.push(
      new blueprints.addons.VpcCniAddOn({
        version: managed.vpcCniVersion,
      })
    );
  }

  if (managed.kubeProxyVersion) {
    addons.push(new blueprints.addons.KubeProxyAddOn(managed.kubeProxyVersion));
  }

  if (managed.coreDnsVersion) {
    addons.push(new blueprints.addons.CoreDnsAddOn(managed.coreDnsVersion));
  }

  if (helm.certManagerChartVersion) {
    addons.push(
      new blueprints.addons.CertManagerAddOn(
        helmVersion(helm.certManagerChartVersion) as any
      )
    );
  }

  if (helm.metricsServerChartVersion) {
    addons.push(
      new blueprints.addons.MetricsServerAddOn(
        helmVersion(helm.metricsServerChartVersion) as any
      )
    );
  }

  if (helm.calicoChartVersion) {
    addons.push(
      new blueprints.addons.CalicoOperatorAddOn(
        helmVersion(helm.calicoChartVersion) as any
      )
    );
  }

  if (managed.ebsCsiVersion) {
    addons.push(
      new ExtendedEbsCsiDriverAddOn({
        version: managed.ebsCsiVersion,
      })
    );
  }

  if (helm.secretsStoreCsiDriverChartVersion) {
    addons.push(
      new blueprints.addons.SecretsStoreAddOn(
        helmVersion(helm.secretsStoreCsiDriverChartVersion) as any
      )
    );
  }

  if (helm.clusterAutoscalerChartVersion) {
    addons.push(
      new blueprints.addons.ClusterAutoScalerAddOn(
        helmVersion(helm.clusterAutoscalerChartVersion) as any
      )
    );
  }

  return addons;
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
  const addons: blueprints.ClusterAddOn[] = [];

  if (helm.awsFluentBitChartVersion) {
    addons.push(
      new blueprints.addons.CloudWatchLogsAddon({
        ...helmVersion(helm.awsFluentBitChartVersion),
        namespace: "aws-for-fluent-bit",
        createNamespace: true,
        serviceAccountName: "aws-fluent-bit-for-cw-sa",
        logGroupPrefix: `/aws/eks/${env.toLowerCase()}-${clusterName}`,
        logRetentionDays: 90,
      } as any)
    );
  }

  if (helm.externalSecretsChartVersion) {
    addons.push(externalSecretAddon(helm));
  }

  if (helm.argoCdChartVersion) {
    addons.push(
      argoCdAddon(env, targetRevision, workloadRepoUrl, helm, argocdServiceType)
    );
  }

  return addons;
}
