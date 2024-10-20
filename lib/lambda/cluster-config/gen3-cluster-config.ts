import {
  CloudFormationClient,
  UpdateStackCommand,
} from "@aws-sdk/client-cloudformation";
import { APIGatewayProxyResult, Context, APIGatewayEvent } from "aws-lambda";

const cloudformation = new CloudFormationClient({});

export const handler = async (
  event: APIGatewayEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  const stageName = process.env.STAGE_NAME;

  if (!stageName) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "STAGE_NAME environment variable is not set",
      }),
    };
  }

  try {
    // Trigger an update to the CloudFormation stack
    const command = new UpdateStackCommand({
      StackName: stageName,
      UsePreviousTemplate: true,
      Parameters: [],
      Capabilities: ["CAPABILITY_NAMED_IAM"],
    });

    const response = await cloudformation.send(command);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: "Stack update triggered successfully",
        response,
      }),
    };
  } catch (error) {
    console.error("Error updating stack:", error);

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: "Failed to update stack",
        error: (error as Error).message,
      }),
    };
  }
};
