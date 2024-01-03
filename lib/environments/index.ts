import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import * as cdk from 'aws-cdk-lib';
import * as rds from 'aws-cdk-lib/aws-rds';

export const Project = 'cad'

export type BuildEnvObj = {
    name: string,
    aws: cdk.Environment,
    platformRoleName: string,
    hostname: string,
    vpcId: string,
    rds: {
        port: number,
        engineVersion: rds.AuroraPostgresEngineVersion,
        serverlessV2MinCapacity: number,
        serverlessV2MaxCapacity: number,
        removalPolicy: cdk.RemovalPolicy,
        instances: Array<string>
    }
}

export const EksPipelineRepo = {
    gitRepoOwner: 'AustralianBioCommons',
    repoUrl: 'gen3-eks-pipeline',
    tagRevision: 'main',
    credentialsSecretName: 'github-token'
}

export const BuildEnv = {
    sandbox: {
        name: "sandbox",
        hostname: "data-sbx.test.biocommons.org.au",
        vpcId: "vpc-0a33e9ac1deb4df67",
        aws: {
            account: '690491147947',
            region: 'ap-southeast-2',
        },
        rds: {
            port: 5432,
            engineVersion: rds.AuroraPostgresEngineVersion.VER_13_9,
            serverlessV2MinCapacity: 0.5,
            serverlessV2MaxCapacity: 1,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            instances: ["fence", "master", "peregrine", "sheepdog", "indexd" ]
        },
        platformRoleName: 'AWSReservedSSO_AWSAdministratorAccess_ecbf315a4635ea96'
    },
    dev: {
        name: "dev",
        hostname: "data-dev.test.biocommons.org.au",
        vpcId: "vpc-0a33e9ac1deb4df67",
        aws: {
            account: '690491147947',
            region: 'ap-southeast-2',
        },
        rds: {
            port: 5432,
            engineVersion: rds.AuroraPostgresEngineVersion.VER_13_9,
            serverlessV2MinCapacity: 0.5,
            serverlessV2MaxCapacity: 1,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            instances: ["fence", "master", "peregrine", "sheepdog", "indexd" ]
        },
        platformRoleName: 'AWSReservedSSO_AWSAdministratorAccess_ecbf315a4635ea96'
    },
    test: {
        name: "test",
        hostname: "data.test.biocommons.org.au",
        vpcId: "vpc-01dae87b51107d5fb",
        aws: {
            account: '232870232581',
            region: 'ap-southeast-2',
        },
        rds: {
            port: 5432,
            engineVersion: rds.AuroraPostgresEngineVersion.VER_13_9,
            serverlessV2MinCapacity: 0.5,
            serverlessV2MaxCapacity: 1,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            instances: ["fence", "master", "peregrine", "sheepdog", "indexd" ]
        },
        platformRoleName: 'AWSReservedSSO_AWSAdministratorAccess_e857afb345dbe57a'
    },
    uat: {
        name: "uat",
        hostname: "data.uat.biocommons.org.au",
        vpcId: "vpc-01dae87b51107d5fb",
        aws: {
            account: '232870232581',
            region: 'ap-southeast-2',
        },
        rds: {
            port: 5432,
            engineVersion: rds.AuroraPostgresEngineVersion.VER_13_9,
            serverlessV2MinCapacity: 0.5,
            serverlessV2MaxCapacity: 1,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            instances: ["fence", "master", "peregrine", "sheepdog", "indexd" ]
        },
        platformRoleName: 'AWSReservedSSO_AWSAdministratorAccess_e857afb345dbe57a'
    },
    prod: {
        name: "prod",
        hostname: "data.preprod.biocommons.org.au",
        vpcId: "vpc-1234xxxxxxxxxx",
        aws: {
            account: '232870232581',
            region: 'ap-southeast-2',
        },
        rds: {
            port: 5432,
            engineVersion: rds.AuroraPostgresEngineVersion.VER_13_9,
            serverlessV2MinCapacity: 0.5,
            serverlessV2MaxCapacity: 1,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
            instances: ["fence", "master", "peregrine", "sheepdog", "indexd" ]
        },
        platformRoleName: 'platformRoleName'
    },
    tools: {
        name: "tools",
        aws: {
            account: '690491147947',
            region: 'ap-southeast-2',
        },
        platformRoleName: 'AWSReservedSSO_AWSAdministratorAccess_ecbf315a4635ea96'
    }
}


export async function getVpcId(buildEnv: BuildEnvObj) {

    const input = {
        SecretId: `${buildEnv.name}-vpcId`,
    };
    const secretClient = new SecretsManagerClient(buildEnv.aws);
    const command = new GetSecretValueCommand(input);
    const response = await secretClient.send(command);
    if (response.SecretString === undefined) {
        throw new Error(`VpcId not found: ${input}`);
    }
    console.log(response.SecretString!);
    return response.SecretString!;
}

