import { z } from 'zod';

import manifest from './api-manifest.json';

export const apiErrorSchema = z.object({
    code: z.string().optional(),
    details: z.unknown().optional(),
    error: z.string()
}).passthrough();

export const userInfoSchema = z.object({
    authenticatedAt: z.number().optional(),
    corporateAccountId: z.string().optional(),
    email: z.string().optional(),
    expiresAt: z.number().optional(),
    id: z.string().optional(),
    isAuthenticated: z.boolean().optional(),
    name: z.string().optional(),
    organization: z.string().optional(),
    organizationId: z.string().optional(),
    phoneNumber: z.string().optional(),
    primaryPhone: z.string().optional(),
    role: z.string().optional(),
    serviceModes: z.array(z.string()).optional(),
    tenantId: z.string().optional()
}).passthrough();

export const authLoginResponseSchema = z.object({
    token: z.string(),
    user: userInfoSchema.optional()
}).passthrough();

export const authRefreshResponseSchema = z.object({
    token: z.string()
}).passthrough();

export const contactSchema = z.object({
    email: z.string().optional(),
    id: z.string(),
    isFavorite: z.boolean().optional(),
    lastCalled: z.string().optional(),
    name: z.string(),
    notes: z.string().optional(),
    phoneNumber: z.string().optional()
}).passthrough();

export const contactsListResponseSchema = z.union([
    z.array(contactSchema),
    z.object({
        contacts: z.array(contactSchema)
    }).passthrough()
]);

export const callRecordSchema = z.object({
    contactName: z.string(),
    direction: z.enum([ 'outgoing', 'incoming', 'missed' ]),
    duration: z.number(),
    id: z.string(),
    interpreterName: z.string().optional(),
    phoneNumber: z.string(),
    timestamp: z.string()
}).passthrough();

export const callHistoryResponseSchema = z.union([
    z.array(callRecordSchema),
    z.object({
        calls: z.array(callRecordSchema)
    }).passthrough()
]);

export const voicemailSchema = z.object({
    duration: z.number(),
    fromName: z.string(),
    fromPhone: z.string().optional(),
    id: z.string(),
    isRead: z.boolean(),
    playbackUrl: z.string().optional(),
    thumbnailUrl: z.string().optional(),
    timestamp: z.string(),
    transcript: z.string().optional()
}).passthrough();

export const voicemailInboxResponseSchema = z.union([
    z.array(voicemailSchema),
    z.object({
        messages: z.array(voicemailSchema).optional(),
        voicemails: z.array(voicemailSchema).optional()
    }).passthrough()
]);

export const voicemailUnreadCountResponseSchema = z.object({
    count: z.number()
}).passthrough();

export const billingUsageSummarySchema = z.object({
    currency: z.string().optional(),
    day: z.unknown().optional(),
    month: z.unknown().optional(),
    totalMinutes: z.number().optional(),
    totalUsd: z.number().optional(),
    week: z.unknown().optional()
}).passthrough();

export const apiContractSchemas = {
    authLoginResponse: authLoginResponseSchema,
    authRefreshResponse: authRefreshResponseSchema,
    billingUsageSummary: billingUsageSummarySchema,
    callHistoryResponse: callHistoryResponseSchema,
    contactsListResponse: contactsListResponseSchema,
    userInfo: userInfoSchema,
    voicemailInboxResponse: voicemailInboxResponseSchema,
    voicemailUnreadCountResponse: voicemailUnreadCountResponseSchema
} as const;

export type ApiContractSchemaKey = keyof typeof apiContractSchemas;

export interface ApiContractEntry {
    method: string;
    path: string;
    schema: ApiContractSchemaKey;
}

export interface SmokeCheckEntry {
    base: 'queue' | 'ops' | 'twilio';
    label: string;
    path: string;
}

export const liveSmokeChecks = manifest.liveChecks as SmokeCheckEntry[];
export const adminSmokeChecks = manifest.adminChecks as SmokeCheckEntry[];
export const apiContractEntries = manifest.apiContracts as ApiContractEntry[];

function stripQuery(path: string) {
    return path.split('?')[0];
}

export function getApiResponseSchema(method: string, path: string) {
    const normalizedMethod = method.toUpperCase();
    const normalizedPath = stripQuery(path);
    const contract = apiContractEntries.find(entry =>
        entry.method.toUpperCase() === normalizedMethod && stripQuery(entry.path) === normalizedPath);

    return contract ? apiContractSchemas[contract.schema] : null;
}

export type AuthLoginResponse = z.infer<typeof authLoginResponseSchema>;
