#!/usr/bin/env node

import * as cdk from 'aws-cdk-lib';
import { Gen3EksPipelineStack, Gen3EksPipelineStackProps } from '../lib/gen3-eks-pipeline-stack';

const app = new cdk.App();

const cadPipeline = new Gen3EksPipelineStack().buildAsync(app, 'Gen3-Eks-pipeline', {project: 'cad'})