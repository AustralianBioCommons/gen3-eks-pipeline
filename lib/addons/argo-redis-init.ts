// lib/addons/argo-redis-init.ts
import { ClusterAddOn, ClusterInfo } from "@aws-quickstart/eks-blueprints";
import * as eks from "aws-cdk-lib/aws-eks";
import * as cdk from "aws-cdk-lib";

export interface ArgoRedisInitRbacProps {
  /** Namespace where Argo CD lives. */
  namespace?: string; // default: "argocd"
  /** ServiceAccount used by the redis-secret-init hook. */
  serviceAccountName?: string; // default: "blueprints-addon-argocd-redis-secret-init"
  /** Create the namespace if it doesn't exist. */
  ensureNamespace?: boolean; // default: true
  /** RBAC Role/Binding name. */
  rbacName?: string; // default: "argocd-redis-secret-init"
}

/**
 * Grants the Argo CD redis-secret-init hook SA the minimal permissions to
 * get/list/watch/create/update/patch secrets in the argocd namespace.
 */
export class ArgoRedisInitRbacAddOn implements ClusterAddOn {
  constructor(private readonly props: ArgoRedisInitRbacProps = {}) {}

  deploy(clusterInfo: ClusterInfo): void {
    const ns = this.props.namespace ?? "argocd";
    const sa = this.props.serviceAccountName ?? "blueprints-addon-argocd-redis-secret-init";
    const rbacName = this.props.rbacName ?? "argocd-redis-secret-init";
    const ensureNs = this.props.ensureNamespace ?? true;

    // Optionally ensure the namespace exists (safe if it already does)
    if (ensureNs) {
      new eks.KubernetesManifest(clusterInfo.cluster.stack, `ArgoCD-Namespace-${ns}`, {
        cluster: clusterInfo.cluster,
        manifest: [{ apiVersion: "v1", kind: "Namespace", metadata: { name: ns } }],
        overwrite: true,
        prune: false,
      });
    }

    new eks.KubernetesManifest(clusterInfo.cluster.stack, `ArgoRedisInitRBAC-${ns}`, {
      cluster: clusterInfo.cluster,
      manifest: [
        {
          apiVersion: "rbac.authorization.k8s.io/v1",
          kind: "Role",
          metadata: { name: rbacName, namespace: ns },
          rules: [
            { apiGroups: [""], resources: ["secrets"], verbs: ["get", "list", "watch", "create", "update", "patch"] },
          ],
        },
        {
          apiVersion: "rbac.authorization.k8s.io/v1",
          kind: "RoleBinding",
          metadata: { name: rbacName, namespace: ns },
          subjects: [{ kind: "ServiceAccount", name: sa, namespace: ns }],
          roleRef: { apiGroup: "rbac.authorization.k8s.io", kind: "Role", name: rbacName },
        },
      ],
      overwrite: true,
      prune: false,
    });
  }
}

export interface ArgoRedisSecretProps {
  /** Namespace where Argo CD lives. */
  namespace?: string; // default: "argocd"
  /** Secret name ArgoCD expects. */
  secretName?: string; // default: "argocd-redis"
  /** Plaintext password; will be stored via stringData (K8s will base64 it). */
  password: string;
  /** Create the namespace if it doesn't exist. */
  ensureNamespace?: boolean; // default: true
}

/**
 * (Optional) Precreates the argocd-redis Secret so the chart doesn't need the redis-secret-init hook.
 * If you use this, set ArgoCD Helm values: redis.existingSecret=<secretName>
 */
export class ArgoRedisSecretAddOn implements ClusterAddOn {
  constructor(private readonly props: ArgoRedisSecretProps) {
    if (!props?.password) {
      throw new Error("ArgoRedisSecretAddOn: 'password' is required.");
    }
  }

  deploy(clusterInfo: ClusterInfo): void {
    const ns = this.props.namespace ?? "argocd";
    const name = this.props.secretName ?? "argocd-redis";
    const ensureNs = this.props.ensureNamespace ?? true;

    if (ensureNs) {
      new eks.KubernetesManifest(clusterInfo.cluster.stack, `ArgoCD-Namespace-${ns}`, {
        cluster: clusterInfo.cluster,
        manifest: [{ apiVersion: "v1", kind: "Namespace", metadata: { name: ns } }],
        overwrite: true,
        prune: false,
      });
    }

    new eks.KubernetesManifest(clusterInfo.cluster.stack, `ArgoRedisSecret-${ns}`, {
      cluster: clusterInfo.cluster,
      manifest: [
        {
          apiVersion: "v1",
          kind: "Secret",
          metadata: { name, namespace: ns },
          type: "Opaque",
          // stringData lets you pass plaintext; the API server encodes it.
          stringData: { "redis-password": this.props.password },
        },
      ],
      overwrite: true,
      prune: false,
    });
  }
}
