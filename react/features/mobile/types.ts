/**
 * Shared types for the VRS/VRI mobile client.
 *
 * These types bridge the mobile screens with the shared
 * interpreter-queue, vrs-auth, and whitelabel subsystems.
 */

// ---------------------------------------------------------------------------
// Auth & User
// ---------------------------------------------------------------------------

export interface UserInfo {
    id: string;
    name?: string;
    email?: string;
    role?: string;
    phoneNumber?: string;
    organization?: string;
    tenantId?: string;
    serviceModes?: string[];
    isAuthenticated?: boolean;
    authenticatedAt?: number;
    expiresAt?: number;
}

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

export interface MatchData {
    callId?: string;
    roomName?: string;
    requestId?: string;
    interpreterName?: string;
    interpreterId?: string;
    clientName?: string;
    language?: string;
}

export interface QueueState {
    isConnected?: boolean;
    isRequestPending?: boolean;
    queuePosition?: number | null;
    matchData?: MatchData | null;
    error?: string | null;
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export interface Contact {
    id: string;
    name: string;
    phoneNumber?: string;
    email?: string;
    lastCalled?: string;
    notes?: string;
}

// ---------------------------------------------------------------------------
// Call History
// ---------------------------------------------------------------------------

export interface CallRecord {
    id: string;
    contactName: string;
    phoneNumber: string;
    direction: 'outgoing' | 'incoming' | 'missed';
    duration: number;
    timestamp: string;
    interpreterName?: string;
}

// ---------------------------------------------------------------------------
// Active Call
// ---------------------------------------------------------------------------

export interface StoredActiveCall {
    callId?: string;
    roomName?: string;
    requestId?: string;
    interpreterName?: string;
    interpreterId?: string;
    clientName?: string;
    language?: string;
    startedAt?: number;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export interface MediaDefaults {
    cameraOn: boolean;
    micMuted: boolean;
    autoJoinOnMatch: boolean;
    notificationsEnabled: boolean;
}
