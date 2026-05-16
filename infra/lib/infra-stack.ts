import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
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

    // ── GitHub OIDC Identity Provider ───────────────────────────────────
    // Enables GitHub Actions to obtain short-lived AWS credentials via OIDC.
    // Provision once per account; CDK handles idempotency via the logical id.
    const githubOidcProvider = new iam.OpenIdConnectProvider(this, 'GitHubOidcProvider', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
    });

    // ── GitHub Actions deploy role ────────────────────────────────────────
    // Trusted only for tokens issued for refs/heads/main. Used by the
    // deploy workflow to run cdk deploy and scripts/build-index.ts.
    const deployRole = new iam.Role(this, 'GitHubActionsDeployRole', {
      roleName: 'astra-github-actions-deploy',
      assumedBy: new iam.WebIdentityPrincipal(githubOidcProvider.openIdConnectProviderArn, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          'token.actions.githubusercontent.com:sub': 'repo:duizendnegen/astra:ref:refs/heads/main',
        },
      }),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'),
      ],
    });

    // ── GitHub Actions read-only role ─────────────────────────────────────
    // Trusted for any ref in this repo. Used by the CI workflow for cdk diff on PRs.
    const readOnlyRole = new iam.Role(this, 'GitHubActionsReadOnlyRole', {
      roleName: 'astra-github-actions-readonly',
      assumedBy: new iam.WebIdentityPrincipal(githubOidcProvider.openIdConnectProviderArn, {
        StringLike: {
          'token.actions.githubusercontent.com:sub': 'repo:duizendnegen/astra:*',
        },
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
        },
      }),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('ReadOnlyAccess'),
      ],
    });

    // ── Icons S3 bucket ───────────────────────────────────────────────────
    // Stores SVG content strings, keyed {source}/{name}. Private; Lambda reads via IAM.
    const iconsBucket = new s3.Bucket(this, 'IconsBucket', {
      bucketName: `astra-icons-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Grant the deploy role PutObject on the icons bucket (needed for build-index)
    iconsBucket.grantPut(deployRole);

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
    const openRouterKeyParam = ssm.StringParameter.fromSecureStringParameterAttributes(
      this,
      'OpenRouterApiKey',
      { parameterName: '/astra/openrouter-api-key' },
    );

    // ── Pinecone API key from SSM Parameter ──────────────────────────────
    // Provision manually: aws ssm put-parameter --name /astra/pinecone-api-key --type SecureString --value <key>
    const pineconeKeyParam = ssm.StringParameter.fromSecureStringParameterAttributes(
      this,
      'PineconeApiKey',
      { parameterName: '/astra/pinecone-api-key' },
    );

    // ── ADOT Lambda layer (arm64) ────────────────────────────────────────
    const adotLayer = lambda.LayerVersion.fromLayerVersionArn(
      this,
      'AdotLayer',
      `arn:aws:lambda:${this.region}:901920570463:layer:aws-otel-nodejs-arm64-ver-1-30-2:1`,
    );

    // ── Lambda skeleton function ─────────────────────────────────────────
    // projectRoot is set to the repo root so that Docker bundling mounts the
    // whole workspace (giving esbuild access to lambda/ from infra/).
    const skeletonFn = new lambdaNodejs.NodejsFunction(this, 'SkeletonFn', {
      functionName: 'astra-skeleton',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      entry: path.join(__dirname, '../../lambda/src/skeleton.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(60),
      memorySize: 1024,
      tracing: lambda.Tracing.ACTIVE,
      layers: [adotLayer],
      projectRoot: path.join(__dirname, '../..'),
      depsLockFilePath: path.join(__dirname, '../../lambda/package-lock.json'),
      bundling: {
        forceDockerBundling: true,
        externalModules: ['@aws-sdk/*', '@smithy/*'],
        nodeModules: ['@opentelemetry/api', '@pinecone-database/pinecone', 'potrace', 'pino', 'polygon-clipping'],
        commandHooks: {
          beforeBundling: () => [],
          beforeInstall: () => [],
          afterBundling: (inputDir, outputDir) => [
            `cp ${inputDir}/frontend/public/data/stars.json ${outputDir}/stars.json`,
          ],
        },
      },
      environment: {
        TABLE_NAME: skeletonTable.tableName,
        OPENROUTER_API_KEY_PARAM: '/astra/openrouter-api-key',
        PINECONE_API_KEY_PARAM: '/astra/pinecone-api-key',
        ICONS_BUCKET_NAME: iconsBucket.bucketName,
        STARS_PATH: '/var/task/stars.json',
        NODE_ENV: 'production',
        PINECONE_INDEX_NAME: 'astra-prod-icons',
        PINECONE_HOST: 'https://astra-prod-icons-ylyik2p.svc.aped-4627-b74a.pinecone.io',
        AWS_LAMBDA_EXEC_WRAPPER: '/opt/otel-handler',
        OTEL_SERVICE_NAME: 'astra-skeleton',
        OTEL_NODE_ENABLED_INSTRUMENTATIONS: 'aws-lambda,aws-sdk',
      },
    });

    skeletonTable.grantReadWriteData(skeletonFn);
    openRouterKeyParam.grantRead(skeletonFn);
    pineconeKeyParam.grantRead(skeletonFn);
    iconsBucket.grantRead(skeletonFn);

    // ── HTTP API Gateway ─────────────────────────────────────────────────
    const httpApi = new apigateway.HttpApi(this, 'AstraApi', {
      apiName: 'astra-api',
      corsPreflight: {
        allowOrigins: ['https://astra.plusx.black'],
        allowMethods: [apigateway.CorsHttpMethod.POST],
        allowHeaders: ['content-type'],
      },
    });

    // Add throttling to the default stage (escape hatch — L2 HttpApi doesn't expose throttle)
    const defaultStage = httpApi.defaultStage!.node.defaultChild as apigateway.CfnStage;
    defaultStage.defaultRouteSettings = {
      throttlingBurstLimit: 10,
      throttlingRateLimit: 2,
    };

    httpApi.addRoutes({
      path: '/api/constellation',
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
    new cdk.CfnOutput(this, 'IconsBucketName', {
      value: iconsBucket.bucketName,
      description: 'S3 bucket for icon SVG content — set as ICONS_BUCKET_NAME in workflows',
    });
    new cdk.CfnOutput(this, 'DeployRoleArn', {
      value: deployRole.roleArn,
      description: 'IAM role ARN for GitHub Actions deploy workflow',
    });
    new cdk.CfnOutput(this, 'ReadOnlyRoleArn', {
      value: readOnlyRole.roleArn,
      description: 'IAM role ARN for GitHub Actions CI workflow (cdk diff)',
    });
  }
}
