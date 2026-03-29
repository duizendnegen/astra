import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayIntegrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import * as path from 'path';

export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ── DynamoDB skeleton cache ──────────────────────────────────────────
    // on-demand billing, word as PK, no TTL
    const skeletonTable = new dynamodb.Table(this, 'SkeletonCache', {
      tableName: 'astra-skeletons',
      partitionKey: { name: 'word', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ── OpenRouter API key from SSM Parameter ────────────────────────────
    // Provision manually: aws ssm put-parameter --name /astra/openrouter-api-key --type SecureString --value <key>
    const openRouterKeyParam = ssm.StringParameter.fromStringParameterName(
      this,
      'OpenRouterApiKey',
      '/astra/openrouter-api-key',
    );

    // ── Lambda skeleton function ─────────────────────────────────────────
    const skeletonFn = new lambdaNodejs.NodejsFunction(this, 'SkeletonFn', {
      functionName: 'astra-skeleton',
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../../lambda/src/skeleton.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(30),
      environment: {
        TABLE_NAME: skeletonTable.tableName,
        OPENROUTER_API_KEY_PARAM: '/astra/openrouter-api-key',
      },
    });

    skeletonTable.grantReadWriteData(skeletonFn);
    openRouterKeyParam.grantRead(skeletonFn);

    // ── HTTP API Gateway ─────────────────────────────────────────────────
    const httpApi = new apigateway.HttpApi(this, 'AstraApi', {
      apiName: 'astra-api',
      corsPreflight: {
        allowOrigins: ['https://astra.plusx.black'],
        allowMethods: [apigateway.CorsHttpMethod.POST],
        allowHeaders: ['content-type'],
      },
    });

    httpApi.addRoutes({
      path: '/api/skeleton',
      methods: [apigateway.HttpMethod.POST],
      integration: new apigatewayIntegrations.HttpLambdaIntegration(
        'SkeletonIntegration',
        skeletonFn,
      ),
    });

    // ── S3 static site bucket (private) ──────────────────────────────────
    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      bucketName: `astra-site-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ── ACM certificate (must be in us-east-1 for CloudFront) ────────────
    const hostedZone = route53.HostedZone.fromLookup(this, 'PlusxZone', {
      domainName: 'plusx.black',
    });

    const certificate = new acm.DnsValidatedCertificate(this, 'SiteCert', {
      domainName: 'astra.plusx.black',
      hostedZone,
      region: 'us-east-1',
    });

    // ── CloudFront distribution ───────────────────────────────────────────
    const apiDomain = `${httpApi.apiId}.execute-api.${this.region}.amazonaws.com`;

    const distribution = new cloudfront.Distribution(this, 'SiteDistribution', {
      defaultRootObject: 'index.html',
      domainNames: ['astra.plusx.black'],
      certificate,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      additionalBehaviors: {
        '/api/*': {
          origin: new origins.HttpOrigin(apiDomain),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
    });

    // ── Route53 A alias record ────────────────────────────────────────────
    new route53.ARecord(this, 'SiteAliasRecord', {
      zone: hostedZone,
      recordName: 'astra',
      target: route53.RecordTarget.fromAlias(
        new route53Targets.CloudFrontTarget(distribution),
      ),
    });

    // ── S3 deployment with CloudFront invalidation ────────────────────────
    new s3deploy.BucketDeployment(this, 'SiteDeployment', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../../frontend/dist'))],
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ['/*'],
    });

    // ── Outputs ───────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'DistributionDomain', {
      value: distribution.distributionDomainName,
    });
    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: httpApi.apiEndpoint,
    });
  }
}
