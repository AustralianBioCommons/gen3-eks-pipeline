import * as blueprints from "@aws-quickstart/eks-blueprints";

/**
 * Note: Users need to customize this module to fit their requirements.
 * Care must be taken to ensure that the environments defined here match
 * with the stages in ../environments.
 */


// Define the repository for workload configurations
const WORKLOAD_REPO =
  "https://github.com/AustralianBioCommons/gen3-workloads.git";

// Function to configure the bootstrap repository for ArgoCD
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

// Function to create the external secrets add-on configuration
const externalSecretAddon = (): blueprints.addons.ExternalsSecretsAddOn =>
  new blueprints.addons.ExternalsSecretsAddOn({
    values: {
      crds: {
        createClusterSecretStore: true,
      },
    },
  });

// Function to configure the ArgoCD add-on for a specific environment
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

// Common add-ons to be included in all clusters
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

// Function to create cluster-specific add-ons for different environments
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

// Environment-specific configurations for add-ons
export const uatClusterAddons = createClusterAddons(
  "uat",
  "uatCluster",
  "testing" //Workloads repo tag/branch
);
export const stagingClusterAddons = createClusterAddons(
  "staging",
  "stagingCluster",
  "main" //Workloads repo tag/branch
);
export const prodClusterAddons = createClusterAddons(
  "prod",
  "prodCluster",
  "main" //Workloads repo tag/branch
);
