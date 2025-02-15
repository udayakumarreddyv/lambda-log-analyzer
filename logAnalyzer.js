const { S3Client, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');
const { CloudWatchLogsClient, FilterLogEventsCommand } = require('@aws-sdk/client-cloudwatch-logs');
const zlib = require('zlib');
const moment = require('moment');
const config = require('./config');

class LogAnalyzer {
  constructor() {
    this.s3Client = new S3Client({ region: config.s3Config.region });
    this.cloudWatchClient = new CloudWatchLogsClient({ region: config.s3Config.region });
  }

  /**
   * Analyze CloudWatch logs for errors and threshold violations
   */
  async analyzeCloudWatchLogs() {
    const results = {
      errors: [],
      metrics: {},
      violations: []
    };

    const endTime = Date.now();
    const startTime = endTime - (config.analysis.lookbackMinutes * 60 * 1000);

    for (const logGroup of config.logGroups) {
      try {
        console.log(`Analyzing CloudWatch log group: ${logGroup}`);

        const params = {
          logGroupName: logGroup,
          startTime: startTime,
          endTime: endTime,
          limit: config.analysis.batchSize
        };

        const command = new FilterLogEventsCommand(params);
        const response = await this.cloudWatchClient.send(command);

        if (response.events && response.events.length > 0) {
          const logGroupResults = this.processLogEvents(response.events, logGroup);
          results.errors.push(...logGroupResults.errors);
          results.metrics[logGroup] = logGroupResults.metrics;
          results.violations.push(...logGroupResults.violations);
        }
      } catch (error) {
        console.error(`Error analyzing log group ${logGroup}:`, error);
        results.errors.push({
          timestamp: new Date().toISOString(),
          logGroup: logGroup,
          message: `Failed to analyze log group: ${error.message}`,
          source: 'log-analyzer'
        });
      }
    }

    return results;
  }

  /**
   * Analyze S3 logs for errors and patterns
   */
  async analyzeS3Logs() {
    const results = {
      errors: [],
      metrics: {},
      violations: []
    };

    try {
      console.log(`Analyzing S3 logs from bucket: ${config.s3Config.bucket}`);

      // List recent log files
      const listParams = {
        Bucket: config.s3Config.bucket,
        Prefix: config.s3Config.prefix,
        MaxKeys: 100
      };

      const listCommand = new ListObjectsV2Command(listParams);
      const listResponse = await this.s3Client.send(listCommand);

      if (!listResponse.Contents || listResponse.Contents.length === 0) {
        console.log('No log files found in S3');
        return results;
      }

      // Filter files by modification time (last hour)
      const cutoffTime = moment().subtract(config.analysis.lookbackMinutes, 'minutes');
      const recentFiles = listResponse.Contents.filter(obj =>
        moment(obj.LastModified).isAfter(cutoffTime)
      );

      console.log(`Found ${recentFiles.length} recent log files`);

      // Process each file
      for (const file of recentFiles.slice(0, 10)) { // Limit to 10 files
        try {
          const fileResults = await this.processS3LogFile(file.Key);
          results.errors.push(...fileResults.errors);
          Object.assign(results.metrics, fileResults.metrics);
          results.violations.push(...fileResults.violations);
        } catch (error) {
          console.error(`Error processing S3 file ${file.Key}:`, error);
        }
      }
    } catch (error) {
      console.error('Error analyzing S3 logs:', error);
      results.errors.push({
        timestamp: new Date().toISOString(),
        source: 's3-analyzer',
        message: `Failed to analyze S3 logs: ${error.message}`
      });
    }

    return results;
  }

  /**
   * Process individual S3 log file
   */
  async processS3LogFile(key) {
    const params = {
      Bucket: config.s3Config.bucket,
      Key: key
    };

    const command = new GetObjectCommand(params);
    const response = await this.s3Client.send(command);

    let content;

    // Handle gzipped files
    if (key.endsWith('.gz')) {
      const chunks = [];
      for await (const chunk of response.Body) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      content = zlib.gunzipSync(buffer).toString();
    } else {
      content = await response.Body.transformToString();
    }

    const lines = content.split('\n').filter(line => line.trim());
    return this.processLogLines(lines, key);
  }

  /**
   * Process CloudWatch log events
   */
  processLogEvents(events, logGroup) {
    const results = {
      errors: [],
      metrics: {
        totalEvents: events.length,
        errorCount: 0,
        responseTimes: [],
        memoryUsage: []
      },
      violations: []
    };

    events.forEach(event => {
      const message = event.message;
      const timestamp = new Date(event.timestamp).toISOString();

      // Check for error patterns
      const isError = config.errorPatterns.some(pattern => pattern.test(message));
      if (isError) {
        results.errors.push({
          timestamp,
          logGroup,
          message: message.substring(0, 500), // Truncate long messages
          source: 'cloudwatch'
        });
        results.metrics.errorCount++;
      }

      // Extract metrics from log messages
      this.extractMetrics(message, results.metrics);
    });

    // Check for threshold violations
    results.violations.push(...this.checkThresholds(results.metrics, logGroup));

    return results;
  }

  /**
   * Process log lines from S3 files
   */
  processLogLines(lines, source) {
    const results = {
      errors: [],
      metrics: {
        totalLines: lines.length,
        errorCount: 0,
        responseTimes: [],
        statusCodes: {}
      },
      violations: []
    };

    lines.forEach(line => {
      // Check for error patterns
      const isError = config.errorPatterns.some(pattern => pattern.test(line));
      if (isError) {
        results.errors.push({
          timestamp: this.extractTimestamp(line) || new Date().toISOString(),
          source: source,
          message: line.substring(0, 500)
        });
        results.metrics.errorCount++;
      }

      // Extract metrics
      this.extractMetrics(line, results.metrics);
    });

    // Check for threshold violations
    results.violations.push(...this.checkThresholds(results.metrics, source));

    return results;
  }

  /**
   * Extract metrics from log messages
   */
  extractMetrics(message, metrics) {
    // Extract response time
    const responseTimeMatch = message.match(/(?:duration|time|elapsed)[:\s]+(\d+(?:\.\d+)?)\s*(?:ms|milliseconds)/i);
    if (responseTimeMatch) {
      if (!metrics.responseTimes) {
        metrics.responseTimes = [];
      }
      metrics.responseTimes.push(parseFloat(responseTimeMatch[1]));
    }

    // Extract memory usage
    const memoryMatch = message.match(/memory[:\s]+(\d+(?:\.\d+)?)\s*(?:mb|gb|%)/i);
    if (memoryMatch) {
      if (!metrics.memoryUsage) {
        metrics.memoryUsage = [];
      }
      metrics.memoryUsage.push(parseFloat(memoryMatch[1]));
    }

    // Extract HTTP status codes
    const statusMatch = message.match(/\b([1-5]\d{2})\b/);
    if (statusMatch) {
      const status = statusMatch[1];
      if (!metrics.statusCodes) {
        metrics.statusCodes = {};
      }
      metrics.statusCodes[status] = (metrics.statusCodes[status] || 0) + 1;
    }
  }

  /**
   * Extract timestamp from log line
   */
  extractTimestamp(line) {
    // Common timestamp patterns
    const patterns = [
      /(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})?)/,
      /(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2})/,
      /(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2})/
    ];

    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        return new Date(match[1]).toISOString();
      }
    }
    return null;
  }

  /**
   * Check for threshold violations
   */
  checkThresholds(metrics, source) {
    const violations = [];

    // Check error rate
    if (metrics.totalEvents > 0 || metrics.totalLines > 0) {
      if (metrics.errorCount > config.thresholds.errorRate.maxErrors) {
        violations.push({
          metric: 'Error Count',
          value: metrics.errorCount,
          threshold: config.thresholds.errorRate.maxErrors,
          comparison: 'exceeds',
          source: source
        });
      }
    }

    // Check response times
    if (metrics.responseTimes && metrics.responseTimes.length > 0) {
      const avgResponseTime = metrics.responseTimes.reduce((a, b) => a + b) / metrics.responseTimes.length;
      const p95ResponseTime = this.calculatePercentile(metrics.responseTimes, 95);

      if (avgResponseTime > config.thresholds.responseTime.maxAvgResponseTime) {
        violations.push({
          metric: 'Average Response Time',
          value: Math.round(avgResponseTime),
          threshold: config.thresholds.responseTime.maxAvgResponseTime,
          comparison: 'exceeds',
          unit: 'ms',
          source: source
        });
      }

      if (p95ResponseTime > config.thresholds.responseTime.maxP95ResponseTime) {
        violations.push({
          metric: 'P95 Response Time',
          value: Math.round(p95ResponseTime),
          threshold: config.thresholds.responseTime.maxP95ResponseTime,
          comparison: 'exceeds',
          unit: 'ms',
          source: source
        });
      }
    }

    // Check memory usage
    if (metrics.memoryUsage && metrics.memoryUsage.length > 0) {
      const avgMemory = metrics.memoryUsage.reduce((a, b) => a + b) / metrics.memoryUsage.length;

      if (avgMemory > config.thresholds.memoryUsage.maxMemoryPercent) {
        violations.push({
          metric: 'Memory Usage',
          value: avgMemory.toFixed(1),
          threshold: config.thresholds.memoryUsage.maxMemoryPercent,
          comparison: 'exceeds',
          unit: '%',
          source: source
        });
      }
    }

    return violations;
  }

  /**
   * Calculate percentile for array of numbers
   */
  calculatePercentile(values, percentile) {
    const sorted = values.slice().sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index] || 0;
  }

  /**
   * Main analysis function
   */
  async analyzeLogs() {
    console.log('Starting log analysis...');

    const [cloudWatchResults, s3Results] = await Promise.all([
      this.analyzeCloudWatchLogs(),
      this.analyzeS3Logs()
    ]);

    // Combine results
    const combinedResults = {
      errors: [...cloudWatchResults.errors, ...s3Results.errors],
      metrics: { ...cloudWatchResults.metrics, ...s3Results.metrics },
      violations: [...cloudWatchResults.violations, ...s3Results.violations],
      timestamp: new Date().toISOString(),
      summary: {
        totalErrors: cloudWatchResults.errors.length + s3Results.errors.length,
        totalViolations: cloudWatchResults.violations.length + s3Results.violations.length,
        cloudWatchSources: Object.keys(cloudWatchResults.metrics).length,
        s3Sources: Object.keys(s3Results.metrics).length
      }
    };

    console.log('Log analysis completed:', combinedResults.summary);
    return combinedResults;
  }
}

module.exports = LogAnalyzer;
