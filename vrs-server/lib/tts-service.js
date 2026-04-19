/**
 * TTS (Text-to-Speech) Service
 *
 * Manages TTS fallback functionality for VCO (Voice Carry Over) calls.
 * Provides text-to-speech synthesis that reads typed messages aloud to
 * hearing parties, with configurable voice settings and quick phrases.
 *
 * The actual audio synthesis happens client-side via the Web Speech API.
 * This service manages:
 *   - Voice configuration storage/retrieval
 *   - Quick phrase CRUD
 *   - In-call TTS message relay via WebSocket
 *   - STS (Speech-to-Speech) mode coordination
 */

const db = require('../database');
const activityLogger = require('./activity-logger');
const log = require('./logger').module('tts');

// Default TTS voice configuration
const DEFAULT_VOICE_SETTINGS = {
    voiceName: '',
    voiceGender: 'female',
    voiceSpeed: 1.0,
    voicePitch: 1.0,
    stsMode: false
};

// Default quick phrases seeded for new clients
const DEFAULT_QUICK_PHRASES = [
    { text: 'Hold please', label: 'Hold' },
    { text: 'Let me transfer you', label: 'Transfer' },
    { text: 'Can you repeat that?', label: 'Repeat' },
    { text: 'One moment please', label: 'Wait' },
    { text: 'Thank you, goodbye', label: 'Goodbye' },
    { text: 'I am deaf and using text-to-speech', label: 'Intro' },
    { text: 'Please speak slowly', label: 'Slow' },
    { text: 'Yes', label: 'Yes' },
    { text: 'No', label: 'No' }
];

// Active TTS sessions: callId -> { clientId, roomName, targetPhone, callSid, startTime }
const activeSessions = new Map();

// ============================================
// TTS SETTINGS
// ============================================

/**
 * Get TTS voice settings for a client. Returns defaults if none stored.
 */
async function getSettings(clientId) {
    try {
        const row = await db.getTtsSettings(clientId);
        return {
            voiceName: row.voice_name || DEFAULT_VOICE_SETTINGS.voiceName,
            voiceGender: row.voice_gender || DEFAULT_VOICE_SETTINGS.voiceGender,
            voiceSpeed: Number(row.voice_speed) || DEFAULT_VOICE_SETTINGS.voiceSpeed,
            voicePitch: Number(row.voice_pitch) || DEFAULT_VOICE_SETTINGS.voicePitch,
            stsMode: !!row.sts_mode
        };
    } catch (error) {
        log.error({ err: error, clientId }, 'Failed to get TTS settings');
        return { ...DEFAULT_VOICE_SETTINGS };
    }
}

/**
 * Update TTS voice settings for a client.
 */
async function updateSettings(clientId, settings) {
    const mapped = {};
    if (settings.voiceName !== undefined) mapped.voice_name = settings.voiceName;
    if (settings.voiceGender !== undefined) mapped.voice_gender = settings.voiceGender;
    if (settings.voiceSpeed !== undefined) mapped.voice_speed = settings.voiceSpeed;
    if (settings.voicePitch !== undefined) mapped.voice_pitch = settings.voicePitch;
    if (settings.stsMode !== undefined) mapped.sts_mode = settings.stsMode;

    await db.updateTtsSettings(clientId, mapped);
    log.info({ clientId }, 'TTS settings updated');
}

// ============================================
// QUICK PHRASES
// ============================================

/**
 * Get all quick phrases for a client.
 */
async function getQuickPhrases(clientId) {
    return await db.getQuickPhrases(clientId);
}

/**
 * Add a new quick phrase.
 */
async function addQuickPhrase(clientId, { text, label, sortOrder }) {
    const result = await db.addQuickPhrase({
        clientId,
        text,
        label: label || text.substring(0, 20),
        sortOrder: sortOrder || 0
    });
    log.info({ clientId, phraseId: result.id }, 'Quick phrase added');
    return result;
}

/**
 * Update an existing quick phrase.
 */
async function updateQuickPhrase(clientId, phraseId, updates) {
    const result = await db.updateQuickPhrase(phraseId, clientId, updates);
    return result;
}

/**
 * Delete a quick phrase.
 */
async function deleteQuickPhrase(clientId, phraseId) {
    return await db.deleteQuickPhrase(phraseId, clientId);
}

/**
 * Seed default quick phrases for a new client.
 */
async function seedDefaultPhrases(clientId) {
    for (let i = 0; i < DEFAULT_QUICK_PHRASES.length; i++) {
        const phrase = DEFAULT_QUICK_PHRASES[i];
        try {
            await db.addQuickPhrase({
                clientId,
                text: phrase.text,
                label: phrase.label,
                sortOrder: i
            });
        } catch (err) {
            // Ignore duplicates
        }
    }
    log.info({ clientId, count: DEFAULT_QUICK_PHRASES.length }, 'Default quick phrases seeded');
}

// ============================================
// TTS SESSION MANAGEMENT
// ============================================

/**
 * Start a TTS session for a VCO call.
 */
function startSession(callId, clientId, roomName, targetPhone = null) {
    activeSessions.set(callId, {
        clientId,
        roomName,
        targetPhone,
        callSid: null,
        startTime: new Date()
    });
    log.info({ callId, clientId, roomName, targetPhone }, 'TTS session started');
}

/**
 * End a TTS session.
 */
function endSession(callId) {
    activeSessions.delete(callId);
    log.info({ callId }, 'TTS session ended');
}

/**
 * Get active TTS session by call ID.
 */
function getSession(callId) {
    return activeSessions.get(callId) || null;
}

/**
 * Get all active TTS sessions for a client.
 */
function getSessionsForClient(clientId) {
    const sessions = [];
    for (const [callId, session] of activeSessions) {
        if (session.clientId === clientId) {
            sessions.push({ callId, ...session });
        }
    }
    return sessions;
}

/**
 * Attach an outbound Twilio call SID to an active TTS session.
 */
function attachCallSid(callId, callSid) {
    const session = activeSessions.get(callId);
    if (!session) {
        return false;
    }

    session.callSid = callSid;
    activeSessions.set(callId, session);
    log.info({ callId, callSid }, 'Attached outbound call SID to TTS session');

    return true;
}

// ============================================
// EXPORT
// ============================================

module.exports = {
    getSettings,
    updateSettings,
    getQuickPhrases,
    addQuickPhrase,
    updateQuickPhrase,
    deleteQuickPhrase,
    seedDefaultPhrases,
    startSession,
    endSession,
    getSession,
    getSessionsForClient,
    attachCallSid
};
