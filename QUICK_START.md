# Quick Start Deployment Guide

This guide will help you deploy the Lambda Log Analyzer in under 10 minutes.

## Prerequisites

- AWS CLI installed and configured
- Node.js 18+ installed
- An AWS account with appropriate permissions

## Step 1: Prepare Configuration

1. **Clone or download this project**
2. **Set up environment variables** (copy `.env.example` to `.env` and update):
   ```bash
   cp .env.example .env
   # Edit .env with your actual values
   ```

3. **Update configuration in `config.js`**:
   ```javascript
   // Update these log groups to match your environment
   logGroups: [
     '/aws/lambda/your-function-name',
     '/aws/apigateway/your-api-name',
     '/aws/ecs/your-service-name'
   ]
   ```

## Step 2: Deploy Infrastructure

```bash
# Make deploy script executable
chmod +x deploy.sh

# Deploy with default settings
./deploy.sh

# Or deploy with custom parameters
./deploy.sh --stack-name my-log-analyzer --function-name my-log-analyzer --region us-west-2
```

## Step 3: Configure Email (SES)

If this is your first time using SES:

```bash
# Verify your email address for sending alerts
aws ses verify-email-identity --email-address your-alerts@company.com

# Check verification status
aws ses get-identity-verification-attributes --identities your-alerts@company.com
```

## Step 4: Test the Setup

```bash
# Run local tests
npm test

# Test the actual Lambda function
aws lambda invoke \
  --function-name log-analyzer \
  --payload '{"source":"manual-test"}' \
  --cli-binary-format raw-in-base64-out \
  response.json && cat response.json
```

## Step 5: Monitor and Customize

1. **View the CloudWatch Dashboard**: Check the deployment output for the dashboard URL
2. **Subscribe to SNS alerts**: Go to SNS console and subscribe to the topic
3. **Customize thresholds**: Edit environment variables in the Lambda console
4. **Add more log sources**: Update `config.js` and redeploy

## Common Issues

### Permission Errors
```bash
# Ensure your AWS credentials have these permissions:
# - lambda:*
# - cloudformation:*
# - iam:*
# - sns:*
# - ses:*
# - s3:*
# - logs:*
```

### Email Not Sending
```bash
# Check SES sandbox mode
aws ses get-send-quota

# If in sandbox, verify recipient emails too
aws ses verify-email-identity --email-address recipient@company.com
```

### Lambda Timeout
```bash
# Increase timeout in CloudFormation parameters
aws cloudformation update-stack \
  --stack-name log-analyzer \
  --template-body file://cloudformation.yaml \
  --parameters ParameterKey=LambdaTimeout,ParameterValue=600
```

## Environment Variables Reference

| Variable | Purpose | Example |
|----------|---------|---------|
| `SNS_TOPIC_ARN` | SNS topic for alerts | `arn:aws:sns:us-east-1:123:alerts` |
| `LOG_BUCKET` | S3 bucket with logs | `my-company-logs` |
| `EMAIL_FROM` | Sender email (must be verified in SES) | `alerts@company.com` |
| `EMAIL_TO` | Recipients (comma-separated) | `admin@company.com,ops@company.com` |
| `MAX_ERRORS` | Error threshold | `10` |
| `LOOKBACK_MINUTES` | How far back to analyze | `60` |

## Schedule Customization

Edit the CloudFormation parameter `ScheduleExpression`:

```yaml
# Every 15 minutes (default)
ScheduleExpression: "rate(15 minutes)"

# Every hour
ScheduleExpression: "rate(1 hour)"

# Daily at 9 AM UTC
ScheduleExpression: "cron(0 9 * * ? *)"

# Business hours only (9 AM - 5 PM, Mon-Fri UTC)
ScheduleExpression: "cron(0 9-17 ? * MON-FRI *)"
```

## Monitoring Your Monitor

The log analyzer includes self-monitoring:

- **Errors**: Check `/aws/lambda/log-analyzer` log group
- **Metrics**: View the CloudWatch dashboard
- **Alerts**: Critical failures send alerts to the same SNS topic

## Next Steps

1. **Add Custom Metrics**: Extend `extractMetrics()` function
2. **Custom Error Patterns**: Update `errorPatterns` in config
3. **Business Logic**: Add domain-specific threshold checks
4. **Integration**: Connect with your existing monitoring tools

## Support

- Check the main README.md for detailed documentation
- View CloudWatch logs for debugging
- Test locally with `node test-local.js`
