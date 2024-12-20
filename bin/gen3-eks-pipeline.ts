#!/usr/bin/env node

import * as cdk from 'aws-cdk-lib';
import { Gen3EksPipelineStack } from '../lib/gen3-eks-pipeline-stack';

const app = new cdk.App();

new Gen3EksPipelineStack().buildAsync(app, 'Gen3-Eks-pipeline', {
    env: { 
        account: process.env.CDK_DEFAULT_ACCOUNT, 
        region: process.env.CDK_DEFAULT_REGION 
    },
})