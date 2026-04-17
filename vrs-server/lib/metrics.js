/**
 * Prometheus Metrics Collection
 *
 * Defines all custom metrics for the MalkaVRS system using prom-client.
 * Exposes a /metrics endpoint in Prometheus exposition format.
 *
 * Metric groups:
 *   - HTTP API: request duration, in-flight requests, request size
 *   - WebSocket: connections by role, messages in/out
 *   - Queue: depth, wait times, matches, interpreter availability
 *   - Database: query latency percentiles
 *   - Calls: active concurrent, setup time, duration
 *   - JVB: CPU, memory, bandwidth (via Jitsi Colibri REST API)
 *   - Call quality: packet loss, jitter, bitrate
 */

const promClient = require('prom-client');

const log = require('./logger').module('metrics');

// ============================================
// REGISTRY & DEFAULT METRICS
// ============================================

const register = new promClient.Registry();

// Add default Node.js metrics (CPU, memory, event loop, GC, etc.)
promClient.collectDefaultMetrics({ register, prefix: 'vrs_' });

// ============================================
// HTTP API METRICS
// ============================================

const httpRequestDuration = new promClient.Histogram({
    name: 'vrs_http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
});
register.registerMetric(httpRequestDuration);

const httpRequestsInFlight = new promClient.Gauge({
    name: 'vrs_http_requests_in_flight',
    help: 'Number of HTTP requests currently in flight',
    labelNames: ['method', 'route']
});
register.registerMetric(httpRequestsInFlight);

const httpRequestTotal = new promClient.Counter({
    name: 'vrs_http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code']
});
register.registerMetric(httpRequestTotal);

// ============================================
// WEBSOCKET METRICS
// ============================================

const wsConnections = new promClient.Gauge({
    name: 'vrs_websocket_connections',
    help: 'Number of active WebSocket connections',
    labelNames: ['role']
});
register.registerMetric(wsConnections);

const wsMessagesIn = new promClient.Counter({
    name: 'vrs_websocket_messages_received_total',
    help: 'Total WebSocket messages received',
    labelNames: ['type']
});
register.registerMetric(wsMessagesIn);

const wsMessagesOut = new promClient.Counter({
    name: 'vrs_websocket_messages_sent_total',
    help: 'Total WebSocket messages sent',
    labelNames: ['type']
});
register.registerMetric(wsMessagesOut);

const wsConnectionErrors = new promClient.Counter({
    name: 'vrs_websocket_connection_errors_total',
    help: 'Total WebSocket connection errors'
});
register.registerMetric(wsConnectionErrors);

// ============================================
// QUEUE METRICS
// ============================================

const queueDepth = new promClient.Gauge({
    name: 'vrs_queue_depth',
    help: 'Current number of requests waiting in the queue'
});
register.registerMetric(queueDepth);

const queueWaitTime = new promClient.Histogram({
    name: 'vrs_queue_wait_time_seconds',
    help: 'Time clients spend waiting in the queue before being matched',
    labelNames: ['language'],
    buckets: [5, 15, 30, 60, 120, 300, 600, 1200, 1800]
});
register.registerMetric(queueWaitTime);

const queueMatchesTotal = new promClient.Counter({
    name: 'vrs_queue_matches_total',
    help: 'Total number of successful client-interpreter matches',
    labelNames: ['language']
});
register.registerMetric(queueMatchesTotal);

const queueCancellationsTotal = new promClient.Counter({
    name: 'vrs_queue_cancellations_total',
    help: 'Total number of queue request cancellations'
});
register.registerMetric(queueCancellationsTotal);

const activeInterpreters = new promClient.Gauge({
    name: 'vrs_active_interpreters',
    help: 'Number of interpreters currently available for matching',
    labelNames: ['language']
});
register.registerMetric(activeInterpreters);

const queuePaused = new promClient.Gauge({
    name: 'vrs_queue_paused',
    help: 'Whether the queue is currently paused (1 = paused, 0 = active)'
});
register.registerMetric(queuePaused);

// ============================================
// DATABASE METRICS
// ============================================

const dbQueryDuration = new promClient.Histogram({
    name: 'vrs_db_query_duration_seconds',
    help: 'Database query duration in seconds',
    labelNames: ['operation'],
    buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5]
});
register.registerMetric(dbQueryDuration);

const dbQueryErrors = new promClient.Counter({
    name: 'vrs_db_query_errors_total',
    help: 'Total database query errors',
    labelNames: ['operation']
});
register.registerMetric(dbQueryErrors);

