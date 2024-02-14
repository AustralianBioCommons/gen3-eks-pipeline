# Welcome to your CDK TypeScript project


The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `cdk deploy --all`      deploy this stack to your default AWS account/region
* `cdk diff`        compare deployed stack with current state
* `cdk synth`       emits the synthesized CloudFormation template

## Adding a new EKS environment

```
   blueprints.CodePipelineStack.builder()
        .name(`gen3-eks-${BuildEnv.tools.name}`)
        .owner(EksPipelineRepo.gitRepoOwner)
        .codeBuildPolicies(buildPolicyStatements)
        .repository({
          repoUrl: EksPipelineRepo.repoUrl,
            codeStarConnectionArn: 'arn:aws:codestar-connections:ap-southeast-2:690491147947:connection/ce767af4-597d-42ce-8920-c2e9011a1616',
          targetRevision: EksPipelineRepo.tagRevision,
        }).enableCrossAccountKeys()
        .stage({
          id: 'dev',
          stackBuilder: blueprint
              .clone(region)
              .name(`${clusterName}-${BuildEnv.dev.name}`)
              .addOns(...clusterConfig.devClusterAddons(clusterName))
              .teams(...devTeams)
              .clusterProvider(clusterConfig.devClusterProvider(clusterName))
              .resourceProvider(
                  blueprints.GlobalResources.Vpc,
                  new blueprints.VpcProvider(devVpcId),
              )
              .withEnv(BuildEnv.tools.aws),
        })
        .stage({ <-- Add a new Stage here -->})
        ```