Gen3 EKS Pipeline Stack
=======================

This repository contains the CDK (Cloud Development Kit) setup for deploying a Gen3 EKS (Elastic Kubernetes Service) pipeline. The stack bootstraps a Gen3 cluster with ArgoCD and deploys workloads using Gen3 Helm charts.


Key Features
------------

-   **ArgoCD Integration**: Bootstraps ArgoCD for managing Kubernetes resources across multiple environments.
-   **Helm Chart Deployment**: Automatically deploys Helm charts for Gen3 components in each environment.
-   **External Secrets Management**: Uses the ExternalSecrets Add-On to manage sensitive data through AWS Secrets Manager.
-   **Cluster Add-Ons**: Common Kubernetes add-ons are installed for networking, logging, monitoring, and scaling.
-   **Customizable Environment Stages**: Easily manage configurations for UAT, staging, production, or new environments.

Table of Contents
-----------------

-   [Introduction](#introduction)
-   [Prerequisites](#prerequisites)
-   [Getting Started](#getting-started)
-   [Usage](#usage)
    -   [Forking the Repository and Configuring Environments](#forking-the-repository-and-configuring-environments)
    -   [Deploying the Stack](#deploying-the-stack)
-   [Customizations](#customizations)
-   [Contributing](#contributing)

Introduction
------------

This stack is built on the [AWS Quick Start EKS Blueprints](https://github.com/aws-quickstart/cdk-eks-blueprints) framework, allowing users to create a fully managed EKS cluster with various add-ons and configurations tailored for Gen3 environments.


Prerequisites
-------------

-   [AWS CDK v2](https://docs.aws.amazon.com/cdk/v2/guide/getting_started.html)
-   [AWS CLI](https://aws.amazon.com/cli/)
-   [Node.js 16+](https://nodejs.org/)
-   AWS IAM Role for deploying the CDK stack.
-   [AWS CodeStar Connection](https://docs.aws.amazon.com/dtconsole/latest/userguide/welcome-connections.html) ARN for GitHub integration. The ARN must be stored in AWS Secrets Manager in the account where this stack is deployed (Tools), with the name `code-star-connection-arn`. The Stack will fail to deploy without this.

**ArgoCD Passwords in AWS Secrets Manager**: The tools/management account where this stack will be deployed must have ArgoCD passwords stored in AWS Secrets Manager. The naming convention for these secrets is `<name>-<environment prefix>`, with the default secret name being `argocdAdmin-{env}`. This can be customized in `lib/config/cluster/index.ts` at the variable:


`const argocdCredentialName = "argocdAdmin-{env}";`

Example: For each environment (UAT, staging, production), you will need credentials in AWS Secrets Manager with the following names:

-   `argocdAdmin-uat`
-   `argocdAdmin-staging`
-   `argocdAdmin-prod`

If you used **gen3-cdk-config**, then these would have been setup for you.

**Workloads AWS Account Setup**: Each AWS account that will host an environment (UAT, staging, production) must have a GitHub access token for ArgoCD. This token will be stored in AWS Secrets Manager under the name `gen3-argocd`.

-   For detailed information on creating and configuring a GitHub access token, refer to the [ArgoCD documentation](https://argo-cd.readthedocs.io/en/release-1.8/user-guide/private-repositories/).


Getting Started
-----------------


1.  **Workload Repository**: You will need to configure GitHub repository to store and manage Helm chart configurations. The stack deploys [Gen3 Helm charts](https://helm.gen3.org/) from the [Gen3 Workloads](https://github.com/AustralianBioCommons/gen3-workloads.git) repository.

2.  **Clone or Fork the Repository:** To get started, you can clone or fork this repository. If you fork it, make sure to keep your fork up-to-date with the upstream repository.

          git clone https://AustralianBioCommons/gen3-eks-pipeline.git

          cd gen3-eks-pipeline

2.  **Install Dependencies:** Navigate to the project directory and run the following command to install the required Node.js packages:

    `npm install`


Usage
-----
### Forking the Repository and Configuring Environments

1.  **Forking the Repository:** If you forked the repository, ensure that your changes align with the upstream configurations.

2.  **Environment Configuration:** Environments are defined in `lib/config/environments/index.ts` and `lib/config/cluster/index.ts`. You can customize and define your own environments by modifying the existing configurations.

    Each environment corresponds to stages in your deployment pipeline (e.g., UAT, Staging, Production).



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

