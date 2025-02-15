#!/usr/bin/env node

/**
 * Local testing script for the Lambda Log Analyzer
 * This script simulates the Lambda environment and allows for local testing
 */

const LogAnalyzer = require('./logAnalyzer');
const AlertService = require('./alertService');

async function runLocalTest() {
  console.log('🚀 Starting local test of Lambda Log Analyzer...\n');

  try {
    // Create test log data
    const mockCloudWatchEvents = [
      {
        timestamp: Date.now() - 300000, // 5 minutes ago
        message: 'INFO: Application started successfully'
      },
      {
        timestamp: Date.now() - 240000, // 4 minutes ago
        message: 'ERROR: Database connection failed - timeout after 30 seconds'
      },
      {
        timestamp: Date.now() - 180000, // 3 minutes ago
        message: 'WARN: Memory usage at 88%, approaching limit'
      },
      {
        timestamp: Date.now() - 120000, // 2 minutes ago
        message: 'ERROR: API request failed with 500 Internal Server Error'
      },
      {
        timestamp: Date.now() - 60000, // 1 minute ago
        message: 'INFO: Request processed in 6500ms'
      }
    ];

    // Initialize services
    const logAnalyzer = new LogAnalyzer();
    const alertService = new AlertService();

    // Process mock events
    console.log('📊 Processing mock log events...');
    const results = logAnalyzer.processLogEvents(mockCloudWatchEvents, 'test-log-group');

    console.log('\n📈 Analysis Results:');
    console.log('===================');
    console.log(`Total Events: ${results.metrics.totalEvents}`);
    console.log(`Errors Found: ${results.errors.length}`);
    console.log(`Violations: ${results.violations.length}`);

    if (results.errors.length > 0) {
      console.log('\n🚨 Errors Detected:');
      results.errors.forEach((error, index) => {
        console.log(`${index + 1}. ${error.timestamp}: ${error.message.substring(0, 100)}...`);
      });
    }

    if (results.violations.length > 0) {
      console.log('\n⚠️  Threshold Violations:');
      results.violations.forEach((violation, index) => {
        console.log(`${index + 1}. ${violation.metric}: ${violation.value} ${violation.comparison} ${violation.threshold} ${violation.unit || ''}`);
      });
    }

    // Test alert formatting
    if (results.errors.length > 0) {
      console.log('\n📧 Testing Alert Formatting...');
      const errorAlert = alertService.formatErrorAlert(results.errors, 15);
      console.log('Subject:', errorAlert.subject);
      console.log('Text Preview:', errorAlert.textMessage.substring(0, 200) + '...');
    }

    if (results.violations.length > 0) {
      console.log('\n⚠️  Testing Threshold Alert Formatting...');
      const thresholdAlert = alertService.formatThresholdAlert(results.violations);
      console.log('Subject:', thresholdAlert.subject);
      console.log('Text Preview:', thresholdAlert.textMessage.substring(0, 200) + '...');
    }

    // Test timestamp extraction
    console.log('\n🕐 Testing Timestamp Extraction...');
    const testTimestamps = [
      '2023-12-01T10:30:00.123Z [ERROR] Test message',
      '2023/12/01 10:30:00 [INFO] Another test',
      'Dec 01 10:30:00 server1 application: Test log'
    ];

    testTimestamps.forEach(line => {
      const timestamp = logAnalyzer.extractTimestamp(line);
      console.log(`"${line.substring(0, 30)}..." → ${timestamp || 'No timestamp found'}`);
    });

    // Test metric extraction
    console.log('\n📊 Testing Metric Extraction...');
    const testMetrics = { responseTimes: [], memoryUsage: [], statusCodes: {} };
    const metricLines = [
      'Request completed in 1234.5ms',
      'Memory usage: 87.5%',
      'HTTP 500 Internal Server Error',
      'Duration: 2500 milliseconds'
    ];

    metricLines.forEach(line => {
      logAnalyzer.extractMetrics(line, testMetrics);
      console.log(`"${line}" → Extracted metrics updated`);
    });
    console.log('Final metrics:', testMetrics);

    // Test percentile calculation
    console.log('\n📈 Testing Percentile Calculation...');
    const testValues = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
    console.log('Values:', testValues);
    console.log('P50:', logAnalyzer.calculatePercentile(testValues, 50));
    console.log('P90:', logAnalyzer.calculatePercentile(testValues, 90));
    console.log('P95:', logAnalyzer.calculatePercentile(testValues, 95));
    console.log('P99:', logAnalyzer.calculatePercentile(testValues, 99));

    console.log('\n✅ Local test completed successfully!');

  } catch (error) {
    console.error('\n❌ Local test failed:', error);
    process.exit(1);
  }
}

// Run if this script is executed directly
if (require.main === module) {
  runLocalTest();
}

module.exports = { runLocalTest };
