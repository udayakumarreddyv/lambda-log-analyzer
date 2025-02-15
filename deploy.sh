#!/bin/bash

# Deployment script for Lambda Log Analyzer
set -e

# Configuration
FUNCTION_NAME="log-analyzer"
STACK_NAME="log-analyzer"
REGION="us-east-1"
PROFILE=""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --function-name)
            FUNCTION_NAME="$2"
            shift 2
            ;;
        --stack-name)
            STACK_NAME="$2"
            shift 2
            ;;
        --region)
            REGION="$2"
            shift 2
            ;;
        --profile)
            PROFILE="--profile $2"
            shift 2
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo "Options:"
            echo "  --function-name  Lambda function name (default: log-analyzer)"
            echo "  --stack-name     CloudFormation stack name (default: log-analyzer)"
            echo "  --region         AWS region (default: us-east-1)"
            echo "  --profile        AWS profile to use"
            echo "  --help           Show this help message"
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

print_status "Starting deployment of Lambda Log Analyzer..."
print_status "Function Name: $FUNCTION_NAME"
print_status "Stack Name: $STACK_NAME"
print_status "Region: $REGION"

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    print_error "AWS CLI is not installed. Please install it first."
    exit 1
fi

# Check if jq is installed (optional but recommended)
if ! command -v jq &> /dev/null; then
    print_warning "jq is not installed. JSON output will not be formatted."
fi

# Validate AWS credentials
print_status "Validating AWS credentials..."
if ! aws sts get-caller-identity $PROFILE --region $REGION &> /dev/null; then
    print_error "AWS credentials are not configured or invalid."
    exit 1
fi

# Install dependencies
print_status "Installing dependencies..."
npm install --production

# Run tests
print_status "Running tests..."
npm test

# Create deployment package
print_status "Creating deployment package..."
rm -f lambda-log-analyzer.zip

# Create a temporary directory for the package
TEMP_DIR=$(mktemp -d)
cp -r . "$TEMP_DIR/"
cd "$TEMP_DIR"

# Remove unnecessary files
rm -rf test/
rm -rf .git/
rm -rf node_modules/.cache/
rm -f deploy.sh
rm -f *.zip

# Create the zip file
zip -r lambda-log-analyzer.zip . -x "*.git*" "test/*" "coverage/*" "*.zip"

# Move back to original directory
cd - > /dev/null
mv "$TEMP_DIR/lambda-log-analyzer.zip" .
rm -rf "$TEMP_DIR"

print_status "Deployment package created: lambda-log-analyzer.zip"

# Check if CloudFormation stack exists
print_status "Checking if CloudFormation stack exists..."
if aws cloudformation describe-stacks --stack-name $STACK_NAME $PROFILE --region $REGION &> /dev/null; then
    STACK_EXISTS=true
    print_status "Stack exists. Will update existing stack."
else
    STACK_EXISTS=false
    print_status "Stack does not exist. Will create new stack."
fi

# Deploy or update CloudFormation stack
if [ "$STACK_EXISTS" = true ]; then
    print_status "Updating CloudFormation stack..."
    aws cloudformation update-stack \
        --stack-name $STACK_NAME \
        --template-body file://cloudformation.yaml \
        --capabilities CAPABILITY_NAMED_IAM \
        $PROFILE \
        --region $REGION
    
    print_status "Waiting for stack update to complete..."
    aws cloudformation wait stack-update-complete \
        --stack-name $STACK_NAME \
        $PROFILE \
        --region $REGION
else
    print_status "Creating CloudFormation stack..."
    aws cloudformation create-stack \
        --stack-name $STACK_NAME \
        --template-body file://cloudformation.yaml \
        --capabilities CAPABILITY_NAMED_IAM \
        $PROFILE \
        --region $REGION
    
    print_status "Waiting for stack creation to complete..."
    aws cloudformation wait stack-create-complete \
        --stack-name $STACK_NAME \
        $PROFILE \
        --region $REGION
fi

# Update Lambda function code
print_status "Updating Lambda function code..."
aws lambda update-function-code \
    --function-name $FUNCTION_NAME \
    --zip-file fileb://lambda-log-analyzer.zip \
    $PROFILE \
    --region $REGION

# Wait for function to be updated
print_status "Waiting for function update to complete..."
aws lambda wait function-updated \
    --function-name $FUNCTION_NAME \
    $PROFILE \
    --region $REGION

# Get stack outputs
print_status "Retrieving stack outputs..."
OUTPUTS=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    $PROFILE \
    --region $REGION \
    --query 'Stacks[0].Outputs')

if command -v jq &> /dev/null; then
    echo "$OUTPUTS" | jq -r '.[] | "\(.OutputKey): \(.OutputValue)"'
else
    echo "$OUTPUTS"
fi

# Test the function
print_status "Testing the Lambda function..."
RESPONSE=$(aws lambda invoke \
    --function-name $FUNCTION_NAME \
    --payload '{"source":"manual-test","detail-type":"Test Event"}' \
    --cli-binary-format raw-in-base64-out \
    $PROFILE \
    --region $REGION \
    /tmp/lambda-response.json)

if [ $? -eq 0 ]; then
    print_status "Lambda function test successful!"
    if command -v jq &> /dev/null; then
        cat /tmp/lambda-response.json | jq '.'
    else
        cat /tmp/lambda-response.json
    fi
    rm -f /tmp/lambda-response.json
else
    print_error "Lambda function test failed!"
    exit 1
fi

# Clean up
rm -f lambda-log-analyzer.zip

print_status "Deployment completed successfully!"
print_status "Dashboard URL: https://$REGION.console.aws.amazon.com/cloudwatch/home?region=$REGION#dashboards:name=LogAnalyzer"
print_status "Lambda Function: https://$REGION.console.aws.amazon.com/lambda/home?region=$REGION#/functions/$FUNCTION_NAME"

echo ""
print_status "Next steps:"
echo "1. Configure your log sources in config.js"
echo "2. Set up SES verified email addresses if using email alerts"
echo "3. Subscribe to the SNS topic for notifications"
echo "4. Monitor the CloudWatch dashboard for function metrics"
