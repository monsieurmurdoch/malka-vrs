#!/usr/bin/env node

/**
 * Twilio Voice Server for VRS (Video Relay Service) calls
 * Handles outbound calling for interpreters in Malka Meet
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

// Initialize Express app
const app = express();
const PORT = process.env.TWILIO_PORT || 3002;

// Middleware
app.use(cors({
    origin: ['https://127.0.0.1:8080', 'http://localhost:8080'],
    credentials: true
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Twilio configuration - YOU NEED TO SET THESE ENVIRONMENT VARIABLES
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || 'YOUR_ACCOUNT_SID';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || 'YOUR_AUTH_TOKEN';
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER || 'YOUR_TWILIO_NUMBER';

// Your webhook URL for call status updates
const WEBHOOK_BASE_URL = process.env.WEBHOOK_BASE_URL || 'https://your-domain.com';

// Initialize Twilio client
let twilio;
try {
    twilio = require('twilio')(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
} catch (error) {
    console.error('⚠️  Twilio initialization failed. Please install: npm install twilio');
    console.error('⚠️  And set your environment variables.');
}

// In-memory call storage (in production, use Redis or database)
const activeCalls = new Map();

/**
 * Utility functions
 */
function log(message) {
    console.log(`[${new Date().toISOString()}] ${message}`);
}

function generateCallId() {
    const crypto = require('crypto');
    return `vrs_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
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
        twilioConfigured: !!twilio && TWILIO_ACCOUNT_SID !== 'YOUR_ACCOUNT_SID'
    });
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

        if (!twilio) {
            return res.status(500).json({
                error: 'Twilio not configured. Please set environment variables.'
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
        message: error.message
    });
});

// Start server
app.listen(PORT, () => {
    console.log('🎯 Twilio Voice Server Started');
    console.log(`📞 Server running on port ${PORT}`);
    console.log(`🌐 Base URL: http://localhost:${PORT}`);
    console.log(`💾 Health check: http://localhost:${PORT}/health`);
    
    if (TWILIO_ACCOUNT_SID === 'YOUR_ACCOUNT_SID') {
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