# AWS Lambda Observability Architecture Guide

## 🎯 Overview

This document provides a comprehensive guide to implementing production-ready observability for AWS Lambda functions using OpenTelemetry (OTEL). It covers the complete architecture, implementation patterns, and developer guidelines for building observable serverless applications.

## 📐 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           OBSERVABILITY ARCHITECTURE                        │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────┐    ┌─────────────┐    ┌─────────────┐    ┌──────────────┐
│   Client     │    │  API Gateway│    │   Lambda    │    │   Database   │
│ Application  │───▶│             │───▶│  Function   │───▶│   Service    │
└──────────────┘    └─────────────┘    └─────────────┘    └──────────────┘
                           │                   │                   │
                           ▼                   ▼                   ▼
                    ┌─────────────────────────────────────────────────────┐
                    │              OTEL INSTRUMENTATION              │
                    │  • Automatic trace generation                  │
                    │  • W3C trace context propagation              │
                    │  • Business context enrichment                │
                    └─────────────────────────────────────────────────────┘
                                           │
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        DISTRIBUTED TRACING FLOW                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐  SNS   ┌─────────────┐  SQS   ┌─────────────┐            │
│  │ Publisher   │───────▶│   Topic     │───────▶│ Consumer    │            │
│  │ Lambda      │        │             │        │ Lambda      │            │
│  └─────────────┘        └─────────────┘        └─────────────┘            │
│         │                       │                       │                  │
│         ▼                       ▼                       ▼                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    TRACE CORRELATION                                │   │
│  │  TraceID: 68ddeb470695db892e7bce267091ed11                         │   │
│  │  ├─ Publisher Span: 0f64cbc462a30019                              │   │
│  │  ├─ SNS Message: preserves trace context                          │   │
│  │  └─ Consumer Span: c60b6c7ab02591b5 (child of publisher)          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                           │
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         OBSERVABILITY OUTPUTS                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐            │
│  │  CloudWatch     │  │   X-Ray         │  │  Custom         │            │
│  │  Logs           │  │   Traces        │  │  Metrics        │            │
│  │                 │  │                 │  │                 │            │
│  │ • Structured    │  │ • Service Map   │  │ • Business KPIs │            │
│  │   JSON logs     │  │ • Trace details │  │ • Error rates   │            │
│  │ • Trace IDs     │  │ • Performance   │  │ • Latency       │            │
│  │ • Business      │  │   metrics       │  │ • Throughput    │            │
│  │   context       │  │                 │  │                 │            │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘            │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 🏗️ Core Components

### 1. ADOT (AWS Distro for OpenTelemetry) Layer

**Purpose**: Provides automatic instrumentation and trace collection
**Layer ARN**: `arn:aws:lambda:us-east-2:901920570463:layer:aws-otel-nodejs-amd64-ver-1-18-1:4`

**Key Features**:
- Automatic trace generation for Lambda functions
- W3C trace context propagation
- Integration with AWS services (SNS, SQS, DynamoDB, etc.)
- Zero-code instrumentation for common operations

### 2. Centralized Logging

**Log Group**: `/asyncdemo/central`
**Format**: Structured JSON with trace correlation

**Benefits**:
- Single location for all application logs
- Consistent log format across services
- Easy trace correlation and debugging
- Cost-effective log management

### 3. Trace Context Propagation

**Standard**: W3C Trace Context
**Format**: `00-{traceId}-{spanId}-{flags}`
**Propagation**: Through SNS message attributes and SQS headers

## 🔧 Implementation Patterns

### Pattern 1: Publisher Function (Event Producer)

