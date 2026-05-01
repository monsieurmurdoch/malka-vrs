#!/usr/bin/env node

/**
 * Twilio Voice Server for VRS (Video Relay Service) calls
 * Handles outbound calling for interpreters in Malka Meet
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { z } = require('zod');
const { logger, requestId, requestLogger } = require('./logger');

// Initialize Express app
const app = express();
const PORT = process.env.TWILIO_PORT || 3002;
const DEFAULT_TWILIO_ACCOUNT_SID = 'YOUR_ACCOUNT_SID';
const DEFAULT_TWILIO_AUTH_TOKEN = 'YOUR_AUTH_TOKEN';
const DEFAULT_TWILIO_PHONE_NUMBER = 'YOUR_TWILIO_NUMBER';
const DEFAULT_WEBHOOK_BASE_URL = 'https://your-domain.com';
const CORS_ORIGINS = (process.env.CORS_ORIGINS || 'https://127.0.0.1:8080,http://localhost:8080')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
const CALL_RATE_LIMIT_WINDOW_MS = Number(process.env.TWILIO_CALL_RATE_LIMIT_WINDOW_MS || 60 * 1000);
const CALL_RATE_LIMIT_MAX = Number(process.env.TWILIO_CALL_RATE_LIMIT_MAX || 10);

app.set('trust proxy', true);

// Middleware
app.use(cors({
    origin(origin, callback) {
        if (!origin || CORS_ORIGINS.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('CORS not allowed'));
        }
    },
    credentials: true
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(requestId);
app.use(requestLogger);

// Twilio configuration - YOU NEED TO SET THESE ENVIRONMENT VARIABLES
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || DEFAULT_TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || DEFAULT_TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER || DEFAULT_TWILIO_PHONE_NUMBER;

// Your webhook URL for call status updates
const WEBHOOK_BASE_URL = process.env.WEBHOOK_BASE_URL || DEFAULT_WEBHOOK_BASE_URL;

// Initialize Twilio client
let twilio;
let twilioSdk;
try {
    twilioSdk = require('twilio');
    if (TWILIO_ACCOUNT_SID !== DEFAULT_TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN !== DEFAULT_TWILIO_AUTH_TOKEN) {
        twilio = twilioSdk(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    }
} catch (error) {
    logger.error({ err: error }, 'twilio_initialization_failed');
}

// In-memory call storage (in production, use Redis or database)
const activeCalls = new Map();
const callRateLimitStore = new Map();

/**
 * Utility functions
 */
function generateCallId() {
    return `vrs_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function isPlaceholder(value, placeholder) {
    return !value || value === placeholder;
}

function getRateLimitKey(req) {
    return req.ip || req.headers['x-forwarded-for'] || 'unknown';
}

function isCallRateLimited(key) {
    const now = Date.now();
    const existing = callRateLimitStore.get(key);

    if (!existing || existing.expiresAt <= now) {
        callRateLimitStore.delete(key);
        return false;
    }

    return existing.count >= CALL_RATE_LIMIT_MAX;
}

function registerCallAttempt(key) {
    const now = Date.now();
    const existing = callRateLimitStore.get(key);

    if (!existing || existing.expiresAt <= now) {
        callRateLimitStore.set(key, { count: 1, expiresAt: now + CALL_RATE_LIMIT_WINDOW_MS });
        return;
    }

    existing.count += 1;
}

function getTwilioWarnings() {
    const warnings = [];

    if (CORS_ORIGINS.length === 0) {
        warnings.push('cors_origins_empty');
    }

    if (WEBHOOK_BASE_URL === DEFAULT_WEBHOOK_BASE_URL) {
        warnings.push('webhook_base_url_not_configured');
    }

    return warnings;
}

function getTwilioHealthSnapshot() {
    const warnings = getTwilioWarnings();
    const checks = {
        accountSidConfigured: !isPlaceholder(TWILIO_ACCOUNT_SID, DEFAULT_TWILIO_ACCOUNT_SID),
        authTokenConfigured: !isPlaceholder(TWILIO_AUTH_TOKEN, DEFAULT_TWILIO_AUTH_TOKEN),
        phoneNumberConfigured: !isPlaceholder(TWILIO_PHONE_NUMBER, DEFAULT_TWILIO_PHONE_NUMBER),
        twilioClientReady: Boolean(twilio),
        webhookBaseUrlConfigured: WEBHOOK_BASE_URL !== DEFAULT_WEBHOOK_BASE_URL,
        webhookSignatureValidationEnabled: Boolean(twilioSdk) && !isPlaceholder(TWILIO_AUTH_TOKEN, DEFAULT_TWILIO_AUTH_TOKEN)
    };
    const blockers = Object.entries(checks)
        .filter(([, passed]) => !passed)
        .map(([name]) => name);
    const ready = blockers.length === 0;

    return {
        activeCalls: activeCalls.size,
        blockers,
        checks,
        ready,
        service: 'twilio-voice-server',
        status: ready ? (warnings.length ? 'degraded' : 'ok') : 'not_ready',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        warnings
    };
}

function validateTwilioWebhook(req) {
    if (!twilioSdk || isPlaceholder(TWILIO_AUTH_TOKEN, DEFAULT_TWILIO_AUTH_TOKEN)) {
        return false;
    }

    const signature = req.headers['x-twilio-signature'];
    if (!signature) {
        return false;
    }

    const forwardedProto = req.get('x-forwarded-proto');
    const protocol = forwardedProto ? forwardedProto.split(',')[0].trim() : req.protocol;
    const host = req.get('x-forwarded-host') || req.get('host');
    const url = `${protocol}://${host}${req.originalUrl}`;

    return twilioSdk.validateRequest(TWILIO_AUTH_TOKEN, signature, url, req.body || {});
}

