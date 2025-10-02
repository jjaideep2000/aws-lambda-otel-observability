// Example: SNS Publisher with Zero Observability Code
// Developer only writes business logic!

import { SNSClient } from "@aws-sdk/client-sns";
import { SNSPublisher, withObservability } from '@company/lambda-observability';

const sns = new SNSClient({});
const publisher = new SNSPublisher('order-publisher', sns);

export const handler = withObservability('order-publisher', async (event, context, logger) => {
    // PURE BUSINESS LOGIC ONLY - No observability code needed!
    
    // Validate input
    if (!event.customerId || !event.amount) {
        throw new Error('Customer ID and amount are required');
    }
    
    // Create order
    const order = {
        orderId: generateOrderId(),
        customerId: event.customerId,
        amount: event.amount,
        transactionType: event.transactionType || 'PAYMENT',
        timestamp: new Date().toISOString()
    };
    
    // Add business context (optional)
    logger.addBusinessContext({
        orderId: order.orderId,
        customerId: order.customerId,
        transactionType: order.transactionType
    });
    
    // Publish to SNS (trace context automatically propagated)
    const result = await publisher.publish(process.env.TOPIC_ARN, order, {
        messageAttributes: {
            transactionType: { DataType: "String", StringValue: order.transactionType },
            orderId: { DataType: "String", StringValue: order.orderId }
        }
    });
    
    return {
        success: true,
        orderId: order.orderId,
        messageId: result.MessageId
    };
});

// Pure business function
function generateOrderId() {
    return `ORD-${Math.random().toString(36).slice(2, 8)}`;
}