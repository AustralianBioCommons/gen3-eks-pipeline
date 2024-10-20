import { PlatformTeam } from "@aws-quickstart/eks-blueprints";
import { Gen3BuildEnv } from "../../config/environments";

export class TeamPlatform extends PlatformTeam {
  constructor(buildEnv: Gen3BuildEnv) {
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
