# Lambda Observability Library

## 🎯 Zero-Config Observability for AWS Lambda

This library eliminates the need for developers to write observability code. Just focus on business logic - we handle all the tracing, logging, and monitoring automatically!

## ✨ Key Benefits

- **Zero Observability Code**: Developers write only business logic
- **Automatic Trace Propagation**: W3C trace context handled automatically  
- **Structured Logging**: Consistent JSON logs with trace correlation
- **Error Handling**: Automatic error capture and span recording
- **Performance Monitoring**: Built-in operation timing and metrics
- **Multiple Event Types**: SQS, SNS, API Gateway, EventBridge support

## 🚀 Quick Start

### 1. Install the Library

```bash
npm install @company/lambda-observability
```

### 2. Use in Your Lambda Functions

#### SQS Consumer (Before vs After)

**❌ Before (Complex observability code):**
```javascript
export const handler = async (event, context) => {
    const span = trace.getSpan(context.active());
    console.log(JSON.stringify({
        level: "INFO", 
        service: "order-processor",
        traceId: span?.spanContext().traceId,
        message: "processing_batch"
    }));
    
    for (const record of event.Records) {
        try {
            const traceContext = extractTraceContext(record);
            const messageData = parseMessage(record);
            
            span?.setAttributes({
                "business.order_id": messageData.orderId
            });
            
            // Business logic buried in observability code
            await processOrder(messageData);
            
        } catch (error) {
            span?.recordException(error);
            console.log(JSON.stringify({
                level: "ERROR",
                error: error.message,
                traceId: span?.spanContext().traceId
            }));
        }
    }
};
```

**✅ After (Pure business logic):**
```javascript
import { SQSProcessor } from '@company/lambda-observability';

const processor = new SQSProcessor('order-processor');

export const handler = async (event, context) => {
    return await processor.processBatch(event, context, async (messageData) => {
        // ONLY BUSINESS LOGIC!
        return await processOrder(messageData);
    });
};
```

#### SNS Publisher

```javascript
import { SNSPublisher, withObservability } from '@company/lambda-observability';

const publisher = new SNSPublisher('order-service', snsClient);

export const handler = withObservability('order-service', async (event, context, logger) => {
    // Pure business logic
    const order = createOrder(event);
    
    // Automatic trace propagation
    await publisher.publish(process.env.TOPIC_ARN, order);
    
    return { success: true, orderId: order.id };
});
```

#### API Gateway Handler

```javascript
import { APIHandler } from '@company/lambda-observability';

const apiHandler = new APIHandler('user-service');

export const handler = async (event, context) => {
    return await apiHandler.handle(event, context, async (event, { logger }) => {
        // Pure business logic
        const user = await getUserById(event.pathParameters.userId);
        
        return {
            statusCode: 200,
            body: JSON.stringify(user)
        };
    });
};
```

## 📚 API Reference

### SQSProcessor

Handles SQS batch processing with automatic observability.

```javascript
const processor = new SQSProcessor('service-name');

await processor.processBatch(event, context, async (messageData, { logger, traceContext, record }) => {
    // Your business logic here
    // messageData: Parsed message (handles SNS->SQS wrapping)
    // logger: Observability manager for custom logging
    // traceContext: Extracted trace context from message
    // record: Original SQS record
    
    return result; // Optional return value
});
```

### SNSPublisher

Publishes messages with automatic trace propagation.

```javascript
const publisher = new SNSPublisher('service-name', snsClient);

await publisher.publish(topicArn, message, {
    messageAttributes: {
        // Your custom attributes
    },
    publishOptions: {
        // SNS publish options
    }
});
```

### APIHandler

Handles API Gateway requests with observability.

```javascript
const apiHandler = new APIHandler('service-name');

await apiHandler.handle(event, context, async (event, { logger, traceContext, context }) => {
    // Your API business logic
    return {
        statusCode: 200,
        body: JSON.stringify(result)
    };
});
```

### withObservability

Wrapper for simple Lambda functions.

```javascript
export const handler = withObservability('service-name', async (event, context, logger) => {
    // Your business logic with automatic observability
    logger.addBusinessContext({ orderId: '123' });
    return result;
});
```

### ObservabilityManager

Direct access to observability features.

