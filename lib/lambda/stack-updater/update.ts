import {
  CodePipelineClient,
  StartPipelineExecutionCommand,
} from "@aws-sdk/client-codepipeline";
import { APIGatewayProxyResult } from "aws-lambda";

const pipeline = new CodePipelineClient({});

export const handler = async (
): Promise<APIGatewayProxyResult> => {
  const pipelineName = process.env.PIPELINE_NAME;

  if (!pipelineName) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: "PIPELINE_NAME environment variable is not set",
      }),
    };
  }

  try {
    const command = new StartPipelineExecutionCommand({
      name: pipelineName,
    });

    const response = await pipeline.send(command);

    return {
      statusCode: 200,
      body: JSON.stringify(response),
    };
  } catch (error: unknown) {
    console.error("Error starting pipeline:", error);

    const errorMessage =
      error instanceof Error ? error.message : "No details available";

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Failed to start pipeline",
        details: errorMessage,
      }),
    };
  }
};
