import { PlatformTeam } from '@aws-quickstart/eks-blueprints';
import {BuildEnvObj} from "../../environments";

export class TeamPlatform extends PlatformTeam {
    constructor(buildEnv: BuildEnvObj) {
        super({
            name: "platform",
            //To do, define roles
            userRoleArn: `arn:aws:iam::${buildEnv.aws.account}:role/${buildEnv.platformRoleName}`,
        })
    }
}