const dbConnectionPool = new promClient.Gauge({
    name: 'vrs_db_pool_connections',
    help: 'Database connection pool stats',
    labelNames: ['state'] // 'idle', 'active', 'waiting'
});
register.registerMetric(dbConnectionPool);

// ============================================
// CALL METRICS
// ============================================

const activeCalls = new promClient.Gauge({
    name: 'vrs_active_calls',
    help: 'Number of active concurrent VRS calls'
});
register.registerMetric(activeCalls);

const callSetupTime = new promClient.Histogram({
    name: 'vrs_call_setup_time_seconds',
    help: 'Time from dial to interpreter connected',
    labelNames: ['language'],
    buckets: [1, 2, 5, 10, 15, 30, 60, 120, 300]
});
register.registerMetric(callSetupTime);

const callDuration = new promClient.Histogram({
    name: 'vrs_call_duration_seconds',
    help: 'Duration of completed VRS calls',
    labelNames: ['language'],
    buckets: [30, 60, 120, 300, 600, 1200, 1800, 3600, 7200]
});
register.registerMetric(callDuration);

const callsTotal = new promClient.Counter({
    name: 'vrs_calls_total',
    help: 'Total VRS calls completed',
    labelNames: ['language', 'outcome'] // outcome: completed, dropped, timeout
});
register.registerMetric(callsTotal);

// ============================================
// JVB METRICS (populated from Jitsi Colibri REST API)
// ============================================

const jvbCpuUsage = new promClient.Gauge({
    name: 'vrs_jvb_cpu_usage_percent',
    help: 'JVB CPU usage percentage',
    labelNames: ['bridge_id']
});
register.registerMetric(jvbCpuUsage);

const jvbMemoryUsage = new promClient.Gauge({
    name: 'vrs_jvb_memory_usage_bytes',
    help: 'JVB memory usage in bytes',
    labelNames: ['bridge_id']
});
register.registerMetric(jvbMemoryUsage);

const jvbBandwidth = new promClient.Gauge({
    name: 'vrs_jvb_bandwidth_bits_per_second',
    help: 'JVB bandwidth usage in bits per second',
    labelNames: ['bridge_id', 'direction'] // 'in', 'out'
});
register.registerMetric(jvbBandwidth);

const jvbConferences = new promClient.Gauge({
    name: 'vrs_jvb_conferences',
    help: 'Number of active conferences on the JVB',
    labelNames: ['bridge_id']
});
register.registerMetric(jvbConferences);

const jvbParticipants = new promClient.Gauge({
    name: 'vrs_jvb_participants',
    help: 'Number of participants on the JVB',
    labelNames: ['bridge_id']
});
register.registerMetric(jvbParticipants);

// ============================================
// CALL QUALITY METRICS
// ============================================

const callPacketLoss = new promClient.Histogram({
    name: 'vrs_call_packet_loss_percent',
    help: 'Packet loss percentage per call',
    labelNames: ['direction'], // 'inbound', 'outbound'
    buckets: [0.1, 0.5, 1, 2, 5, 10, 20, 50]
});
register.registerMetric(callPacketLoss);

const callJitter = new promClient.Histogram({
    name: 'vrs_call_jitter_milliseconds',
    help: 'Jitter in milliseconds per call',
    labelNames: ['direction'], // 'inbound', 'outbound'
    buckets: [1, 5, 10, 20, 30, 50, 100, 200]
});
register.registerMetric(callJitter);

const callBitrate = new promClient.Histogram({
    name: 'vrs_call_bitrate_kbps',
    help: 'Bitrate in kbps per call',
    labelNames: ['direction', 'media_type'], // 'audio', 'video'
    buckets: [10, 30, 50, 100, 250, 500, 1000, 2000, 5000]
});
register.registerMetric(callBitrate);

const callsBelowQualityThreshold = new promClient.Counter({
    name: 'vrs_calls_below_quality_threshold_total',
    help: 'Number of calls flagged below quality threshold',
    labelNames: ['reason'] // 'packet_loss', 'jitter', 'bitrate'
});
register.registerMetric(callsBelowQualityThreshold);

// Quality thresholds for flagging
const QUALITY_THRESHOLDS = {
    packetLossPercent: 5,      // > 5% packet loss
    jitterMs: 50,              // > 50ms jitter
    audioBitrateKbps: 10,      // < 10 kbps audio
    videoBitrateKbps: 100      // < 100 kbps video
};