// ============================================
// INPUT VALIDATION
// ============================================

function validateRequest(schema) {
    return (req, res, next) => {
        const result = schema.safeParse(req.body);
        if (!result.success) {
            const details = {};
            for (const issue of result.error.issues) {
                const key = issue.path.join('.') || '_root';
                if (!details[key]) details[key] = issue.message;
            }
            return res.status(400).json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details });
        }
        req.body = result.data;
        next();
    };
}

const callSchema = z.object({
    to: z.string().regex(/^\+?\d{7,16}$/, 'Invalid phone number format'),
    from: z.string().regex(/^\+?\d{7,16}$/, 'Invalid phone number format').optional(),
    roomName: z.string().min(1).max(100).optional()
});

const initiateCallSchema = z.object({
    phoneNumber: z.string().regex(/^\+?\d{7,16}$/, 'Invalid phone number format'),
    interpreterId: z.string().min(1),
    sessionId: z.string().optional()
});

/**
 * ROUTES
 */

// Health check
app.get(['/health', '/api/health'], (req, res) => {
    res.json(getTwilioHealthSnapshot());
});

app.get('/api/readiness', (req, res) => {
    const snapshot = getTwilioHealthSnapshot();

    res.status(snapshot.ready ? 200 : 503).json(snapshot);
});

// Initiate outbound call
app.post('/api/voice/call', validateRequest(initiateCallSchema), async (req, res) => {
    try {
        const { phoneNumber, interpreterId, sessionId } = req.body;

        const readiness = getTwilioHealthSnapshot();
        if (!readiness.ready) {
            return res.status(503).json({
                error: 'Twilio service is not ready for outbound calling',
                code: 'SERVICE_NOT_READY',
                blockers: readiness.blockers
            });
        }

        const rateLimitKey = getRateLimitKey(req);
        if (isCallRateLimited(rateLimitKey)) {
            return res.status(429).json({
                error: 'Too many call attempts. Please try again shortly.',
                code: 'RATE_LIMIT_EXCEEDED'
            });
        }
        registerCallAttempt(rateLimitKey);

        if (!twilio) {
            return res.status(500).json({
                error: 'Twilio not configured. Please set environment variables.',
                code: 'TWILIO_NOT_CONFIGURED'
            });
        }

        // Clean phone number (remove non-digits except +)
        const cleanNumber = phoneNumber.replace(/[^\d+]/g, '');
        
        // Add +1 if it's a US number without country code
        const finalNumber = cleanNumber.match(/^\d{10}$/) ? `+1${cleanNumber}` : cleanNumber;

        logger.info({ interpreterId, phoneNumber: finalNumber, requestId: req.id, sessionId }, 'call_lifecycle.twilio_call_start_requested');

        // Create call with Twilio
        const call = await twilio.calls.create({
            to: finalNumber,
            from: TWILIO_PHONE_NUMBER,
            // TwiML to handle the call - connects to interpreter's browser
            twiml: `
                <Response>
                    <Say voice="alice">
                        Connecting you to a Video Relay Service interpreter. 
                        Please hold while we establish the connection.
                    </Say>
                    <Dial>
                        <Client>${interpreterId}</Client>
                    </Dial>
                </Response>
            `,
            statusCallback: `${WEBHOOK_BASE_URL}/api/voice/webhook/${sessionId}`,
            statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
            statusCallbackMethod: 'POST',
            timeout: 30,
            record: false // Set to true if you want call recording
        });

        // Store call information
        const callData = {
            callSid: call.sid,
            sessionId,
            interpreterId,
            phoneNumber: finalNumber,
            status: 'initiated',
            startTime: new Date(),
            endTime: null,
            duration: null
        };

        activeCalls.set(call.sid, callData);

        logger.info({ callSid: call.sid, interpreterId, phoneNumber: finalNumber, requestId: req.id, sessionId }, 'call_lifecycle.twilio_call_started');

        res.json({
            success: true,
            callSid: call.sid,
            status: 'initiated',
            message: 'Call initiated successfully'
        });

    } catch (error) {
        logger.error({ err: error, requestId: req.id }, 'call_lifecycle.twilio_call_start_failed');
        res.status(500).json({
            error: 'Failed to initiate call',
            code: 'CALL_INITIATION_FAILED',
            details: { message: error.message }
        });
    }
});

