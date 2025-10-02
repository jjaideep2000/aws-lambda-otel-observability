// Simple consumer without complex OTEL imports to avoid runtime errors
// OTEL instrumentation will be handled by the ADOT layer automatically

export const handler = async (event) => {
  console.log(JSON.stringify({
    level: "INFO", hop: "consumer", message: "processing_sqs_batch",
    recordCount: event.Records?.length || 0
  }));

  const results = [];

  for (const record of event.Records || []) {
    try {
      // LOG RAW MESSAGE FOR DEBUGGING
      console.log(JSON.stringify({
        level: "DEBUG", hop: "consumer", message: "raw_sqs_record",
        messageId: record.messageId,
        body: record.body,
        messageAttributes: record.messageAttributes,
        attributes: record.attributes
      }));

      // Parse the message (handle SNS->SQS wrapping)
      const messageData = parseMessage(record);
      
      // Extract trace context for logging
      const carrier = extractTraceCarrier(record);
      
      console.log(JSON.stringify({
        level: "INFO", 
        service: "asyncdemo-consumer",
        hop: "consumer", 
        message: "processing_message",
        messageId: record.messageId,
        transactionType: messageData.transactionType,
        orderId: messageData.orderId,
        traceparent: carrier.traceparent || null,
        aws: {
          service: "sqs",
          operation: "process",
          resource: record.eventSourceARN
        },
        correlation: {
          traceId: carrier.traceparent ? carrier.traceparent.split('-')[1] : null,
          spanId: carrier.traceparent ? carrier.traceparent.split('-')[2] : null,
          messageId: record.messageId
        }
      }));

      // Simulate business processing
      await processBusinessLogic(messageData);

      results.push({ messageId: record.messageId, status: "success" });

    } catch (error) {
      console.log(JSON.stringify({
        level: "ERROR", hop: "consumer", message: "record_processing_error",
        messageId: record.messageId,
        error: error.message
      }));
      
      results.push({ messageId: record.messageId, status: "error", error: error.message });
    }
  }

  console.log(JSON.stringify({
    level: "INFO", hop: "consumer", message: "batch_processing_complete",
    processedCount: results.length,
    successCount: results.filter(r => r.status === "success").length,
    errorCount: results.filter(r => r.status === "error").length
  }));

  return { batchItemFailures: [] };
};

function extractTraceCarrier(record) {
  const carrier = {};
  
  // Try SQS message attributes first (direct SQS)
  const sqsAttrs = record.messageAttributes || {};
  let traceparent = sqsAttrs.traceparent?.stringValue;
  
  // Extract all trace contexts for comparison
  const traceparentFromSNS = sqsAttrs.traceparent?.stringValue || null;
  const traceparentOriginal = sqsAttrs.w3c_traceparent_orig?.stringValue || null;
  const xrayHeader = record.attributes?.AWSTraceHeader || null;
  
  console.log(JSON.stringify({
    level: "INFO", 
    service: "asyncdemo-consumer",
    hop: "consumer", 
    message: "trace_context_analysis",
    traceparentFromSNS: traceparentFromSNS,
    traceparentOriginalFromPublisher: traceparentOriginal,
    xrayHeader: xrayHeader,
    traceparentMatch: traceparentFromSNS === traceparentOriginal ? "SAME" : "DIFFERENT",
    // Enhanced observability fields
    aws: {
      service: "sqs",
      operation: "receive",
      resource: record.eventSourceARN
    },
    correlation: {
      traceId: traceparentOriginal ? traceparentOriginal.split('-')[1] : null,
      spanId: traceparentOriginal ? traceparentOriginal.split('-')[2] : null,
      messageId: record.messageId
    }
  }));
  
  // If not found, try SNS message attributes (SNS->SQS flow)
  if (!traceparent) {
    try {
      const body = JSON.parse(record.body);
      if (body.Type === "Notification" && body.MessageAttributes) {
        traceparent = body.MessageAttributes.traceparent?.Value;
      }
    } catch (error) {
      // Not an SNS message, ignore
    }
  }
  
  // Use original traceparent if available for proper trace continuity
  const finalTraceparent = traceparentOriginal || traceparent;
  
  if (finalTraceparent) {
    carrier.traceparent = finalTraceparent;
    console.log(JSON.stringify({
      level: "DEBUG", hop: "consumer", message: "extracted_traceparent",
      traceparent: finalTraceparent,
      source: traceparentOriginal ? "original_from_publisher" : "sns_modified"
    }));
  }
  
  return carrier;
}

function parseMessage(record) {
  try {
    const body = JSON.parse(record.body);
    
    // Handle SNS->SQS wrapping
    if (body.Type === "Notification" && body.Message) {
      return JSON.parse(body.Message);
    }
    
    // Direct SQS message
    return body;
  } catch (error) {
    throw new Error(`Failed to parse message: ${error.message}`);
  }
}

function getQueueName(eventSourceARN) {
  return eventSourceARN?.split(':').pop() || 'unknown';
}

async function processBusinessLogic(messageData) {
  // Simulate processing time
  await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));

  // Log business event
  console.log(JSON.stringify({
    level: "INFO", 
    service: "asyncdemo-consumer",
    hop: "consumer", 
    message: "business_processing_complete",
    transactionType: messageData.transactionType,
    orderId: messageData.orderId,
    processingTimeMs: 150
  }));
}