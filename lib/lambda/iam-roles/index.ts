import { CloudFormation } from "aws-sdk";
import { Context } from "aws-lambda";

const cloudformation = new CloudFormation();

export const handler = async (
  context: Context
): Promise<any> => {
  const stackName = process.env.IAM_ROLES_STACK_NAME; 

  if (!stackName) {
    throw new Error("STACK_NAME environment variable is not set");
  }

  try {
    // Trigger an update to the stack
    const response = await cloudformation
      .updateStack({
        StackName: stackName,
        UsePreviousTemplate: true,
        Parameters: [],
        Capabilities: ["CAPABILITY_NAMED_IAM"], 
      })
      .promise();

    return {
      statusCode: 200,
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error("Error updating stack:", error);
    throw new Error("Failed to update stack");
  }
};
