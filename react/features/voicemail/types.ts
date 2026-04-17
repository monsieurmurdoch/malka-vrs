/**
 * Type definitions for the voicemail feature.
 */

export interface VoicemailMessage {
    id: string;
    caller_id: string;
    callee_id: string | null;
    callee_phone: string | null;
    room_name: string;
    recording_filename: string;
    storage_key: string;
    thumbnail_key: string | null;
    file_size_bytes: number | null;
    duration_seconds: number | null;
    content_type: string;
    status: 'recording' | 'available' | 'failed' | 'expired';
    seen: number;
    expires_at: string;
    created_at: string;
    // Joined fields
    caller_name?: string;
    caller_phone?: string;
    // Generated fields
    thumbnailUrl?: string;
    playbackUrl?: string;
    playbackUrlExpiresAt?: string;
}

export interface VoicemailPromptData {
    calleeName: string;
    calleePhone: string;
    calleeId: string;
}

export interface VoicemailRecordingSession {
    messageId: string;
    roomName: string;
    maxDurationSeconds: number;
}

export interface VoicemailState {
    // Inbox
    messages: VoicemailMessage[];
    totalCount: number;
    unreadCount: number;
    isLoading: boolean;

    // Current message being played
    currentMessage: VoicemailMessage | null;
    playbackUrl: string | null;
    isPlayerOpen: boolean;

    // Recording session
    isRecording: boolean;
    recordingSession: VoicemailRecordingSession | null;

    // Missed call → voicemail prompt
    isPromptVisible: boolean;
    promptData: VoicemailPromptData | null;

    // Error
    error: string | null;
}
