const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const config = require('./config');

class AlertService {
  constructor() {
    this.snsClient = new SNSClient({ region: config.s3Config.region });
    this.sesClient = new SESClient({ region: config.s3Config.region });
    this.lastAlertTimes = new Map();
  }

  /**
   * Check if alert is within cooldown period
   */
  isInCooldown(alertType) {
    const lastAlertTime = this.lastAlertTimes.get(alertType);
    if (!lastAlertTime) return false;

    const cooldownMs = config.alerts.alertCooldown * 60 * 1000;
    return (Date.now() - lastAlertTime) < cooldownMs;
  }

  /**
   * Record alert time for cooldown tracking
   */
  recordAlert(alertType) {
    this.lastAlertTimes.set(alertType, Date.now());
  }

  /**
   * Send SNS notification
   */
  async sendSNSAlert(subject, message, severity = 'WARNING') {
    try {
      if (!config.alerts.snsTopicArn) {
        console.log('SNS Topic ARN not configured, skipping SNS alert');
        return;
      }

      const params = {
        TopicArn: config.alerts.snsTopicArn,
        Subject: `[${severity}] ${subject}`,
        Message: message,
        MessageAttributes: {
          severity: {
            DataType: 'String',
            StringValue: severity
          },
          timestamp: {
            DataType: 'String',
            StringValue: new Date().toISOString()
          }
        }
      };

      const command = new PublishCommand(params);
      const result = await this.snsClient.send(command);
      console.log('SNS alert sent successfully:', result.MessageId);
      return result;
    } catch (error) {
      console.error('Failed to send SNS alert:', error);
      throw error;
    }
  }

  /**
   * Send email alert using SES
   */
  async sendEmailAlert(subject, htmlBody, textBody, severity = 'WARNING') {
    try {
      const params = {
        Source: config.alerts.emailFrom,
        Destination: {
          ToAddresses: config.alerts.emailTo
        },
        Message: {
          Subject: {
            Data: `[${severity}] ${subject}`,
            Charset: 'UTF-8'
          },
          Body: {
            Html: {
              Data: htmlBody,
              Charset: 'UTF-8'
            },
            Text: {
              Data: textBody,
              Charset: 'UTF-8'
            }
          }
        }
      };

      const command = new SendEmailCommand(params);
      const result = await this.sesClient.send(command);
      console.log('Email alert sent successfully:', result.MessageId);
      return result;
    } catch (error) {
      console.error('Failed to send email alert:', error);
      throw error;
    }
  }

  /**
   * Format alert message for errors
   */
  formatErrorAlert(errors, timeWindow) {
    const errorCount = errors.length;
    const uniqueErrors = [...new Set(errors.map(e => e.message))];

    const subject = `${errorCount} errors detected in the last ${timeWindow} minutes`;

    const textMessage = `
Error Alert Summary:
==================
Total Errors: ${errorCount}
Time Window: ${timeWindow} minutes
Unique Error Types: ${uniqueErrors.length}

Recent Errors:
${errors.slice(0, 10).map(e => `- ${e.timestamp}: ${e.message}`).join('\n')}

${errorCount > 10 ? `... and ${errorCount - 10} more errors` : ''}
`;

    const htmlMessage = `
<html>
<body>
  <h2>🚨 Error Alert Summary</h2>
  <table border="1" style="border-collapse: collapse;">
    <tr><td><strong>Total Errors:</strong></td><td>${errorCount}</td></tr>
    <tr><td><strong>Time Window:</strong></td><td>${timeWindow} minutes</td></tr>
    <tr><td><strong>Unique Error Types:</strong></td><td>${uniqueErrors.length}</td></tr>
  </table>
  
  <h3>Recent Errors:</h3>
  <ul>
    ${errors.slice(0, 10).map(e => `<li><strong>${e.timestamp}:</strong> ${e.message}</li>`).join('')}
    ${errorCount > 10 ? `<li><em>... and ${errorCount - 10} more errors</em></li>` : ''}
  </ul>
</body>
</html>`;

    return { subject, textMessage, htmlMessage };
  }

  /**
   * Format alert message for threshold violations
   */
  formatThresholdAlert(violations) {
    const subject = 'Threshold violations detected';

    const textMessage = `
Threshold Violation Alert:
========================
${violations.map(v => `- ${v.metric}: ${v.value} ${v.comparison} ${v.threshold} ${v.unit || ''}`).join('\n')}

Timestamp: ${new Date().toISOString()}
`;

    const htmlMessage = `
<html>
<body>
  <h2>⚠️ Threshold Violation Alert</h2>
  <table border="1" style="border-collapse: collapse;">
    <tr><th>Metric</th><th>Current Value</th><th>Threshold</th><th>Status</th></tr>
    ${violations.map(v => `
      <tr>
        <td>${v.metric}</td>
        <td>${v.value} ${v.unit || ''}</td>
        <td>${v.threshold} ${v.unit || ''}</td>
        <td style="color: red;">${v.comparison}</td>
      </tr>
    `).join('')}
  </table>
  <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
</body>
</html>`;

    return { subject, textMessage, htmlMessage };
  }

  /**
   * Send comprehensive alert (both SNS and Email)
   */
  async sendAlert(alertData, alertType, severity = 'WARNING') {
    if (this.isInCooldown(alertType)) {
      console.log(`Alert type '${alertType}' is in cooldown period, skipping`);
      return;
    }

    try {
      const { subject, textMessage, htmlMessage } = alertData;

      // Send SNS alert
      await this.sendSNSAlert(subject, textMessage, severity);

      // Send email alert
      await this.sendEmailAlert(subject, htmlMessage, textMessage, severity);

      // Record alert time for cooldown
      this.recordAlert(alertType);

      console.log(`Alert sent successfully for type: ${alertType}`);
    } catch (error) {
      console.error(`Failed to send alert for type ${alertType}:`, error);
      throw error;
    }
  }
}

module.exports = AlertService;
