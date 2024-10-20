import * as blueprints from "@aws-quickstart/eks-blueprints";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import {
  getSecretValue,
  validateSecret,
} from "@aws-quickstart/eks-blueprints/dist/utils/secrets-manager-utils";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { EksPipelineRepo, toolsRegion } from "./config/environments";
import * as clusterConfig from "./config/cluster";
import { gen3ClusterProvider } from "./config/cluster/cluster-provider";
import { buildPolicyStatements } from "./iam";
import { IamRolesStack } from "./iam-roles-stack";
import { getStages, project, Gen3BuildEnv } from "./config/environments";
import * as lambda from "aws-cdk-lib/aws-lambda"; 
import * as events from "aws-cdk-lib/aws-events"; 
import * as targets from "aws-cdk-lib/aws-events-targets"; 
import * as ssm from "aws-cdk-lib/aws-ssm"; 
import * as iam from "aws-cdk-lib/aws-iam"; 

export class Gen3EksPipelineStack extends cdk.Stack {
  async buildAsync(scope: Construct, id: string) {
    validateSecret("gen3-env-credentials", toolsRegion);
    validateSecret("code-star-connection-arn", toolsRegion);

    const codeStarConnectionArn = await getSecretValue(
      "code-star-connection-arn",
      toolsRegion
    );
    const envValues = JSON.parse(
      await getSecretValue("gen3-env-credentials", toolsRegion)
    );

    const clusterName = `${id}-${project}`;
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

    // Gen3 environment stages
    const stages = await getStages();

    // Create the CodePipelineStack
    const pipelineStack = blueprints.CodePipelineStack.builder()
      .name(`gen3-eks-${envValues.tools.name}`)
      .owner(EksPipelineRepo.gitRepoOwner)
      .codeBuildPolicies(buildPolicyStatements)
      .repository({
        repoUrl: EksPipelineRepo.repoUrl,
        codeStarConnectionArn,
        targetRevision: EksPipelineRepo.tagRevision,
      })
      .enableCrossAccountKeys();

    // Add stages dynamically
    for (const { id, env, teams, externalSecret, addons } of stages) {
      const stage = pipelineStack.stage({
        id: id,
        stackBuilder: blueprint
          .clone(region)
          .name(env.clusterName)
          .addOns(...addons)
          .teams(...teams, externalSecret)
          .clusterProvider(
            await gen3ClusterProvider(
              env.name,
              env.clusterName,
              this.subnetsSelection(env.clusterSubnets, "cluster"),
              this.subnetsSelection(env.nodeGroupSubnets, "nodes")
            )
          )
          .resourceProvider(
            blueprints.GlobalResources.Vpc,
            new blueprints.VpcProvider(env.vpcId)
          )
          .withEnv(env.aws),
        stageProps: {
          pre: [
            new blueprints.pipelines.cdkpipelines.ManualApprovalStep(
              "manual-approval"
            ),
          ],
        },
      });
    }

    pipelineStack.build(scope, `${id}-stack`, { env: envValues.tools.aws });

    // Add IAM Role Stacks for each environment
    for (const { env } of stages) {
      this.addIamRoleStack(scope, env);
    }

    // Lambda function to update Cluster on config change
    const ssmChangeLambda = new lambda.Function(this, `${id}ClusterConfigLambda`, {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset("lib/lambda/cluster-config"), 
      environment: {
        STAGE_NAME: id, 
      },
    });

    // Grant necessary permissions to the Lambda function
    ssmChangeLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "cloudformation:UpdateStack",
          "cloudformation:DescribeStacks",
        ],
        resources: ["*"],
      })
    );

    // CloudWatch event rule to trigger Lambda on SSM parameter change
    for (const { id } of stages) {
      const ssmParameterChangeRule = new events.Rule(
        this,
        `${id}SSMParameterChangeRule`,
        {
          eventPattern: {
            source: ["aws.ssm"],
            detailType: ["SSM Parameter Store Change"],
            detail: {
              name: [`/gen3/${id}/cluster-config`], 
            },
          },
        }
      );

      ssmParameterChangeRule.addTarget(
        new targets.LambdaFunction(ssmChangeLambda)
      );
    }
  }

  private subnetsSelection(subnetIds: [string], type: string) {
    const subnetsSelection: ec2.SubnetSelection = {
      subnets: subnetIds.map((subnetId) =>
        ec2.Subnet.fromSubnetId(this, `Subnet-${subnetId}-${type}`, subnetId)
      ),
    };
    return subnetsSelection;
  }

  private addIamRoleStack(scope: Construct, buildEnv: Gen3BuildEnv) {
    new IamRolesStack(scope, `${buildEnv.clusterName}-IamRoles`, {
      env: buildEnv.aws,
      buildEnv: buildEnv,
    });
  }
}