// ============================================
// REDIS METRICS (populated from Redis INFO)
// ============================================

const redisMemoryUsage = new promClient.Gauge({
    name: 'vrs_redis_memory_used_bytes',
    help: 'Redis memory usage in bytes'
});
register.registerMetric(redisMemoryUsage);

const redisHitRate = new promClient.Gauge({
    name: 'vrs_redis_keyspace_hit_rate',
    help: 'Redis keyspace hit rate (hits / (hits + misses))'
});
register.registerMetric(redisHitRate);

const redisConnectedClients = new promClient.Gauge({
    name: 'vrs_redis_connected_clients',
    help: 'Number of connected Redis clients'
});
register.registerMetric(redisConnectedClients);

// ============================================
// MIDDLEWARE HELPERS
// ============================================

/**
 * Express middleware to collect HTTP metrics per request.
 * Labels route using req.route?.path or req.path as fallback.
 */
function httpMetricsMiddleware(req, res, next) {
    const route = req.route ? req.route.path : req.path;

    httpRequestsInFlight.inc({ method: req.method, route });
    const end = httpRequestDuration.startTimer({ method: req.method, route });

    res.on('finish', () => {
        const labels = { method: req.method, route, status_code: res.statusCode };
        end(labels);
        httpRequestsInFlight.dec({ method: req.method, route });
        httpRequestTotal.inc(labels);
    });

    next();
}

// ============================================
// TRACKING HELPERS
// ============================================

/**
 * Record a database query with timing.
 * @param {string} operation - e.g. 'select_calls', 'insert_queue'
 * @param {Function} fn - async function performing the query
 */
async function trackDbQuery(operation, fn) {
    const end = dbQueryDuration.startTimer({ operation });
    try {
        const result = await fn();
        end();
        return result;
    } catch (error) {
        dbQueryErrors.inc({ operation });
        end();
        throw error;
    }
}

/**
 * Record call quality metrics for a completed call and check thresholds.
 * @param {object} params
 */
function recordCallQuality({ callId, packetLossIn, packetLossOut, jitterIn, jitterOut, audioBitrateIn, audioBitrateOut, videoBitrateIn, videoBitrateOut }) {
    if (packetLossIn != null) callPacketLoss.observe({ direction: 'inbound' }, packetLossIn);
    if (packetLossOut != null) callPacketLoss.observe({ direction: 'outbound' }, packetLossOut);
    if (jitterIn != null) callJitter.observe({ direction: 'inbound' }, jitterIn);
    if (jitterOut != null) callJitter.observe({ direction: 'outbound' }, jitterOut);
    if (audioBitrateIn != null) callBitrate.observe({ direction: 'inbound', media_type: 'audio' }, audioBitrateIn);
    if (audioBitrateOut != null) callBitrate.observe({ direction: 'outbound', media_type: 'audio' }, audioBitrateOut);
    if (videoBitrateIn != null) callBitrate.observe({ direction: 'inbound', media_type: 'video' }, videoBitrateIn);
    if (videoBitrateOut != null) callBitrate.observe({ direction: 'outbound', media_type: 'video' }, videoBitrateOut);

    // Flag calls below quality thresholds
    const reasons = [];
    if (packetLossIn > QUALITY_THRESHOLDS.packetLossPercent || packetLossOut > QUALITY_THRESHOLDS.packetLossPercent) {
        reasons.push('packet_loss');
    }
    if (jitterIn > QUALITY_THRESHOLDS.jitterMs || jitterOut > QUALITY_THRESHOLDS.jitterMs) {
        reasons.push('jitter');
    }
    if (audioBitrateIn < QUALITY_THRESHOLDS.audioBitrateKbps || audioBitrateOut < QUALITY_THRESHOLDS.audioBitrateKbps) {
        reasons.push('bitrate');
    }
    if (videoBitrateIn < QUALITY_THRESHOLDS.videoBitrateKbps || videoBitrateOut < QUALITY_THRESHOLDS.videoBitrateKbps) {
        reasons.push('bitrate');
    }

    if (reasons.length > 0) {
        log.warn({ callId, reasons }, 'Call below quality threshold');
        for (const reason of reasons) {
            callsBelowQualityThreshold.inc({ reason });
        }
    }
}

/**
 * Scrape JVB stats from the Jitsi Colibri REST API.
 * @param {string} jvbUrl - e.g. 'http://jvb:8080'
 */
