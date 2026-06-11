import * as blueprints from "@aws-quickstart/eks-blueprints";
import * as eks from "aws-cdk-lib/aws-eks";
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";

import cluster from "cluster";
import { toolsRegion } from "../environments";

import { ExtendedEbsCsiDriverAddOn } from "../../addons/extended-ebscsi-driver-addon";

// ArgoCd credential prefix in secret Manager
const argocdCredentialName = "argocdAdmin";

interface ManagedAddonConfig {
  vpcCniVersion?: string;
  kubeProxyVersion?: string;
  coreDnsVersion?: string;
  ebsCsiVersion?: string;
}

interface HelmAddonConfig {
  skipCalico?: boolean;
}

interface AddonConfig {
  managedAddons?: ManagedAddonConfig;
  helmAddons?: HelmAddonConfig;
}

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
const externalSecretAddon = (): blueprints.addons.ExternalsSecretsAddOn =>
  new blueprints.addons.ExternalsSecretsAddOn({
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
  serviceType?: string
): blueprints.addons.ArgoCDAddOn =>
  new blueprints.addons.ArgoCDAddOn({
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
      helm: {
        valueFiles: ["values.yaml", "gen3-values.yaml"],
      },
    },
  });

async function getAddonConfig(env: string, region: string): Promise<AddonConfig> {
  const paramName = `/gen3/${env.toLowerCase()}/addon-config`;
  const ssmClient = new SSMClient({ region });

  try {
    const response = await ssmClient.send(
      new GetParameterCommand({
        Name: paramName,
        WithDecryption: true,
      })
    );
    return JSON.parse(response.Parameter?.Value || "{}") as AddonConfig;
  } catch {
    return {};
  }
}

// Common add-ons to be included in all clusters
export async function commonAddonsForEnv(env: string): Promise<blueprints.ClusterAddOn[]> {
  const addonConfig = await getAddonConfig(env, toolsRegion);
  const managed = addonConfig.managedAddons || {};
  const helm = addonConfig.helmAddons || {};

  const addons: blueprints.ClusterAddOn[] = [
    new blueprints.addons.VpcCniAddOn({
      version: managed.vpcCniVersion,
    }),
    new blueprints.addons.KubeProxyAddOn(
      managed.kubeProxyVersion
    ),
    new blueprints.addons.CoreDnsAddOn(
      managed.coreDnsVersion
    ),
    new blueprints.addons.CertManagerAddOn(),
    new blueprints.addons.MetricsServerAddOn(),
    new ExtendedEbsCsiDriverAddOn({
      version: managed.ebsCsiVersion,
    }),
    new blueprints.addons.SecretsStoreAddOn(),
    new blueprints.addons.SSMAgentAddOn(),
    new blueprints.addons.ClusterAutoScalerAddOn(),
  ];

  if (!helm.skipCalico) {
    addons.splice(5, 0, new blueprints.addons.CalicoOperatorAddOn());
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
): Array<blueprints.ClusterAddOn> {
  return [
    new blueprints.addons.CloudWatchLogsAddon({
      namespace: "aws-for-fluent-bit",
      createNamespace: true,
      serviceAccountName: "aws-fluent-bit-for-cw-sa",
      logGroupPrefix: `/aws/eks/${env.toLowerCase()}-${clusterName}`,
      logRetentionDays: 90,
    }),
    externalSecretAddon(),
    argoCdAddon(env, targetRevision, workloadRepoUrl, argocdServiceType),
  ];
}



