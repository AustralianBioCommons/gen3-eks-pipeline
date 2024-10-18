import * as AWS from "aws-sdk";
import {
  CloudFormationCustomResourceHandler,
  Context,
  CloudFormationCustomResourceEvent,
} from "aws-lambda";

const eks = new AWS.EKS();

export const handler: CloudFormationCustomResourceHandler = async (
  event: CloudFormationCustomResourceEvent,
  context: Context
) => {
  const clusterName = event.ResourceProperties.ClusterName;

  try {
    const response = await eks.describeCluster({ name: clusterName }).promise();
    const oidcIssuer = response.cluster.identity.oidc.issuer;

    return {
      PhysicalResourceId: clusterName,
      Data: {
        OIDC: oidcIssuer,
      },
    };
  } catch (error) {
    if (error instanceof Error) {
      console.error("Error fetching OIDC:", error.message);
    } else {
      console.error("An unknown error occurred when fetching OIDC", error);
    }

    throw error;
  }
};
