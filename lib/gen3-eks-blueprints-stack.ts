import * as cdk from "aws-cdk-lib";
import * as blueprints from "@aws-quickstart/eks-blueprints";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";
import { loadEnvConfig, loadClusterConfig } from "./loadConfig";
import { getKubernetesVersion } from "./config/cluster/cluster-provider";

export interface Gen3EksBlueprintsStackProps extends cdk.StackProps {
  envName: string;
  project: string;
}

export class Gen3EksBlueprintsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: Gen3EksBlueprintsStackProps) {
    super(scope, id, props);

    // Load configuration from JSON files
    const envConfig = loadEnvConfig(props.envName);
    const clusterConfig = loadClusterConfig(props.envName);

    if (!envConfig.vpcId) {
      throw new Error(`VPC ID is missing in envConfig.json for environment: ${props.envName}`);
    }

    // Lookup the existing VPC
    const vpc = ec2.Vpc.fromLookup(this, `Vpc-${props.envName}`, {
      vpcId: envConfig.vpcId,
    });

    // Select private subnets for cluster and nodes
    const clusterSubnets = envConfig.clusterSubnets?.map((subnetId) =>
      ec2.Subnet.fromSubnetId(this, `Subnet-${subnetId}-cluster`, subnetId)
    ) || vpc.privateSubnets;


    const nodeGroupSubnets = this.subnetsSelection(envConfig.nodeGroupSubnets!, "cluster") || undefined

    // Define EKS Add-ons
    const addOns: Array<blueprints.ClusterAddOn> = [
      new blueprints.addons.AwsLoadBalancerControllerAddOn({ enableWafv2: true }),
      new blueprints.addons.MetricsServerAddOn(),
      new blueprints.addons.ClusterAutoScalerAddOn(),
    ];

    // Kubernetes version
    const versionString = clusterConfig["version"];
    const version = getKubernetesVersion(versionString);

    // Deploy EKS Cluster with EKS Blueprints
    blueprints.EksBlueprint.builder()
      .name(envConfig.clusterName)
      .region(this.region)
      .account(this.account)
      .addOns(...addOns)
      .clusterProvider(
        new blueprints.GenericClusterProvider({
          version, 
          managedNodeGroups: [
            {
              id: `${props.envName}-nodegroup`,
              instanceTypes: [new ec2.InstanceType(clusterConfig.instanceType)],
              minSize: clusterConfig.minSize,
              maxSize: clusterConfig.maxSize,
              desiredSize: clusterConfig.desiredSize,
              diskSize: clusterConfig.diskSize,
              amiReleaseVersion: clusterConfig.amiReleaseVersion,
              nodeGroupSubnets: nodeGroupSubnets || undefined,
              launchTemplate: {
                tags: clusterConfig.tags,
              },
            },
          ],
        })
      )
      .resourceProvider(
        blueprints.GlobalResources.Vpc,
        new blueprints.VpcProvider(envConfig.vpcId)
      )
      .build(this, `Gen3EksBlueprint-${props.envName}`);
  }

  private subnetsSelection(subnetIds: string[], type: string) {
    const subnetsSelection: ec2.SubnetSelection = {
      subnets: subnetIds.map((subnetId) =>
        ec2.Subnet.fromSubnetId(this, `Subnet-${subnetId}-${type}`, subnetId)
      ),
    };
    return subnetsSelection;
  }
}