// Hangup call
app.post('/api/voice/hangup', async (req, res) => {
    try {
        const { callSid } = req.body;

        if (!callSid) {
            return res.status(400).json({
                error: 'Missing required field: callSid',
                code: 'MISSING_CALL_SID'
            });
        }

        if (!twilio) {
            return res.status(500).json({
                error: 'Twilio not configured',
                code: 'TWILIO_NOT_CONFIGURED'
            });
        }

        logger.info({ callSid, requestId: req.id }, 'call_lifecycle.twilio_call_hangup_requested');

        // Update call status to completed
        await twilio.calls(callSid).update({ status: 'completed' });

        // Update local storage
        const callData = activeCalls.get(callSid);
        if (callData) {
            callData.status = 'completed';
            callData.endTime = new Date();
            if (callData.startTime) {
                callData.duration = Math.floor((callData.endTime - callData.startTime) / 1000);
            }
        }

        res.json({
            success: true,
            message: 'Call ended successfully'
        });

    } catch (error) {
        logger.error({ callSid: req.body.callSid, err: error, requestId: req.id }, 'call_lifecycle.twilio_call_hangup_failed');
        res.status(500).json({
            error: 'Failed to end call',
            code: 'HANGUP_FAILED',
            details: { message: error.message }
        });
    }
});

// TTS Say — relay text-to-speech to an active VCO call
app.post('/api/voice/tts-say', validateRequest(z.object({
    callSid: z.string().min(1),
    text: z.string().min(1).max(1000),
    voice: z.string().max(50).optional()
})), async (req, res) => {
    try {
        const { callSid, text, voice } = req.body;

        if (!twilio) {
            return res.status(500).json({
                error: 'Twilio not configured',
                code: 'TWILIO_NOT_CONFIGURED'
            });
        }

        logger.info({ callSid, requestId: req.id, textLength: text.length }, 'twilio_tts_say_requested');

        // Update the live call with TwiML that speaks the text
        const twiml = `<Response><Say voice="${voice || 'alice'}">${text.replace(/[<>&]/g, ' ')}</Say></Response>`;

        // For live calls, we use the Call API to modify the call
        await twilio.calls(callSid).update({
            twiml
        });

        res.json({ success: true, message: 'TTS sent to call' });
    } catch (error) {
        logger.error({ callSid: req.body.callSid, err: error, requestId: req.id }, 'twilio_tts_say_failed');
        res.status(500).json({
            error: 'Failed to send TTS',
            code: 'TTS_FAILED',
            details: { message: error.message }
        });
    }
});

