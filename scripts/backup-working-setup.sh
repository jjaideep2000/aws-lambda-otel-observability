#!/bin/bash

echo "🔄 Backing up working OTEL setup from AWS..."

# Create backup directory
mkdir -p aws-backup/functions
mkdir -p aws-backup/configs

# Download current function code
echo "📥 Downloading publisher function..."
aws lambda get-function --function-name asyncdemo-publisher-x86 --query 'Code.Location' --output text | xargs curl -o aws-backup/functions/publisher-current.zip

echo "📥 Downloading consumer function..."
aws lambda get-function --function-name asyncdemo-consumer-temp --query 'Code.Location' --output text | xargs curl -o aws-backup/functions/consumer-current.zip

# Get function configurations
echo "⚙️ Backing up function configurations..."
aws lambda get-function-configuration --function-name asyncdemo-publisher-x86 > aws-backup/configs/publisher-config.json
aws lambda get-function-configuration --function-name asyncdemo-consumer-temp > aws-backup/configs/consumer-config.json

# Extract the zip files to see the code
echo "📂 Extracting function code..."
cd aws-backup/functions
unzip -o publisher-current.zip -d publisher/
unzip -o consumer-current.zip -d consumer/
cd ../..

echo "✅ Backup complete! Check aws-backup/ directory"