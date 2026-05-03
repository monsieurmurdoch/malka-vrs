/**
 * Shared types for the VRS/VRI mobile client.
 *
 * These types bridge the mobile screens with the shared
 * interpreter-queue, vrs-auth, and whitelabel subsystems.
 */

import type {
    CallRecord,
    Contact,
    UserInfo,
    Voicemail
} from '../../../contracts/types';
import type { QueueMatchPayload } from '../../../contracts/queue';

export type {
    CallRecord,
    Contact,
    UserInfo,
    Voicemail
} from '../../../contracts/types';

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

export type MatchData = QueueMatchPayload;

export interface QueueState {
    isConnected?: boolean;
    isRequestPending?: boolean;
    queuePosition?: number | null;
    matchData?: MatchData | null;
    error?: string | null;
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
