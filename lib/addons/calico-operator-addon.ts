import * as blueprints from "@aws-quickstart/eks-blueprints";
import { Construct } from "constructs";

export interface CalicoOperatorWithCrdsAddOnProps {
  /**
   * Calico chart version. The same version is used for the CRD chart and
   * tigera-operator so their APIs stay aligned.
   */
  version?: string;
}

/**
 * Installs Calico's CRD chart and Tigera operator with an explicit CDK
 * dependency between the two Helm resources.
 *
 * Calico 3.32 no longer ships the operator.tigera.io / crd.projectcalico.org
 * CRDs in the tigera-operator chart, so fresh clusters need the separate
 * crd.projectcalico.org.v1 chart first.
 */
export class CalicoOperatorWithCrdsAddOn implements blueprints.ClusterAddOn {
  constructor(private readonly props: CalicoOperatorWithCrdsAddOnProps = {}) {}

  async deploy(clusterInfo: blueprints.ClusterInfo): Promise<Construct> {
    const version = this.props.version;

    const crds = clusterInfo.cluster.addHelmChart("CalicoCrds", {
      chart: "crd.projectcalico.org.v1",
      repository: "https://docs.tigera.io/calico/charts",
      release: "calico-crds",
      namespace: "tigera-operator",
      createNamespace: true,
      wait: true,
      ...(version ? { version } : {}),
    });

    const operator = clusterInfo.cluster.addHelmChart("calico-operator", {
      chart: "tigera-operator",
      repository: "https://docs.tigera.io/calico/charts",
      release: "bp-addon-calico-operator",
      namespace: "calico-operator",
      createNamespace: true,
      values: {},
      ...(version ? { version } : {}),
    });

    operator.node.addDependency(crds);

    return operator;
  }
}
