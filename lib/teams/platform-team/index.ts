import { PlatformTeam } from '@aws-quickstart/eks-blueprints';
import {Gen3BuildEnv} from "../../environments";

export class TeamPlatform extends PlatformTeam {
    constructor(buildEnv: Gen3BuildEnv) {
        super({
            name: "platform",
            //To do, define roles
            userRoleArn: `arn:aws:iam::${buildEnv.aws.account}:role/${buildEnv.platformRoleName}`,
        })
    }
}