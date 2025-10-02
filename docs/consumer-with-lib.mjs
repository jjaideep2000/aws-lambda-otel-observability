// Consumer Lambda using the Observability Library
// Developer only writes business logic!

import { SQSProcessor } from '@company/lambda-observability';

const processor = new SQSProcessor('order-processor');

export const handler = async (event, context) => {
    return await processor.processBatch(event, context, async (messageData, { logger, traceContext }) => {
        // PURE BUSINESS LOGIC ONLY - No observability code needed!
        
        // Validate order data
        if (!messageData.orderId) {
            throw new Error('Order ID is required');
        }
        
        if (!messageData.transactionType) {
            throw new Error('Transaction type is required');
        }
        
        // Add business context for better observability (optional)
        logger.addBusinessContext({
            orderId: messageData.orderId,
            customerId: messageData.customerId,
            transactionType: messageData.transactionType,
            orderAmount: messageData.amount
        });
        
        // Process the order
        const processedOrder = await processOrder(messageData);
        
        // Send notifications
        await sendOrderNotifications(processedOrder);
        
        // Update inventory
        await updateInventory(processedOrder);
        
        return {
            success: true,
            orderId: processedOrder.orderId,
            status: processedOrder.status
        };
    });
};

// Pure business functions - no observability code needed
async function processOrder(orderData) {
    // Simulate order processing
    const processedOrder = {
        orderId: orderData.orderId,
        customerId: orderData.customerId,
        transactionType: orderData.transactionType,
        amount: orderData.amount,
        status: 'processed',
        processedAt: new Date().toISOString(),
        items: orderData.items || []
    };
    
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
    
    return processedOrder;
}

async function sendOrderNotifications(order) {
    // Simulate sending notifications
    console.log(`Sending notifications for order ${order.orderId}`);
    
    // Email notification
    await sendEmail(order.customerId, 'Order Processed', `Your order ${order.orderId} has been processed.`);
    
    // SMS notification (if high value)
    if (order.amount > 100) {
        await sendSMS(order.customerId, `High-value order ${order.orderId} processed successfully.`);
    }
}

async function updateInventory(order) {
    // Simulate inventory update
    console.log(`Updating inventory for order ${order.orderId}`);
    
    for (const item of order.items) {
        await updateItemInventory(item.sku, item.quantity);
    }
}

// Helper functions
async function sendEmail(customerId, subject, message) {
    // Simulate email sending
    await new Promise(resolve => setTimeout(resolve, 50));
    console.log(`Email sent to customer ${customerId}: ${subject}`);
}

async function sendSMS(customerId, message) {
    // Simulate SMS sending
    await new Promise(resolve => setTimeout(resolve, 30));
    console.log(`SMS sent to customer ${customerId}: ${message}`);
}

async function updateItemInventory(sku, quantity) {
    // Simulate inventory update
    await new Promise(resolve => setTimeout(resolve, 25));
    console.log(`Updated inventory for SKU ${sku}: -${quantity}`);
}