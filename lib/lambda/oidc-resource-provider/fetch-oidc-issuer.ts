import * as AWS from "aws-sdk";
import {
  CloudFormationCustomResourceHandler,
  CloudFormationCustomResourceEvent,
  Context,
} from "aws-lambda";
import * as https from "https";

const eks = new AWS.EKS();

export const handler: CloudFormationCustomResourceHandler = async (
  event: CloudFormationCustomResourceEvent,
  context: Context
): Promise<void> => {
  const clusterName = event.ResourceProperties.ClusterName;
  console.log("Received event:", JSON.stringify(event, null, 2));

  try {
    if (event.RequestType === "Delete") {
      // Send a success response for deletion
      return sendResponse(event, "SUCCESS", {
        PhysicalResourceId: clusterName,
      });
    }

    // Fetch the OIDC issuer for the EKS cluster
    const response = await eks.describeCluster({ name: clusterName }).promise();
    const oidcIssuer = response.cluster?.identity?.oidc?.issuer;

    if (!oidcIssuer) {
      throw new Error("OIDC issuer not found for the cluster.");
    }

    console.log("OIDC Issuer:", oidcIssuer);

    // Send a success response with data
    return sendResponse(event, "SUCCESS", {
      PhysicalResourceId: clusterName,
      Data: {
        OIDC: oidcIssuer,
      },
    });
  } catch (error: unknown) {
    console.error("Error fetching OIDC issuer:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    // Send a failure response
    return sendResponse(event, "FAILED", {
      PhysicalResourceId: clusterName,
      Reason: errorMessage,
    });
  }
};

// Helper function to send response to CloudFormation
const sendResponse = async (
  event: CloudFormationCustomResourceEvent,
  status: string,
  responseData: Record<string, any> = {}
): Promise<void> => {
  if (!event.ResponseURL) {
    console.error("Missing ResponseURL in the event.");
    throw new Error(
      "Invalid CloudFormation custom resource event: Missing ResponseURL."
    );
  }

  const responseBody = JSON.stringify({
    Status: status,
    PhysicalResourceId: responseData.PhysicalResourceId,
    StackId: event.StackId,
    RequestId: event.RequestId,
    LogicalResourceId: event.LogicalResourceId,
    Data: responseData.Data,
    Reason: responseData.Reason,
  });

  // Log response body for debugging
  console.log("Response body:", responseBody);

  const parsedUrl = new URL(event.ResponseURL);

  const options = {
    hostname: parsedUrl.hostname,
    port: 443,
    path: parsedUrl.pathname,
    method: "PUT",
    headers: {
      "Content-Type": "",
      "Content-Length": Buffer.byteLength(responseBody),
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      res.on("data", (data) => {
        console.log(`Response from CloudFormation: ${data}`);
      });
      res.on("end", resolve);
    });

    req.on("error", (error) => {
      console.error("Error sending response to CloudFormation:", error);
      reject(error);
    });

    req.write(responseBody);
    req.end();
  });
};
