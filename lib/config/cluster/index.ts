import * as blueprints from "@aws-quickstart/eks-blueprints";
import * as eks from "aws-cdk-lib/aws-eks";

import cluster from "cluster";

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

// Common add-ons to be included in all clusters
export const commonAddons: blueprints.ClusterAddOn[] = [
  new blueprints.addons.VpcCniAddOn(),
  new blueprints.addons.KubeProxyAddOn(),
  new blueprints.addons.CoreDnsAddOn(),
  new blueprints.addons.CertManagerAddOn(),
  new blueprints.addons.MetricsServerAddOn(),
  new blueprints.addons.CalicoOperatorAddOn(),
  new blueprints.addons.EbsCsiDriverAddOn({
    configurationValues: { provisioner: { enableVolumeScheduling: true, enableVolumeResizing: true, enableVolumeSnapshot: true } },
  }),
  new blueprints.addons.SecretsStoreAddOn(),
  new blueprints.addons.SSMAgentAddOn(),
  new blueprints.addons.ClusterAutoScalerAddOn(),
];

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