```javascript
// Publisher Lambda Function Pattern
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { trace, context } from "@opentelemetry/api";

const sns = new SNSClient({});

export const handler = async (event) => {
    // Get current OTEL trace context (automatically created by ADOT)
    const currentSpan = trace.getSpan(context.active());
    
    // Add business attributes to the span
    if (currentSpan) {
        currentSpan.setAttributes({
            "business.transaction_type": event.transactionType,
            "business.order_id": event.orderId,
            "messaging.system": "sns",
            "messaging.operation": "publish"
        });
    }
    
    // Extract trace context for propagation
    const traceparent = getTraceparentFromActiveSpan();
    
    // Build message with business data
    const message = {
        transactionType: event.transactionType,
        orderId: event.orderId,
        timestamp: new Date().toISOString(),
        // ... other business data
    };
    
    // Publish with trace context in message attributes
    await sns.send(new PublishCommand({
        TopicArn: process.env.TOPIC_ARN,
        Message: JSON.stringify(message),
        MessageAttributes: {
            traceparent: { 
                DataType: "String", 
                StringValue: traceparent 
            },
            // ... other attributes
        }
    }));
    
    // Structured logging with trace correlation
    console.log(JSON.stringify({
        level: "INFO",
        service: "order-publisher",
        message: "order_published",
        traceId: currentSpan?.spanContext().traceId,
        orderId: event.orderId,
        // ... business context
    }));
    
    return { success: true, orderId: event.orderId };
};

function getTraceparentFromActiveSpan() {
    const span = trace.getSpan(context.active());
    if (!span) return null;
    
    const sc = span.spanContext();
    const flags = (sc.traceFlags & 0x01) ? "01" : "00";
    return `00-${sc.traceId}-${sc.spanId}-${flags}`;
}
```

### Pattern 2: Consumer Function (Event Processor)

```javascript
// Consumer Lambda Function Pattern
export const handler = async (event) => {
    console.log(JSON.stringify({
        level: "INFO",
        service: "order-processor", 
        message: "processing_batch",
        recordCount: event.Records?.length || 0
    }));

    for (const record of event.Records || []) {
        try {
            // Parse message (handle SNS->SQS wrapping)
            const messageData = parseMessage(record);
            
            // Extract trace context from message attributes
            const traceContext = extractTraceContext(record);
            
            // Process with trace correlation
            await processMessage(messageData, traceContext, record);
            
        } catch (error) {
            console.log(JSON.stringify({
                level: "ERROR",
                service: "order-processor",
                message: "processing_error",
                messageId: record.messageId,
                error: error.message,
                traceId: traceContext?.traceId
            }));
        }
    }
    
    return { batchItemFailures: [] };
};

function extractTraceContext(record) {
    // Extract from SQS message attributes (SNS->SQS flow)
    const traceparent = record.messageAttributes?.traceparent?.stringValue ||
                       record.messageAttributes?.w3c_traceparent_orig?.stringValue;
    
    if (traceparent) {
        const parts = traceparent.split('-');
        return {
            traceId: parts[1],
            spanId: parts[2],
            traceparent: traceparent
        };
    }
    
    return null;
}

function parseMessage(record) {
    const body = JSON.parse(record.body);
    
    // Handle SNS->SQS message wrapping
    if (body.Type === "Notification" && body.Message) {
        return JSON.parse(body.Message);
    }
    
    return body;
}

async function processMessage(messageData, traceContext, record) {
    console.log(JSON.stringify({
        level: "INFO",
        service: "order-processor",
        message: "processing_order",
        orderId: messageData.orderId,
        traceId: traceContext?.traceId,
        messageId: record.messageId,
        // Business context
        transactionType: messageData.transactionType,
        processingTime: new Date().toISOString()
    }));
    
    // Simulate business processing
    await processBusinessLogic(messageData);
    
    console.log(JSON.stringify({
        level: "INFO",
        service: "order-processor", 
        message: "order_processed_successfully",
        orderId: messageData.orderId,
        traceId: traceContext?.traceId
    }));
}
```

## 👨‍💻 Developer Guidelines

### Step 1: Lambda Function Setup

#### 1.1 Add ADOT Layer

```bash
# Add ADOT layer to your Lambda function
aws lambda update-function-configuration \
  --function-name your-function-name \
  --layers "arn:aws:lambda:us-east-2:901920570463:layer:aws-otel-nodejs-amd64-ver-1-18-1:4"
```

#### 1.2 Configure Environment Variables

```json
{
  "Variables": {
    "AWS_LAMBDA_EXEC_WRAPPER": "/opt/otel-handler",
    "OTEL_PROPAGATORS": "tracecontext,baggage",
    "OTEL_RESOURCE_ATTRIBUTES": "service.name=your-service-name,service.version=1.0.0"
  }
}
```

#### 1.3 Set Up Centralized Logging

```bash
# Create or use existing central log group
aws logs create-log-group --log-group-name "/your-app/central"

# Configure Lambda to write to central log group
# (This requires custom log forwarding or log destination)
```

### Step 2: Code Implementation

#### 2.1 Import Required Libraries

