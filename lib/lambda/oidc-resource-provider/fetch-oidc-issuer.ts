import { Handler } from "aws-lambda";
import { EKSClient, DescribeClusterCommand } from "@aws-sdk/client-eks";
import { SSMClient, PutParameterCommand } from "@aws-sdk/client-ssm";

const region = process.env.AWS_REGION || "ap-southeast-2";
const eks = new EKSClient({ region });
const ssm = new SSMClient({ region });

export const handler: Handler = async (event) => {
  const clusterName = event.ResourceProperties?.ClusterName as string;
  const envKey = process.env.ENV_KEY as string;
  if (!clusterName) throw new Error("Missing ClusterName");
  if (!envKey) throw new Error("Missing ENV_KEY");

  const { cluster } = await eks.send(new DescribeClusterCommand({ name: clusterName }));
  if (!cluster) throw new Error(`Cluster not found: ${clusterName}`);

  const issuerUrl = cluster.identity?.oidc?.issuer;
  if (!issuerUrl) throw new Error("OIDC issuer not found");
  const oidcIssuer = issuerUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");

  // arn:aws:eks:<region>:<account>:cluster/<name>
  const clusterArn = cluster.arn!;
  const accountId = clusterArn.split(":")[4];
  if (!accountId) throw new Error(`Cannot parse account id from ARN: ${clusterArn}`);

  const oidcProviderArn = `arn:aws:iam::${accountId}:oidc-provider/${oidcIssuer}`;

  // Write params (idempotent)
  const put = (Name: string, Value: string, Description?: string) =>
    ssm.send(new PutParameterCommand({ Name, Value, Type: "String", Overwrite: true, Description }));

  await put(`/gen3/${envKey}/clusterName`, cluster.name!, "EKS cluster name for this Gen3 env");
  await put(`/gen3/${envKey}/oidcIssuer`, oidcIssuer, "OIDC issuer hostpath (no scheme)");
  await put(`/gen3/${envKey}/oidcProviderArn`, oidcProviderArn, "IAM OIDC provider ARN");

  if (clusterArn) await put(`/gen3/${envKey}/clusterArn`, clusterArn, "EKS cluster ARN");
  if (cluster.endpoint) await put(`/gen3/${envKey}/kubeApiEndpoint`, cluster.endpoint, "Kubernetes API endpoint");

  return {
    PhysicalResourceId: `gen3-eks-contract-${envKey}`,
    Data: { clusterName: cluster.name, oidcIssuer, oidcProviderArn, clusterArn, kubeApiEndpoint: cluster.endpoint },
  };
};
