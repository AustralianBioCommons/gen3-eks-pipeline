import { Handler } from "aws-lambda";
import { EKSClient, DescribeClusterCommand } from "@aws-sdk/client-eks";
import { SSMClient, PutParameterCommand } from "@aws-sdk/client-ssm";

const region = process.env.AWS_REGION; // Explicitly define the region
const eksClient = new EKSClient({ region });
const ssmClient = new SSMClient({ region });

export const handler: Handler = async (event) => {
  const clusterName = event.ResourceProperties.ClusterName;
  const parameterName = process.env.PARAMETER_NAME;

  console.log(`Received event: ${JSON.stringify(event)}`);
  console.log(`Parameter Name: ${parameterName}`);

  try {
    console.log(`Describing cluster: ${clusterName}`);
    const command = new DescribeClusterCommand({ name: clusterName });
    const clusterData = await eksClient.send(command);
    const oidcIssuerUrl = clusterData.cluster?.identity?.oidc?.issuer;

    

    if (!oidcIssuerUrl) {
      throw new Error("OIDC issuer not found in cluster identity.");
    }

    const oidcIssuer = oidcIssuerUrl.replace("https://", "");

    console.log(`OIDC Issuer: ${oidcIssuer}`);

    // Create or update the OIDC issuer in SSM Parameter Store
    await ssmClient.send(
      new PutParameterCommand({
        Name: parameterName,
        Value: oidcIssuer,
        Type: "String",
        Overwrite: true,
      })
    );

    console.log("Successfully updated SSM parameter with OIDC issuer");
    //return { oidcIssuer: oidcIssuer};
  } catch (error) {
    console.error("Error fetching OIDC issuer or updating SSM:", error);
    throw error; // AwsCustomResource will handle this as failure
  }
};
