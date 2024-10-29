import * as blueprints from "@aws-quickstart/eks-blueprints";


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
  targetRevision: string,
  workloadRepoUrl: string
): blueprints.addons.ArgoCDAddOn =>
  new blueprints.addons.ArgoCDAddOn({
    adminPasswordSecretName: `${argocdCredentialName}-${env}`,
    name: `${env}Gen3Cluster`,
    bootstrapRepo: bootstrapRepo(env, targetRevision, workloadRepoUrl),
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
  targetRevision: string,
  workloadRepoUrl: string
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
    argoCdAddon(env, targetRevision, workloadRepoUrl),
  ];
}




