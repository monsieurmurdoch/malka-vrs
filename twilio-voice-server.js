#!/usr/bin/env node

/**
 * Twilio Voice Server for VRS (Video Relay Service) calls
 * Handles outbound calling for interpreters in Malka Meet
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bodyParser = require('body-parser');

// ============================================
// FAIL-FAST: Require Twilio env vars at startup
// ============================================

const REQUIRED_ENV_VARS = [
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
    'TWILIO_PHONE_NUMBER'
];

const missingEnvVars = REQUIRED_ENV_VARS.filter(v => !process.env[v]);
if (missingEnvVars.length > 0) {
    console.error('FATAL: Missing required environment variables:');
    missingEnvVars.forEach(v => console.error(`  - ${v}`));
    console.error('Set them before starting the server.');
    process.exit(1);
}

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const TWILIO_TWIML_APP_SID = process.env.TWILIO_TWIML_APP_SID || '';

// Your webhook URL for call status updates
const WEBHOOK_BASE_URL = process.env.WEBHOOK_BASE_URL || '';

// Initialize Express app
const app = express();
const PORT = process.env.TWILIO_PORT || 3002;

// ============================================
// SECURITY MIDDLEWARE
// ============================================

// CORS — restrict to known VRS front-end origins
const CORS_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:8080,https://localhost:8080,http://localhost:3001,http://localhost:3003')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

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

app.use(helmet({
    contentSecurityPolicy: false // API-only server; CSP not applicable
}));

// Global rate limiter — 60 req/min per IP
const globalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' }
});
app.use(globalLimiter);

// Stricter rate limiter for token generation
const tokenLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many token requests, please try again later.' }
});

app.use(bodyParser.json({ limit: '1mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '1mb' }));

// Initialize Twilio client
let twilio;
let twilioLib;
let ClientCapability;
try {
    twilioLib = require('twilio');
    twilio = twilioLib(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    ClientCapability = twilioLib.jwt?.ClientCapability;
} catch (error) {
    console.error('Twilio initialization failed. Please install: npm install twilio');
    process.exit(1);
}

// In-memory call storage (in production, use Redis or database)
const activeCalls = new Map();

// Max number of completed call records to keep in memory
const MAX_COMPLETED_CALLS = 500;

/**
 * Utility functions
 */
function log(message) {
    console.log(`[${new Date().toISOString()}] ${message}`);
}

function generateCallId() {
    return `vrs_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Sanitize a phone number: keep digits and leading + only.
 * Returns the cleaned string or null if invalid.
 */
function sanitizePhoneNumber(raw) {
    if (typeof raw !== 'string') {
        return null;
    }
    const cleaned = raw.replace(/[^\d+]/g, '');
    if (cleaned.length < 7 || cleaned.length > 16) {
        return null;
    }

    return cleaned;
}

/**
 * ROUTES
 */

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'twilio-voice-server',
        activeCalls: activeCalls.size,
        uptime: process.uptime(),
        twilioConfigured: !!twilio,
        twilioClientConfigured: Boolean(ClientCapability && TWILIO_TWIML_APP_SID)
    });
});

// Generate a Twilio Client token for an interpreter browser/mobile session.
app.get('/api/voice/token/:identity', tokenLimiter, (req, res) => {
    const identity = (req.params.identity || '').trim();

    if (!identity || identity.length > 128) {
        return res.status(400).json({ error: 'Valid interpreter identity is required (max 128 chars)' });
    }

    if (!ClientCapability) {
        return res.status(500).json({ error: 'Twilio client token support is not configured' });
    }

    try {
        const capability = new ClientCapability({
            accountSid: TWILIO_ACCOUNT_SID,
            authToken: TWILIO_AUTH_TOKEN
        });

        capability.addScope(new ClientCapability.IncomingClientScope(identity));

        // Outgoing scope when a TwiML App SID is configured.
        if (TWILIO_TWIML_APP_SID && ClientCapability.OutgoingClientScope) {
            capability.addScope(new ClientCapability.OutgoingClientScope({
                applicationSid: TWILIO_TWIML_APP_SID
            }));
        }

        return res.json({
            identity,
            token: capability.toJwt()
        });
    } catch (error) {
        log(`Error generating Twilio client token: ${error.message}`);
        return res.status(500).json({
            error: 'Failed to generate Twilio client token',
            message: error.message
        });
    }
});

// Initiate outbound call
app.post('/api/voice/call', async (req, res) => {
    try {
        const { phoneNumber, interpreterId, sessionId } = req.body;

        if (!phoneNumber || !interpreterId) {
            return res.status(400).json({
                error: 'Missing required fields: phoneNumber, interpreterId'
            });
        }

        // Sanitize and validate phone number
        const finalNumber = sanitizePhoneNumber(phoneNumber);
        if (!finalNumber) {
            return res.status(400).json({
                error: 'Invalid phone number format'
            });
        }

        if (!twilio) {
            return res.status(500).json({
                error: 'Twilio not configured. Please set environment variables.'
            });
        }

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
            statusCallback: WEBHOOK_BASE_URL ? `${WEBHOOK_BASE_URL}/api/voice/webhook/${sessionId || ''}` : undefined,
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
            message: error.message
        });
    }
});

// Hangup call
app.post('/api/voice/hangup', async (req, res) => {
    try {
        const { callSid } = req.body;

        if (!callSid) {
            return res.status(400).json({
                error: 'Missing required field: callSid'
            });
        }

        if (!twilio) {
            return res.status(500).json({
                error: 'Twilio not configured'
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
            message: error.message
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
                error: 'Call not found'
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
            message: error.message
        });
    }
});

// Webhook endpoint for call status updates
app.post('/api/voice/webhook/:sessionId?', (req, res) => {
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
        message: error.message
    });
});

// Start server
app.listen(PORT, () => {
    console.log('Twilio Voice Server Started');
    console.log(`Server running on port ${PORT}`);
    console.log(`Base URL: http://localhost:${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(`Twilio configured for account: ${TWILIO_ACCOUNT_SID}`);
    console.log(`Using Twilio number: ${TWILIO_PHONE_NUMBER}`);
    if (WEBHOOK_BASE_URL) {
        console.log(`Webhook URL: ${WEBHOOK_BASE_URL}/api/voice/webhook`);
    }
    console.log('Ready to handle VRS calls for interpreters!');
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

    // First pass: remove old completed calls
    for (const [callSid, callData] of activeCalls) {
        if (callData.endTime && (now - callData.endTime.getTime()) > OLD_CALL_THRESHOLD) {
            activeCalls.delete(callSid);
            log(`Cleaned up old call: ${callSid}`);
        }
    }

    // Safety cap: if we still have too many entries, evict the oldest
    if (activeCalls.size > MAX_COMPLETED_CALLS) {
        const entries = Array.from(activeCalls.entries())
            .sort((a, b) => (a[1].endTime || a[1].startTime) - (b[1].endTime || b[1].startTime));
        const excess = entries.slice(0, entries.length - MAX_COMPLETED_CALLS);
        for (const [sid] of excess) {
            activeCalls.delete(sid);
            log(`Evicted call to stay under limit: ${sid}`);
        }
    }
}, 10 * 60 * 1000);
