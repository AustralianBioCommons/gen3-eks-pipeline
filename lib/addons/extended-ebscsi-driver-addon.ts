import * as blueprints from "@aws-quickstart/eks-blueprints";
import { Construct } from "constructs";

export class ExtendedEbsCsiDriverAddOn extends blueprints.EbsCsiDriverAddOn {
    constructor() {
        super(); // keep the managed add-on config
    }

    async deploy(clusterInfo: blueprints.ClusterInfo): Promise<Construct> {
        super.deploy(clusterInfo);

        const cluster = clusterInfo.cluster;

        const sc = cluster.addManifest("Gp3WffcStorageClass", {
            apiVersion: "storage.k8s.io/v1",
            kind: "StorageClass",
            metadata: {
                name: "gp3-wffc",
                annotations: {
                    "storageclass.kubernetes.io/is-default-class": "true",
                },
            },
            provisioner: "ebs.csi.aws.com",
            allowVolumeExpansion: true,
            volumeBindingMode: "WaitForFirstConsumer",
            parameters: { type: "gp3", encrypted: "true" },
            reclaimPolicy: "Delete",
        });

        return sc;
    }

}
