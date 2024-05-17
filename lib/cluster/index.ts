import * as blueprints from '@aws-quickstart/eks-blueprints';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

import {
    CapacityType,
    EndpointAccess,
    KubernetesVersion,
    NodegroupAmiType,
} from 'aws-cdk-lib/aws-eks';

const WORKLOAD_REPO = 'https://github.com/AustralianBioCommons/gen3-workloads.git';

const bootstrapRepo: blueprints.ApplicationRepository = {
    repoUrl: WORKLOAD_REPO,
    credentialsSecretName: "github-ssh-key",
    credentialsType: "SSH",
    targetRevision: "main",
};

const devBootstrapRepo: blueprints.ApplicationRepository = {
    repoUrl: WORKLOAD_REPO,
    credentialsSecretName: "github-ssh-key",
    credentialsType: "SSH",
    targetRevision: "refactor",
};
const uatBootstrapRepo: blueprints.ApplicationRepository = {
  repoUrl: WORKLOAD_REPO,
  credentialsSecretName: "gen3-argocd",
  credentialsType: "TOKEN",
  targetRevision: "refactor",
};

const prodBootstrapRepo: blueprints.ApplicationRepository = {
  repoUrl: WORKLOAD_REPO,
  credentialsSecretName: "gen3-argocd",
  credentialsType: "TOKEN",
  targetRevision: "refactor",
};

