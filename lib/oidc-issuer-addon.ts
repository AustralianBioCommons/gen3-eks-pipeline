import * as blueprints from "@aws-quickstart/eks-blueprints";
import { OidcIssuerStack } from "./oidc-issuer-stack";

export class OidcIssuerAddOn implements blueprints.ClusterAddOn {
  constructor(private namespace: string, private oidcIssuerParameter: string) {}

  deploy(clusterInfo: blueprints.ClusterInfo): void {
    new OidcIssuerStack(
      clusterInfo.cluster.stack,
      `${this.namespace}-OidcIssuerStack`,
      {
        env: clusterInfo.cluster.env,
        clusterName: clusterInfo.cluster.clusterName,
        namespace: this.namespace,
        oidcIssuerParameter: this.oidcIssuerParameter,
      }
    );
  }
}
