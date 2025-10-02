// @company/lambda-observability
// Zero-config observability for AWS Lambda functions

import { trace, context } from "@opentelemetry/api";

/**
 * Observability Library - Handles all OTEL complexity automatically
 * Developers only need to focus on business logic
 */

class ObservabilityManager {
    constructor(serviceName) {
        this.serviceName = serviceName || process.env.SERVICE_NAME || 'unknown-service';
        this.currentSpan = null;
    }

    /**
     * Initialize observability for the Lambda function
     * Call this at the start of your handler
     */
    init(event, context) {
        this.currentSpan = trace.getSpan(context.active());
        this.lambdaContext = context;
        this.event = event;
        
        // Add service metadata to span
        if (this.currentSpan) {
            this.currentSpan.setAttributes({
                'service.name': this.serviceName,
                'faas.execution': context.awsRequestId,
                'faas.id': context.functionName,
                'faas.version': context.functionVersion
            });
        }

        this.log('INFO', 'function_started', {
            requestId: context.awsRequestId,
            functionName: context.functionName,
            eventType: this.detectEventType(event)
        });

        return this;
    }

    /**
     * Structured logging with automatic trace correlation
     */
    log(level, message, data = {}) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            level: level,
            service: this.serviceName,
            message: message,
            requestId: this.lambdaContext?.awsRequestId,
            traceId: this.currentSpan?.spanContext().traceId,
            spanId: this.currentSpan?.spanContext().spanId,
            ...data
        };

        console.log(JSON.stringify(logEntry));
    }

    /**
     * Add business context to the current span and logs
     */
    addBusinessContext(context) {
        if (this.currentSpan) {
            // Add business attributes to span
            Object.entries(context).forEach(([key, value]) => {
                this.currentSpan.setAttributes({
                    [`business.${key}`]: String(value)
                });
            });
        }

        this.log('DEBUG', 'business_context_added', context);
        return this;
    }

    /**
     * Handle errors with proper observability
     */
    handleError(error, context = {}) {
        if (this.currentSpan) {
            this.currentSpan.recordException(error);
            this.currentSpan.setStatus({ 
                code: 2, // ERROR
                message: error.message 
            });
        }

        this.log('ERROR', 'operation_failed', {
            error: error.message,
            errorType: error.constructor.name,
            stack: error.stack,
            ...context
        });

        return this;
    }

    /**
     * Monitor async operations with automatic timing and error handling
     */
    async monitor(operationName, operation, context = {}) {
        const startTime = Date.now();
        
        this.log('DEBUG', `${operationName}_started`, context);

        try {
            const result = await operation();
            const duration = Date.now() - startTime;

            if (this.currentSpan) {
                this.currentSpan.setAttributes({
                    [`operation.${operationName}.duration`]: duration,
                    [`operation.${operationName}.success`]: true
                });
            }

            this.log('INFO', `${operationName}_completed`, {
                duration: duration,
                success: true,
                ...context
            });

            return result;

        } catch (error) {
            const duration = Date.now() - startTime;

            if (this.currentSpan) {
                this.currentSpan.setAttributes({
                    [`operation.${operationName}.duration`]: duration,
                    [`operation.${operationName}.success`]: false,
                    [`operation.${operationName}.error`]: error.message
                });
            }

            this.log('ERROR', `${operationName}_failed`, {
                duration: duration,
                error: error.message,
                ...context
            });

            throw error;
        }
    }

    /**
     * Get current trace context for propagation
     */
    getTraceContext() {
        if (!this.currentSpan) return null;

        const sc = this.currentSpan.spanContext();
        const flags = (sc.traceFlags & 0x01) ? "01" : "00";
        
        return {
            traceId: sc.traceId,
            spanId: sc.spanId,
            traceparent: `00-${sc.traceId}-${sc.spanId}-${flags}`
        };
    }

    /**
     * Extract trace context from incoming events (SQS, SNS, etc.)
     */
    extractIncomingTraceContext(record) {
        // Handle SQS records
        if (record.messageAttributes) {
            const traceparent = record.messageAttributes.traceparent?.stringValue ||
                               record.messageAttributes.w3c_traceparent_orig?.stringValue;
            
            if (traceparent) {
                const parts = traceparent.split('-');
                return {
                    traceId: parts[1],
                    spanId: parts[2],
                    traceparent: traceparent
                };
            }
        }

        // Handle API Gateway events
        if (record.headers && record.headers.traceparent) {
            const parts = record.headers.traceparent.split('-');
            return {
                traceId: parts[1],
                spanId: parts[2],
                traceparent: record.headers.traceparent
            };
        }

        return null;
    }

    /**
     * Detect event type for automatic instrumentation
     */
    detectEventType(event) {
        if (event.Records) {
            if (event.Records[0]?.eventSource === 'aws:sqs') return 'SQS';
            if (event.Records[0]?.EventSource === 'aws:sns') return 'SNS';
            if (event.Records[0]?.eventSource === 'aws:s3') return 'S3';
            if (event.Records[0]?.eventSource === 'aws:dynamodb') return 'DynamoDB';
        }
        
        if (event.httpMethod || event.requestContext) return 'API_GATEWAY';
        if (event.source && event['detail-type']) return 'EVENTBRIDGE';
        
        return 'DIRECT_INVOKE';
    }

    /**
     * Complete the observability session
     */
    complete(result = {}) {
        this.log('INFO', 'function_completed', {
            success: true,
            ...result
        });

        if (this.currentSpan) {
            this.currentSpan.setStatus({ code: 1 }); // OK
        }

        return this;
    }
}

