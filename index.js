const LogAnalyzer = require('./logAnalyzer');
const AlertService = require('./alertService');
const config = require('./config');

/**
 * AWS Lambda handler for log analysis and alerting
 */
exports.handler = async (event, _context) => {
  console.log('Lambda function started');
  console.log('Event:', JSON.stringify(event, null, 2));

  const startTime = Date.now();

  try {
    // Initialize services
    const logAnalyzer = new LogAnalyzer();
    const alertService = new AlertService();

    // Perform log analysis
    console.log('Starting log analysis...');
    const analysisResults = await logAnalyzer.analyzeLogs();

    // Process results and send alerts if necessary
    await processAnalysisResults(analysisResults, alertService);

    const duration = Date.now() - startTime;
    console.log(`Lambda function completed successfully in ${duration}ms`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Log analysis completed successfully',
        summary: analysisResults.summary,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error('Lambda function failed:', error);

    // Send critical alert about the failure
    try {
      const alertService = new AlertService();
      await alertService.sendAlert(
        {
          subject: 'Log Analyzer Lambda Function Failed',
          textMessage: `The log analyzer Lambda function failed with error: ${error.message}\n\nStack trace: ${error.stack}`,
          htmlMessage: `
            <html>
            <body>
              <h2>🚨 Critical Alert: Log Analyzer Failed</h2>
              <p><strong>Error:</strong> ${error.message}</p>
              <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
              <pre>${error.stack}</pre>
            </body>
            </html>
          `
        },
        'lambda-failure',
        'CRITICAL'
      );
    } catch (alertError) {
      console.error('Failed to send failure alert:', alertError);
    }

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Log analysis failed',
        message: error.message,
        timestamp: new Date().toISOString()
      })
    };
  }
};

/**
 * Process analysis results and send appropriate alerts
 */
async function processAnalysisResults(results, alertService) {
  console.log('Processing analysis results...');

  const { errors, violations, summary } = results;

  // Send error alerts if threshold exceeded
  if (errors.length > config.thresholds.errorRate.maxErrors) {
    console.log(`Sending error alert for ${errors.length} errors`);

    const errorAlert = alertService.formatErrorAlert(
      errors,
      config.analysis.lookbackMinutes
    );

    await alertService.sendAlert(
      errorAlert,
      'error-threshold',
      errors.length > (config.thresholds.errorRate.maxErrors * 2) ? 'CRITICAL' : 'WARNING'
    );
  }

  // Send threshold violation alerts
  if (violations.length > 0) {
    console.log(`Sending threshold violation alert for ${violations.length} violations`);

    const thresholdAlert = alertService.formatThresholdAlert(violations);

    await alertService.sendAlert(
      thresholdAlert,
      'threshold-violation',
      violations.some(v => v.metric.includes('Memory') || v.metric.includes('Error')) ? 'CRITICAL' : 'WARNING'
    );
  }

  // Send summary if there are any issues
  if (errors.length > 0 || violations.length > 0) {
    console.log('Sending summary alert');

    const summaryAlert = {
      subject: 'Log Analysis Summary - Issues Detected',
      textMessage: `
Log Analysis Summary:
===================
Timestamp: ${results.timestamp}
Analysis Window: ${config.analysis.lookbackMinutes} minutes

Issues Found:
- Total Errors: ${summary.totalErrors}
- Threshold Violations: ${summary.totalViolations}

Sources Analyzed:
- CloudWatch Log Groups: ${summary.cloudWatchSources}
- S3 Log Sources: ${summary.s3Sources}

${errors.length > 0 ? `\nRecent Errors:\n${errors.slice(0, 5).map(e => `- ${e.timestamp}: ${e.message.substring(0, 100)}`).join('\n')}` : ''}

${violations.length > 0 ? `\nThreshold Violations:\n${violations.map(v => `- ${v.metric}: ${v.value} ${v.comparison} ${v.threshold}`).join('\n')}` : ''}
`,
      htmlMessage: `
<html>
<body>
  <h2>📊 Log Analysis Summary</h2>
  <table border="1" style="border-collapse: collapse;">
    <tr><td><strong>Timestamp:</strong></td><td>${results.timestamp}</td></tr>
    <tr><td><strong>Analysis Window:</strong></td><td>${config.analysis.lookbackMinutes} minutes</td></tr>
    <tr><td><strong>Total Errors:</strong></td><td style="color: ${summary.totalErrors > 0 ? 'red' : 'green'};">${summary.totalErrors}</td></tr>
    <tr><td><strong>Threshold Violations:</strong></td><td style="color: ${summary.totalViolations > 0 ? 'red' : 'green'};">${summary.totalViolations}</td></tr>
    <tr><td><strong>CloudWatch Sources:</strong></td><td>${summary.cloudWatchSources}</td></tr>
    <tr><td><strong>S3 Sources:</strong></td><td>${summary.s3Sources}</td></tr>
  </table>
  
  ${errors.length > 0 ? `
    <h3>Recent Errors:</h3>
    <ul>
      ${errors.slice(0, 5).map(e => `<li><strong>${e.timestamp}:</strong> ${e.message.substring(0, 100)}...</li>`).join('')}
    </ul>
  ` : ''}
  
  ${violations.length > 0 ? `
    <h3>Threshold Violations:</h3>
    <ul>
      ${violations.map(v => `<li><strong>${v.metric}:</strong> ${v.value} ${v.comparison} ${v.threshold} ${v.unit || ''}</li>`).join('')}
    </ul>
  ` : ''}
</body>
</html>
`
    };

    await alertService.sendAlert(
      summaryAlert,
      'summary',
      'INFO'
    );
  } else {
    console.log('No issues detected - skipping alerts');
  }
}

// For local testing
if (require.main === module) {
  const testEvent = {
    source: 'aws.events',
    'detail-type': 'Scheduled Event',
    detail: {}
  };

  const testContext = {
    functionName: 'log-analyzer',
    functionVersion: '1.0.0',
    invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:log-analyzer',
    memoryLimitInMB: '512',
    remainingTimeInMillis: 30000
  };

  exports.handler(testEvent, testContext)
    .then(result => {
      console.log('Test completed:', result);
      process.exit(0);
    })
    .catch(error => {
      console.error('Test failed:', error);
      process.exit(1);
    });
}
