# Convergence v2 — mixed fleet (some stacks deployed from iam-roles-removal)

Baseline: **iam-roles-removal branch structure** (prefetched cluster config,
sync `buildClusterProviderFromConfig`, inline OIDC issuer Lambda, `await`
in bin, event-bus before pipeline build), because that is the more recently
deployed shape. Fleet-divergent facts are per-env SSM config, not code.

Features on top:
- **Configurable add-on versions** (`managedAddons`/`helmAddons` in
  `/gen3/<env>/cluster-config`). Version unset → addon installed at its
  currently deployed default; never omitted. external-secrets falls back to
  the deployed 0.16.1 pin. ArgoCD/external-secrets *values shapes are the
  iam-roles-removal ones* (configs at top level, valueFiles incl.
  gen3-values.yaml) — i.e. what's deployed.
- **Workspace node group** (`workspaceNodeGroup` block) — additive; envs
  without the block keep exactly one node group.
- **PVC**: `ExtendedEbsCsiDriverAddOn` + gp3-wffc default StorageClass
  unchanged; driver pinnable via `managedAddons.ebsCsiVersion`.
- **IAM roles**: `embedIamRolesAllowlist` retained as the migration knob;
  roles get `DeletionPolicy: Retain`. Role creation is phased out per env,
  then the capability is deleted from the codebase (see end state).

## MANDATORY pre-deploy audit (because the fleet is mixed)

For every env, against its account:

1. **Node group id** — `aws eks list-nodegroups --cluster-name <env-cluster>`
   - `mng-<env>-1` → nothing to do (code default).
   - `mng-<env>-general` (deployed from main/1.3.3) → set
     `"generalNodeGroupId": "mng-<env>-general"` in that env's
     `/gen3/<env>/cluster-config` BEFORE deploying, or the node group is
     REPLACED.
2. **Embedded IAM roles** —
   `aws cloudformation describe-stack-resources --stack-name <env-cluster-stack> \
      --query "StackResources[?ResourceType=='AWS::CloudFormation::Stack'].LogicalResourceId"`

   The embed decision is now **per project per env** via `embedIamRoles`
   in `/gen3/<env>/cluster-config` (each pipeline reads its own tools
   account, so projects can't collide). The shared cdk.json
   `embedIamRolesAllowlist` remains only as a fallback when the flag is
   unset, and ships as a superset `["test", "uat", "staging"]` because
   the failure modes are asymmetric: over-embedding fails visibly
   (EntityAlreadyExists / unused duplicate roles), under-embedding
   silently deletes live roles. **Set the flag explicitly for every env
   in every project before the first deploy:**
   - `IamRolesStack` present in the deployed cluster stack →
     `"embedIamRoles": true`
   - absent → `"embedIamRoles": false`

   Known fleet as of this merge:
   - Project with **no IAM roles in test** → its test cluster-config:
     `"embedIamRoles": false`
   - Project with **IAM roles in test and staging** → those two
     cluster-configs: `"embedIamRoles": true` (Retain lands on first
     deploy; flip to false per env during phase-out)
3. **OIDC issuer shape** — same describe-stack-resources output:
   - Envs deployed from main show a nested `<namespace>-OidcIssuerStack`.
     Expected diff on first deploy: that nested stack is deleted and the
     inline `<project>-<env>-FetchOidcIssuerFunction` + custom resource
     are created. Safe: the `/gen3/.../oidcIssuer` SSM parameter is written
     by the Lambda (not CFN-owned) and survives; the old custom resource
     has no onDelete. But verify the parameter still resolves after deploy
     — IRSA trust policies in the external role repos depend on it.
   - Envs deployed from iam-roles-removal: no diff here.

## Expected first-deploy diff per fleet

- **iam-roles-removal-deployed envs**: near no-op. Only additions you opt
  into (workspace group, version pins) plus CodeBuild `eks:Describe*`
  actions. If the env is (correctly) not allow-listed: nothing IAM-related.
- **main/1.3.3-deployed envs** (with `generalNodeGroupId` override set):
  node groups untouched; nested OidcIssuerStack replaced by inline issuer
  (see above); `DeletionPolicy: Retain` appears on embedded roles.

Approve each stage only after the pipeline diff matches this description —
any node group replacement means the audit for that env was wrong.

## Phase-out sequence (per env, after first deploy)

1. External roles live (platform-bootstrap / per-commons repo), pod service
   accounts annotated to them, CloudTrail shows AssumeRoleWithWebIdentity
   against the new ARNs.
2. Set `"embedIamRoles": false` in that env's cluster-config, deploy —
   nested IamRolesStack removed, physical roles retained as orphans.
   (The Retain policy must already be in that env's deployed template,
   i.e. one deploy of this branch with the flag still `true`.)
3. Delete orphaned `*-service-role` roles manually once CloudTrail shows
   no assumptions.
4. When every env in every project resolves to `false`, apply the
   end-state commit
   (kept as an open PR): delete `iam-roles-addon.ts`, `iam-roles-stack.ts`,
   `oidc-issuer-stack.ts` (unused once the inline issuer is everywhere),
   allowlist logic, `IamRoleConfig`/`IamRolesConfig` interfaces, and the
   `iamRolesConfig` EventBridge pattern. Ordering is mandatory: that commit
   reaching an env whose last deployed template lacks Retain deletes live
   roles.

## SSM cluster-config — full schema example

```json
{
  "version": "1.31",
  "minSize": 2, "maxSize": 4, "desiredSize": 2,
  "diskSize": 100, "instanceType": "m5.2xlarge",
  "amiReleaseVersion": "…", "tags": { "…": "…" },

  "generalNodeGroupId": "mng-<env>-general",   // ONLY main-deployed envs
  "embedIamRoles": false,                       // REQUIRED: match deployed reality

  "workspaceNodeGroup": {
    "enabled": true,
    "minSize": 0, "maxSize": 4, "desiredSize": 1,
    "diskSize": 100,
    "instanceTypes": ["m5.2xlarge"],
    "capacityType": "ON_DEMAND"
  },

  "managedAddons": {
    "vpcCniVersion": "v1.19.0-eksbuild.1",
    "kubeProxyVersion": "v1.31.2-eksbuild.3",
    "coreDnsVersion": "v1.11.3-eksbuild.2",
    "ebsCsiVersion": "v1.37.0-eksbuild.1"
  },
  "helmAddons": {
    "argoCdChartVersion": "7.7.5",
    "awsLoadBalancerControllerChartVersion": "1.10.0",
    "calicoChartVersion": "3.28.2",
    "certManagerChartVersion": "1.16.1",
    "metricsServerChartVersion": "3.12.2",
    "clusterAutoscalerChartVersion": "9.43.2",
    "externalSecretsChartVersion": "0.16.1",
    "secretsStoreCsiDriverChartVersion": "1.4.6",
    "awsFluentBitChartVersion": "0.1.34"
  }
}
```

Everything below `tags` is optional. Pin versions to what's *currently
running* first (`aws eks describe-addon`, `helm list -A`) so the first
pinned deploy is a no-op, then bump deliberately (uat → prod).