/**
 * SQS Message Processor - Handles SQS batch processing with observability
 */
export class SQSProcessor {
    constructor(serviceName) {
        this.serviceName = serviceName;
    }

    /**
     * Process SQS batch with automatic observability
     * Developer only provides business logic function
     */
    async processBatch(event, context, businessLogic) {
        const obs = new ObservabilityManager(this.serviceName).init(event, context);
        
        obs.log('INFO', 'sqs_batch_processing_started', {
            recordCount: event.Records?.length || 0
        });

        const results = [];
        const failures = [];

        for (const record of event.Records || []) {
            try {
                // Extract trace context
                const traceContext = obs.extractIncomingTraceContext(record);
                
                // Parse message (handle SNS->SQS wrapping)
                const messageData = this.parseMessage(record);
                
                // Add SQS context to observability
                obs.addBusinessContext({
                    messageId: record.messageId,
                    receiptHandle: record.receiptHandle,
                    queueName: this.getQueueName(record.eventSourceARN)
                });

                // Log message processing start
                obs.log('INFO', 'message_processing_started', {
                    messageId: record.messageId,
                    traceId: traceContext?.traceId,
                    messageSize: JSON.stringify(messageData).length
                });

                // Call business logic with observability wrapper
                const result = await obs.monitor('business_logic', async () => {
                    return await businessLogic(messageData, {
                        record: record,
                        traceContext: traceContext,
                        logger: obs,
                        messageId: record.messageId
                    });
                }, {
                    messageId: record.messageId,
                    traceId: traceContext?.traceId
                });

                results.push({
                    messageId: record.messageId,
                    status: 'success',
                    result: result
                });

                obs.log('INFO', 'message_processed_successfully', {
                    messageId: record.messageId,
                    traceId: traceContext?.traceId
                });

            } catch (error) {
                obs.handleError(error, {
                    messageId: record.messageId,
                    operation: 'message_processing'
                });

                failures.push({
                    itemIdentifier: record.messageId
                });

                results.push({
                    messageId: record.messageId,
                    status: 'error',
                    error: error.message
                });
            }
        }

        obs.complete({
            processedCount: results.length,
            successCount: results.filter(r => r.status === 'success').length,
            errorCount: results.filter(r => r.status === 'error').length
        });

        // Return SQS batch failure format
        return {
            batchItemFailures: failures
        };
    }

