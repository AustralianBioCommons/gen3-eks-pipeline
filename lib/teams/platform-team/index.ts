import { PlatformTeam } from "@aws-quickstart/eks-blueprints";
import { EnvironmentConfig } from "../../config/environments/config-interfaces";

export class TeamPlatform extends PlatformTeam {
  constructor(buildEnv: EnvironmentConfig) {
    super({
      name: "platform", // Defines the team name as 'platform'

      // TODO: Define additional roles for the team as needed,
      // such as admin roles or specific service roles.
      // See: https://aws-quickstart.github.io/cdk-eks-blueprints/teams/teams/

      // The user's role ARN is constructed dynamically using the AWS account
      // and platformRoleName from the build environment configuration.
      userRoleArn: `arn:aws:iam::${buildEnv.aws.account}:role/${buildEnv.platformRoleName}`,
    });
  }
}
