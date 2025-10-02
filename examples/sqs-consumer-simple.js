// Example: SQS Consumer with Zero Observability Code
// Developer only writes business logic!

import { SQSProcessor } from '@company/lambda-observability';

const processor = new SQSProcessor('order-processor');

export const handler = async (event, context) => {
    return await processor.processBatch(event, context, async (messageData, { logger, traceContext }) => {
        // PURE BUSINESS LOGIC ONLY - No observability code needed!
        
        // Validate order
        if (!messageData.orderId) {
            throw new Error('Order ID is required');
        }
        
        // Process the order
        const order = {
            id: messageData.orderId,
            customerId: messageData.customerId,
            amount: messageData.amount,
            status: 'processing',
            processedAt: new Date().toISOString()
        };
        
        // Save to database (automatically monitored)
        await saveOrderToDatabase(order);
        
        // Send notification (automatically monitored)
        await sendOrderConfirmation(order);
        
        // Optional: Add business context for better observability
        logger.addBusinessContext({
            orderId: order.id,
            customerId: order.customerId,
            orderAmount: order.amount
        });
        
        return { success: true, orderId: order.id };
    });
};

// Business functions - no observability code needed
async function saveOrderToDatabase(order) {
    // Database logic here
    console.log('Saving order to database:', order.id);
    // Simulate async operation
    await new Promise(resolve => setTimeout(resolve, 100));
}

async function sendOrderConfirmation(order) {
    // Notification logic here  
    console.log('Sending confirmation for order:', order.id);
    // Simulate async operation
    await new Promise(resolve => setTimeout(resolve, 50));
}