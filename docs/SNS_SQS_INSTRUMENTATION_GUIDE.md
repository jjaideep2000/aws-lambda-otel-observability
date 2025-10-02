# SNS and SQS Instrumentation Guide

## Overview

Your system provides **automatic end-to-end tracing** from SNS → SQS → Lambda without requiring any manual instrumentation of SNS or SQS services. The trace context flows seamlessly through the entire pipeline.

## 🔄 **Complete Trace Flow**

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│     SNS     │───▶│     SQS     │───▶│   Lambda    │───▶│  Business   │
│  Publisher  │    │   Queue     │    │  Function   │    │   Logic     │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
       │                   │                   │                   │
       ▼                   ▼                   ▼                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    Automatic Trace Propagation                         │
│  Trace ID: abc123... (flows through entire pipeline)                   │
│  Parent-Child Spans: SNS→SQS→Lambda→Business Operations                │
└─────────────────────────────────────────────────────────────────────────┘
```

## 📡 **SNS Instrumentation**

### **Automatic AWS SDK Instrumentation**
- AWS SDK automatically creates trace context when publishing messages
- No manual OpenTelemetry code required in SNS publishers
- Trace IDs are generated and propagated via message attributes

### **Message Attributes for Trace Propagation**
```javascript
// From your demo script - SNS publish with trace context
aws sns publish \
  --topic-arn "arn:aws:sns:us-east-2:088153174619:asyncobservability-messages-topic" \
  --message "$PAYLOAD" \
  --message-attributes '{
    "customerId": {"DataType": "String", "StringValue": "cust-demo-premium-001"},
    "transactionType": {"DataType": "String", "StringValue": "order"},
    "priority": {"DataType": "String", "StringValue": "high"}
  }'
```

### **SNS Producer Lambda (Advanced)**
Your `functions/snsProducer.js` shows advanced SNS instrumentation:

```javascript
// Creates producer spans for SNS operations
const publishParams = {
  TopicArn: process.env.SNS_TOPIC_ARN,
  Message: JSON.stringify(snsMessage),
  MessageAttributes: {
    // Automatic trace context propagation
    'otel-trace-id': {
      DataType: 'String', 
      StringValue: publishSpanContext.traceId
    },
    'otel-span-id': {
      DataType: 'String',
      StringValue: publishSpanContext.spanId
    }
  }
};
```

## 📥 **SQS Instrumentation**

### **Automatic Message Processing**
- SQS preserves trace context from SNS messages
- Lambda runtime automatically extracts trace context from SQS records
- Parent-child span relationships maintained automatically

### **SQS Message Structure**
```json
{
  "Records": [
    {
      "messageId": "abc123...",
      "body": "{\"Message\": \"{...business data...}\"}",
      "messageAttributes": {
        "customerId": {"stringValue": "cust-demo-premium-001"},
        "otel-trace-id": {"stringValue": "68d348f79a8299bd..."},
        "otel-span-id": {"stringValue": "2a50facd301d1012..."}
      }
    }
  ]
}
```

### **Lambda SQS Processing**
Your `functions/consumer-business-clean.js` shows how SQS messages are processed:

```javascript
// Automatic trace context extraction and span creation
const handler = wrapLambdaHandler(async (event, context, { handlerParent }) => {
  // forEachSqsRecord automatically:
  // - Extracts parent trace context from each SQS message
  // - Creates child spans for each message processing
  // - Handles SNS→SQS message unwrapping
  const results = await forEachSqsRecord(event, processTransaction);
});
```

## 🔍 **Observability Data Examples**

### **Business Events with Trace Correlation**
```json
{
  "eventType": "order_completed",
  "businessData": {
    "customerId": "cust-demo-premium-001",
    "orderId": "ord-demo-1758677232-001",
    "amount": 2500,
    "currency": "USD"
  },
  "traceContext": {
    "traceId": "68d348f0859442d6f79dacdb8f474461",
    "spanId": "93768df19da0b8eb",
    "traceFlags": 1
  }
}
```

### **OTEL Span Summaries**
```json
{
  "traceId": "68d348f0859442d6f79dacdb8f474461",
  "spanId": "b9e7d1793a423d0a",
  "parentSpanId": "6367603cbc446518",
  "name": "asyncobservability-order-processor",
  "duration": "277.18ms",
  "status": "OK",
  "attributes": {
    "messaging.system": "sqs",
    "messaging.operation": "process",
    "faas.execution": "841daf65-aef6-5866-bf37-ce28e5d28d09"
  }
}
```

## 🎯 **Complete Trace Example**

From a real trace in your system:

```
Trace ID: 68d348f79a8299bd47f48066078a19fc

