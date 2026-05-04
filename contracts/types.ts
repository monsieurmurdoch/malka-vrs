export interface ApiResponse<T> {
    data: T | null;
    error: string | null;
    status: number;
}

export interface UserInfo {
    authenticatedAt?: number;
    corporateAccountId?: string;
    email?: string;
    expiresAt?: number;
    id?: string;
    isAuthenticated?: boolean;
    name?: string;
    organization?: string;
    organizationId?: string;
    phoneNumber?: string;
    primaryPhone?: string;
    role?: string;
    serviceModes?: string[];
    tenantId?: string;
}

export interface Contact {
    handle?: string;
    email?: string;
    id: string;
    isFavorite?: boolean;
    lastCalled?: string;
    name: string;
    notes?: string;
    phoneNumber?: string;
}

export interface CallRecord {
    contactName: string;
    direction: 'outgoing' | 'incoming' | 'missed';
    duration: number;
    id: string;
    interpreterName?: string;
    phoneNumber: string;
    timestamp: string;
}

export interface Voicemail {
    duration: number;
    fromName: string;
    fromPhone?: string;
    id: string;
    isRead: boolean;
    playbackUrl?: string;
    thumbnailUrl?: string;
    timestamp: string;
    transcript?: string;
}
