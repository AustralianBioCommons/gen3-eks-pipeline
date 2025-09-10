import { Handler } from "aws-lambda";
import { EKSClient, DescribeClusterCommand } from "@aws-sdk/client-eks";
import { SSMClient, PutParameterCommand } from "@aws-sdk/client-ssm";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";

const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "ap-southeast-2";
const eks = new EKSClient({ region });
const ssm = new SSMClient({ region });
const sts = new STSClient({ region });

async function putParam(Name: string, Value: string, Description?: string) {
  await ssm.send(new PutParameterCommand({
    Name, Value, Type: "String", Overwrite: true,
    Description,
    // Tier: "Standard",
    // Tags: [{ Key: "Project", Value: "Gen3" }]
  }));
  console.log(`PutParameter OK: ${Name} = ${Value}`);
}

export const handler: Handler = async (event) => {
  const clusterName = event.ResourceProperties?.ClusterName as string;
  const envKey = process.env.ENV_KEY; // e.g. "omix3-test"
  if (!envKey) throw new Error("Missing ENV_KEY env var");
  if (!clusterName) throw new Error("Missing event.ResourceProperties.ClusterName");

  console.log(`EnvKey=${envKey} ClusterName=${clusterName}`);

  try {
    const desc = await eks.send(new DescribeClusterCommand({ name: clusterName }));
    const cluster = desc.cluster;
    if (!cluster) throw new Error(`Cluster not found: ${clusterName}`);

    const issuerUrl = cluster.identity?.oidc?.issuer;
    if (!issuerUrl) throw new Error("OIDC issuer not found on cluster.identity.oidc");
    // normalize: strip scheme + trailing slash
    const oidcIssuer = issuerUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
    console.log(`OIDC Issuer hostpath: ${oidcIssuer}`);

    // account id to assemble provider ARN
    const ident = await sts.send(new GetCallerIdentityCommand({}));
    const accountId = ident.Account;
    if (!accountId) throw new Error("Unable to resolve AWS Account ID via STS");
    const oidcProviderArn = `arn:aws:iam::${accountId}:oidc-provider/${oidcIssuer}`;

    // Write required params
    await putParam(`/gen3/${envKey}/clusterName`, cluster.name!, "EKS cluster name for this Gen3 env");
    await putParam(`/gen3/${envKey}/oidcIssuer`, oidcIssuer, "EKS OIDC issuer hostpath (no scheme)");
    await putParam(`/gen3/${envKey}/oidcProviderArn`, oidcProviderArn, "IAM OIDC provider ARN for this cluster");

    // Optional extras
    if (cluster.arn) {
      await putParam(`/gen3/${envKey}/clusterArn`, cluster.arn, "EKS cluster ARN");
    }
    if (cluster.endpoint) {
      await putParam(`/gen3/${envKey}/kubeApiEndpoint`, cluster.endpoint, "Kubernetes API endpoint");
    }

    return {
      PhysicalResourceId: `gen3-eks-contract-${envKey}`,
      Data: {
        clusterName: cluster.name,
        oidcIssuer,
        oidcProviderArn,
        clusterArn: cluster.arn,
        kubeApiEndpoint: cluster.endpoint,
      },
    };
  } catch (err) {
    console.error("Failure updating SSM parameters:", err);
    throw err;
  }
};
