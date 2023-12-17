import * as blueprints from '@aws-quickstart/eks-blueprints';
import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import {BuildEnv, getVpcId} from "gen3-aws-config/dist/environments";
import *  as clusterConfig from  'gen3-aws-config/dist/cluster'
import {TeamPlatform} from "gen3-aws-config/dist/teams";


export interface Gen3EksPipelineStackProps {
  env: cdk.Environment;
  project: string;

}

export class Gen3EksPipelineStack extends cdk.Stack {

  async buildAsync(scope: Construct, id: string, props: Gen3EksPipelineStackProps) {

    const clusterName = id+'-'+props.project;

    const devVpcId = await getVpcId(BuildEnv.dev);
    // const sandboxVpcId = await getVpcId(BuildEnv.sandbox);
    // const testVpcId = await getVpcId(BuildEnv.test);
    // const prodVpcId = await getVpcId(BuildEnv.prod);

    const account = BuildEnv.tools.aws.account;
    const region = BuildEnv.tools.aws.region;

    blueprints.HelmAddOn.validateHelmVersions = true;
    blueprints.HelmAddOn.failOnVersionValidation = false;
    blueprints.utils.logger.settings.minLevel = 3; // info
    blueprints.utils.userLog.settings.minLevel = 2; // debug

    const teams: Array<blueprints.Team> = [
      new TeamPlatform(account),
    ];

    const nodeRole = new blueprints.CreateRoleProvider('gen3-node-role', new iam.ServicePrincipal('ec2.amazonaws.com'),
        [
          iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSWorkerNodePolicy'),
          iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ContainerRegistryReadOnly'),
          iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
        ]);


    const addOns: Array<blueprints.ClusterAddOn> = [
      new blueprints.addons.AwsLoadBalancerControllerAddOn(),
      new blueprints.addons.CertManagerAddOn(),
      new blueprints.addons.CalicoOperatorAddOn(),
      new blueprints.addons.MetricsServerAddOn(),
      new blueprints.addons.ClusterAutoScalerAddOn(),
      new blueprints.addons.SecretsStoreAddOn(),
      new blueprints.addons.NginxAddOn(),
      new blueprints.addons.SSMAgentAddOn(),
      new blueprints.addons.CoreDnsAddOn(),
      new blueprints.addons.KubeProxyAddOn(),
      new blueprints.addons.VpcCniAddOn(),
      new blueprints.addons.EbsCsiDriverAddOn(),
      new blueprints.addons.ExternalsSecretsAddOn({
        values: {
          crds: {
            createClusterSecretStore: true,
          },
        },
      }),
    ];

    const blueprint = blueprints.EksBlueprint.builder()
        .name(clusterName)
        .account(account)
        .region(region)
        .addOns(...addOns)
        .teams(...teams)
        .resourceProvider(`gen3-node-role-${id}`, nodeRole);

    // @ts-ignore
    blueprints.CodePipelineStack.builder()
        .name('gen3-infra-pipeline-2')
        .owner('AustralianBioCommons')
        .codeBuildPolicies(blueprints.DEFAULT_BUILD_POLICIES)
        .repository({
          repoUrl: 'gen3-aws-cdk',
          credentialsSecretName: 'gen3_github_token',
          targetRevision: 'refactor',
        })
        .stage({
          id: 'sandbox',
          stackBuilder: blueprint
              .clone('ap-southeast-2')
              .name(`${clusterName}-${BuildEnv.sandbox.name}`)
              .addOns(...clusterConfig.sandboxClusterAddons(clusterName))
              .clusterProvider(clusterConfig.sandboxClusterProvider(clusterName))
              .resourceProvider(
                  blueprints.GlobalResources.Vpc,
                  new blueprints.VpcProvider(devVpcId),
              )
              .withEnv(BuildEnv.sandbox.aws),
        })
        .stage({
          id: 'dev',
          stackBuilder: blueprint
              .clone('ap-southeast-2')
              .name(`${clusterName}-${BuildEnv.dev.name}`)
              .addOns(...clusterConfig.devClusterAddons(clusterName))
              .clusterProvider(clusterConfig.devClusterProvider(clusterName))
              .resourceProvider(
                  blueprints.GlobalResources.Vpc,
                  new blueprints.VpcProvider(devVpcId),
              )
              .withEnv(BuildEnv.dev.aws),
          stageProps: {
            pre: [
              new blueprints.pipelines.cdkpipelines.ManualApprovalStep(
                  'manual-approval',
              ),
            ],
          },
        })
        .build(scope, id + '-stack', props);
  }

}

