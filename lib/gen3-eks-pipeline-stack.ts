import * as blueprints from '@aws-quickstart/eks-blueprints';
import { getSecretValue, validateSecret } from "@aws-quickstart/eks-blueprints/dist/utils/secrets-manager-utils";
import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import {BuildEnv, EksPipelineRepo } from "./environments";
import *  as clusterConfig from  './cluster'
import {TeamPlatform} from "./teams";
import {buildPolicyStatements} from "./iam";
import { ExternalSecretsSa } from './teams/service-accounts.ts';



export interface Gen3EksPipelineStackProps {
  project: string;

}

export class Gen3EksPipelineStack extends cdk.Stack {

  async buildAsync(scope: Construct, id: string, props: Gen3EksPipelineStackProps) {

    const clusterName = id+'-' + props.project;

    const uatVpcId = await getSecretValue(
      `${BuildEnv.uat.name}-vpcId`,
      BuildEnv.uat.aws.region!
    );
    
    const stagingVpcId = await getSecretValue(
      `${BuildEnv.staging.name}-vpcId`,
      BuildEnv.staging.aws.region!
    );

    const prodVpcId = await getSecretValue(
      `${BuildEnv.prod.name}-vpcId`,
      BuildEnv.prod.aws.region!
    );

    const uatTeams: Array<blueprints.Team> = [
      new TeamPlatform(BuildEnv.uat),
    ];

    const stagingTeams: Array<blueprints.Team> = [
      new TeamPlatform(BuildEnv.staging),
    ];
    const prodTeams: Array<blueprints.Team> = [
      new TeamPlatform(BuildEnv.prod),
    ];

    const externalSecretSa: Array<blueprints.Team> = [new ExternalSecretsSa(BuildEnv.uat)];

    const stagingExternalSecretSa: Array<blueprints.Team> = [
          new ExternalSecretsSa(BuildEnv.staging),
        ];
    const prodExternalSecretSa: Array<blueprints.Team> = [
      new ExternalSecretsSa(BuildEnv.prod),
    ];
    const account = BuildEnv.tools.aws.account;
    const region = BuildEnv.tools.aws.region;

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

    // const serviceRole = new blueprints.CreateRoleProvider('gen3-service-role',
    //     new iam.FederatedPrincipal('sts.amazonaws.com',
    //         {
    //           StringEquals: { 'sts:ViaService': `eks.${this.region}.amazonaws.com` },
    //           'ForAnyValue:StringLike': { 'sts:ExternalId': 'E60ED68B98362E7D568EA4908070A66B' },
    //         },
    //         'sts:AssumeRoleWithWebIdentity'),
    //     [iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3ReadOnlyAccess')]
    //     );

    const addOns: Array<blueprints.ClusterAddOn> = [
      new blueprints.addons.AwsLoadBalancerControllerAddOn({
        enableWafv2: true
      }),
      new blueprints.addons.CertManagerAddOn(),
      new blueprints.addons.CalicoOperatorAddOn(),
      new blueprints.addons.MetricsServerAddOn(),
      new blueprints.addons.ClusterAutoScalerAddOn(),
      new blueprints.addons.SecretsStoreAddOn(),
      new blueprints.addons.SSMAgentAddOn(),
      new blueprints.addons.CoreDnsAddOn(),
      new blueprints.addons.KubeProxyAddOn(),
      new blueprints.addons.VpcCniAddOn(),
      new blueprints.addons.EbsCsiDriverAddOn(),
    ];

    const blueprint = blueprints.EksBlueprint.builder()
        .name(clusterName)
        .account(account)
        .region(region)
        .addOns(...addOns)
        .resourceProvider(`gen3-node-role-${id}`, nodeRole);
        // .resourceProvider(`serviceRole-${id}`, serviceRole);

    // @ts-ignore
    blueprints.CodePipelineStack.builder()
      .name(`gen3-eks-${BuildEnv.tools.name}`)
      .owner(EksPipelineRepo.gitRepoOwner)
      .codeBuildPolicies(buildPolicyStatements)
      .repository({
        repoUrl: EksPipelineRepo.repoUrl,
        codeStarConnectionArn:
          "arn:aws:codestar-connections:ap-southeast-2:891377157203:connection/f7b5ea72-f57f-4c3b-a00a-fda36a5719b1",
        targetRevision: EksPipelineRepo.tagRevision,
      })
      .enableCrossAccountKeys()
      .stage({
        id: "uat",
        stackBuilder: blueprint
          .clone(region)
          .name(`${clusterName}-${BuildEnv.uat.name}`)
          .addOns(
            ...clusterConfig.uatClusterAddons(
              `${clusterName}-${BuildEnv.uat.name}`
            )
          )
          .teams(...uatTeams, ...externalSecretSa)
          .clusterProvider(
            clusterConfig.uatClusterProvider(
              `${clusterName}-${BuildEnv.uat.name}`
            )
          )
          .resourceProvider(
            blueprints.GlobalResources.Vpc,
            new blueprints.VpcProvider(uatVpcId)
          )
          .withEnv(BuildEnv.uat.aws),
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
          .name(`${clusterName}-${BuildEnv.staging.name}`)
          .addOns(
            ...clusterConfig.stagingClusterAddons(
              `${clusterName}-${BuildEnv.staging.name}`
            )
          )
          .teams(...stagingTeams, ...stagingExternalSecretSa)
          .clusterProvider(
            clusterConfig.stagingClusterProvider(
              `${clusterName}-${BuildEnv.staging.name}`
            )
          )
          .resourceProvider(
            blueprints.GlobalResources.Vpc,
            new blueprints.VpcProvider(stagingVpcId)
          )
          .withEnv(BuildEnv.staging.aws),
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
          .name(`${clusterName}-${BuildEnv.prod.name}`)
          .addOns(
            ...clusterConfig.prodClusterAddons(
              `${clusterName}-${BuildEnv.prod.name}`
            )
          )
          .teams(...prodTeams, ...prodExternalSecretSa)
          .clusterProvider(
            clusterConfig.prodClusterProvider(
              `${clusterName}-${BuildEnv.prod.name}`
            )
          )
          .resourceProvider(
            blueprints.GlobalResources.Vpc,
            new blueprints.VpcProvider(prodVpcId)
          )
          .withEnv(BuildEnv.prod.aws),
        stageProps: {
          pre: [
            new blueprints.pipelines.cdkpipelines.ManualApprovalStep(
              "manual-approval"
            ),
          ],
        },
      })
      .build(scope, id + "-stack", { env: BuildEnv.tools.aws });
  }

}

