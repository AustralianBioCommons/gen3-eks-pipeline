import * as blueprints from '@aws-quickstart/eks-blueprints';
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { getSecretValue, validateSecret } from "@aws-quickstart/eks-blueprints/dist/utils/secrets-manager-utils";
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { EksPipelineRepo, toolsRegion } from "./config/environments";
import *  as clusterConfig from  './config/cluster'
import { gen3ClusterProvider } from './config/cluster/cluster-provider';
import {TeamPlatform} from "./teams";
import {buildPolicyStatements} from "./iam";
import { ExternalSecretsSa } from './teams/service-accounts.ts';
import { IamRolesStack } from './iam-roles-stack';


export interface Gen3EksPipelineStackProps {
  project: string;

}

export class Gen3EksPipelineStack extends cdk.Stack {
  async buildAsync(
    scope: Construct,
    id: string,
    props: Gen3EksPipelineStackProps
  ) {
    validateSecret("gen3-env-credentials", toolsRegion);

    validateSecret("code-star-connection-arn", toolsRegion);

    const codeStarConnectionArn = await getSecretValue(
      "code-star-connection-arn",
      toolsRegion
    );

    const envValues = JSON.parse(
      await getSecretValue("gen3-env-credentials", toolsRegion)
    );

    // Prefix for all clusters
    const clusterName = id + "-" + props.project;

    const uatTeams: Array<blueprints.Team> = [new TeamPlatform(envValues.uat)];

    const stagingTeams: Array<blueprints.Team> = [
      new TeamPlatform(envValues.staging),
    ];
    const prodTeams: Array<blueprints.Team> = [
      new TeamPlatform(envValues.prod),
    ];

    const externalSecretSa: Array<blueprints.Team> = [
      new ExternalSecretsSa(envValues.uat),
    ];

    const stagingExternalSecretSa: Array<blueprints.Team> = [
      new ExternalSecretsSa(envValues.staging),
    ];
    const prodExternalSecretSa: Array<blueprints.Team> = [
      new ExternalSecretsSa(envValues.prod),
    ];
    const account = envValues.tools.aws.account;
    const region = envValues.tools.aws.region;

    blueprints.HelmAddOn.validateHelmVersions = true;
    blueprints.HelmAddOn.failOnVersionValidation = false;
    blueprints.utils.logger.settings.minLevel = 3; // info
    blueprints.utils.userLog.settings.minLevel = 2; // debug

    const addOns: Array<blueprints.ClusterAddOn> = [
      new blueprints.addons.AwsLoadBalancerControllerAddOn({
        enableWafv2: true,
      }),
      ...clusterConfig.commonAddons,
    ];

    const blueprint = blueprints.EksBlueprint.builder()
      .name(clusterName)
      .account(account)
      .region(region)
      .addOns(...addOns);

    blueprints.CodePipelineStack.builder()
      .name(`gen3-eks-${envValues.tools.name}`)
      .owner(EksPipelineRepo.gitRepoOwner)
      .codeBuildPolicies(buildPolicyStatements)
      .repository({
        repoUrl: EksPipelineRepo.repoUrl,
        codeStarConnectionArn,
        targetRevision: EksPipelineRepo.tagRevision,
      })
      .enableCrossAccountKeys()
      .stage({
        id: "uat",
        stackBuilder: blueprint
          .clone(region)
          .name(envValues.uat.clusterName)
          .addOns(...clusterConfig.uatClusterAddons)
          .teams(...uatTeams, ...externalSecretSa)
          .clusterProvider(
            gen3ClusterProvider(
              envValues.uat.name,
              envValues.uat.clusterName,
              this.subnetsSelection(envValues.uat.clusterSubnets, "cluster"),
              this.subnetsSelection(envValues.uat.nodeGroupSubnets, "nodes")
            )
          )
          .resourceProvider(
            blueprints.GlobalResources.Vpc,
            new blueprints.VpcProvider(envValues.uat.vpcId)
          )
          .withEnv(envValues.uat.aws),
        stageProps: {
          pre: [
            new blueprints.pipelines.cdkpipelines.ManualApprovalStep(
              "manual-approval"
            ),
          ],
        },
      })
      .stage({
        id: "staging",
        stackBuilder: blueprint
          .clone(region)
          .name(envValues.staging.clusterName)
          .addOns(...clusterConfig.stagingClusterAddons)
          .teams(...stagingTeams, ...stagingExternalSecretSa)
          .clusterProvider(
            gen3ClusterProvider(
              envValues.staging.name,
              envValues.staging.clusterName,
              this.subnetsSelection(
                envValues.staging.clusterSubnets,
                "cluster"
              ),
              this.subnetsSelection(envValues.staging.nodeGroupSubnets, "nodes")
            )
          )
          .resourceProvider(
            blueprints.GlobalResources.Vpc,
            new blueprints.VpcProvider(envValues.staging.vpcId)
          )
          .withEnv(envValues.staging.aws),
        stageProps: {
          pre: [
            new blueprints.pipelines.cdkpipelines.ManualApprovalStep(
              "manual-approval"
            ),
          ],
        },
      })
      .stage({
        id: "prod",
        stackBuilder: blueprint
          .clone(region)
          .name(envValues.prod.clusterName)
          .addOns(...clusterConfig.prodClusterAddons)
          .teams(...prodTeams, ...prodExternalSecretSa)
          .clusterProvider(
            gen3ClusterProvider(
              envValues.prod.name,
              envValues.prod.clusterName,
              this.subnetsSelection(envValues.prod.clusterSubnets, "cluster"),
              this.subnetsSelection(envValues.prod.nodeGroupSubnets, "nodes")
            )
          )
          .resourceProvider(
            blueprints.GlobalResources.Vpc,
            new blueprints.VpcProvider(envValues.prod.vpcId)
          )
          .withEnv(envValues.prod.aws),
        stageProps: {
          pre: [
            new blueprints.pipelines.cdkpipelines.ManualApprovalStep(
              "manual-approval"
            ),
          ],
        },
      })
      .build(scope, id + "-stack", { env: envValues.tools.aws });

      this.addIamRoleStack(scope, envValues.uat)
      this.addIamRoleStack(scope, envValues.staging); 
      this.addIamRoleStack(scope, envValues.prod);  

  }

  private subnetsSelection(subnetIds: [string], type: string) {
    const subnetsSelection: ec2.SubnetSelection = {
      subnets: subnetIds.map((subnetId) =>
        ec2.Subnet.fromSubnetId(this, `Subnet-${subnetId}-${type}`, subnetId)
      ),
    };
    return subnetsSelection;
  }



  private addIamRoleStack(scope: Construct, buildEnv: any) {
    new IamRolesStack(scope, `${buildEnv.clusterName}-IamRoles`, {
      env: buildEnv.aws,
      buildEnv: buildEnv
    });
  }
 
}



