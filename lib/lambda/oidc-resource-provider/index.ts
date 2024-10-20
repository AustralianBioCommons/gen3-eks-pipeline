import * as AWS from "aws-sdk";
import {
  CloudFormationCustomResourceHandler,
  CloudFormationCustomResourceEvent,
  Context,
} from "aws-lambda";

const eks = new AWS.EKS();

export const handler: CloudFormationCustomResourceHandler = async (
  event: CloudFormationCustomResourceEvent,
  context: Context,
  callback: (error: any, response: any) => void
) => {
  const clusterName = event.ResourceProperties.ClusterName;
  console.log("Received event:", JSON.stringify(event, null, 2));

  try {
    if (event.RequestType === "Delete") {
      callback(null, {
        Status: "SUCCESS",
        PhysicalResourceId: clusterName,
        StackId: event.StackId,
        RequestId: event.RequestId,
        LogicalResourceId: event.LogicalResourceId,
      });
      return;
    }

    // Fetch the OIDC issuer for the EKS cluster
    const response = await eks.describeCluster({ name: clusterName }).promise();
    const oidcIssuer = response.cluster?.identity?.oidc?.issuer;

    if (!oidcIssuer) {
      throw new Error("OIDC issuer not found for the cluster.");
    }

    console.log("OIDC Issuer:", oidcIssuer);

    callback(null, {
      Status: "SUCCESS",
      PhysicalResourceId: clusterName,
      StackId: event.StackId,
      RequestId: event.RequestId,
      LogicalResourceId: event.LogicalResourceId,
      Data: {
        OIDC: oidcIssuer,
      },
    });
  } catch (error) {
    console.error("Error fetching OIDC issuer:", error);

    callback(null, {
      Status: "FAILED",
      PhysicalResourceId: clusterName,
      StackId: event.StackId,
      RequestId: event.RequestId,
      LogicalResourceId: event.LogicalResourceId,
      Reason: (error as Error).message || "Unknown error",
    });
  }
};