export const uatExternalSecretAddon = new blueprints.addons.ExternalsSecretsAddOn({
  values: {
    crds: {
      createClusterSecretStore: false,
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


export const sandboxBootstrapArgoCd = new blueprints.addons.ArgoCDAddOn({
    adminPasswordSecretName: 'cad-argocdAdmin-sandbox',
    bootstrapRepo: {
        ...bootstrapRepo,
        path: "environments/sandbox",
    },
    values: {
        server: {
            service: {
                type: "LoadBalancer",
            },
        },
    },
});

export const devBootstrapArgoCd = new blueprints.addons.ArgoCDAddOn({
    adminPasswordSecretName: 'cad-argocdAdmin-dev',
    bootstrapRepo: {
        ...devBootstrapRepo,
        path: "environments/dev",
    },
    values: {
        server: {
            service: {
                type: "NodePort",
            },
        },
        configs: {
            cm: {
                "accounts.tester": "login",
                "admin.enabled": "true"
            },
            rbac: {
                'policy.cad.csv': "g,tester, role:readonly"
            },
            secret: {
                extra: {
                    "accounts.tester.password": "$2y$10$lQ9RmU51My52x6ZkJibWkuWYxqmldAhT82Xh0i1QKiMHxcyEop40y"
                }
            }

        }
    },
});

export const testBootstrapArgoCd = new blueprints.addons.ArgoCDAddOn({
    adminPasswordSecretName: 'cad-argocdAdmin-test',
    name: 'testCluster',
    bootstrapRepo: {
        ...bootstrapRepo,
        path: "environments/test",
    },
    values: {
        server: {
            service: {
                type: "NodePort",
            },
        },
        helm: {
            valueFiles: [
                "values.yaml",
                "gen3-values.yaml"
            ]
        }
    },
});

export const uatBootstrapArgoCd = new blueprints.addons.ArgoCDAddOn({
  adminPasswordSecretName: "cad-argocdAdmin-test",
  name: "uatCluster",
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
    configs: {
      cm: {
        "accounts.tester": "login",
        "admin.enabled": "true",
      },
      rbac: {
        "policy.cad.csv": "g,tester, role:readonly",
      },
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
      valueFiles: ["values.yaml", "gen3-values.yaml", "secrets-values.yaml"],
    },
    configs: {
      cm: {
        "accounts.tester": "login",
        "admin.enabled": "true",
      },
      rbac: {
        "policy.cad.csv": "g,tester, role:readonly",
      },
    },
  },
});

/**
 *
 * @param clusterName
 */
export function devClusterAddons(clusterName: string) {

    const addOns: Array<blueprints.ClusterAddOn> = [
        // Add additional addons here
        new blueprints.addons.CloudWatchLogsAddon({
            namespace: 'aws-for-fluent-bit',
            createNamespace: true,
            serviceAccountName: 'aws-fluent-bit-for-cw-sa',
            logGroupPrefix: `/aws/eks/sandbox-${clusterName}`,
            logRetentionDays: 90,
        }),
        devBootstrapArgoCd,
    ];

    return addOns;
}

export function testClusterAddons(clusterName: string) {

    const addOns: Array<blueprints.ClusterAddOn> = [
        // Add additional addons here
        new blueprints.addons.CloudWatchLogsAddon({
            namespace: 'aws-for-fluent-bit',
            createNamespace: true,
            serviceAccountName: 'aws-fluent-bit-for-cw-sa',
            logGroupPrefix: `/aws/eks/sandbox-${clusterName}`,
            logRetentionDays: 90,
        }),
        testBootstrapArgoCd,
    ];

    return addOns;
}

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

/**
 *
 * @param clusterName
 */
export function sandboxClusterAddons(clusterName: string) {
    const addOns: Array<blueprints.ClusterAddOn> = [
        // Add additional addons here
        new blueprints.addons.CloudWatchLogsAddon({
            namespace: 'aws-for-fluent-bit',
            createNamespace: true,
            serviceAccountName: 'aws-fluent-bit-for-cw-sa',
            logGroupPrefix: `/aws/eks/sandobx-${clusterName}`,
            logRetentionDays: 90,
        }),
        sandboxBootstrapArgoCd,
    ];

    return addOns;
}

/**
 *
 * @param clusterName
 */
export function sandboxClusterProvider(clusterName: string) {
    const version = KubernetesVersion.V1_28;
    return new blueprints.GenericClusterProvider({
        version: version,
        clusterName: clusterName,
        managedNodeGroups: [
            {
                id: 'mng1',
                minSize: 1,
                maxSize: 4,
                desiredSize: 3,
                instanceTypes: [new ec2.InstanceType('m5.large')],
                amiType: NodegroupAmiType.AL2_X86_64,
                nodeGroupCapacityType: CapacityType.ON_DEMAND,
                amiReleaseVersion: '1.28.5-20240110',
                // amiReleaseVersion: '1.27.6-20231027',
                tags: {
                    Name: 'GEN3 Cluster',
                    Type: 'ACDC',
                    ENV: 'sandbox'
                },
            },
        ],
    });
}

/**
 *
 * @param clusterName
 */
export function devClusterProvider(clusterName: string) {
    const version = KubernetesVersion.V1_27;
    return new blueprints.GenericClusterProvider({
        version: version,
        clusterName: clusterName,
        endpointAccess: EndpointAccess.PRIVATE,
        managedNodeGroups: [
            {
                id: 'mng1',
                minSize: 1,
                maxSize: 4,
                desiredSize: 3,
                instanceTypes: [new ec2.InstanceType('m5.large')],
                amiType: NodegroupAmiType.AL2_X86_64,
                nodeGroupCapacityType: CapacityType.ON_DEMAND,
                amiReleaseVersion: '1.27.6-20231027',
                tags: {
                    Name: 'GEN3 Cluster',
                    Type: 'ACDC',
                    ENV: 'dev'
                },
            },
        ],
    });
}

/**
 *
 * @param clusterName
 */
export function testClusterProvider(clusterName: string) {
    const version = KubernetesVersion.V1_27;
    return new blueprints.GenericClusterProvider({
        version: version,
        clusterName: clusterName,
        managedNodeGroups: [
            {
                id: 'mng1',
                minSize: 1,
                maxSize: 4,
                desiredSize: 3,
                instanceTypes: [new ec2.InstanceType('m5.large')],
                amiType: NodegroupAmiType.AL2_X86_64,
                nodeGroupCapacityType: CapacityType.ON_DEMAND,
                amiReleaseVersion: '1.27.6-20231027',
                tags: {
                    Name: 'GEN3 Cluster',
                    Type: 'ACDC',
                    ENV: 'test'
                },
            },
        ],
    });
}

export function uatClusterProvider(clusterName: string) {
    const version = KubernetesVersion.V1_28;
    return new blueprints.GenericClusterProvider({
      version: version,
      clusterName: clusterName,
      managedNodeGroups: [
        {
          id: "mng1",
          minSize: 1,
          maxSize: 3,
          desiredSize: 2,
          diskSize: 100,
          instanceTypes: [new ec2.InstanceType("m5.4xlarge")],
          amiType: NodegroupAmiType.AL2_X86_64,
          nodeGroupCapacityType: CapacityType.ON_DEMAND,
          amiReleaseVersion: "1.28.5-20240227",
          tags: {
            Name: "GEN3 Cluster",
            Type: "ACDC",
            ENV: "uat",
          },
        },
      ],
    });
}

export function prodClusterProvider(clusterName: string) {
  const version = KubernetesVersion.V1_28;
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
        amiReleaseVersion: "1.28.5-20240227",
        tags: {
          Name: "GEN3 Cluster",
          Type: "ACDC",
          ENV: "prod",
        },
      },
      {
        id: "mng3",
        minSize: 2,
        maxSize: 3,
        desiredSize: 2,
        diskSize: 100,
        instanceTypes: [new ec2.InstanceType("m5.4xlarge")],
        amiType: NodegroupAmiType.AL2_X86_64,
        nodeGroupCapacityType: CapacityType.ON_DEMAND,
        amiReleaseVersion: "1.28.5-20240227",
        tags: {
          Name: "GEN3 Cluster",
          Type: "ACDC",
          ENV: "prod",
        },
      },
    ],
  });
}