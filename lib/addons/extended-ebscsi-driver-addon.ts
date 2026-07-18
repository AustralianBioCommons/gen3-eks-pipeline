import * as blueprints from "@aws-quickstart/eks-blueprints";
import { Construct } from "constructs";

export class ExtendedEbsCsiDriverAddOn extends blueprints.EbsCsiDriverAddOn {
    constructor(options?: blueprints.addons.EbsCsiDriverAddOnProps) {
        super(options);
    }

    async deploy(
        clusterInfo: blueprints.ClusterInfo
    ): Promise<Construct> {
        const ebsCsiAddOn = await super.deploy(clusterInfo);

        const storageClass = clusterInfo.cluster.addManifest(
            "Gp3WffcStorageClass",
            {
                apiVersion: "storage.k8s.io/v1",
                kind: "StorageClass",
                metadata: {
                    name: "gp3-wffc",
                    annotations: {
                        // Keep gp3 as the only default StorageClass.
                        "storageclass.kubernetes.io/is-default-class": "false",
                    },
                },
                provisioner: "ebs.csi.aws.com",
                allowVolumeExpansion: true,
                volumeBindingMode: "WaitForFirstConsumer",
                parameters: {
                    type: "gp3",
                    encrypted: "true",
                },
                reclaimPolicy: "Delete",
            }
        );

        storageClass.node.addDependency(ebsCsiAddOn);

        return storageClass;
    }
}