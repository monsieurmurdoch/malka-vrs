import { z } from 'zod';

const looseEventSchema = z.unknown();

export const queueMessageSchema = z.object({
    clientId: z.string().optional(),
    data: z.unknown().optional(),
    name: z.string().optional(),
    role: z.string().optional(),
    token: z.string().optional(),
    type: z.string(),
    userId: z.string().optional()
}).passthrough();

export const interpreterInfoSchema = z.object({
    id: z.string(),
    languages: z.array(z.string()),
    name: z.string(),
    status: z.enum([ 'active', 'busy', 'inactive' ])
}).passthrough();

export const requestInfoSchema = z.object({
    clientName: z.string(),
    id: z.string(),
    language: z.string(),
    position: z.number().optional(),
    roomName: z.string().optional(),
    timestamp: z.number().optional()
}).passthrough();

export const queueMatchPayloadSchema = z.object({
    callId: z.string().optional(),
    clientId: z.string().optional(),
    clientName: z.string().optional(),
    interpreterId: z.string().optional(),
    interpreterName: z.string().optional(),
    language: z.string().optional(),
    requestId: z.string().optional(),
    roomName: z.string().optional()
}).passthrough();

export const interpreterRequestPayloadSchema = z.object({
    clientName: z.string(),
    id: z.string(),
    language: z.string(),
    roomName: z.string().optional(),
    timestamp: z.number().optional()
}).passthrough();

export const queueErrorPayloadSchema = z.object({
    code: z.string().optional(),
    message: z.string().optional(),
    retrying: z.boolean().optional()
}).passthrough();

export const vriInvitePreparedPayloadSchema = z.object({
    inviteUrl: z.string().optional(),
    token: z.string().optional()
}).passthrough();

export const voicemailEventPayloadSchema = z.object({
    calleeId: z.string().optional(),
    calleeName: z.string().optional(),
    calleePhone: z.string().optional(),
    count: z.number().optional(),
    durationSeconds: z.number().optional(),
    maxDurationSeconds: z.number().optional(),
    message: z.string().optional(),
    messageId: z.string().optional(),
    roomName: z.string().optional(),
    voicemailAvailable: z.boolean().optional()
}).passthrough();

export const queueStatusSchema = z.object({
    activeInterpreters: z.array(interpreterInfoSchema),
    paused: z.boolean().optional(),
    pendingRequests: z.array(requestInfoSchema),
    totalMatches: z.number()
}).passthrough();

const p2pFailureSchema = z.object({
    message: z.string().optional()
}).passthrough();

const p2pTargetSchema = z.object({
    calleeName: z.string().optional()
}).passthrough();

export const queueEventSchemas = {
    authenticated: z.object({ clientId: z.string().optional(), role: z.string().optional() }).passthrough(),
    callHoldUpdated: looseEventSchema,
    callOffHold: looseEventSchema,
    callOnHold: looseEventSchema,
    callTransferAccepted: looseEventSchema,
    callTransferCancelled: looseEventSchema,
    callTransferInitiated: looseEventSchema,
    callTransferPending: looseEventSchema,
    callWaitingIncoming: looseEventSchema,
    callWaitingResponded: looseEventSchema,
    chatHistory: looseEventSchema,
    chatMessage: looseEventSchema,
    chatMessageSent: looseEventSchema,
    conferenceAddOffline: looseEventSchema,
    conferenceAddRinging: looseEventSchema,
    conferenceInvite: looseEventSchema,
    conferenceParticipantRemoved: looseEventSchema,
    conferenceRemoved: looseEventSchema,
    connection: z.object({
        connected: z.boolean(),
        maxAttemptsReached: z.boolean().optional(),
        message: z.string().optional()
    }).passthrough(),
    contactsChanged: looseEventSchema,
    error: queueErrorPayloadSchema,
    handoff_complete: looseEventSchema,
    handoff_consumed: looseEventSchema,
    handoff_error: looseEventSchema,
    handoff_executed: looseEventSchema,
    handoff_in_progress: looseEventSchema,
    handoff_prepared: looseEventSchema,
    interpreterRequest: interpreterRequestPayloadSchema,
    matchFound: queueMatchPayloadSchema,
    meetingInitiated: queueMatchPayloadSchema,
    p2pCallFailed: p2pFailureSchema,
    p2pRinging: queueMatchPayloadSchema.extend({ calleeName: z.string().optional() }).passthrough(),
    p2pTargetDnd: p2pTargetSchema,
    p2pTargetOffline: p2pTargetSchema,
    p2p_target_offline: p2pTargetSchema,
    preferencesUpdated: looseEventSchema,
    queueStatus: queueStatusSchema,
    requestAccepted: queueMatchPayloadSchema,
    requestAssigned: queueMatchPayloadSchema,
    requestCancelled: z.object({ requestId: z.string().optional() }).passthrough(),
    requestDeclined: queueMatchPayloadSchema,
    requestQueued: z.object({ position: z.number().optional(), requestId: z.string().optional() }).passthrough(),
    session_registered: looseEventSchema,
    session_unregistered: looseEventSchema,
    voicemail_error: voicemailEventPayloadSchema,
    voicemail_message_deleted: voicemailEventPayloadSchema,
    voicemail_new_message: voicemailEventPayloadSchema,
    voicemail_recording_cancelled: voicemailEventPayloadSchema,
    voicemail_recording_complete: voicemailEventPayloadSchema,
    voicemail_recording_started: voicemailEventPayloadSchema,
    voicemail_unread_count: voicemailEventPayloadSchema,
    vriInvitePrepared: vriInvitePreparedPayloadSchema
} as const;

export const queueSequenceContracts = {
    requestInterpreter: [
        'connection',
        'requestQueued',
        'interpreterRequest',
        'requestAccepted',
        'matchFound',
        'meetingInitiated'
    ],
    interpreterAvailability: [
        'connection',
        'authenticated',
        'queueStatus'
    ],
    vriInvitePreparation: [
        'connection',
        'vriInvitePrepared'
    ]
} as const satisfies Record<string, ReadonlyArray<keyof typeof queueEventSchemas>>;

export const queueEventNames = Object.keys(queueEventSchemas) as Array<keyof typeof queueEventSchemas>;

export type QueueMessage = z.infer<typeof queueMessageSchema>;
export type InterpreterInfo = z.infer<typeof interpreterInfoSchema>;
export type RequestInfo = z.infer<typeof requestInfoSchema>;
export type QueueMatchPayload = z.infer<typeof queueMatchPayloadSchema>;
export type InterpreterRequestPayload = z.infer<typeof interpreterRequestPayloadSchema>;
export type QueueErrorPayload = z.infer<typeof queueErrorPayloadSchema>;
export type VriInvitePreparedPayload = z.infer<typeof vriInvitePreparedPayloadSchema>;
export type VoicemailEventPayload = z.infer<typeof voicemailEventPayloadSchema>;
export type QueueStatus = z.infer<typeof queueStatusSchema>;

export type QueueEventMap = {
    [K in keyof typeof queueEventSchemas]: z.infer<(typeof queueEventSchemas)[K]>;
};
