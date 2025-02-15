// Jest setup file
// This file runs before each test file

// Mock AWS SDK clients globally
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    send: jest.fn()
  })),
  ListObjectsV2Command: jest.fn(),
  GetObjectCommand: jest.fn()
}));

jest.mock('@aws-sdk/client-cloudwatch-logs', () => ({
  CloudWatchLogsClient: jest.fn().mockImplementation(() => ({
    send: jest.fn()
  })),
  DescribeLogGroupsCommand: jest.fn(),
  FilterLogEventsCommand: jest.fn()
}));

jest.mock('@aws-sdk/client-sns', () => ({
  SNSClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({ MessageId: 'test-message-id' })
  })),
  PublishCommand: jest.fn()
}));

jest.mock('@aws-sdk/client-ses', () => ({
  SESClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({ MessageId: 'test-email-id' })
  })),
  SendEmailCommand: jest.fn()
}));

// Set test environment variables
process.env.AWS_REGION = 'us-east-1';
process.env.LOG_BUCKET = 'test-bucket';
process.env.SNS_TOPIC_ARN = 'arn:aws:sns:us-east-1:123456789012:test-topic';
process.env.EMAIL_FROM = 'test@example.com';
process.env.EMAIL_TO = 'admin@example.com';

// Console log suppression for cleaner test output
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

beforeEach(() => {
  // Suppress console.log during tests unless explicitly needed
  console.log = jest.fn();
  console.error = jest.fn();
});

afterEach(() => {
  // Restore console methods
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  
  // Clear all mocks
  jest.clearAllMocks();
});
