import * as cdk from "aws-cdk-lib";
import { Gen3EksPipelineStack } from "../lib/gen3-eks-pipeline-stack";
import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";

test("Gen3EksPipelineStack creates a Lambda function and CloudWatch Rule", async () => {
  // Create a new CDK app
  const app = new App();
  // Create the stack
  const stack = new Gen3EksPipelineStack(app, "TestStack");

  // Prepare the template for assertions
  const template = Template.fromStack(stack);

  // TODO: Add assertions to verify the created Lambda function and CloudWatch Event Rule
  // e.g., check properties of the Lambda function, validate event rule configuration, etc.

  // TODO: Add assertions for GEN3 stages to ensure they are configured as expected
  // e.g., validate that each stage exists and has the correct properties and configurations
});
