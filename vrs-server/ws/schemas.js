/**
 * Zod schemas for validating all WebSocket message payloads.
 *
 * Each key maps a `type` field value to the schema that the `data` field must satisfy.
 * The `validatePayload` helper from lib/validation.js is used at the top of each handler.
 */

const { z, nameSchema, phoneNumberSchema, languageSchema } = require('../lib/validation');

const authMessageSchema = z.object({
    role: z.enum(['client', 'interpreter', 'admin', 'captioner']),
    userId: z.string().min(1),
    name: z.string().max(100).optional(),
    token: z.string().optional()
});

const interpreterStatusSchema = z.object({
    status: z.enum(['online', 'offline', 'available', 'busy', 'inactive', 'active']).optional(),
    available: z.boolean().optional(),
    languages: z.array(languageSchema).optional()
}).refine(data => data.status !== undefined || data.available !== undefined, {
    message: 'Must provide status or available field'
});

const requestInterpreterSchema = z.object({
    clientName: z.string().max(100).optional(),
    language: languageSchema.optional().default('ASL'),
    targetPhone: phoneNumberSchema.optional(),
    roomName: z.string().max(100).optional()
});

const cancelRequestSchema = z.object({
    requestId: z.string().min(1)
});

const acceptRequestSchema = z.object({
    requestId: z.string().min(1)
});

const declineRequestSchema = z.object({
    requestId: z.string().min(1)
});

const sessionRegisterSchema = z.object({
    userId: z.string().min(1),
    roomName: z.string().min(1).max(100),
    deviceId: z.string().min(1).max(100)
});

const sessionUnregisterSchema = z.object({
    userId: z.string().min(1)
});

const handoffPrepareSchema = z.object({
    userId: z.string().min(1),
    targetDeviceId: z.string().min(1).max(100)
});

const handoffReadySchema = z.object({
    token: z.string().min(1),
    newDeviceId: z.string().min(1).max(100)
});

const handoffCompleteSchema = z.object({
    userId: z.string().min(1),
    interpreterId: z.string().optional()
});

const handoffCancelSchema = z.object({
    userId: z.string().min(1)
});

const p2pCallSchema = z.object({
    phoneNumber: phoneNumberSchema
});

const p2pAcceptSchema = z.object({
    callId: z.string().min(1),
    roomName: z.string().min(1),
    callerId: z.string().min(1)
});

const p2pDeclineSchema = z.object({
    callId: z.string().min(1),
    callerId: z.string().min(1)
});

const p2pCancelSchema = z.object({
    callId: z.string().min(1),
    calleeId: z.string().min(1)
});

const p2pEndSchema = z.object({
    callId: z.string().min(1),
    roomName: z.string().optional(),
    otherId: z.string().min(1),
    durationMinutes: z.number().nonnegative().optional()
});

const callEndSchema = z.object({
    callId: z.string().min(1),
    roomName: z.string().optional(),
    durationMinutes: z.number().nonnegative().optional()
});

const voicemailStartSchema = z.object({
    calleePhone: phoneNumberSchema.optional()
});

const voicemailMessageSchema = z.object({
    messageId: z.string().min(1)
});

const adminSubscribeSchema = z.object({}).passthrough();

// Call waiting schemas
const callWaitingAcceptSchema = z.object({
    incomingCallId: z.string().min(1),
    currentCallId: z.string().min(1),
    action: z.enum(['accept', 'reject', 'hold_and_accept'])
});

// Call transfer schemas
const callTransferSchema = z.object({
    callId: z.string().min(1),
    toPhoneNumber: phoneNumberSchema.optional(),
    toInterpreterId: z.string().min(1).optional(),
    transferType: z.enum(['blind', 'attended']).default('blind'),
    reason: z.string().max(500).optional()
}).refine(data => data.toPhoneNumber || data.toInterpreterId, {
    message: 'Must provide toPhoneNumber or toInterpreterId'
});

const callTransferAcceptSchema = z.object({
    transferId: z.string().min(1)
});

const callTransferCancelSchema = z.object({
    transferId: z.string().min(1)
});

