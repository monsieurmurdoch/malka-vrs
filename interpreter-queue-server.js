#!/usr/bin/env node

/**
 * Simple WebSocket server for interpreter queue management
 * Runs alongside webpack dev server to handle real-time interpreter-client matching
 */

const WebSocket = require('ws');
const http = require('http');
const url = require('url');

// In-memory state
const state = {
    interpreters: new Map(), // id -> { id, name, status, languages, ws, lastActive }
    requests: new Map(),     // id -> { id, clientId, language, timestamp, ws }
    matches: new Map()       // requestId -> interpreterId
};

// Create HTTP server
const server = http.createServer();
const wss = new WebSocket.Server({ server });

// Helper functions
function generateId() {
    return Math.random().toString(36).substr(2, 9);
}

function log(message) {
    console.log(`[${new Date().toISOString()}] ${message}`);
}

function broadcast(message, excludeWs = null) {
    const data = JSON.stringify(message);
    wss.clients.forEach(client => {
        if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
}

function sendToClient(ws, message) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
    }
}

function findAvailableInterpreter(language = 'any') {
    for (const [id, interpreter] of state.interpreters) {
        if (interpreter.status === 'active' && 
            (language === 'any' || interpreter.languages.includes(language))) {
            return interpreter;
        }
    }
    return null;
}

function matchRequest(requestId) {
    const request = state.requests.get(requestId);
    if (!request) return false;

    const interpreter = findAvailableInterpreter(request.language);
    if (!interpreter) return false;

    // Don't create match or room until interpreter accepts
    
    // Send popup notification to interpreter instead of auto-matching
    sendToClient(interpreter.ws, {
        type: 'interpreter_request',
        data: {
            requestId: request.id,
            clientName: request.clientName,
            language: request.language,
            timestamp: request.timestamp
        }
    });
    
    log(`Sent interpreter request popup to ${interpreter.id} for request ${requestId}`);
    broadcastQueueStatus();
    return true;
}

function broadcastQueueStatus() {
    const status = {
        type: 'queue_status',
        data: {
            activeInterpreters: Array.from(state.interpreters.values()).map(i => ({
                id: i.id,
                name: i.name,
                status: i.status,
                languages: i.languages
            })),
            pendingRequests: Array.from(state.requests.values()).map(r => ({
                id: r.id,
                language: r.language,
                timestamp: r.timestamp
            })),
            totalMatches: state.matches.size
        }
    };
    broadcast(status);
}

function removeInterpreter(interpreterId) {
    const interpreter = state.interpreters.get(interpreterId);
    if (!interpreter) return;
    
    state.interpreters.delete(interpreterId);
    log(`Removed interpreter ${interpreterId}`);
    
    // Find any assigned requests and put them back in queue
    for (const [requestId, assignedInterpreterId] of state.matches) {
        if (assignedInterpreterId === interpreterId) {
            state.matches.delete(requestId);
            // Could re-queue the request here if needed
        }
    }
    
    broadcastQueueStatus();
}

function removeRequest(requestId) {
    if (state.requests.delete(requestId)) {
        log(`Removed request ${requestId}`);
        broadcastQueueStatus();
    }
}

// WebSocket connection handling
wss.on('connection', (ws, req) => {
    const query = url.parse(req.url, true).query;
    const userRole = query.role || 'unknown';
    const userId = generateId();
    
    log(`New connection: ${userId} (${userRole})`);
    
    // Send initial queue status
    sendToClient(ws, {
        type: 'connected',
        data: { userId, role: userRole }
    });
    
    // Send current queue status
    broadcastQueueStatus();
    
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            handleMessage(ws, userId, userRole, message);
        } catch (error) {
            log(`Error parsing message from ${userId}: ${error.message}`);
            sendToClient(ws, {
                type: 'error',
                data: { message: 'Invalid message format' }
            });
        }
    });
    
    ws.on('close', () => {
        log(`Connection closed: ${userId} (${userRole})`);
        
        // Clean up interpreter or request
        if (userRole === 'interpreter') {
            removeInterpreter(userId);
        } else if (userRole === 'client') {
            removeRequest(userId);
        }
    });
    
    ws.on('error', (error) => {
        log(`WebSocket error for ${userId}: ${error.message}`);
    });
});

