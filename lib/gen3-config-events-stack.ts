import * as cdk from 'aws-cdk-lib';
import * as events from 'aws-cdk-lib/aws-events';
import { Construct } from 'constructs';
import { EnvironmentConfig } from "./config/environments/config-interfaces";
import * as iam from 'aws-cdk-lib/aws-iam';

export interface Gen3ConfigEventsStackProps extends cdk.StackProps {
  env: cdk.Environment;
  buildEnv: EnvironmentConfig;
  toolsAccount: string;
}

export class Gen3ConfigEventsStack extends cdk.Stack {
  constructor(
    scope: Construct,
    id: string,
    props?: Gen3ConfigEventsStackProps
  ) {
    super(scope, id, props);

    const eventBusName = `${props?.buildEnv.name}-gen3-config-eventbus`;

    //Create an EventBus for the environment
    const eventBus = new events.EventBus(this, eventBusName, {
      eventBusName,
    });

    // Grant Permissions for the tools account to send
    // events to this event bus
    const sourceAccountId = props?.toolsAccount

    eventBus.grantPutEventsTo(
      new iam.AccountPrincipal(sourceAccountId)
    )

  }
}