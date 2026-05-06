/**
 * Activity Logger
 *
 * Logs all system activity for:
 * - Admin dashboard activity feed
 * - Audit trail
 * - Analytics and reporting
 */

const db = require('../database');

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
};

// Activity descriptions
const descriptions = {
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
    captioner_online: 'Captioner came online',
    captioner_offline: 'Captioner went offline',
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

/**
 * Log an activity event
 *
 * @param {string} type - Activity type from ActivityTypes
 * @param {Object} data - Additional data to store
 * @param {string} description - Custom description (optional)
 */
function log(type, data = {}, description) {
    return db.logActivity(
        type,
        description || descriptions[type] || type,
        data,
        data.createdBy || null
    );
}

/**
 * Get recent activity log
 *
 * @param {Object} options - Query options
 * @param {number} options.limit - Max number of records
 * @param {string} options.type - Filter by type
 * @param {number} options.offset - Offset for pagination
 */
async function getRecent(options = {}) {
    const { limit = 50, type, offset = 0 } = options;
    return await db.getActivityLog({ limit, type, offset });
}

/**
 * Format activity for dashboard display
 *
 * @param {Object} activity - Raw activity from database
 */
function formatForDisplay(activity) {
    const icons = {
        admin_login: '🔐',
        admin_logout: '🚪',
        interpreter_created: '➕',
        interpreter_updated: '✏️',
        interpreter_deleted: '🗑️',
        interpreter_online: '🟢',
        interpreter_offline: '⚫',
        interpreter_status_change: '🔄',
        client_connected: '👤',
        client_disconnected: '📴',
        client_created: '👥',
        client_registered: '📝',
        captioner_online: '🟢',
        captioner_offline: '⚫',
        queue_request_added: '⏳',
        queue_request_cancelled: '❌',
        queue_match_complete: '✅',
        queue_paused: '⏸️',
        queue_resumed: '▶️',
        queue_manual_assign: '👆',
        queue_request_removed: '🗑️',
        call_started: '📞',
        call_ended: '📵',
        call_duration: '⏱️',
        system_error: '⚠️',
        system_start: '🚀',
        system_shutdown: '🛑'
    };

    const icon = icons[activity.type] || '📌';

    let title = activity.description || activity.type;
    let desc = '';

    // Generate description from data
    if (activity.data) {
        try {
            const data = typeof activity.data === 'string'
                ? JSON.parse(activity.data)
                : activity.data;

            if (activity.type === 'interpreter_status_change') {
                desc = `${data.interpreterName} changed status to ${data.status}`;
            } else if (activity.type === 'queue_match_complete') {
                desc = `${data.interpreterName} matched with ${data.clientName}`;
            } else if (activity.type === 'queue_request_added') {
                desc = `${data.clientName} joined the queue`;
            } else if (activity.type === 'interpreter_online') {
                desc = `${data.interpreterName} is now online`;
            } else if (activity.type === 'call_started') {
                desc = `Call started in room ${data.roomName}`;
            }
        } catch (e) {
            desc = '';
        }
    }

    return {
        ...activity,
        icon,
        title,
        shortDesc: desc,
        timeAgo: formatTimeAgo(activity.created_at)
    };
}

function formatTimeAgo(dateStr) {
    const now = new Date();
    const date = new Date(dateStr);
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days > 1 ? 's' : ''} ago`;
}

// ============================================
// EXPORT
// ============================================

module.exports = {
    ...ActivityTypes,
    log,
    getRecent,
    formatForDisplay
};
