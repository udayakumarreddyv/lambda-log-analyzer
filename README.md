# Lambda Log Analyzer

A comprehensive Node.js AWS Lambda function that periodically analyzes logs from S3 and CloudWatch, detects errors and threshold violations, and sends alerts via SNS and email.

## Features

- 🔍 **Multi-source Log Analysis**: Monitors both CloudWatch Log Groups and S3 log files
- 🚨 **Intelligent Error Detection**: Uses configurable regex patterns to identify errors
- 📊 **Threshold Monitoring**: Tracks metrics like response times, memory usage, and error rates
- 📧 **Multi-channel Alerts**: Sends notifications via SNS and SES email
- ⏰ **Cooldown Management**: Prevents alert spam with configurable cooldown periods
- 📈 **CloudWatch Dashboard**: Includes monitoring dashboard for the analyzer itself
- 🏗️ **Infrastructure as Code**: Complete CloudFormation template included

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   CloudWatch    │    │       S3        │    │  EventBridge    │
│   Log Groups    │    │   Log Files     │    │   (Schedule)    │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
                       ┌─────────▼───────┐
                       │     Lambda      │
                       │  Log Analyzer   │
                       └─────────┬───────┘
                                 │
                    ┌────────────┼────────────┐
                    │                         │
          ┌─────────▼───────┐      ┌─────────▼───────┐
          │       SNS       │      │       SES       │
          │   (Instant      │      │     (Email      │
          │   Alerts)       │      │     Reports)    │
          └─────────────────┘      └─────────────────┘
```

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy the example configuration and update with your values:

```bash
# Set environment variables
export SNS_TOPIC_ARN="arn:aws:sns:us-east-1:123456789012:log-analyzer-alerts"
export LOG_BUCKET="your-log-bucket"
export EMAIL_FROM="alerts@company.com"
export EMAIL_TO="admin@company.com,ops@company.com"
```

### 3. Deploy Infrastructure

```bash
# Deploy CloudFormation stack
aws cloudformation create-stack \
  --stack-name log-analyzer \
  --template-body file://cloudformation.yaml \
  --parameters ParameterKey=LogBucket,ParameterValue=your-log-bucket \
               ParameterKey=EmailAddress,ParameterValue=admin@company.com \
  --capabilities CAPABILITY_NAMED_IAM
```

### 4. Deploy Lambda Code

```bash
# Create deployment package
npm run deploy

# Update Lambda function
aws lambda update-function-code \
  --function-name log-analyzer \
  --zip-file fileb://lambda-log-analyzer.zip
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SNS_TOPIC_ARN` | SNS topic for alerts | Required |
| `LOG_BUCKET` | S3 bucket for log files | Required |
| `LOG_PREFIX` | S3 prefix for log files | `logs/` |
| `EMAIL_FROM` | Sender email address | Required |
| `EMAIL_TO` | Recipient emails (comma-separated) | Required |
| `MAX_ERRORS` | Error threshold | `10` |
| `TIME_WINDOW_MINUTES` | Analysis window | `15` |
| `MAX_AVG_RESPONSE_TIME` | Avg response time threshold (ms) | `5000` |
| `MAX_P95_RESPONSE_TIME` | P95 response time threshold (ms) | `10000` |
| `MAX_MEMORY_PERCENT` | Memory usage threshold (%) | `85` |
| `ALERT_COOLDOWN_MINUTES` | Alert cooldown period | `30` |
| `LOOKBACK_MINUTES` | Log lookback period | `60` |

### Log Groups Configuration

Edit `config.js` to specify which CloudWatch Log Groups to monitor:

```javascript
logGroups: [
  '/aws/lambda/my-application',
  '/aws/apigateway/my-api',
  '/aws/ecs/my-service',
  '/aws/rds/instance/my-db/error'
]
```

### Error Patterns

Customize error detection patterns in `config.js`:

```javascript
errorPatterns: [
  /ERROR/i,
  /FATAL/i,
  /Exception/i,
  /timeout/i,
  /5\d{2}\s+Server\s+Error/i,
  /OOM|OutOfMemoryError/i
]
```

## Usage Examples

### Manual Testing

```bash
# Test locally
node index.js

