import { ApplicationTeam, ClusterInfo } from "@aws-quickstart/eks-blueprints";
import * as iam from "aws-cdk-lib/aws-iam";
import { Gen3BuildEnv } from "../../config/environments";

/**
 * The Application Team class is used to create the ExternalSecretsSa
 * Kubernetes service account for the external-secrets operator. This service account
 * is assigned specific IAM permissions to interact with AWS Secrets Manager and
 * SSM Parameter Store. Additionally, a corresponding role is created with the necessary permissions.
 *
 * Disclaimer: The current policy grants access to all secrets (`resources: ["*"]`). 
 * This should be further restricted to specific resources or paths to follow the principle of least privilege.
 */

export class ExternalSecretsSa extends ApplicationTeam {
  /**
   * The constructor initializes the `ApplicationTeam` superclass with specific configurations.
   *
   * @param buildEnv - The build environment object (`Gen3BuildEnv`) containing environment-specific settings.
   * It is used to manage different configurations for environments like dev, test, and production.
   */
  constructor(buildEnv: Gen3BuildEnv) {
    // Calling the parent class (ApplicationTeam) constructor with specific values for team name and namespace
    super({
      name: "external-secrets", // Defines the team name as 'external-secrets'
      namespace: buildEnv.namespace, // The namespace for the service account
    });
  }

  /**
   * The `setupServiceAccount` method configures the service account
   * to interact with AWS services (Secrets Manager and SSM Parameter Store).
   *
   * @param clusterInfo - Contains metadata about the EKS cluster, used to apply the service account
   * settings to the specific cluster.
   */
  protected setupServiceAccount(clusterInfo: ClusterInfo) {
    // Calls the base class setupServiceAccount method to initialize the service account
    super.setupServiceAccount(clusterInfo);

    // Creates an IAM policy statement granting specific permissions for Secrets Manager, SSM, and KMS
    const smPolicy = new iam.PolicyStatement({
      actions: [
        "secretsmanager:GetResourcePolicy",
        "secretsmanager:GetSecretValue",
        "secretsmanager:DescribeSecret",
        "secretsmanager:ListSecretVersionIds",
        "secretsmanager:ListSecrets",

        "ssm:DescribeParameters",
        "ssm:GetParameter",
        "ssm:GetParameters",
        "ssm:GetParametersByPath",
        "ssm:GetParameterHistory",

        "kms:Decrypt",
      ],
      // The policy allows access to all secrets (this should be further restricted)
      resources: ["*"],
    });

    // Attaches the above policy to the service account, allowing it to interact with AWS Secrets Manager and SSM
    this.serviceAccount.addToPrincipalPolicy(smPolicy);
  }
}
