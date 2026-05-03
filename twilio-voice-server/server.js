#!/usr/bin/env node

/**
 * Twilio Voice Server for VRS (Video Relay Service) calls
 * Handles outbound calling for interpreters in Malka Meet
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { z } = require('zod');

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
app.use(standardizeErrorResponses);

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
    console.error('⚠️  Twilio initialization failed. Please install: npm install twilio');
    console.error('⚠️  And set your environment variables.');
}

// In-memory call storage (in production, use Redis or database)
const activeCalls = new Map();
const callRateLimitStore = new Map();

/**
 * Utility functions
 */
function log(message) {
    console.log(`[${new Date().toISOString()}] ${message}`);
}

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

function inferErrorCode(statusCode) {
    if (statusCode === 400) return 'BAD_REQUEST';
    if (statusCode === 401) return 'AUTH_REQUIRED';
    if (statusCode === 403) return 'FORBIDDEN';
    if (statusCode === 404) return 'NOT_FOUND';
    if (statusCode === 429) return 'RATE_LIMITED';
    if (statusCode === 503) return 'SERVICE_UNAVAILABLE';
    if (statusCode >= 500) return 'INTERNAL_ERROR';
    return 'ERROR';
}

function standardizeErrorResponses(req, res, next) {
    const originalJson = res.json.bind(res);
    res.json = (body) => {
        if (res.statusCode >= 400) {
            const source = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
            const payload = {
                ...source,
                error: typeof source.error === 'string' ? source.error : 'Request failed',
                code: typeof source.code === 'string' ? source.code : inferErrorCode(res.statusCode)
            };
            if (process.env.NODE_ENV === 'production' && res.statusCode >= 500) {
                delete payload.details;
                payload.error = 'Internal server error';
                payload.code = 'INTERNAL_ERROR';
            }
            return originalJson(payload);
        }
        return originalJson(body);
    };
    next();
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

const hangupSchema = z.object({
    callSid: z.string().min(1).max(100)
});

const twilioWebhookSchema = z.object({
    CallSid: z.string().min(1).max(100),
    CallStatus: z.string().min(1).max(80),
    CallDuration: z.string().max(40).optional(),
    From: z.string().max(80).optional(),
    To: z.string().max(80).optional(),
    Direction: z.string().max(80).optional()
}).passthrough();

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

        log(`Initiating call from ${interpreterId} to ${finalNumber}`);

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

        log(`Call initiated: ${call.sid} (${interpreterId} -> ${finalNumber})`);

        res.json({
            success: true,
            callSid: call.sid,
            status: 'initiated',
            message: 'Call initiated successfully'
        });

    } catch (error) {
        log(`Error initiating call: ${error.message}`);
        res.status(500).json({
            error: 'Failed to initiate call',
            code: 'CALL_INITIATION_FAILED',
            details: { message: error.message }
        });
    }
});

// Hangup call
app.post('/api/voice/hangup', validateRequest(hangupSchema), async (req, res) => {
    try {
        const { callSid } = req.body;

        if (!twilio) {
            return res.status(500).json({
                error: 'Twilio not configured',
                code: 'TWILIO_NOT_CONFIGURED'
            });
        }

        log(`Hanging up call: ${callSid}`);

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
        log(`Error hanging up call: ${error.message}`);
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

        log(`TTS Say on call ${callSid}: "${text.substring(0, 60)}..."`);

        // Update the live call with TwiML that speaks the text
        const twiml = `<Response><Say voice="${voice || 'alice'}">${text.replace(/[<>&]/g, ' ')}</Say></Response>`;

        // For live calls, we use the Call API to modify the call
        await twilio.calls(callSid).update({
            twiml
        });

        res.json({ success: true, message: 'TTS sent to call' });
    } catch (error) {
        log(`Error in TTS Say: ${error.message}`);
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
                log(`Error fetching call from Twilio: ${error.message}`);
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
        log(`Error getting call status: ${error.message}`);
        res.status(500).json({
            error: 'Failed to get call status',
            code: 'STATUS_FETCH_FAILED',
            details: { message: error.message }
        });
    }
});

// Webhook endpoint for call status updates
app.post('/api/voice/webhook/:sessionId?', validateRequest(twilioWebhookSchema), (req, res) => {
    if (twilio && !validateTwilioWebhook(req)) {
        log('Rejected webhook with invalid Twilio signature');
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

    log(`Webhook received: ${CallSid} -> ${CallStatus} (${sessionId})`);

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
    log(`Server error: ${error.message}`);
    res.status(500).json({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
        ...(process.env.NODE_ENV === 'development' && { details: { message: error.message } })
    });
});

// Start server
app.listen(PORT, () => {
    console.log('🎯 Twilio Voice Server Started');
    console.log(`📞 Server running on port ${PORT}`);
    console.log(`🌐 Base URL: http://localhost:${PORT}`);
    console.log(`💾 Health check: http://localhost:${PORT}/health`);
    console.log(`🩺 Readiness check: http://localhost:${PORT}/api/readiness`);
    
    if (TWILIO_ACCOUNT_SID === DEFAULT_TWILIO_ACCOUNT_SID) {
        console.log('');
        console.log('⚠️  CONFIGURATION REQUIRED:');
        console.log('   Set the following environment variables:');
        console.log('   - TWILIO_ACCOUNT_SID=your_account_sid');
        console.log('   - TWILIO_AUTH_TOKEN=your_auth_token'); 
        console.log('   - TWILIO_PHONE_NUMBER=your_twilio_number');
        console.log('   - WEBHOOK_BASE_URL=https://your-domain.com');
        console.log('');
    } else {
        console.log(`✅ Twilio configured for account: ${TWILIO_ACCOUNT_SID}`);
        console.log(`📱 Using Twilio number: ${TWILIO_PHONE_NUMBER}`);
        console.log(`🔗 Webhook URL: ${WEBHOOK_BASE_URL}/api/voice/webhook`);
    }

    const warnings = getTwilioWarnings();
    if (warnings.length) {
        console.warn(`⚠️  Startup warnings: ${warnings.join(', ')}`);
    }
    
    console.log('📋 Ready to handle VRS calls for interpreters!');
});

// Graceful shutdown
process.on('SIGTERM', () => {
    log('Received SIGTERM, shutting down gracefully');
    process.exit(0);
});

// Cleanup old calls periodically (every 10 minutes)
setInterval(() => {
    const now = Date.now();
    const OLD_CALL_THRESHOLD = 10 * 60 * 1000; // 10 minutes

    for (const [callSid, callData] of activeCalls) {
        if (callData.endTime && (now - callData.endTime.getTime()) > OLD_CALL_THRESHOLD) {
            activeCalls.delete(callSid);
            log(`Cleaned up old call: ${callSid}`);
        }
    }
}, 10 * 60 * 1000);