# Test specific components
const LogAnalyzer = require('./logAnalyzer');
const analyzer = new LogAnalyzer();
analyzer.analyzeLogs().then(console.log);
```

### Lambda Event Triggers

The function supports multiple trigger types:

1. **Scheduled (EventBridge)**:
   ```json
   {
     "source": "aws.events",
     "detail-type": "Scheduled Event"
   }
   ```

2. **S3 Object Created**:
   ```json
   {
     "Records": [{
       "eventSource": "aws:s3",
       "eventName": "ObjectCreated:Put",
       "s3": {
         "bucket": {"name": "log-bucket"},
         "object": {"key": "logs/app.log"}
       }
     }]
   }
   ```

3. **CloudWatch Logs**:
   ```json
   {
     "awslogs": {
       "data": "compressed-log-data"
     }
   }
   ```

## Alert Types

### 1. Error Alerts
Triggered when error count exceeds threshold:
- **Severity**: WARNING/CRITICAL
- **Cooldown**: 30 minutes (configurable)
- **Content**: Error count, recent error messages

### 2. Threshold Violation Alerts
Triggered for metric violations:
- **Response Time**: Average and P95 thresholds
- **Memory Usage**: Percentage thresholds
- **Error Rate**: Errors per time window

### 3. Summary Reports
Periodic summary of analysis results:
- **Frequency**: Configurable
- **Content**: Overall statistics, top errors, trends

## Monitoring

### CloudWatch Metrics

The function publishes custom metrics:
- `LogAnalyzer/ErrorsDetected`
- `LogAnalyzer/ThresholdViolations`
- `LogAnalyzer/AnalysisTime`
- `LogAnalyzer/LogSourcesAnalyzed`

### CloudWatch Dashboard

Access the dashboard via the CloudFormation output URL or:
```
https://console.aws.amazon.com/cloudwatch/home#dashboards:name=LogAnalyzer
```

### Logs

Function logs are available in CloudWatch:
```
/aws/lambda/log-analyzer
```

## Advanced Configuration

### Custom Metric Extraction

Add custom metric extraction in `logAnalyzer.js`:

```javascript
extractMetrics(message, metrics) {
  // Custom business metrics
  const orderMatch = message.match(/orders_processed:\s*(\d+)/i);
  if (orderMatch) {
    metrics.ordersProcessed = parseInt(orderMatch[1]);
  }
  
  // Database query times
  const dbMatch = message.match(/db_query_time:\s*(\d+(?:\.\d+)?)/i);
  if (dbMatch) {
    metrics.dbQueryTimes = metrics.dbQueryTimes || [];
    metrics.dbQueryTimes.push(parseFloat(dbMatch[1]));
  }
}
```

### Custom Threshold Checks

Add business-specific thresholds:

```javascript
checkThresholds(metrics, source) {
  const violations = [];
  
  // Custom business metric thresholds
  if (metrics.ordersProcessed < 100) {
    violations.push({
      metric: 'Orders Processed',
      value: metrics.ordersProcessed,
      threshold: 100,
      comparison: 'below minimum',
      source: source
    });
  }
  
  return violations;
}
```

## Troubleshooting

### Common Issues

1. **Permission Errors**:
   - Ensure IAM role has required permissions
   - Check S3 bucket policies
   - Verify SES sending authorization

2. **Memory/Timeout Issues**:
   - Increase Lambda memory allocation
   - Reduce batch size in config
   - Optimize log group selection

3. **Missing Alerts**:
   - Check SNS topic subscriptions
   - Verify email addresses in SES
   - Review cooldown settings

### Debug Mode

Enable verbose logging:

```javascript
// In config.js
debug: {
  enabled: process.env.DEBUG_MODE === 'true',
  logLevel: 'verbose'
}
```

### Health Checks

The function includes self-monitoring:
- Failed executions trigger critical alerts
- Performance metrics are tracked
- Regular heartbeat confirmations

## Cost Optimization

### Estimated Costs (us-east-1)

- **Lambda**: ~$2-5/month (15-minute intervals)
- **CloudWatch Logs**: ~$0.50/month
- **SNS**: ~$0.50/month
- **S3 API calls**: ~$1/month

### Optimization Tips

1. **Reduce Frequency**: Use longer intervals for non-critical monitoring
2. **Filter Log Groups**: Only monitor essential log groups
3. **Optimize Memory**: Right-size Lambda memory allocation
4. **Log Retention**: Set appropriate CloudWatch log retention

## Security

### Best Practices

1. **Least Privilege**: IAM role has minimal required permissions
2. **Encryption**: All data encrypted in transit and at rest
3. **Network**: Deploy in VPC for additional isolation
4. **Secrets**: Use AWS Secrets Manager for sensitive configuration

### Security Checklist

- [ ] IAM policies follow least privilege
- [ ] S3 bucket has proper access controls
- [ ] SNS topics have appropriate permissions
- [ ] Lambda function uses latest runtime
- [ ] CloudWatch logs have retention policies
- [ ] SES has verified domains/emails

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Update documentation
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:
- Create GitHub issues for bugs
- Check CloudWatch logs for runtime errors
- Review AWS documentation for service limits
- Monitor AWS Health Dashboard for service issues
