// oidc-issuer-addon.ts
import * as blueprints from "@aws-quickstart/eks-blueprints";
import * as cdk from "aws-cdk-lib";

export class OidcIssuerAddOn implements blueprints.ClusterAddOn {
  constructor(
    private namespace: string,
    private oidcIssuerParameter: string,
    private eksEnv: cdk.Environment,
    private concreteClusterName: string
  ) { }

  deploy(clusterInfo: blueprints.ClusterInfo): void {
    // Intentionally empty — OidcIssuerStack is created at pipeline level
    // to avoid nested stack / cross-stack export issues
  }

  // Expose for pipeline stack to consume
  getClusterName() { return this.concreteClusterName; }
  getNamespace() { return this.namespace; }
  getOidcIssuerParameter() { return this.oidcIssuerParameter; }
  getEksEnv() { return this.eksEnv; }
}
