Gen3 EKS Pipeline Stack
=======================

This project builds an AWS EKS (Elastic Kubernetes Service) cluster using the [AWS CDK EKS Blueprints](https://github.com/aws-quickstart/cdk-eks-blueprints). The stack is configured to bootstrap with ArgoCD and deploy Gen3 Helm charts from the `gen3-helm` and `gen3-workloads` repositories.

The infrastructure automates cluster provisioning for environments like UAT, staging, and production, complete with common add-ons such as CertManager, MetricsServer, and ClusterAutoScaler.

Key Features
------------

-   **ArgoCD Integration**: Bootstraps ArgoCD for managing Kubernetes resources across multiple environments.
-   **Helm Chart Deployment**: Automatically deploys Helm charts for Gen3 components in each environment.
-   **External Secrets Management**: Uses the ExternalSecrets Add-On to manage sensitive data through AWS Secrets Manager.
-   **Cluster Add-Ons**: Common Kubernetes add-ons are installed for networking, logging, monitoring, and scaling.
-   **Customizable Environment Stages**: Easily manage configurations for UAT, staging, production, or new environments.

Prerequisites
-------------

-   [AWS CDK v2](https://docs.aws.amazon.com/cdk/v2/guide/getting_started.html)
-   [AWS CLI](https://aws.amazon.com/cli/)
-   [Node.js 16+](https://nodejs.org/)
-   AWS IAM Role for deploying the CDK stack.
-   [AWS CodeStar Connection](https://docs.aws.amazon.com/dtconsole/latest/userguide/welcome-connections.html) ARN for GitHub integration.

Git Configuration
-----------------

You will need to configure GitHub repositories to store and manage Helm chart configurations:

1.  **Workload Repository**: The stack deploys Helm charts from the [Gen3 Workloads](https://github.com/AustralianBioCommons/gen3-workloads.git) repository.

2.  **Setting the Workload Repo**:

    -   Define the `WORKLOAD_REPO` URL in the codebase for your workload configurations.
    -   Set the `targetRevision` to match the desired branch or tag in the workload repository.

Example:



`const WORKLOAD_REPO = "https://github.com/AustralianBioCommons/gen3-workloads.git";
const targetRevision = "main";  // or specify a release tag`

1.  **CodeStar Connection ARN**: Ensure that the correct CodeStar connection ARN is used to integrate GitHub with AWS. You'll need to replace the placeholder value with the actual ARN in the stack configuration.



`const codeStarConnectionArn = "arn:aws:codestar-connections:REGION:ACCOUNT_ID:connection/CONNECTION_ID";`

Adding/Removing Environments
----------------------------

To manage environments, you can modify the existing configurations or add new ones in the `createClusterAddons` function. This will automatically deploy environment-specific add-ons and configurations for your new environment.

### Adding a New Environment

1.  Add the new environment in the `createClusterAddons` function. For example, to add a "dev" environment:



    `export const devClusterAddons = createClusterAddons(
      "dev",
      "devCluster",
      "develop"  // Set the Git branch or tag for the environment
    );`

2.  Update the bootstrap repository to include the new environment path:



    `const bootstrapRepo = (
      env: string,
      targetRevision: string
    ): blueprints.ApplicationRepository => ({
      repoUrl: WORKLOAD_REPO,
      credentialsSecretName: "gen3-argocd",
      credentialsType: "TOKEN",
      targetRevision: targetRevision,
      path: `environments/${env}`,
    });`

3.  Ensure that the environment-specific values YAML file is available in the workload repo:

    -   Path: `environments/dev/gen3-values.yaml`
    -   Adjust values based on environment-specific configurations like namespaces, server settings, etc.

### Removing an Environment

To remove an environment, simply delete its corresponding configuration block from `createClusterAddons` and ensure any associated resources like ArgoCD apps are removed from the `gen3-workloads` repository.

Helm Chart Configuration
------------------------

Helm charts for the Gen3 platform are deployed via ArgoCD. The configuration for each environment can be found in the workload repository under the appropriate environment folder.

-   **Helm Values Files**: Modify the following files to customize each environment's Helm deployment.
    -   `values.yaml`
    -   `gen3-values.yaml`

Example:



`# values.yaml
server:
  service:
    type: NodePort

# gen3-values.yaml
argoCdCertificateArn: arn:aws:acm:REGION:ACCOUNT_ID:certificate/CERTIFICATE_ID
argocdHostname: cd.your-environment.org
externalSecrets:
  roleArn: arn:aws:iam::ACCOUNT_ID:role/your-external-secrets-role`

Usage
-----

1.  **Clone the Repository**: Clone the [Gen3 CDK Config repository](https://github.com/AustralianBioCommons/gen3-cdk-config.git) and navigate to the project directory.


    `git clone https://github.com/AustralianBioCommons/gen3-cdk-config.git
    cd gen3-cdk-config`

2.  **Install Dependencies**: Install the necessary dependencies using `npm` or `yarn`.


    `npm install`

3.  **Deploy the Stack**: Use the AWS CDK CLI to deploy the stack to your AWS account.


    `cdk deploy`

4.  **Check the Cluster**: After the deployment is complete, verify that the EKS cluster is running, and ArgoCD is bootstrapped with the correct Helm charts for your environment.


    `kubectl get pods -n argocd`