async function scrapeJvbStats(jvbUrl) {
    try {
        const response = await fetch(`${jvbUrl}/colibri/stats`);
        if (!response.ok) return;

        const stats = await response.json();
        const bridgeId = stats.bridge_id || 'default';

        if (stats.cpu_usage != null) jvbCpuUsage.set({ bridge_id: bridgeId }, stats.cpu_usage * 100);
        if (stats.memory_usage != null) jvbMemoryUsage.set({ bridge_id: bridgeId }, stats.memory_usage);
        if (stats.bit_rate_download != null) jvbBandwidth.set({ bridge_id: bridgeId, direction: 'in' }, stats.bit_rate_download);
        if (stats.bit_rate_upload != null) jvbBandwidth.set({ bridge_id: bridgeId, direction: 'out' }, stats.bit_rate_upload);
        if (stats.conferences != null) jvbConferences.set({ bridge_id: bridgeId }, stats.conferences);
        if (stats.participants != null) jvbParticipants.set({ bridge_id: bridgeId }, stats.participants);
    } catch (error) {
        log.debug({ err: error.message }, 'Failed to scrape JVB stats');
    }
}

/**
 * Scrape Redis INFO stats.
 * @param {object} redisClient - ioredis or node-redis client with .info() method
 */
async function scrapeRedisStats(redisClient) {
    try {
        const info = await redisClient.info();
        const lines = info.split('\r\n');
        let keyspaceHits = 0, keyspaceMisses = 0, usedMemory = 0, connectedClients = 0;

        for (const line of lines) {
            if (line.startsWith('keyspace_hits:')) keyspaceHits = parseInt(line.split(':')[1], 10);
            if (line.startsWith('keyspace_misses:')) keyspaceMisses = parseInt(line.split(':')[1], 10);
            if (line.startsWith('used_memory:')) usedMemory = parseInt(line.split(':')[1], 10);
            if (line.startsWith('connected_clients:')) connectedClients = parseInt(line.split(':')[1], 10);
        }

        const total = keyspaceHits + keyspaceMisses;
        redisMemoryUsage.set(usedMemory);
        redisHitRate.set(total > 0 ? keyspaceHits / total : 0);
        redisConnectedClients.set(connectedClients);
    } catch (error) {
        log.debug({ err: error.message }, 'Failed to scrape Redis stats');
    }
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
    register,

    // Middleware
    httpMetricsMiddleware,

    // Trackers
    trackDbQuery,
    recordCallQuality,
    scrapeJvbStats,
    scrapeRedisStats,

    // Metric instances (for direct manipulation in services)
    metrics: {
        httpRequestDuration,
        httpRequestsInFlight,
        httpRequestTotal,
        wsConnections,
        wsMessagesIn,
        wsMessagesOut,
        wsConnectionErrors,
        queueDepth,
        queueWaitTime,
        queueMatchesTotal,
        queueCancellationsTotal,
        activeInterpreters,
        queuePaused,
        dbQueryDuration,
        dbQueryErrors,
        dbConnectionPool,
        activeCalls,
        callSetupTime,
        callDuration,
        callsTotal,
        jvbCpuUsage,
        jvbMemoryUsage,
        jvbBandwidth,
        jvbConferences,
        jvbParticipants,
        callPacketLoss,
        callJitter,
        callBitrate,
        callsBelowQualityThreshold,
        redisMemoryUsage,
        redisHitRate,
        redisConnectedClients,

    // ============================================
    // VOICEMAIL METRICS
    // ============================================

    voicemailMessagesTotal: new promClient.Counter({
        name: 'vrs_voicemail_messages_total',
        help: 'Total voicemail messages created',
        labelNames: ['status'] // created, expired, deleted, failed
    }),
    voicemailStorageBytes: new promClient.Gauge({
        name: 'vrs_voicemail_storage_bytes',
        help: 'Total voicemail storage in bytes'
    }),
    voicemailDuration: new promClient.Histogram({
        name: 'vrs_voicemail_duration_seconds',
        help: 'Duration of voicemail recordings',
        buckets: [10, 30, 60, 90, 120, 180, 300]
    }),
    voicemailActiveRecordings: new promClient.Gauge({
        name: 'vrs_voicemail_active_recordings',
        help: 'Number of voicemail recordings currently in progress'
    })
    },

    QUALITY_THRESHOLDS
};
