import * as blueprints from '@aws-quickstart/eks-blueprints';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

import {
    CapacityType,
    EndpointAccess,
    KubernetesVersion,
    NodegroupAmiType,
} from 'aws-cdk-lib/aws-eks';

const WORKLOAD_REPO = 'https://github.com/AustralianBioCommons/gen3-workloads.git';


const uatBootstrapRepo: blueprints.ApplicationRepository = {
  repoUrl: WORKLOAD_REPO,
  credentialsSecretName: "gen3-argocd",
  credentialsType: "TOKEN",
  targetRevision: "testing",
};

const stagingBootstrapRepo: blueprints.ApplicationRepository = {
  repoUrl: WORKLOAD_REPO,
  credentialsSecretName: "gen3-argocd",
  credentialsType: "TOKEN",
  targetRevision: "main",
};

const prodBootstrapRepo: blueprints.ApplicationRepository = {
  repoUrl: WORKLOAD_REPO,
  credentialsSecretName: "gen3-argocd",
  credentialsType: "TOKEN",
  targetRevision: "main",
};

export const uatExternalSecretAddon = new blueprints.addons.ExternalsSecretsAddOn({
  values: {
    crds: {
      createClusterSecretStore: false,
    },
  },
});

export const stagingExternalSecretAddon =
  new blueprints.addons.ExternalsSecretsAddOn({
    values: {
      crds: {
        createClusterSecretStore: true,
      },
    },
  });

export const prodExternalSecretAddon =
  new blueprints.addons.ExternalsSecretsAddOn({
    values: {
      crds: {
        createClusterSecretStore: true,
      },
    },
  });

export const uatBootstrapArgoCd = new blueprints.addons.ArgoCDAddOn({
  adminPasswordSecretName: "cad-argocdAdmin-uat",
  name: "uatGen3Cluster",
  bootstrapRepo: {
    ...uatBootstrapRepo,
    path: "environments/uat",
  },
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

export const stagingBootstrapArgoCd = new blueprints.addons.ArgoCDAddOn({
  adminPasswordSecretName: "cad-argocdAdmin-staging",
  name: "stagingCluster",
  bootstrapRepo: {
    ...stagingBootstrapRepo,
    path: "environments/staging",
  },
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

export const prodBootstrapArgoCd = new blueprints.addons.ArgoCDAddOn({
  adminPasswordSecretName: "cad-argocdAdmin-prod",
  name: "prodCluster",
  bootstrapRepo: {
    ...prodBootstrapRepo,
    path: "environments/prod",
  },
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

export const commonAddons = [
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

export function uatClusterAddons(clusterName: string) {

    const addOns: Array<blueprints.ClusterAddOn> = [
      // Add additional addons here
      new blueprints.addons.CloudWatchLogsAddon({
        namespace: "aws-for-fluent-bit",
        createNamespace: true,
        serviceAccountName: "aws-fluent-bit-for-cw-sa",
        logGroupPrefix: `/aws/eks/sandbox-${clusterName}`,
        logRetentionDays: 90,
      }),
      uatExternalSecretAddon,
      uatBootstrapArgoCd,
    ];

    return addOns;
}

export function stagingClusterAddons(clusterName: string) {
  const addOns: Array<blueprints.ClusterAddOn> = [
    // Add additional addons here
    new blueprints.addons.CloudWatchLogsAddon({
      namespace: "aws-for-fluent-bit",
      createNamespace: true,
      serviceAccountName: "aws-fluent-bit-for-cw-sa",
      logGroupPrefix: `/aws/eks/prod-${clusterName}`,
      logRetentionDays: 90,
    }),
    stagingExternalSecretAddon,
    stagingBootstrapArgoCd,
  ];

  return addOns;
}

export function prodClusterAddons(clusterName: string) {
  const addOns: Array<blueprints.ClusterAddOn> = [
    // Add additional addons here
    new blueprints.addons.CloudWatchLogsAddon({
      namespace: "aws-for-fluent-bit",
      createNamespace: true,
      serviceAccountName: "aws-fluent-bit-for-cw-sa",
      logGroupPrefix: `/aws/eks/prod-${clusterName}`,
      logRetentionDays: 90,
    }),
    prodExternalSecretAddon,
    prodBootstrapArgoCd
    
  ];

  return addOns;
}

export function uatClusterProvider(clusterName: string) {
    const version = KubernetesVersion.V1_30;
    return new blueprints.GenericClusterProvider({
      version: version,
      clusterName: clusterName,
      managedNodeGroups: [
        {
          id: "mng3",
          minSize: 1,
          maxSize: 2,
          desiredSize: 2,
          diskSize: 100,
          instanceTypes: [new ec2.InstanceType("m5.2xlarge")],
          amiType: NodegroupAmiType.AL2_X86_64,
          nodeGroupCapacityType: CapacityType.ON_DEMAND,
          amiReleaseVersion: "1.30.0-20240703",
          tags: {
            Name: "GEN3 Cluster",
            Type: "ACDC",
            ENV: "uat",
          },
        },
      ],
    });
}

export function stagingClusterProvider(clusterName: string) {
  const version = KubernetesVersion.V1_30;
  return new blueprints.GenericClusterProvider({
    version: version,
    clusterName: clusterName,
    endpointAccess: EndpointAccess.PRIVATE,
    managedNodeGroups: [
      {
        id: "mng1",
        minSize: 2,
        maxSize: 3,
        desiredSize: 2,
        diskSize: 100,
        instanceTypes: [new ec2.InstanceType("m5.2xlarge")],
        amiType: NodegroupAmiType.AL2_X86_64,
        nodeGroupCapacityType: CapacityType.ON_DEMAND,
        amiReleaseVersion: "1.30.0-20240703",
        tags: {
          Name: "GEN3 Cluster",
          Type: "ACDC",
          ENV: "staging",
        },
      },
    ],
  });
}

export function prodClusterProvider(clusterName: string) {
  const version = KubernetesVersion.V1_30;
  return new blueprints.GenericClusterProvider({
    version: version,
    clusterName: clusterName,
    endpointAccess: EndpointAccess.PRIVATE,
    managedNodeGroups: [
      {
        id: "mng1",
        minSize: 2,
        maxSize: 3,
        desiredSize: 2,
        diskSize: 100,
        instanceTypes: [new ec2.InstanceType("m5.2xlarge")],
        amiType: NodegroupAmiType.AL2_X86_64,
        nodeGroupCapacityType: CapacityType.ON_DEMAND,
        amiReleaseVersion: "1.30.0-20240703",
        tags: {
          Name: "GEN3 Cluster",
          Type: "ACDC",
          ENV: "prod",
        },
      },
    ],
  });
}