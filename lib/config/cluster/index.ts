import * as blueprints from "@aws-quickstart/eks-blueprints";

const WORKLOAD_REPO =
  "https://github.com/AustralianBioCommons/gen3-workloads.git";

// Shared bootstrap repository definition
const bootstrapRepo = (
  env: string,
  targetRevision: string
): blueprints.ApplicationRepository => ({
  repoUrl: WORKLOAD_REPO,
  credentialsSecretName: "gen3-argocd",
  credentialsType: "TOKEN",
  targetRevision: targetRevision,
  path: `environments/${env}`,
});

// Shared ExternalSecretsAddOn definition
const externalSecretAddon = (): blueprints.addons.ExternalsSecretsAddOn =>
  new blueprints.addons.ExternalsSecretsAddOn({
    values: {
      crds: {
        createClusterSecretStore: true,
      },
    },
  });

// Shared ArgoCDAddOn definition
const argoCdAddon = (
  env: string,
  targetRevision: string
): blueprints.addons.ArgoCDAddOn =>
  new blueprints.addons.ArgoCDAddOn({
    adminPasswordSecretName: `cad-argocdAdmin-${env}`,
    name: `${env}Gen3Cluster`,
    bootstrapRepo: bootstrapRepo(env, targetRevision),
    values: {
      server: {
        service: {
          type: "NodePort",
        },
      },
      helm: {
        valueFiles: ["values.yaml", "gen3-values.yaml"],
      },
    },
  });

// Common add-ons
export const commonAddons: Array<blueprints.ClusterAddOn> = [
  new blueprints.addons.CertManagerAddOn(), 
  new blueprints.addons.CalicoOperatorAddOn(),
  new blueprints.addons.MetricsServerAddOn(),
  new blueprints.addons.ClusterAutoScalerAddOn(),
  new blueprints.addons.SecretsStoreAddOn(),
  new blueprints.addons.SSMAgentAddOn(),
  new blueprints.addons.CoreDnsAddOn(),
  new blueprints.addons.KubeProxyAddOn(),
  new blueprints.addons.VpcCniAddOn(),
  new blueprints.addons.EbsCsiDriverAddOn(),
];

// Function to create cluster-specific add-ons
export function createClusterAddons(
  env: string,
  clusterName: string,
  targetRevision: string
): Array<blueprints.ClusterAddOn> {
  return [
    new blueprints.addons.CloudWatchLogsAddon({
      namespace: "aws-for-fluent-bit",
      createNamespace: true,
      serviceAccountName: "aws-fluent-bit-for-cw-sa",
      logGroupPrefix: `/aws/eks/${env}-${clusterName}`,
      logRetentionDays: 90,
    }),
    externalSecretAddon(),
    argoCdAddon(env, targetRevision),
  ];
}

// Environment-specific configurations
export const uatClusterAddons = createClusterAddons(
  "uat",
  "uatCluster",
  "testing"
);
export const stagingClusterAddons = createClusterAddons(
  "staging",
  "stagingCluster",
  "main"
);
export const prodClusterAddons = createClusterAddons(
  "prod",
  "prodCluster",
  "main"
);