function handleMessage(ws, userId, userRole, message) {
    const { type, data } = message;
    
    switch (type) {
        case 'interpreter_status_update':
            if (userRole === 'interpreter') {
                const { status, name, languages = ['en'] } = data;
                
                if (status === 'active') {
                    state.interpreters.set(userId, {
                        id: userId,
                        name: name || `Interpreter ${userId.substr(0, 4)}`,
                        status: 'active',
                        languages,
                        ws,
                        lastActive: Date.now()
                    });
                    log(`Interpreter ${userId} went active`);
                } else if (status === 'inactive') {
                    removeInterpreter(userId);
                }
                
                broadcastQueueStatus();
                
                // Try to match any pending requests
                for (const requestId of state.requests.keys()) {
                    if (matchRequest(requestId)) break;
                }
            }
            break;
            
        case 'request_interpreter':
            if (userRole === 'client') {
                const { language = 'any', clientName } = data;
                const requestId = generateId();
                
                state.requests.set(requestId, {
                    id: requestId,
                    clientId: userId,
                    clientName: clientName || `Client ${userId.substr(0, 4)}`,
                    language,
                    timestamp: Date.now(),
                    ws
                });
                
                log(`Client ${userId} requested interpreter (${language})`);
                
                // Try immediate match
                if (!matchRequest(requestId)) {
                    sendToClient(ws, {
                        type: 'request_queued',
                        data: { requestId, position: state.requests.size }
                    });
                    broadcastQueueStatus();
                }
            }
            break;
            
        case 'cancel_request':
            if (userRole === 'client') {
                removeRequest(userId);
                sendToClient(ws, {
                    type: 'request_cancelled',
                    data: { userId }
                });
            }
            break;
            
        case 'accept_request':
            if (userRole === 'interpreter') {
                const { requestId, roomName } = data;
                const request = state.requests.get(requestId);
                if (request) {
                    log(`Interpreter ${userId} accepted request ${requestId}`);
                    
                    // Notify the client
                    sendToClient(request.ws, {
                        type: 'request_accepted',
                        data: { requestId, roomName, interpreterId: userId }
                    });
                    
                    // Initiate meeting for both parties
                    sendToClient(request.ws, {
                        type: 'meeting_initiated',
                        data: { roomName, role: 'client' }
                    });
                    
                    sendToClient(ws, {
                        type: 'meeting_initiated', 
                        data: { roomName, role: 'interpreter' }
                    });
                    
                    // Clean up
                    state.requests.delete(requestId);
                    updateQueueStatus();
                }
            }
            break;
            
        case 'decline_request':
            if (userRole === 'interpreter') {
                const { requestId } = data;
                const request = state.requests.get(requestId);
                if (request) {
                    log(`Interpreter ${userId} declined request ${requestId}`);
                    
                    // Try to find another interpreter
                    const nextInterpreter = findAvailableInterpreter(request.language);
                    if (nextInterpreter) {
                        sendToClient(nextInterpreter.ws, {
                            type: 'interpreter_request',
                            data: {
                                requestId: request.id,
                                clientName: request.clientName,
                                language: request.language,
                                timestamp: request.timestamp
                            }
                        });
                    } else {
                        // No more interpreters available
                        sendToClient(request.ws, {
                            type: 'request_declined',
                            data: { requestId, reason: 'no_available_interpreters' }
                        });
                    }
                }
            }
            break;

        case 'ping':
            sendToClient(ws, { type: 'pong', data: { timestamp: Date.now() } });
            break;
            
        default:
            log(`Unknown message type: ${type} from ${userId}`);
            sendToClient(ws, {
                type: 'error',
                data: { message: `Unknown message type: ${type}` }
            });
    }
}

// Health check endpoint
server.on('request', (req, res) => {
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'healthy',
            interpreters: state.interpreters.size,
            requests: state.requests.size,
            matches: state.matches.size,
            uptime: process.uptime()
        }));
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

// Start server
const PORT = process.env.QUEUE_PORT || 3001;
server.listen(PORT, () => {
    console.log('🚀 Interpreter Queue Server started');
    console.log(`📡 WebSocket server: ws://localhost:${PORT}`);
    console.log(`🏥 Health check: http://localhost:${PORT}/health`);
    console.log('📊 Ready to handle interpreter-client matching!');
});

// Graceful shutdown
process.on('SIGTERM', () => {
    log('Received SIGTERM, shutting down gracefully');
    server.close(() => {
        log('Server closed');
        process.exit(0);
    });
});

// Periodic cleanup (remove stale connections)
setInterval(() => {
    const now = Date.now();
    const STALE_TIMEOUT = 5 * 60 * 1000; // 5 minutes
    
    for (const [id, interpreter] of state.interpreters) {
        if (now - interpreter.lastActive > STALE_TIMEOUT) {
            log(`Removing stale interpreter: ${id}`);
            removeInterpreter(id);
        }
    }
}, 60000); // Check every minute