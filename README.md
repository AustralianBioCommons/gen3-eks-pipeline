Gen3 EKS Pipeline Stack
=======================

This repository contains the CDK (Cloud Development Kit) setup for deploying a Gen3 EKS (Elastic Kubernetes Service) pipeline. The stack bootstraps a Gen3 cluster with ArgoCD and deploys workloads using Gen3 Helm charts. It follows the app of apps pattern and is designed to work seamlessly with the [gen3-workloads-example](https://github.com/AustralianBioCommons/gen3-workloads-example) as a dependent repository.

Purpose
-------

The Gen3 EKS Pipeline repository serves as a foundational setup for bootstrapping Gen3 applications with ArgoCD. It enables users to define and manage their EKS clusters, along with the necessary resources and configurations to run Gen3 workloads effectively.

Key Features
------------

-   **EKS Blueprints Integration:** Utilizes AWS Quickstart's EKS Blueprints to simplify cluster setup and management.
-   **Dynamic Environment Stages:** Supports the definition of multiple environments (e.g., UAT, staging, production) with customizable configurations.
-   **IAM Roles Management:** Facilitates the creation and management of IAM roles tailored for specific services within the Gen3 architecture.
-   **ArgoCD Integration**: Bootstraps ArgoCD for managing Kubernetes resources across multiple environments.
-   **Helm Chart Deployment**: Automatically deploys Helm charts for Gen3 components in each environment.
-   **External Secrets Management**: Uses the ExternalSecrets Add-On to manage sensitive data through AWS Secrets Manager.
-   **Cluster Add-Ons**: Common Kubernetes add-ons are installed for networking, logging, monitoring, and scaling.


Table of Contents
-----------------

-   [Introduction](#introduction)
-   [Prerequisites](#prerequisites)
-   [Getting Started](#getting-started)
-   [Usage](#usage)
    -   [Forking the Repository and Configuring Environments](#forking-the-repository-and-configuring-environments)
    -   [Deploying the Stack](#deploying-the-stack)
-   [Customizations](#customizations)
-   [Advanced Configuration](#Advanced-Configuration)

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

**ArgoCD Passwords in AWS Secrets Manager**: The tools/management account where this stack will be deployed must have ArgoCD passwords stored in AWS Secrets Manager. The naming convention for these secrets is `<name>-<environment prefix>`, with the default secret name being `argocdAdmin-{env}`. 


Example: For each environment (UAT, staging, production), you will need credentials in AWS Secrets Manager with the following names:

-   `argocdAdmin-uat`
-   `argocdAdmin-staging`
-   `argocdAdmin-prod`

If you used **gen3-cdk-config**, then these would have been setup for you.

**Workloads AWS Account Setup**: Each AWS account that will host an environment (UAT, staging, production) must have a GitHub access token for ArgoCD. This token will be stored in AWS Secrets Manager under the name `gen3-argocd`.

-   For detailed information on creating and configuring a GitHub access token, refer to the [ArgoCD documentation](https://argo-cd.readthedocs.io/en/release-1.8/user-guide/private-repositories/).


Getting Started
-----------------


**Workload Repository**: You will need to configure GitHub repository to store and manage Helm chart configurations. The stack deploys [Gen3 Helm charts](https://helm.gen3.org/) from the [Gen3 Workloads](https://github.com/AustralianBioCommons/gen3-workloads-example.git) repository.

[See Quick Start Guide](docos/quick-start-guide.md)


Adding/Removing Environments
----------------------------

To manage environments, you can modify the existing configurations  This will automatically deploy environment-specific add-ons and configurations for your new environment.

Environments are managed in the following parameter stores in the **tools account**:

`/gen3/config` AWS information such as vpc (if providing one), account information

`/gen3/{env}/iamRolesConfig` IAM policies for Gen3 Services

`/gen3/{env}/cluster-config` Autoscaling, disk, k8s version, etc

Please note that `tools` account is required in the configuration, it can be the same AWS account as workload for development purposes. This is where the pipeline is deployed.


Customizations
--------------



Advanced Configuration
----------------------