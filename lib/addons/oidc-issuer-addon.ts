import * as blueprints from "@aws-quickstart/eks-blueprints";
import * as cdk from "aws-cdk-lib";
import { OidcIssuerStack } from "../oidc-issuer-stack";

export class OidcIssuerAddOn implements blueprints.ClusterAddOn {
  constructor(
    private namespace: string,
    private oidcIssuerParameter: string,
    private eksEnv: cdk.Environment,
    private concreteClusterName: string
  ) { }

  deploy(clusterInfo: blueprints.ClusterInfo): void {
    const cluster = clusterInfo.cluster;
    const refreshToken =
      cluster.openIdConnectProvider?.openIdConnectProviderArn ??
      cluster.clusterArn;

    new OidcIssuerStack(
      clusterInfo.cluster.stack,
      `${this.namespace}-OidcIssuerStack`,
      {
        env: this.eksEnv,
        clusterName: this.concreteClusterName,
        namespace: this.namespace,
        oidcIssuerParameter: this.oidcIssuerParameter,
        refreshToken,
      }
    );
  }
}
