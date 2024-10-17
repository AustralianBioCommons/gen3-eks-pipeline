import * as blueprints from '@aws-quickstart/eks-blueprints';
import { getSecretValue, validateSecret } from "@aws-quickstart/eks-blueprints/dist/utils/secrets-manager-utils";
import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { EksPipelineRepo, toolsRegion } from "./config/environments";
import *  as clusterConfig from  './config/cluster'
import {TeamPlatform} from "./teams";
import {buildPolicyStatements} from "./iam";
import { ExternalSecretsSa } from './teams/service-accounts.ts';



export interface Gen3EksPipelineStackProps {
  project: string;

}

export class Gen3EksPipelineStack extends cdk.Stack {

  async buildAsync(scope: Construct, id: string, props: Gen3EksPipelineStackProps) {

    validateSecret("gen3-argocd", toolsRegion);

    validateSecret("gen3-env-credentials", toolsRegion)

    validateSecret("code-star-connection-arn", toolsRegion);

    const codeStarConnectionArn = await getSecretValue("code-star-connection-arn", toolsRegion)
  
    const envValues = JSON.parse(await getSecretValue("gen3-env-credentials", toolsRegion));

    const clusterName = id+'-' + props.project;

    const uatTeams: Array<blueprints.Team> = [
      new TeamPlatform(envValues.uat),
    ];

    const stagingTeams: Array<blueprints.Team> = [
      new TeamPlatform(envValues.staging),
    ];
    const prodTeams: Array<blueprints.Team> = [
      new TeamPlatform(envValues.prod),
    ];

    const externalSecretSa: Array<blueprints.Team> = [new ExternalSecretsSa(envValues.uat)];

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


    const nodeRole = new blueprints.CreateRoleProvider('gen3-node-role', new iam.ServicePrincipal('ec2.amazonaws.com'),
        [
          iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSWorkerNodePolicy'),
          iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ContainerRegistryReadOnly'),
          iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
        ]);

    const addOns: Array<blueprints.ClusterAddOn> = [
      new blueprints.addons.AwsLoadBalancerControllerAddOn({
        enableWafv2: true
      }),
      ...clusterConfig.commonAddons
    ];

    const blueprint = blueprints.EksBlueprint.builder()
        .name(clusterName)
        .account(account)
        .region(region)
        .addOns(...addOns)
        .resourceProvider(`gen3-node-role-${id}`, nodeRole);


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
          .name(`${clusterName}-${envValues.uat.name}`)
          .addOns(
            ...clusterConfig.uatClusterAddons(
              `${clusterName}-${envValues.uat.name}`
            )
          )
          .teams(...uatTeams, ...externalSecretSa)
          .clusterProvider(
            clusterConfig.uatClusterProvider(
              `${clusterName}-${envValues.uat.name}`
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
          .name(`${clusterName}-${envValues.staging.name}`)
          .addOns(
            ...clusterConfig.stagingClusterAddons(
              `${clusterName}-${envValues.staging.name}`
            )
          )
          .teams(...stagingTeams, ...stagingExternalSecretSa)
          .clusterProvider(
            clusterConfig.stagingClusterProvider(
              `${clusterName}-${envValues.staging.name}`
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
          .name(`${clusterName}-${envValues.prod.name}`)
          .addOns(
            ...clusterConfig.prodClusterAddons(
              `${clusterName}-${envValues.prod.name}`
            )
          )
          .teams(...prodTeams, ...prodExternalSecretSa)
          .clusterProvider(
            clusterConfig.prodClusterProvider(
              `${clusterName}-${envValues.prod.name}`
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
  }

}