```javascript
// For trace context extraction and manipulation
import { trace, context } from "@opentelemetry/api";

// For AWS SDK operations (automatically instrumented)
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
```

#### 2.2 Implement Structured Logging

```javascript
// Standard log structure
function logEvent(level, message, additionalData = {}) {
    const currentSpan = trace.getSpan(context.active());
    
    console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: level,
        service: process.env.SERVICE_NAME || "unknown-service",
        message: message,
        traceId: currentSpan?.spanContext().traceId,
        spanId: currentSpan?.spanContext().spanId,
        ...additionalData
    }));
}

// Usage examples
logEvent("INFO", "processing_started", { orderId: "12345" });
logEvent("ERROR", "validation_failed", { error: "Missing required field", field: "customerId" });
logEvent("INFO", "processing_completed", { orderId: "12345", duration: 150 });
```

#### 2.3 Add Business Context to Spans

```javascript
export const handler = async (event) => {
    const currentSpan = trace.getSpan(context.active());
    
    // Add business attributes to the current span
    if (currentSpan) {
        currentSpan.setAttributes({
            // Business identifiers
            "business.customer_id": event.customerId,
            "business.order_id": event.orderId,
            "business.transaction_type": event.transactionType,
            
            // Technical context
            "messaging.system": "sqs",
            "messaging.operation": "process",
            "messaging.destination": getQueueName(event),
            
            // Custom metrics
            "business.order_value": event.amount,
            "business.item_count": event.items?.length || 0
        });
    }
    
    // Your business logic here
};
```

#### 2.4 Propagate Trace Context

**For SNS Publishing:**
```javascript
async function publishToSNS(message, traceContext) {
    const messageAttributes = {
        // Business attributes
        transactionType: { DataType: "String", StringValue: message.transactionType },
        orderId: { DataType: "String", StringValue: message.orderId },
        
        // Trace context propagation
        traceparent: { DataType: "String", StringValue: traceContext.traceparent },
        w3c_traceparent_orig: { DataType: "String", StringValue: traceContext.traceparent }
    };
    
    await sns.send(new PublishCommand({
        TopicArn: process.env.TOPIC_ARN,
        Message: JSON.stringify(message),
        MessageAttributes: messageAttributes
    }));
}
```

**For HTTP Calls:**
```javascript
async function callDownstreamService(data, traceContext) {
    const headers = {
        'Content-Type': 'application/json',
        'traceparent': traceContext.traceparent,
        // Other headers
    };
    
    const response = await fetch(process.env.DOWNSTREAM_URL, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(data)
    });
    
    return response.json();
}
```

### Step 3: Error Handling and Monitoring

#### 3.1 Structured Error Logging

```javascript
function handleError(error, context = {}) {
    const currentSpan = trace.getSpan(context.active());
    
    // Record exception in span
    if (currentSpan) {
        currentSpan.recordException(error);
        currentSpan.setStatus({ 
            code: 2, // ERROR
            message: error.message 
        });
    }
    
    // Structured error logging
    logEvent("ERROR", "operation_failed", {
        error: error.message,
        errorType: error.constructor.name,
        stack: error.stack,
        ...context
    });
}

// Usage
try {
    await processOrder(orderData);
} catch (error) {
    handleError(error, { 
        orderId: orderData.orderId,
        operation: "process_order" 
    });
    throw error; // Re-throw if needed
}
```

#### 3.2 Performance Monitoring

```javascript
async function monitoredOperation(operationName, operation) {
    const startTime = Date.now();
    const currentSpan = trace.getSpan(context.active());
    
    try {
        const result = await operation();
        
        const duration = Date.now() - startTime;
        
        logEvent("INFO", `${operationName}_completed`, {
            duration: duration,
            success: true
        });
        
        if (currentSpan) {
            currentSpan.setAttributes({
                [`${operationName}.duration`]: duration,
                [`${operationName}.success`]: true
            });
        }
        
        return result;
        
    } catch (error) {
        const duration = Date.now() - startTime;
        
        logEvent("ERROR", `${operationName}_failed`, {
            duration: duration,
            error: error.message
        });
        
        if (currentSpan) {
            currentSpan.setAttributes({
                [`${operationName}.duration`]: duration,
                [`${operationName}.success`]: false,
                [`${operationName}.error`]: error.message
            });
        }
        
        throw error;
    }
}

// Usage
const result = await monitoredOperation("database_write", async () => {
    return await dynamodb.send(new PutItemCommand(params));
});
```

