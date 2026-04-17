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

const voicemailStartSchema = z.object({
    calleePhone: phoneNumberSchema.optional()
});

const voicemailMessageSchema = z.object({
    messageId: z.string().min(1)
});

const adminSubscribeSchema = z.object({}).passthrough();

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
    voicemail_start: voicemailStartSchema,
    voicemail_cancel: voicemailMessageSchema,
    voicemail_delete: voicemailMessageSchema,
    voicemail_mark_seen: voicemailMessageSchema,
    admin_subscribe: adminSubscribeSchema
};

module.exports = { messageSchemas };
