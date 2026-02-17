import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import type { IncomingMessage } from 'http';

/**
 * OpenTelemetry initialization for wedding-backend
 * 
 * This sets up automatic instrumentation for:
 * - HTTP/HTTPS requests
 * - Express framework
 * - SQLite database operations
 * - DNS, Net, and other Node.js core modules
 * 
 * Traces and metrics are exported to Grafana Cloud (or any OTLP-compatible backend)
 */

// Check if OTel is enabled (default to true in production, false in development)
const isOtelEnabled = process.env.OTEL_ENABLED !== 'false';

if (!isOtelEnabled) {
  console.log('OpenTelemetry is disabled (OTEL_ENABLED=false)');
} else {
  // Validate required environment variables
  const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  
  if (!otlpEndpoint) {
    console.warn('⚠️  OTEL_EXPORTER_OTLP_ENDPOINT not set. OpenTelemetry will not export data.');
    console.warn('   Set this to your Grafana Cloud OTLP endpoint to enable telemetry.');
  } else {
    console.log(`✓ OpenTelemetry enabled, exporting to: ${otlpEndpoint}`);
  }

  // Configure the trace exporter
  const traceExporter = new OTLPTraceExporter({
    url: otlpEndpoint ? `${otlpEndpoint}/v1/traces` : undefined,
    headers: process.env.OTLP_HEADERS 
      ? JSON.parse(process.env.OTLP_HEADERS)
      : {},
  });

  // Configure the metrics exporter
  const metricExporter = new OTLPMetricExporter({
    url: otlpEndpoint ? `${otlpEndpoint}/v1/metrics` : undefined,
    headers: process.env.OTLP_HEADERS
      ? JSON.parse(process.env.OTLP_HEADERS)
      : {},
  });

  // Create the SDK with auto-instrumentation
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: 'wedding-backend',
      [ATTR_SERVICE_VERSION]: '1.0.0',
      'deployment.environment': process.env.NODE_ENV || 'development',
    }),
    traceExporter,
    metricReader: new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: 60000, // Export metrics every 60 seconds
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        // Automatically instrument common libraries
        '@opentelemetry/instrumentation-http': {
          // Add custom attributes to HTTP spans
          requestHook: (span, request) => {
            const incomingMessage = request as IncomingMessage;
            if (incomingMessage.headers) {
              span.setAttribute('http.request.body.size', incomingMessage.headers['content-length'] || 0);
            }
          },
        },
        '@opentelemetry/instrumentation-express': {
          // Capture Express route information
          requestHook: (span, info) => {
            if (info.layerType) {
              span.setAttribute('express.layer.type', info.layerType);
            }
          },
        },
      }),
    ],
  });

  // Start the SDK
  sdk.start();

  // Gracefully shut down on process termination
  process.on('SIGTERM', () => {
    sdk
      .shutdown()
      .then(() => console.log('OpenTelemetry SDK shut down successfully'))
      .catch((error) => console.error('Error shutting down OpenTelemetry SDK', error))
      .finally(() => process.exit(0));
  });

  console.log('✓ OpenTelemetry SDK initialized');
}
