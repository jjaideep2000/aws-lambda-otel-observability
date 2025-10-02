# AWS Lambda OpenTelemetry Observability Demo

A complete implementation of distributed tracing across AWS Lambda functions using OpenTelemetry (OTEL) with SNS/SQS message flow.

## 🎯 What This Demonstrates

- **End-to-end distributed tracing** across Lambda functions
- **W3C Trace Context propagation** through SNS/SQS
- **ADOT (AWS Distro for OpenTelemetry)** integration
- **Centralized logging** with trace correlation
- **Production-ready observability** patterns

## 🏗️ Architecture

```
Publisher Lambda → SNS Topic → SQS Queue → Consumer Lambda
     ↓              ↓           ↓            ↓
   OTEL Traces → Trace Context → Preserved → Correlated Logs
```

## 🚀 Quick Start

1. **Deploy Functions**:
   ```bash
   npm run deploy-publisher
   npm run deploy-consumer
   ```

2. **Test End-to-End Flow**:
   ```bash
   ./scripts/test-publisher-subscriber-flow.sh
   ```

3. **View Logs**:
   - Check `/asyncdemo/central` CloudWatch log group
   - Search for trace IDs to see complete flow

## 📊 Key Features

- ✅ **OTEL trace generation** with ADOT layer
- ✅ **Automatic trace propagation** through AWS services  
- ✅ **Centralized logging** with structured JSON
- ✅ **Trace correlation** across service boundaries
- ✅ **Production-ready** error handling and monitoring

## 📚 Documentation

- [Clean OTEL Guide](docs/CLEAN_OTEL_GUIDE.md)
- [Technical Design](docs/TECHNICAL_DESIGN_DOCUMENT.md)
- [SNS/SQS Instrumentation](docs/SNS_SQS_INSTRUMENTATION_GUIDE.md)
- [Test Results](docs/otel-test-results.md)

## 🔧 Configuration

Environment configurations are in `configs/environments/`:
- `publisher-env.json` - Publisher Lambda OTEL settings
- `consumer-env.json` - Consumer Lambda OTEL settings

## 🧪 Testing

Run the complete test suite:
```bash
./scripts/test-publisher-subscriber-flow.sh
```

This will:
1. Invoke the publisher with test data
2. Verify message flow through SNS/SQS
3. Check consumer processing
4. Validate trace correlation

## 📈 Observability

All telemetry data flows to CloudWatch Logs with structured JSON containing:
- Trace IDs for correlation
- Business context (order IDs, transaction types)
- Service metadata (hops, operations)
- AWS resource information

Search logs by trace ID to see complete distributed transactions!