Span Hierarchy:
├── [ROOT] SNS Publish (AWS SDK automatic)
│   └── [CHILD] SQS Message Processing
│       └── [CHILD] asyncobservability-order-processor (235.99ms)
│           └── [CHILD] lambda-handler (235.35ms)
│               └── [CHILD] sqs-message-processing (234.30ms)
│                   ├── [CHILD] order-validation (50.51ms)
│                   ├── [CHILD] inventory-check (101.07ms)
│                   └── [CHILD] payment-processing (80.83ms)

Business Events:
├── BUSINESS_EVENT_INVENTORY_CHECKED
├── BUSINESS_EVENT_PAYMENT_PROCESSED
└── BUSINESS_EVENT_ORDER_COMPLETED
```

## 📊 **Viewing SNS/SQS Instrumentation Data**

### **1. View Complete Trace Flow**
```bash
./demo/view-sns-sqs-instrumentation.sh
```

### **2. Query Specific Trace**
```bash
# Replace TRACE_ID with actual trace ID
aws logs filter-log-events \
  --log-group-name '/aws/lambda/asyncobservability-observability' \
  --filter-pattern 'TRACE_ID' \
  --query 'events[*].message' \
  --output text
```

### **3. View Parent-Child Relationships**
```bash
aws logs filter-log-events \
  --log-group-name '/aws/lambda/asyncobservability-observability' \
  --filter-pattern 'OTEL_SPAN_SUMMARY' \
  --query 'events[*].message' \
  --output text
```

### **4. AWS X-Ray Console**
- Navigate to: **AWS Console → X-Ray → Traces**
- View complete service map showing SNS → SQS → Lambda flow
- See timing breakdown and error analysis

## 🔧 **CloudWatch Metrics**

### **SNS Metrics**
```bash
aws cloudwatch get-metric-statistics \
  --namespace AWS/SNS \
  --metric-name NumberOfMessagesPublished \
  --dimensions Name=TopicName,Value=asyncobservability-messages-topic \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum
```

### **SQS Metrics**
```bash
aws cloudwatch get-metric-statistics \
  --namespace AWS/SQS \
  --metric-name NumberOfMessagesReceived \
  --dimensions Name=QueueName,Value=asyncobservability-messages-queue \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum
```

## ✨ **Key Benefits**

### **Zero Manual Instrumentation**
- SNS and SQS are automatically instrumented by AWS
- No OpenTelemetry code required in message publishers
- Trace context flows seamlessly through the pipeline

### **Complete Observability**
- End-to-end tracing from message publish to business logic completion
- Parent-child span relationships show detailed execution flow
- Business events correlated with technical traces

### **Production Ready**
- Built-in error handling and retry mechanisms
- Comprehensive logging for debugging and monitoring
- CloudWatch integration for alerts and dashboards

### **Developer Experience**
- Business logic remains clean and focused
- Automatic trace correlation without complexity
- Easy debugging with complete request flow visibility

## 🎉 **Demo Commands**

Run these commands to see SNS/SQS instrumentation in action:

```bash
# 1. Send test messages through SNS
./demo/01-send-test-records.sh

# 2. View complete observability data
./demo/02-show-observability.sh

# 3. Analyze SNS/SQS instrumentation
./demo/view-sns-sqs-instrumentation.sh

# 4. View raw log data
./demo/view-raw-logs.sh
```

This architecture provides **complete end-to-end observability** with **zero complexity** for developers working on business logic!