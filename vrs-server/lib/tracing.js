/**
 * OpenTelemetry Distributed Tracing
 *
 * Configures automatic instrumentation for tracing requests across
 * VRS -> Ops -> Twilio services.
 *
 * Supports:
 *   - HTTP Express request tracing
 *   - PostgreSQL query tracing
 *   - Custom span creation for business operations
 *   - Trace context propagation via W3C TraceContext headers
 *
 * Enable via environment variables:
 *   OTEL_ENABLED=true
 *   OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
 *   OTEL_SERVICE_NAME=vrs-server
 */

const { trace, context, SpanStatusCode, propagation } = require('@opentelemetry/api');

const log = require('./logger').module('tracing');

let tracer = null;
let sdk = null;

/**
 * Initialize OpenTelemetry SDK with auto-instrumentation.
 * Safe to call multiple times — no-ops if already initialized.
 */
function initialize() {
    if (process.env.OTEL_ENABLED !== 'true') {
        log.info('OpenTelemetry tracing disabled (set OTEL_ENABLED=true to enable)');
        return;
    }

    if (sdk) {
        return;
    }

    const { NodeSDK } = require('@opentelemetry/sdk-node');
    const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
    const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
    const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
    const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
    const { resource } = require('@opentelemetry/resources');
    const { ATTR_SERVICE_NAME } = require('@opentelemetry/semantic-conventions');

    const serviceName = process.env.OTEL_SERVICE_NAME || 'vrs-server';
    const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318';

    try {
        const traceExporter = new OTLPTraceExporter({
            url: `${endpoint}/v1/traces`
        });

        const metricExporter = new OTLPMetricExporter({
            url: `${endpoint}/v1/metrics`
        });

        sdk = new NodeSDK({
            serviceName,
            traceExporter,
            metricReader: new PeriodicExportingMetricReader({
                exporter: metricExporter,
                exportIntervalMillis: 15000
            }),
            instrumentations: [
                getNodeAutoInstrumentations({
                    '@opentelemetry/instrumentation-fs': { enabled: false },
                    '@opentelemetry/instrumentation-dns': { enabled: false }
                })
            ]
        });

        sdk.start();

        tracer = trace.getTracer(serviceName, '1.0.0');

        log.info({ serviceName, endpoint }, 'OpenTelemetry tracing initialized');

        // Graceful shutdown
        const shutdown = async () => {
            try {
                await sdk.shutdown();
                log.info('OpenTelemetry SDK shut down');
            } catch (error) {
                log.error({ err: error }, 'Error shutting down OpenTelemetry SDK');
            }
        };

        process.on('SIGTERM', shutdown);
        process.on('SIGINT', shutdown);
    } catch (error) {
        log.error({ err: error }, 'Failed to initialize OpenTelemetry');
    }
}

/**
 * Create a child span for a custom operation.
 *
 * @param {string} name - Span name
 * @param {object} [attributes] - Span attributes
 * @param {Function} fn - Async function to execute within the span
 * @returns {Promise<*>} Result of fn
 */
async function withSpan(name, attributes, fn) {
    if (!tracer) {
        return fn();
    }

    return tracer.startActiveSpan(name, { attributes }, async (span) => {
        try {
            const result = await fn(span);
            span.setStatus({ code: SpanStatusCode.OK });
            return result;
        } catch (error) {
            span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
            span.recordException(error);
            throw error;
        } finally {
            span.end();
        }
    });
}

/**
 * Create a span for a queue operation.
 *
 * @param {string} operation - e.g. 'match', 'enqueue', 'cancel'
 * @param {object} [attributes] - Additional span attributes
 * @param {Function} fn - Async function
 */
async function traceQueueOperation(operation, attributes, fn) {
    return withSpan(`queue.${operation}`, {
        'vrs.operation': operation,
        'vrs.component': 'queue',
        ...attributes
    }, fn);
}

/**
 * Create a span for a call operation.
 *
 * @param {string} operation - e.g. 'setup', 'active', 'teardown'
 * @param {object} [attributes]
 * @param {Function} fn
 */
async function traceCallOperation(operation, attributes, fn) {
    return withSpan(`call.${operation}`, {
        'vrs.operation': operation,
        'vrs.component': 'call',
        ...attributes
    }, fn);
}

/**
 * Create a span for a database operation.
 *
 * @param {string} operation - e.g. 'query', 'insert', 'update'
 * @param {object} [attributes]
 * @param {Function} fn
 */
async function traceDbOperation(operation, attributes, fn) {
    return withSpan(`db.${operation}`, {
        'vrs.operation': operation,
        'vrs.component': 'database',
        ...attributes
    }, fn);
}

/**
 * Get the current trace ID (for log correlation).
 *
 * @returns {string|null}
 */
function getCurrentTraceId() {
    const span = trace.getActiveSpan();
    if (!span) return null;
    const ctx = span.spanContext();
    return ctx.traceId;
}

/**
 * Get trace context headers for propagation to downstream services.
 * Returns W3C TraceContext headers (traceparent, tracestate).
 *
 * @returns {object} Headers to inject into outgoing requests
 */
function getPropagationHeaders() {
    const headers = {};
    propagation.inject(context.active(), headers);
    return headers;
}

/**
 * Express middleware to add trace ID to request logs.
 */
function tracingMiddleware(req, res, next) {
    const traceId = getCurrentTraceId();
    if (traceId && req.log) {
        req.log = req.log.child({ traceId });
    }
    next();
}

module.exports = {
    initialize,
    withSpan,
    traceQueueOperation,
    traceCallOperation,
    traceDbOperation,
    getCurrentTraceId,
    getPropagationHeaders,
    tracingMiddleware,
    isTracingEnabled: () => tracer !== null
};
