// index.mjs
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { context, trace } from "@opentelemetry/api";

const sns = new SNSClient({});

function getTraceparentFromActiveSpan() {
    // Try multiple approaches to get trace context from ADOT layer

    // Method 1: Standard OpenTelemetry API
    const span = trace.getSpan(context.active());
    if (span) {
        const sc = span.spanContext();
        if (sc && sc.traceId && sc.spanId) {
            const flags = (sc.traceFlags & 0x01) ? "01" : "00";
            return `00-${sc.traceId}-${sc.spanId}-${flags}`;
        }
    }

    // Method 2: Try to get from X-Ray environment variables
    const xrayTraceId = process.env._X_AMZN_TRACE_ID;
    if (xrayTraceId) {
        // Parse X-Ray trace ID format: Root=1-5e1b4151-5ac6c58f40c8b5e065b2dcf0;Parent=53995c3f42cd8ad8;Sampled=1
        const match = xrayTraceId.match(/Root=1-([a-f0-9]{8})-([a-f0-9]{24});Parent=([a-f0-9]{16});Sampled=([01])/);
        if (match) {
            const [, timestamp, traceIdSuffix, parentId, sampled] = match;
            const traceId = timestamp + traceIdSuffix;
            const flags = sampled === "1" ? "01" : "00";
            return `00-${traceId}-${parentId}-${flags}`;
        }
    }

    // Method 3: Try to access the active context directly
    const activeContext = context.active();
    if (activeContext) {
        // Check if there's trace context in the active context
        const traceState = trace.getSpanContext(activeContext);
        if (traceState && traceState.traceId && traceState.spanId) {
            const flags = (traceState.traceFlags & 0x01) ? "01" : "00";
            return `00-${traceState.traceId}-${traceState.spanId}-${flags}`;
        }
    }

    return null;
}

function generateW3CTraceparent() {
    // Generate a random 32-character hex trace ID
    const traceId = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    // Generate a random 16-character hex span ID
    const spanId = Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    // Set flags to 01 (sampled)
    const flags = "01";
    return `00-${traceId}-${spanId}-${flags}`;
}

export const handler = async (event = {}) => {
    // Let ADOT layer handle span creation automatically
    // Just get the current span that ADOT created for us
    const transactionType = event.transactionType ?? "PAYMENT";
    const orderId = event.orderId ?? `ORD-${Math.random().toString(36).slice(2, 8)}`;

    // Get the current span that ADOT layer created for us and add business attributes
    const currentSpan = trace.getSpan(context.active());
    if (currentSpan) {
        currentSpan.setAttributes({
            "business.transaction_type": transactionType,
            "business.order_id": orderId,
            "messaging.system": "sns",
            "messaging.operation": "publish"
        });
    }

    // Build comprehensive message with all payload data
    const msg = {
        message: "e2e test",
        transactionType,
        orderId,
        // Include additional fields from payload
        ...(event.amount && { amount: event.amount }),
        ...(event.customerId && { customerId: event.customerId }),
        ...(event.reason && { reason: event.reason }),
        ...(event.items && { items: event.items }),
        // Add timestamp for tracking
        timestamp: new Date().toISOString()
    };

    // prefer incoming traceparent (if this lambda is invoked by an upstream caller)
    const incomingTraceparent = event.traceparent;
    const otelTraceparent = getTraceparentFromActiveSpan();
    const traceparent = incomingTraceparent || otelTraceparent || generateW3CTraceparent();

    // Debug: Log what trace context we can access
    const debugInfo = {
        xrayTraceId: process.env._X_AMZN_TRACE_ID || null,
        hasActiveSpan: !!trace.getSpan(context.active()),
        activeContext: !!context.active(),
        spanContext: trace.getSpanContext(context.active()) || null
    };

    console.info(JSON.stringify({
        level: "INFO",
        service: "asyncdemo-publisher",
        hop: "publisher",
        message: "publishing_to_sns",
        transactionType,
        orderId,
        messageSize: JSON.stringify(msg).length,
        hasAmount: !!event.amount,
        hasCustomerId: !!event.customerId,
        hasItems: !!event.items,
        traceparentIncoming: incomingTraceparent ?? null,
        traceparentOTEL: otelTraceparent ?? null,
        traceparentGenerated: (!incomingTraceparent && !otelTraceparent) ? "yes" : "no",
        traceparent: traceparent,
        debug: debugInfo,
        // Enhanced observability fields
        aws: {
            service: "sns",
            operation: "publish",
            resource: process.env.TOPIC_ARN
        },
        correlation: {
            traceId: traceparent.split('-')[1],
            spanId: traceparent.split('-')[2]
        }
    }));

    // Build message attributes dynamically
    const messageAttributes = {
        transactionType: { DataType: "String", StringValue: transactionType },
        orderId: { DataType: "String", StringValue: orderId }
    };

    // Add optional attributes if present
    if (event.amount) {
        messageAttributes.amount = { DataType: "Number", StringValue: event.amount.toString() };
    }

    if (event.customerId) {
        messageAttributes.customerId = { DataType: "String", StringValue: event.customerId };
    }

    if (event.reason) {
        messageAttributes.reason = { DataType: "String", StringValue: event.reason };
    }

    // Always add traceparent (now guaranteed to exist)
    messageAttributes.traceparent = { DataType: "String", StringValue: traceparent };

    // WORKAROUND: Add original traceparent in separate attribute that SNS won't touch
    messageAttributes.w3c_traceparent_orig = { DataType: "String", StringValue: traceparent };

    await sns.send(new PublishCommand({
        TopicArn: process.env.TOPIC_ARN,
        Message: JSON.stringify(msg),
        MessageAttributes: messageAttributes
    }));

    return {
        ok: true,
        orderId,
        transactionType,
        messageAttributes: Object.keys(messageAttributes),
        traceparent: traceparent,
        traceparentSource: incomingTraceparent ? "incoming" : (otelTraceparent ? "otel" : "generated")
    };
};