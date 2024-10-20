import {
  CloudFormationClient,
  UpdateStackCommand,
} from "@aws-sdk/client-cloudformation";
import { Context, APIGatewayProxyResult } from "aws-lambda";

const cloudformation = new CloudFormationClient({});

export const handler = async (
  context: Context
): Promise<APIGatewayProxyResult> => {
  const stackName = process.env.STACK_NAME;

  if (!stackName) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: "STACK_NAME environment variable is not set",
      }),
    };
  }

  try {
    const command = new UpdateStackCommand({
      StackName: stackName,
      UsePreviousTemplate: true,
      Parameters: [],
      Capabilities: ["CAPABILITY_NAMED_IAM"],
    });

    const response = await cloudformation.send(command);

    return {
      statusCode: 200,
      body: JSON.stringify(response),
    };
  } catch (error: unknown) {
    // Specify the error type as unknown
    console.error("Error updating stack:", error);

    // Type assertion to safely access error properties
    const errorMessage =
      error instanceof Error ? error.message : "No details available";

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Failed to update stack",
        details: errorMessage,
      }),
    };
  }
};
