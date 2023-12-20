import * as blueprints from '@aws-quickstart/eks-blueprints';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

import {
    CapacityType,
    KubernetesVersion,
    NodegroupAmiType,
} from 'aws-cdk-lib/aws-eks';

const APP_REPO = 'git@github.com:AustralianBioCommons/gen3-helm.git';
const WORKLOAD_REPO = 'git@github.com:AustralianBioCommons/gen3-workloads.git';

const bootstrapRepo: blueprints.ApplicationRepository = {
    repoUrl: WORKLOAD_REPO,
    credentialsSecretName: "github-ssh-key",
    credentialsType: "SSH",
    targetRevision: "main",
};



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
        ...bootstrapRepo,
        path: "environments/dev",
    },
    values: {
        server: {
            service: {
                type: "LoadBalancer",
            },
        },
    },
});

export const testBootstrapArgoCd = new blueprints.addons.ArgoCDAddOn({
    adminPasswordSecretName: 'cad-argocdAdmin-test',
    name: 'testCluster',
    bootstrapRepo: {
        ...bootstrapRepo,
        path: "environments/testd",
    },
    values: {
        server: {
            service: {
                type: "LoadBalancer",
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