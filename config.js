const config = {
  // CloudWatch Log Groups to monitor
  logGroups: [
    '/aws/lambda/my-application',
    '/aws/apigateway/my-api',
    '/aws/ecs/my-service'
  ],

  // S3 bucket for log files
  s3Config: {
    bucket: process.env.LOG_BUCKET || 'my-log-bucket',
    prefix: process.env.LOG_PREFIX || 'logs/',
    region: process.env.AWS_REGION || 'us-east-1'
  },

  // Error patterns to search for
  errorPatterns: [
    /ERROR/i,
    /FATAL/i,
    /Exception/i,
    /Error:/i,
    /failed/i,
    /timeout/i,
    /500\s+Internal/i,
    /502\s+Bad\s+Gateway/i,
    /503\s+Service\s+Unavailable/i,
    /504\s+Gateway\s+Timeout/i
  ],

  // Threshold configurations
  thresholds: {
    errorRate: {
      maxErrors: parseInt(process.env.MAX_ERRORS) || 10,
      timeWindow: parseInt(process.env.TIME_WINDOW_MINUTES) || 15 // minutes
    },
    responseTime: {
      maxAvgResponseTime: parseInt(process.env.MAX_AVG_RESPONSE_TIME) || 5000, // ms
      maxP95ResponseTime: parseInt(process.env.MAX_P95_RESPONSE_TIME) || 10000 // ms
    },
    memoryUsage: {
      maxMemoryPercent: parseFloat(process.env.MAX_MEMORY_PERCENT) || 85.0
    },
    diskSpace: {
      maxDiskPercent: parseFloat(process.env.MAX_DISK_PERCENT) || 90.0
    }
  },

  // Alert configuration
  alerts: {
    snsTopicArn: process.env.SNS_TOPIC_ARN,
    emailFrom: process.env.EMAIL_FROM || 'noreply@company.com',
    emailTo: process.env.EMAIL_TO ? process.env.EMAIL_TO.split(',') : ['admin@company.com'],
    alertCooldown: parseInt(process.env.ALERT_COOLDOWN_MINUTES) || 30 // minutes
  },

  // Analysis time window
  analysis: {
    lookbackMinutes: parseInt(process.env.LOOKBACK_MINUTES) || 60,
    batchSize: parseInt(process.env.BATCH_SIZE) || 1000
  }
};

module.exports = config;
