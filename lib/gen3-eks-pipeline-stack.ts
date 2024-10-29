import * as blueprints from "@aws-quickstart/eks-blueprints";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import {
  getSecretValue,
  validateSecret,
} from "@aws-quickstart/eks-blueprints/dist/utils/secrets-manager-utils";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import {
  getGithubRepoConfig,
  toolsRegion
} from "./config/environments";
import * as clusterConfig from "./config/cluster";
import { gen3ClusterProvider } from "./config/cluster/cluster-provider";
import { buildPolicyStatements } from "./iam";
import { IamRolesStack } from "./iam-roles-stack";
import {
  getStages,
  validateParameter,
  getAwsConfig,
  addCredentialsOrConnectionArn,
} from "./config/environments";
import {
  EnvironmentConfig,
  Config,
  RepoConfig,
} from "./config/environments/config-interfaces";
import { Gen3ConfigEventsStack } from "./gen3-config-events-stack";
import { OidcIssuerStack } from "./oidc-issuer-stack";


export class Gen3EksPipelineStack extends cdk.Stack {
  async buildAsync(scope: Construct, id: string, props: cdk.StackProps) {
    const pipelineName = `${id}`; //pipeline builder name

    //Validate required parameters
    validateParameter("/gen3/config", toolsRegion)
    validateParameter("/gen3/eks-blueprint-repo", toolsRegion)

    // We need region to read the initial configuration
    const envValuesString = await getAwsConfig("/gen3/config", toolsRegion);
    const envValues: Config = envValuesString ? JSON.parse(envValuesString) : null;

    const env = props.env;

    if (!env?.region || !env?.account) {
      throw new Error("Both region and account are required.");
    }

    const region = env.region;
    const account = env.account;

    // Github credentials for this repo
    const eksPipelineRepoFromParameterStore = await getGithubRepoConfig(region);

    let repositoryConfig: RepoConfig = {
      gitRepoOwner: eksPipelineRepoFromParameterStore.gitRepoOwner,
      repoUrl: eksPipelineRepoFromParameterStore.repoUrl,
      tagRevision: eksPipelineRepoFromParameterStore.tagRevision,
      credentialsSecretName: "github-token",
    };

    let codeStarConnectionArn = "";

    try {
      codeStarConnectionArn = await getSecretValue(
        "code-star-connection-arn",
        "ap-southeast-2"
      );
      repositoryConfig = addCredentialsOrConnectionArn(
        eksPipelineRepoFromParameterStore,
        {
          codeStarConnectionArn,
        }
      );
    } catch (error) {
      console.log(
        `Warning: Secret name, code-star-connection-arn not found in secret manager, region: ${error}.`
      );
      console.log("** Warning: Will try github-token");
    }

    if (!codeStarConnectionArn) {
      try {
        validateSecret("github-token", region);
        repositoryConfig = addCredentialsOrConnectionArn(
          eksPipelineRepoFromParameterStore,
          {
            credentialsSecretName: "github-token",
          }
        );
      } catch (error) {
        console.log(
          "** Error: Could not find any required credentials for github in secrets manager"
        );
        throw error;
      }
    }

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
      .name(pipelineName)
      .account(account)
      .region(region)
      .addOns(...addOns);

    // Gen3 environment stages
    const stages = await getStages(toolsRegion);

    console.log(stages)

    // Create the CodePipelineStack
    const pipelineStack = blueprints.CodePipelineStack.builder()
      .name(`gen3-eks-${envValues.tools.name}`)
      .owner(repositoryConfig.gitRepoOwner)
      .codeBuildPolicies(buildPolicyStatements)
      .repository(repositoryConfig)
      .enableCrossAccountKeys();

    // Add stages dynamically
    for (const { id, env, teams, externalSecret, addons } of stages) {
      pipelineStack.stage({
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
              // The code now checks if env.clusterSubnets and env.nodeGroupSubnets are defined.
              // If they are, it calls this.subnetsSelection to create a subnet selection;
              // otherwise, it passes undefined to gen3ClusterProvider
              env.clusterSubnets
                ? this.subnetsSelection(env.clusterSubnets, "cluster")
                : undefined,
              env.nodeGroupSubnets
                ? this.subnetsSelection(env.nodeGroupSubnets, "nodes")
                : undefined
            )
          )
          .resourceProvider(
            blueprints.GlobalResources.Vpc,
            new blueprints.VpcProvider(env.vpcId || undefined)
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

    // Add OIDC Issuer Stack for each environment before IAM Roles
    const oidcStacks: OidcIssuerStack[] = [];
    for (const { env } of stages) {
      const oidcStack = this.addOidcIssuerStack(
        scope,
        env.aws,
        env.clusterName,
        env.namespace, // Ensure that your env has a namespace property
        `/gen3/${env.name}/oidcIssuer`
      );
      oidcStacks.push(oidcStack);
    }

    // Loop through stages to add IAM Role Stacks with dependencies on OIDC stacks
    for (const { env } of stages) {
      // Find the matching oidcStack based on the environment
      const oidcStack = oidcStacks.find((stack) => stack.env === env.aws);

      if (oidcStack) {
        // Pass the specific oidcStack as an argument to addIamRoleStack
        const iamRoleStack = this.addIamRoleStack(scope, env, oidcStack);
        iamRoleStack.node.addDependency(oidcStack);
      } else {
        console.warn(`No OIDC issuer stack found for environment: ${env.aws}`);
      }
    }

    // Event Bus stacks for each each environment
    // account is the source (tools) account here
    this.addEventBusStack(scope, envValues);
  }

  private subnetsSelection(subnetIds: string[], type: string) {
    const subnetsSelection: ec2.SubnetSelection = {
      subnets: subnetIds.map((subnetId) =>
        ec2.Subnet.fromSubnetId(this, `Subnet-${subnetId}-${type}`, subnetId)
      ),
    };
    return subnetsSelection;
  }

  private addIamRoleStack(scope: Construct, buildEnv: EnvironmentConfig, oidcIssuerStack: OidcIssuerStack) {
    const iamRoleStack = new IamRolesStack(
      scope,
      `${buildEnv.clusterName}-IamRoles`,
      {
        env: buildEnv.aws,
        buildEnv: buildEnv,
        oidcIssuerStack
      }
    );
    return iamRoleStack; // Return the created stack for dependency management
  }

  private addEventBusStack(scope: Construct, envConfigs: Config) {
    new Gen3ConfigEventsStack(scope, `gen3-eventBus-stack`, {
      env: { region: toolsRegion, account: this.account },
      envConfigs,
    });
  }

  private addOidcIssuerStack(
    scope: Construct,
    env: cdk.Environment,
    clusterName: string,
    namespace: string,
    oidcIssuerParameter: string
  ) {
    const oidcStack = new OidcIssuerStack(scope, `${clusterName}OidcIssuerStack`, {
      env,
      clusterName,
      namespace,
      oidcIssuerParameter,
    });
    return oidcStack; // Return the created stack for dependency management
  }
}