    parseMessage(record) {
        try {
            const body = JSON.parse(record.body);
            
            // Handle SNS->SQS wrapping
            if (body.Type === "Notification" && body.Message) {
                return JSON.parse(body.Message);
            }
            
            return body;
        } catch (error) {
            throw new Error(`Failed to parse message: ${error.message}`);
        }
    }

    getQueueName(eventSourceARN) {
        return eventSourceARN?.split(':').pop() || 'unknown';
    }
}

/**
 * SNS Publisher - Handles SNS publishing with observability
 */
export class SNSPublisher {
    constructor(serviceName, snsClient) {
        this.serviceName = serviceName;
        this.sns = snsClient;
    }

    /**
     * Publish message with automatic trace propagation
     */
    async publish(topicArn, message, options = {}) {
        const obs = new ObservabilityManager(this.serviceName);
        const traceContext = obs.getTraceContext();

        // Add observability context
        obs.addBusinessContext({
            topicArn: topicArn,
            messageSize: JSON.stringify(message).length
        });

        // Build message attributes with trace propagation
        const messageAttributes = {
            ...options.messageAttributes,
            // Always include trace context
            traceparent: {
                DataType: "String",
                StringValue: traceContext?.traceparent || this.generateFallbackTrace()
            },
            w3c_traceparent_orig: {
                DataType: "String", 
                StringValue: traceContext?.traceparent || this.generateFallbackTrace()
            }
        };

        return await obs.monitor('sns_publish', async () => {
            const { PublishCommand } = await import("@aws-sdk/client-sns");
            
            const result = await this.sns.send(new PublishCommand({
                TopicArn: topicArn,
                Message: JSON.stringify(message),
                MessageAttributes: messageAttributes,
                ...options.publishOptions
            }));

            obs.log('INFO', 'message_published', {
                messageId: result.MessageId,
                topicArn: topicArn,
                traceId: traceContext?.traceId
            });

            return result;
        });
    }

    generateFallbackTrace() {
        const traceId = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
        const spanId = Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
        return `00-${traceId}-${spanId}-01`;
    }
}

/**
 * API Gateway Handler - Handles HTTP requests with observability
 */
export class APIHandler {
    constructor(serviceName) {
        this.serviceName = serviceName;
    }

    /**
     * Handle API Gateway request with observability
     */
    async handle(event, context, businessLogic) {
        const obs = new ObservabilityManager(this.serviceName).init(event, context);

        try {
            // Add API context
            obs.addBusinessContext({
                httpMethod: event.httpMethod,
                path: event.path,
                userAgent: event.headers?.['User-Agent'],
                sourceIp: event.requestContext?.identity?.sourceIp
            });

            // Extract trace context from headers
            const traceContext = obs.extractIncomingTraceContext(event);

            obs.log('INFO', 'api_request_started', {
                httpMethod: event.httpMethod,
                path: event.path,
                traceId: traceContext?.traceId
            });

            // Call business logic
            const result = await obs.monitor('api_business_logic', async () => {
                return await businessLogic(event, {
                    context: context,
                    traceContext: traceContext,
                    logger: obs
                });
            });

            obs.complete({
                statusCode: result.statusCode || 200,
                responseSize: JSON.stringify(result).length
            });

            return result;

        } catch (error) {
            obs.handleError(error, {
                httpMethod: event.httpMethod,
                path: event.path
            });

            return {
                statusCode: 500,
                body: JSON.stringify({
                    error: 'Internal Server Error',
                    requestId: context.awsRequestId
                })
            };
        }
    }
}

// Export main classes and utilities
export { ObservabilityManager };

// Convenience function for simple Lambda functions
export function withObservability(serviceName, handler) {
    return async (event, context) => {
        const obs = new ObservabilityManager(serviceName).init(event, context);
        
        try {
            const result = await obs.monitor('lambda_execution', async () => {
                return await handler(event, context, obs);
            });
            
            obs.complete();
            return result;
            
        } catch (error) {
            obs.handleError(error);
            throw error;
        }
    };
}