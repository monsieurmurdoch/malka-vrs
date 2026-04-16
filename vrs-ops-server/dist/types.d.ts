/**
 * VRS Ops Server Types
 */
export type VRSRole = 'client' | 'interpreter' | 'captioner' | 'admin' | 'superadmin';
export type CallStatus = 'waiting' | 'connecting' | 'active' | 'on_hold' | 'ended' | 'abandoned' | 'failed';
export type InterpreterStatus = 'offline' | 'available' | 'busy' | 'break' | 'away';
export interface User {
    id: string;
    email: string;
    name: string;
    role: VRSRole;
    languages: string[];
    createdAt: Date;
    lastLogin?: Date;
}
export interface Interpreter extends User {
    role: 'interpreter';
    status: InterpreterStatus;
    currentCallId?: string;
    totalCallsToday: number;
    totalMinutesToday: number;
    averageCallDuration?: number;
    rating?: number;
}
export interface Client extends User {
    role: 'client';
}
export interface CallSession {
    id: string;
    roomId: string;
    clientId: string;
    clientName: string;
    interpreterId?: string;
    interpreterName?: string;
    hearingPartyPhone?: string;
    requestedAt: Date;
    matchedAt?: Date;
    startedAt?: Date;
    endedAt?: Date;
    status: CallStatus;
    language: string;
    waitTime?: number;
    duration?: number;
    qualityMetrics?: CallQualityMetrics;
    recordingUrl?: string;
    recordingId?: string;
    notes?: string;
    tags?: string[];
}
export interface CallQualityMetrics {
    averageBitrate?: number;
    packetLoss?: number;
    jitter?: number;
    latency?: number;
    frameRate?: number;
    resolution?: string;
}
export interface QueueStats {
    pendingRequests: number;
    activeInterpreters: number;
    availableInterpreters: number;
    averageWaitTime: number;
    longestWaitTime: number;
}
export interface DailyStats {
    date: string;
    totalCalls: number;
    completedCalls: number;
    abandonedCalls: number;
    averageWaitTime: number;
    averageCallDuration: number;
    peakHour: number;
    interpreterMinutes: number;
}
export interface AuthToken {
    userId: string;
    role: VRSRole;
    name: string;
    email: string;
    username?: string;
    languages?: string[];
    iat: number;
    exp: number;
}
export interface OpsEvent {
    type: 'call_started' | 'call_ended' | 'interpreter_online' | 'interpreter_offline' | 'queue_update';
    timestamp: Date;
    data: any;
}
//# sourceMappingURL=types.d.ts.map