### Step 4: Testing and Validation

#### 4.1 Local Testing

```javascript
// Test trace context extraction
function testTraceExtraction() {
    const mockRecord = {
        messageAttributes: {
            traceparent: {
                stringValue: "00-68ddeb470695db892e7bce267091ed11-0f64cbc462a30019-01"
            }
        }
    };
    
    const traceContext = extractTraceContext(mockRecord);
    console.log("Extracted trace context:", traceContext);
}
```

#### 4.2 End-to-End Testing

```bash
# Test complete flow
aws lambda invoke \
  --function-name your-publisher-function \
  --payload '{"orderId":"test-123","transactionType":"PAYMENT"}' \
  response.json

# Check logs for trace correlation
aws logs filter-log-events \
  --log-group-name "/your-app/central" \
  --filter-pattern "test-123" \
  --start-time $(date -d '5 minutes ago' +%s)000
```

## 📊 Monitoring and Alerting

### CloudWatch Insights Queries

#### 1. Trace Flow Analysis
```sql
fields @timestamp, service, message, traceId, orderId
| filter traceId = "68ddeb470695db892e7bce267091ed11"
| sort @timestamp asc
```

#### 2. Error Rate Monitoring
```sql
fields @timestamp, service, level, message, error
| filter level = "ERROR"
| stats count() by service, bin(5m)
```

#### 3. Performance Analysis
```sql
fields @timestamp, service, message, duration
| filter message like /completed/
| stats avg(duration), max(duration), min(duration) by service, bin(5m)
```

### Recommended Alerts

1. **High Error Rate**: > 5% errors in 5-minute window
2. **High Latency**: > 95th percentile latency threshold
3. **Missing Traces**: Functions without trace context
4. **Failed Message Processing**: SQS DLQ messages

## 🔍 Troubleshooting Guide

### Common Issues and Solutions

#### Issue 1: Missing Trace Context
**Symptoms**: Logs show `traceId: null` or missing trace correlation
**Solutions**:
- Verify ADOT layer is attached
- Check environment variables are set correctly
- Ensure `AWS_LAMBDA_EXEC_WRAPPER` is configured

#### Issue 2: Broken Trace Propagation
**Symptoms**: Different trace IDs across services
**Solutions**:
- Verify message attributes include `traceparent`
- Check SNS->SQS message attribute mapping
- Validate trace context extraction logic

#### Issue 3: Performance Impact
**Symptoms**: Increased function duration or cold starts
**Solutions**:
- Monitor OTEL overhead (typically < 5%)
- Optimize logging frequency
- Use sampling for high-volume functions

## 📚 Best Practices

### 1. Logging Standards
- Use structured JSON logging consistently
- Include trace IDs in all log entries
- Add business context to logs
- Use appropriate log levels (INFO, WARN, ERROR)

### 2. Trace Context Management
- Always propagate trace context to downstream services
- Use original trace context when available
- Generate new traces only for entry points

### 3. Performance Optimization
- Minimize synchronous operations in critical path
- Use async logging where possible
- Implement sampling for high-volume scenarios
- Monitor OTEL overhead regularly

### 4. Security Considerations
- Don't log sensitive data (PII, credentials)
- Use log filtering for compliance
- Implement proper IAM permissions for log access
- Consider log retention policies

## 🚀 Deployment Checklist

### Pre-Deployment
- [ ] ADOT layer configured
- [ ] Environment variables set
- [ ] Centralized logging configured
- [ ] IAM permissions verified
- [ ] Code follows logging standards

### Post-Deployment
- [ ] Verify trace generation
- [ ] Check log correlation
- [ ] Test error scenarios
- [ ] Validate performance impact
- [ ] Set up monitoring alerts

### Production Readiness
- [ ] Load testing completed
- [ ] Monitoring dashboards created
- [ ] Alert thresholds configured
- [ ] Runbook documentation updated
- [ ] Team training completed

## 📖 Additional Resources

- [AWS ADOT Documentation](https://aws-otel.github.io/docs/)
- [OpenTelemetry Specification](https://opentelemetry.io/docs/)
- [W3C Trace Context](https://www.w3.org/TR/trace-context/)
- [CloudWatch Logs Insights](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/AnalyzingLogData.html)

---

**Document Version**: 1.0  
**Last Updated**: October 2025  
**Maintained By**: Platform Engineering Team