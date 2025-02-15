const LogAnalyzer = require('../logAnalyzer');
const AlertService = require('../alertService');
const config = require('../config');

// Mock AWS SDK
jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/client-cloudwatch-logs');
jest.mock('@aws-sdk/client-sns');
jest.mock('@aws-sdk/client-ses');

describe('LogAnalyzer', () => {
  let logAnalyzer;

  beforeEach(() => {
    logAnalyzer = new LogAnalyzer();
  });

  test('should extract timestamp from log line', () => {
    const testLines = [
      '2023-12-01T10:30:00.123Z [ERROR] Something went wrong',
      '2023/12/01 10:30:00 [INFO] Process started',
      '12/01/2023 10:30:00 [WARN] Memory usage high'
    ];

    testLines.forEach(line => {
      const timestamp = logAnalyzer.extractTimestamp(line);
      expect(timestamp).toBeTruthy();
      expect(new Date(timestamp)).toBeInstanceOf(Date);
    });
  });

  test('should detect error patterns', () => {
    const testMessages = [
      'ERROR: Database connection failed',
      'FATAL: Out of memory',
      'Exception in thread main',
      '500 Internal Server Error',
      'Request timeout occurred'
    ];

    testMessages.forEach(message => {
      const isError = config.errorPatterns.some(pattern => pattern.test(message));
      expect(isError).toBe(true);
    });
  });

  test('should extract response time metrics', () => {
    const metrics = { responseTimes: [] };
    const testMessage = 'Request completed with duration: 1234.5ms';
    
    logAnalyzer.extractMetrics(testMessage, metrics);
    
    expect(metrics.responseTimes).toContain(1234.5);
  });

  test('should calculate percentiles correctly', () => {
    const values = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
    
    const p50 = logAnalyzer.calculatePercentile(values, 50);
    const p95 = logAnalyzer.calculatePercentile(values, 95);
    const p99 = logAnalyzer.calculatePercentile(values, 99);
    
    expect(p50).toBe(500);
    expect(p95).toBe(1000); // For 10 items, 95th percentile is the last item
    expect(p99).toBe(1000); // For 10 items, 99th percentile is also the last item
  });

  test('should detect threshold violations', () => {
    const metrics = {
      totalEvents: 100,
      errorCount: 15, // Exceeds threshold of 10
      responseTimes: [6000, 7000, 8000], // Exceeds avg threshold of 5000ms
      memoryUsage: [90, 95, 88] // Exceeds threshold of 85%
    };

    const violations = logAnalyzer.checkThresholds(metrics, 'test-source');
    
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some(v => v.metric === 'Error Count')).toBe(true);
    expect(violations.some(v => v.metric === 'Average Response Time')).toBe(true);
    expect(violations.some(v => v.metric === 'Memory Usage')).toBe(true);
  });
});

describe('AlertService', () => {
  let alertService;

  beforeEach(() => {
    alertService = new AlertService();
  });

  test('should format error alert correctly', () => {
    const errors = [
      {
        timestamp: '2023-12-01T10:30:00Z',
        message: 'Database connection failed',
        source: 'app-logs'
      },
      {
        timestamp: '2023-12-01T10:31:00Z',
        message: 'API timeout occurred',
        source: 'app-logs'
      }
    ];

    const alert = alertService.formatErrorAlert(errors, 15);
    
    expect(alert.subject).toContain('2 errors detected');
    expect(alert.textMessage).toContain('Total Errors: 2');
    expect(alert.htmlMessage).toContain('<h2>');
    expect(alert.htmlMessage).toContain('Database connection failed');
  });

  test('should format threshold alert correctly', () => {
    const violations = [
      {
        metric: 'Response Time',
        value: 6000,
        threshold: 5000,
        comparison: 'exceeds',
        unit: 'ms',
        source: 'api-logs'
      }
    ];

    const alert = alertService.formatThresholdAlert(violations);
    
    expect(alert.subject).toContain('Threshold violations detected');
    expect(alert.textMessage).toContain('Response Time: 6000 exceeds 5000 ms');
    expect(alert.htmlMessage).toContain('<table');
  });

  test('should respect cooldown period', () => {
    const alertType = 'test-alert';
    
    // First alert should not be in cooldown
    expect(alertService.isInCooldown(alertType)).toBe(false);
    
    // Record alert
    alertService.recordAlert(alertType);
    
    // Subsequent alert should be in cooldown
    expect(alertService.isInCooldown(alertType)).toBe(true);
  });
});

describe('Integration Tests', () => {
  test('should process mock log events', async () => {
    const mockEvents = [
      {
        timestamp: Date.now(),
        message: 'INFO: Application started successfully'
      },
      {
        timestamp: Date.now(),
        message: 'ERROR: Database connection failed after 30s timeout'
      },
      {
        timestamp: Date.now(),
        message: 'WARN: Memory usage at 90%, approaching limit'
      }
    ];

    const logAnalyzer = new LogAnalyzer();
    const results = logAnalyzer.processLogEvents(mockEvents, 'test-log-group');
    
    expect(results.errors.length).toBe(1);
    expect(results.metrics.totalEvents).toBe(3);
    expect(results.metrics.errorCount).toBe(1);
  });

  test('should handle empty log data gracefully', async () => {
    const logAnalyzer = new LogAnalyzer();
    const results = logAnalyzer.processLogEvents([], 'empty-log-group');
    
    expect(results.errors.length).toBe(0);
    expect(results.metrics.totalEvents).toBe(0);
    expect(results.violations.length).toBe(0);
  });
});
