import * as iam from 'aws-cdk-lib/aws-iam'

export const buildPolicyStatements = [

    new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions:
            [
                'codeartifact:GetAuthorizationToken',
                'codeartifact:GetRepositoryEndpoint',
                'codeartifact:ReadFromRepository',
                'cloudformation:DescribeStacks',
                'cloudformation:DescribeStacks',
                'codebuild:BatchGetBuilds',
                'codebuild:StartBuild',
                'codebuild:StopBuild'
            ],
        resources: ['*']
    }),
    new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions:
            ['sts:GetServiceBearerToken'],
        resources: ['*']
    })


]