// Get call status
app.get('/api/voice/status/:callSid', async (req, res) => {
    try {
        const { callSid } = req.params;

        // First check local storage
        let callData = activeCalls.get(callSid);
        
        if (!callData && twilio) {
            // Fallback: fetch from Twilio
            try {
                const call = await twilio.calls(callSid).fetch();
                callData = {
                    callSid: call.sid,
                    status: call.status,
                    duration: call.duration,
                    startTime: call.dateCreated,
                    endTime: call.dateUpdated
                };
            } catch (error) {
                logger.warn({ callSid, err: error, requestId: req.id }, 'twilio_call_fetch_failed');
            }
        }

        if (!callData) {
            return res.status(404).json({
                error: 'Call not found',
                code: 'CALL_NOT_FOUND'
            });
        }

        res.json({
            callSid: callData.callSid,
            status: callData.status,
            duration: callData.duration,
            startTime: callData.startTime,
            endTime: callData.endTime
        });

    } catch (error) {
        logger.error({ callSid: req.params.callSid, err: error, requestId: req.id }, 'twilio_call_status_failed');
        res.status(500).json({
            error: 'Failed to get call status',
            code: 'STATUS_FETCH_FAILED',
            details: { message: error.message }
        });
    }
});

// Webhook endpoint for call status updates
app.post('/api/voice/webhook/:sessionId?', (req, res) => {
    if (twilio && !validateTwilioWebhook(req)) {
        logger.warn({ requestId: req.id }, 'twilio_webhook_signature_rejected');
        return res.status(403).json({
            error: 'Invalid Twilio webhook signature',
            code: 'INVALID_SIGNATURE'
        });
    }

    const sessionId = req.params.sessionId;
    const {
        CallSid,
        CallStatus,
        CallDuration,
        From,
        To,
        Direction
    } = req.body;

    logger.info({ callSid: CallSid, callStatus: CallStatus, direction: Direction, from: From, requestId: req.id, sessionId, to: To }, 'call_lifecycle.twilio_webhook_status');

    // Update local call storage
    const callData = activeCalls.get(CallSid);
    if (callData) {
        callData.status = CallStatus;
        if (CallDuration) {
            callData.duration = parseInt(CallDuration, 10);
        }
        if (CallStatus === 'completed' || CallStatus === 'failed' || CallStatus === 'canceled') {
            callData.endTime = new Date();
        }
    }

    // Here you can add custom logic to notify the frontend
    // For example, WebSocket notifications, database updates, etc.
    
    // TODO: You can add your custom webhook logic here
    // For example: notify the interpreter's browser, log to database, etc.

    // Respond to Twilio
    res.status(200).send('OK');
});

// List active calls (for debugging)
app.get('/api/voice/calls', (req, res) => {
    const calls = Array.from(activeCalls.values()).map(call => ({
        callSid: call.callSid,
        interpreterId: call.interpreterId,
        phoneNumber: call.phoneNumber,
        status: call.status,
        duration: call.duration,
        startTime: call.startTime
    }));

    res.json({
        totalCalls: calls.length,
        calls
    });
});

// Error handling middleware
app.use((error, req, res, next) => {
    logger.error({ err: error, requestId: req.id }, 'twilio_request_failed');
    res.status(500).json({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
        details: { message: error.message }
    });
});

// Start server
app.listen(PORT, () => {
    logger.info({
        baseUrl: `http://localhost:${PORT}`,
        healthUrl: `http://localhost:${PORT}/health`,
        port: PORT,
        readinessUrl: `http://localhost:${PORT}/api/readiness`
    }, 'twilio_voice_server_started');
    
    if (TWILIO_ACCOUNT_SID === DEFAULT_TWILIO_ACCOUNT_SID) {
        logger.warn({ blockers: getTwilioHealthSnapshot().blockers }, 'twilio_configuration_required');
    } else {
        logger.info({ accountSid: TWILIO_ACCOUNT_SID, phoneNumber: TWILIO_PHONE_NUMBER, webhookUrl: `${WEBHOOK_BASE_URL}/api/voice/webhook` }, 'twilio_configuration_ready');
    }

    const warnings = getTwilioWarnings();
    if (warnings.length) {
        logger.warn({ warnings }, 'twilio_startup_warnings');
    }

    logger.info('twilio_ready_for_vrs_calls');
});

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.info('twilio_sigterm_received');
    process.exit(0);
});

// Cleanup old calls periodically (every 10 minutes)
setInterval(() => {
    const now = Date.now();
    const OLD_CALL_THRESHOLD = 10 * 60 * 1000; // 10 minutes

    for (const [callSid, callData] of activeCalls) {
        if (callData.endTime && (now - callData.endTime.getTime()) > OLD_CALL_THRESHOLD) {
            activeCalls.delete(callSid);
            logger.info({ callSid }, 'twilio_old_call_cleaned_up');
        }
    }
}, 10 * 60 * 1000);
