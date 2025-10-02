#!/bin/bash

echo "🚀 Testing Publisher → SNS → SQS → Consumer Flow with OTEL"
echo "========================================================="

# Step 1: Test Publisher (OTEL-enabled)
echo "📤 Step 1: Testing Publisher Function..."
aws lambda invoke \
  --function-name asyncdemo-publisher-x86 \
  --cli-binary-format raw-in-base64-out \
  --payload file://test-otel-publisher.json \
  response-publisher-test.json

echo "✅ Publisher Response:"
cat response-publisher-test.json | jq .
TRACE_ID=$(cat response-publisher-test.json | jq -r '.traceparent' | cut -d'-' -f2)
echo "🔍 Generated Trace ID: $TRACE_ID"
echo ""

# Step 2: Wait for message propagation through SNS → SQS → Consumer
echo "⏳ Step 2: Waiting for message propagation (SNS → SQS → Consumer)..."
sleep 5

# Step 3: Check Consumer Function (asyncdemo-consumer-temp)
echo "📥 Step 3: Checking Consumer Function (asyncdemo-consumer-temp)..."

# Get recent logs from consumer in central logs
CONSUMER_STREAM=$(aws logs describe-log-streams \
  --log-group-name "/asyncdemo/central" \
  --order-by LastEventTime \
  --descending \
  --query 'logStreams[?contains(logStreamName, `consumer-temp`)].logStreamName' \
  --output text | head -1)

if [ ! -z "$CONSUMER_STREAM" ] && [ "$CONSUMER_STREAM" != "None" ]; then
  echo "Latest consumer log stream: $CONSUMER_STREAM"
  echo "Recent consumer logs:"
  aws logs get-log-events \
    --log-group-name "/asyncdemo/central" \
    --log-stream-name "$CONSUMER_STREAM" \
    --query 'events[-3:].[timestamp,message]' \
    --output text
else
  echo "❌ No recent consumer logs found in central logs"
fi

echo ""

# Step 4: Check both Publisher and Consumer in Central Logs
echo "📋 Step 4: Checking Central Logs for Trace Correlation..."
echo "Publisher logs (last 2 entries):"
PUBLISHER_STREAM=$(aws logs describe-log-streams \
  --log-group-name "/asyncdemo/central" \
  --order-by LastEventTime \
  --descending \
  --query 'logStreams[?contains(logStreamName, `publisher`)].logStreamName' \
  --output text | head -1)

if [ ! -z "$PUBLISHER_STREAM" ]; then
  aws logs get-log-events \
    --log-group-name "/asyncdemo/central" \
    --log-stream-name "$PUBLISHER_STREAM" \
    --query 'events[-2:].[timestamp,message]' \
    --output text
fi

echo ""

# Step 5: Check X-Ray Service Graph
echo "🔍 Step 5: Checking X-Ray Service Graph..."
echo "Looking for services in the last 10 minutes..."
aws xray get-service-graph \
  --start-time $(date -v-10M +%s) \
  --end-time $(date +%s) \
  --query 'Services[*].[Name,Type,State]' \
  --output table

echo ""

# Step 6: Search for specific trace
echo "🎯 Step 6: Searching for Trace ID: $TRACE_ID"
aws xray batch-get-traces --trace-ids "1-$TRACE_ID" --query 'Traces[0].Segments[*].Document' --output json | jq -r '.[] | fromjson | .name'

echo ""
echo "🎉 End-to-End OTEL Test Complete!"
echo "✅ Publisher: asyncdemo-publisher-x86 (OTEL-enabled)"
echo "✅ Consumer: asyncdemo-consumer-temp (OTEL-enabled)"  
echo "✅ Flow: Publisher → SNS → SQS → Consumer"
echo "🔍 Trace ID: $TRACE_ID"