/**
 * Activity Logger
 *
 * Logs all system activity for:
 * - Admin dashboard activity feed
 * - Audit trail
 * - Analytics and reporting
 */

import * as db from '../database';

// Activity types
const ActivityTypes = {
    // Auth
    ADMIN_LOGIN: 'admin_login',
    ADMIN_LOGOUT: 'admin_logout',

    // Interpreters
    INTERPRETER_CREATED: 'interpreter_created',
    INTERPRETER_UPDATED: 'interpreter_updated',
    INTERPRETER_DELETED: 'interpreter_deleted',
    INTERPRETER_ONLINE: 'interpreter_online',
    INTERPRETER_OFFLINE: 'interpreter_offline',
    INTERPRETER_STATUS_CHANGE: 'interpreter_status_change',

    // Clients
    CLIENT_CONNECTED: 'client_connected',
    CLIENT_DISCONNECTED: 'client_disconnected',
    CLIENT_CREATED: 'client_created',
    CLIENT_REGISTERED: 'client_registered',

    // Queue
    QUEUE_REQUEST_ADDED: 'queue_request_added',
    QUEUE_REQUEST_CANCELLED: 'queue_request_cancelled',
    QUEUE_MATCH_COMPLETE: 'queue_match_complete',
    QUEUE_PAUSED: 'queue_paused',
    QUEUE_RESUMED: 'queue_resumed',
    QUEUE_MANUAL_ASSIGN: 'queue_manual_assign',
    QUEUE_REQUEST_REMOVED: 'queue_request_removed',

    // Calls
    CALL_STARTED: 'call_started',
    CALL_ENDED: 'call_ended',
    CALL_DURATION: 'call_duration',

    // System
    SYSTEM_ERROR: 'system_error',
    SYSTEM_START: 'system_start',
    SYSTEM_SHUTDOWN: 'system_shutdown'
} as const;

type ActivityType = typeof ActivityTypes[keyof typeof ActivityTypes];

// Activity descriptions
const descriptions: Record<string, string> = {
    admin_login: 'Admin logged in',
    admin_logout: 'Admin logged out',
    interpreter_created: 'New interpreter account created',
    interpreter_updated: 'Interpreter account updated',
    interpreter_deleted: 'Interpreter account deleted',
    interpreter_online: 'Interpreter came online',
    interpreter_offline: 'Interpreter went offline',
    interpreter_status_change: 'Interpreter status changed',
    client_connected: 'Client connected',
    client_disconnected: 'Client disconnected',
    client_created: 'New client account created',
    client_registered: 'New client registered',
    queue_request_added: 'Interpreter request added to queue',
    queue_request_cancelled: 'Interpreter request cancelled',
    queue_match_complete: 'Interpreter matched with client',
    queue_paused: 'Queue paused by admin',
    queue_resumed: 'Queue resumed by admin',
    queue_manual_assign: 'Admin manually assigned interpreter',
    queue_request_removed: 'Request removed from queue',
    call_started: 'Call started',
    call_ended: 'Call ended',
    call_duration: 'Call duration recorded',
    system_error: 'System error occurred',
    system_start: 'System started',
    system_shutdown: 'System shutdown'
};

interface ActivityData {
    [key: string]: unknown;
    createdBy?: string;
}

/**
 * Log an activity event
 */
function log(type: string, data: ActivityData = {}, description?: string): Promise<void> {
    return db.logActivity(
        type,
        description || descriptions[type] || type,
        data,
        data.createdBy || null
    );
}

interface GetRecentOptions {
    limit?: number;
    type?: string;
    offset?: number;
}

/**
 * Get recent activity log
 */
async function getRecent(options: GetRecentOptions = {}): Promise<db.Row[]> {
    const { limit = 50, type, offset = 0 } = options;
    return await db.getActivityLog({ limit, type, offset });
}

interface DisplayActivity {
    [key: string]: unknown;
    type: string;
    description?: string;
    data?: unknown;
    created_at?: string;
    icon: string;
    title: string;
    shortDesc: string;
    timeAgo: string;
}

/**
 * Format activity for dashboard display
 */
function formatForDisplay(activity: { [key: string]: unknown }): DisplayActivity {
    const icons: Record<string, string> = {
        admin_login: '\u{1F511}',
        admin_logout: '\u{1F6AA}',
        interpreter_created: '\u2795',
        interpreter_updated: '\u270F\uFE0F',
        interpreter_deleted: '\u{1F5D1}\uFE0F',
        interpreter_online: '\u{1F7E2}',
        interpreter_offline: '\u26AB',
        interpreter_status_change: '\u{1F504}',
        client_connected: '\u{1F464}',
        client_disconnected: '\u{1F4F2}',
        client_created: '\u{1F465}',
        client_registered: '\u{1F4DD}',
        queue_request_added: '\u23F3',
        queue_request_cancelled: '\u274C',
        queue_match_complete: '\u2705',
        queue_paused: '\u23F8\uFE0F',
        queue_resumed: '\u25B6\uFE0F',
        queue_manual_assign: '\u{1F446}',
        queue_request_removed: '\u{1F5D1}\uFE0F',
        call_started: '\u{1F4DE}',
        call_ended: '\u{1F4F5}',
        call_duration: '\u23F1\uFE0F',
        system_error: '\u26A0\uFE0F',
        system_start: '\u{1F680}',
        system_shutdown: '\u{1F6D1}'
    };

    const activityType = activity.type as string;
    const icon = icons[activityType] || '\u{1F4CC}';

    let title = (activity.description as string) || activityType;
    let desc = '';

    // Generate description from data
    if (activity.data) {
        try {
            const data = typeof activity.data === 'string'
                ? JSON.parse(activity.data)
                : activity.data as Record<string, unknown>;

            if (activityType === 'interpreter_status_change') {
                desc = `${(data as Record<string, unknown>).interpreterName} changed status to ${(data as Record<string, unknown>).status}`;
            } else if (activityType === 'queue_match_complete') {
                desc = `${(data as Record<string, unknown>).interpreterName} matched with ${(data as Record<string, unknown>).clientName}`;
            } else if (activityType === 'queue_request_added') {
                desc = `${(data as Record<string, unknown>).clientName} joined the queue`;
            } else if (activityType === 'interpreter_online') {
                desc = `${(data as Record<string, unknown>).interpreterName} is now online`;
            } else if (activityType === 'call_started') {
                desc = `Call started in room ${(data as Record<string, unknown>).roomName}`;
            }
        } catch (_e) {
            desc = '';
        }
    }

    return {
        ...activity,
        type: activityType,
        icon,
        title,
        shortDesc: desc,
        timeAgo: formatTimeAgo(activity.created_at as string)
    };
}

function formatTimeAgo(dateStr: string): string {
    const now = new Date();
    const date = new Date(dateStr);
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days > 1 ? 's' : ''} ago`;
}

export {
    ActivityTypes,
    log,
    getRecent,
    formatForDisplay
};