```javascript
const obs = new ObservabilityManager('service-name').init(event, context);

// Structured logging
obs.log('INFO', 'operation_started', { orderId: '123' });

// Add business context
obs.addBusinessContext({ customerId: 'cust-456' });

// Monitor operations
const result = await obs.monitor('database_write', async () => {
    return await saveToDatabase(data);
});

// Handle errors
try {
    await riskyOperation();
} catch (error) {
    obs.handleError(error, { operation: 'risky_operation' });
}

// Get trace context for propagation
const traceContext = obs.getTraceContext();
```

## 🔧 Configuration

### Environment Variables

Set these in your Lambda function:

```bash
SERVICE_NAME=your-service-name  # Optional: defaults to function name
```

### Lambda Layer Setup

1. **Build the layer:**
   ```bash
   cd observability-lib
   npm install
   npm run build
   ```

2. **Deploy as Lambda layer:**
   ```bash
   aws lambda publish-layer-version \
     --layer-name lambda-observability \
     --zip-file fileb://lambda-observability-layer.zip \
     --compatible-runtimes nodejs18.x nodejs20.x
   ```

3. **Add to your functions:**
   ```bash
   aws lambda update-function-configuration \
     --function-name your-function \
     --layers "arn:aws:lambda:region:account:layer:lambda-observability:1"
   ```

### Required Lambda Configuration

Your Lambda functions still need the ADOT layer and basic OTEL configuration:

```json
{
  "Environment": {
    "Variables": {
      "AWS_LAMBDA_EXEC_WRAPPER": "/opt/otel-handler",
      "OTEL_PROPAGATORS": "tracecontext,baggage",
      "OTEL_RESOURCE_ATTRIBUTES": "service.name=your-service"
    }
  },
  "Layers": [
    "arn:aws:lambda:us-east-2:901920570463:layer:aws-otel-nodejs-amd64-ver-1-18-1:4",
    "arn:aws:lambda:region:account:layer:lambda-observability:1"
  ]
}
```

## 📊 What You Get Automatically

### Structured Logs
```json
{
  "timestamp": "2025-10-02T10:30:00.000Z",
  "level": "INFO",
  "service": "order-processor",
  "message": "message_processed_successfully",
  "requestId": "abc-123",
  "traceId": "68ddeb470695db892e7bce267091ed11",
  "spanId": "0f64cbc462a30019",
  "messageId": "msg-456",
  "orderId": "ORD-789"
}
```

### Automatic Span Attributes
- Service metadata (name, version, function details)
- Business context (order IDs, customer IDs, etc.)
- Operation timing and success/failure
- Error details and stack traces
- Message and request metadata

### Trace Propagation
- W3C trace context automatically extracted from events
- Trace context automatically added to outgoing messages
- Parent-child span relationships maintained
- Cross-service correlation preserved

## 🎯 Developer Benefits

### Before This Library
- 50+ lines of observability code per function
- Easy to forget trace propagation
- Inconsistent logging formats
- Manual error handling
- Complex span management

### After This Library
- 5-10 lines of pure business logic
- Automatic trace propagation
- Consistent structured logging
- Automatic error capture
- Zero span management

## 🔍 Troubleshooting

### Common Issues

1. **Missing traces**: Ensure ADOT layer is attached
2. **No log correlation**: Check service name configuration
3. **Performance impact**: Monitor function duration (typically <5% overhead)

### Debug Mode

Enable debug logging:
```javascript
const obs = new ObservabilityManager('service-name');
obs.log('DEBUG', 'debug_info', { details: 'here' });
```

## 📈 Migration Guide

### Step 1: Install Library
```bash
npm install @company/lambda-observability
```

### Step 2: Replace Existing Code
```javascript
// Old complex handler
export const handler = async (event, context) => {
    // 50+ lines of observability code
    // Business logic mixed with tracing
};

// New simple handler
import { SQSProcessor } from '@company/lambda-observability';
const processor = new SQSProcessor('service-name');

export const handler = async (event, context) => {
    return await processor.processBatch(event, context, async (messageData) => {
        // Only business logic!
        return await processMessage(messageData);
    });
};
```

### Step 3: Test and Deploy
- Verify logs still contain trace IDs
- Check trace propagation works
- Monitor performance impact

## 🏆 Best Practices

1. **Use descriptive service names**: `order-processor`, `user-service`
2. **Add business context**: Use `logger.addBusinessContext()`
3. **Handle errors gracefully**: Let the library catch and log errors
4. **Keep business logic pure**: No observability code in business functions
5. **Test trace propagation**: Verify end-to-end trace correlation

---

**Version**: 1.0.0  
**Maintained By**: Platform Engineering Team  
**Support**: #platform-engineering Slack channel