// Conference schemas
const conferenceAddSchema = z.object({
    callId: z.string().min(1),
    phoneNumber: phoneNumberSchema.optional(),
    clientId: z.string().min(1).optional()
}).refine(data => data.phoneNumber || data.clientId, {
    message: 'Must provide phoneNumber or clientId'
});

const conferenceRemoveSchema = z.object({
    callId: z.string().min(1),
    participantId: z.string().min(1)
});

// In-call chat schemas
const chatSendMessageSchema = z.object({
    callId: z.string().min(1),
    message: z.string().min(1).max(2000)
});

const chatHistorySchema = z.object({
    callId: z.string().min(1),
    limit: z.number().min(1).max(500).optional().default(100),
    offset: z.number().nonnegative().optional().default(0)
});

// Client preferences schemas
const preferencesUpdateSchema = z.object({
    dnd_enabled: z.boolean().optional(),
    dnd_message: z.string().max(200).optional(),
    dark_mode: z.enum(['light', 'dark', 'system']).optional(),
    camera_default_off: z.boolean().optional(),
    mic_default_off: z.boolean().optional(),
    skip_waiting_room: z.boolean().optional(),
    remember_media_permissions: z.boolean().optional()
});

// Call hold schemas
const callHoldSchema = z.object({
    callId: z.string().min(1),
    onHold: z.boolean()
});

// TTS / VCO schemas
const vcoStartSchema = z.object({
    targetPhone: phoneNumberSchema.optional(),
    roomName: z.string().max(100).optional()
});

const vcoEndSchema = z.object({
    callId: z.string().min(1),
    roomName: z.string().optional(),
    durationMinutes: z.number().nonnegative().optional()
});

const ttsSpeakSchema = z.object({
    callId: z.string().min(1),
    text: z.string().min(1).max(1000),
    voiceSettings: z.object({
        voiceName: z.string().max(100).optional(),
        voiceGender: z.enum(['male', 'female']).optional(),
        voiceSpeed: z.number().min(0.5).max(2.0).optional(),
        voicePitch: z.number().min(0.5).max(2.0).optional()
    }).optional()
});

const ttsQuickSpeakSchema = z.object({
    callId: z.string().min(1),
    phraseId: z.string().min(1)
});

// Map message type → schema for the `data` payload
const messageSchemas = {
    auth: authMessageSchema,
    interpreter_status: interpreterStatusSchema,
    request_interpreter: requestInterpreterSchema,
    cancel_request: cancelRequestSchema,
    accept_request: acceptRequestSchema,
    decline_request: declineRequestSchema,
    session_register: sessionRegisterSchema,
    session_unregister: sessionUnregisterSchema,
    handoff_prepare: handoffPrepareSchema,
    handoff_ready: handoffReadySchema,
    handoff_complete: handoffCompleteSchema,
    handoff_cancel: handoffCancelSchema,
    p2p_call: p2pCallSchema,
    p2p_accept: p2pAcceptSchema,
    p2p_decline: p2pDeclineSchema,
    p2p_cancel: p2pCancelSchema,
    p2p_end: p2pEndSchema,
    call_end: callEndSchema,
    voicemail_start: voicemailStartSchema,
    voicemail_cancel: voicemailMessageSchema,
    voicemail_delete: voicemailMessageSchema,
    voicemail_mark_seen: voicemailMessageSchema,
    admin_subscribe: adminSubscribeSchema,
    // Call management & UX
    call_waiting_respond: callWaitingAcceptSchema,
    call_transfer: callTransferSchema,
    call_transfer_accept: callTransferAcceptSchema,
    call_transfer_cancel: callTransferCancelSchema,
    conference_add: conferenceAddSchema,
    conference_remove: conferenceRemoveSchema,
    chat_send: chatSendMessageSchema,
    chat_history: chatHistorySchema,
    preferences_update: preferencesUpdateSchema,
    call_hold: callHoldSchema,
    // TTS / VCO
    vco_start: vcoStartSchema,
    vco_end: vcoEndSchema,
    tts_speak: ttsSpeakSchema,
    tts_quick_speak: ttsQuickSpeakSchema
};

module.exports = { messageSchemas };
