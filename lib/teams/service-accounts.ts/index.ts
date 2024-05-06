import { ApplicationTeam, ClusterInfo } from "@aws-quickstart/eks-blueprints";
import * as iam from "aws-cdk-lib/aws-iam";
import { BuildEnvObj, Project } from "../../environments";

export class ExternalSecretsSa extends ApplicationTeam {
  constructor(buildEnv: BuildEnvObj) {
    super({
      name: 'external-secrets-sa',
      namespace: Project,
    });
  }

  protected setupServiceAccount(clusterInfo: ClusterInfo) {
    super.setupServiceAccount(clusterInfo);
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
      resources: ["*"],
    });
    this.serviceAccount.addToPrincipalPolicy(smPolicy);
  }
}
