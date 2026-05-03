"use strict";
/**
 * Database Module
 *
 * PostgreSQL database for storing:
 * - Admin accounts
 * - Interpreter accounts
 * - Client accounts
 * - Call history
 * - Activity logs
 * - Usage statistics
 *
 * Uses `pg` (node-postgres) with connection pooling.
 * All queries use parameterized placeholders ($1, $2, ...).
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.assignClientPhoneNumber = exports.getClientPhoneNumbers = exports.incrementSpeedDialUsage = exports.deleteSpeedDialEntry = exports.updateSpeedDialEntry = exports.addSpeedDialEntry = exports.getSpeedDialEntries = exports.getDailyUsageStats = exports.getDashboardStats = exports.getActivityLog = exports.logActivity = exports.getVriSessionInvite = exports.endVriInvitesForRoom = exports.expireVriInvitesForQueue = exports.activateVriInvitesForQueue = exports.attachVriInvitesToQueue = exports.createVriSessionInvite = exports.reorderQueue = exports.removeFromQueue = exports.completeRequest = exports.assignInterpreter = exports.getQueueRequests = exports.addToQueue = exports.getActiveCalls = exports.getCall = exports.setServerState = exports.getServerState = exports.endCall = exports.createCall = exports.updateClient = exports.createClient = exports.getClientByEmail = exports.getClient = exports.getAllClients = exports.deleteCaptioner = exports.updateCaptioner = exports.createCaptioner = exports.getCaptionerByEmail = exports.getCaptioner = exports.getAllCaptioners = exports.getInterpreterStats = exports.deleteInterpreter = exports.updateInterpreter = exports.createInterpreter = exports.getInterpreterByEmail = exports.getInterpreter = exports.getAllInterpreters = exports.createAdmin = exports.getAdminByUsername = exports.initialize = void 0;
exports.updateContactNote = exports.createContactNote = exports.getContactNotes = exports.getContactCallHistory = exports.ensureDefaultGroups = exports.migrateSpeedDialToContacts = exports.importContacts = exports.mergeContacts = exports.findDuplicateContacts = exports.isContactBlocked = exports.unblockContact = exports.blockContact = exports.getBlockedContacts = exports.setContactGroups = exports.deleteContactGroup = exports.updateContactGroup = exports.createContactGroup = exports.getContactGroups = exports.deleteContact = exports.updateContact = exports.createContact = exports.getContact = exports.getContacts = exports.getActiveP2PRoomsForClient = exports.markMissedCallsSeen = exports.getMissedCalls = exports.createMissedCall = exports.createP2PCall = exports.getClientByPhoneNumber = exports.getInterpreterCallHistory = exports.getClientCallHistory = exports.requestInterpreterTeamAssignment = exports.getInterpreterTeamAssignments = exports.createPostCallSurvey = exports.createInterpreterContinuityNote = exports.getInterpreterContinuityNotes = exports.endInterpreterBreak = exports.startInterpreterBreak = exports.getInterpreterBreaks = exports.getAdminUtilizationSummary = exports.getInterpreterUtilizationSummary = exports.logInterpreterQueueEvent = exports.getInterpreterAnalytics = exports.getInterpreterEarnings = exports.updateInterpreterScheduleWindow = exports.createInterpreterScheduleWindow = exports.getInterpreterScheduleWindows = exports.updateInterpreterShift = exports.createInterpreterShift = exports.getInterpreterShifts = void 0;
exports.getVoicemailUnreadCount = exports.getVoicemailInboxCount = exports.getVoicemailInbox = exports.deleteVoicemailMessage = exports.updateVoicemailMessage = exports.getVoicemailMessageByRoomName = exports.getVoicemailMessage = exports.createVoicemailMessage = exports.updateInterpreterPassword = exports.updateClientPassword = exports.consumePasswordReset = exports.createPasswordReset = exports.verifyOtpCode = exports.createOtpCode = exports.createVCOCall = exports.deleteQuickPhrase = exports.updateQuickPhrase = exports.addQuickPhrase = exports.getQuickPhrases = exports.updateTtsSettings = exports.getTtsSettings = exports.getActiveCallForClient = exports.setCallOnHold = exports.getChatMessages = exports.addChatMessage = exports.getConferenceParticipants = exports.removeConferenceParticipant = exports.addConferenceParticipant = exports.getPendingTransferForCall = exports.getCallTransfers = exports.updateCallTransferStatus = exports.createCallTransfer = exports.deleteExpiredHandoffTokens = exports.deleteHandoffTokensByUser = exports.deleteHandoffToken = exports.storeHandoffToken = exports.getAllActiveHandoffTokens = exports.deleteActiveSession = exports.upsertActiveSession = exports.getAllActiveSessions = exports.isClientDND = exports.updateClientPreferences = exports.getClientPreferences = exports.deleteGoogleOAuthToken = exports.upsertGoogleOAuthToken = exports.getGoogleOAuthToken = exports.getContactChangesSince = exports.logContactChange = exports.getContactTimeline = exports.deleteContactNote = void 0;
exports.assignInterpreterToRequest = exports.pool = exports.getVoicemailStorageStats = exports.getAllVoicemailMessages = exports.seedVoicemailSettings = exports.setVoicemailSetting = exports.getAllVoicemailSettings = exports.getVoicemailSetting = exports.getActiveVoicemailRecordings = exports.getExpiredVoicemailMessages = exports.getVoicemailMessageCount = exports.getVoicemailStorageUsage = exports.markVoicemailSeen = void 0;
const pg_1 = require("pg");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const uuid_1 = require("uuid");
let pgPool = undefined;
function normalizeServiceModes(value, fallback = ['vrs']) {
    let raw = value;
    if (typeof value === 'string') {
        try {
            raw = JSON.parse(value);
        }
        catch {
            raw = [];
        }
    }
    const modes = Array.isArray(raw) ? raw.filter(mode => mode === 'vri' || mode === 'vrs') : [];
    return modes.length ? modes : fallback;
}
// ============================================
// DATABASE INITIALIZATION
// ============================================
async function initialize() {
    const connectionString = process.env.DATABASE_URL
        || `postgresql://${process.env.PGUSER || 'malka'}:${process.env.PGPASSWORD || 'malka'}@${process.env.PGHOST || 'postgres'}:${process.env.PGPORT || 5432}/${process.env.PGDATABASE || 'malka_vrs'}`;
    pgPool = new pg_1.Pool({
        connectionString,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000
    });
    // Verify connection
    const client = await pgPool.connect();
    try {
        const res = await client.query('SELECT NOW()');
        console.log('[Database] Connected to PostgreSQL at', res.rows[0].now);
    }
    finally {
        client.release();
    }
    await createTables();
    console.log('[Database] Tables initialized');
}
exports.initialize = initialize;
async function createTables() {
    const ddl = `
        -- Admins table
        CREATE TABLE IF NOT EXISTS admins (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            name TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            last_login TIMESTAMPTZ
        );

        -- Interpreters table
        CREATE TABLE IF NOT EXISTS interpreters (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            password_hash TEXT,
            languages JSONB DEFAULT '["ASL"]',
            service_modes JSONB DEFAULT '["vrs"]',
            tenant_id TEXT DEFAULT 'malka',
            status TEXT DEFAULT 'offline',
            active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            last_active TIMESTAMPTZ
        );

        -- Captioners table
        CREATE TABLE IF NOT EXISTS captioners (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT,
            languages JSONB DEFAULT '["en"]',
            status TEXT DEFAULT 'offline',
            active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            last_active TIMESTAMPTZ
        );

        -- Clients table
        CREATE TABLE IF NOT EXISTS clients (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            password_hash TEXT,
            organization TEXT DEFAULT 'Personal',
            service_modes JSONB DEFAULT '["vrs"]',
            tenant_id TEXT DEFAULT 'malka',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            last_call TIMESTAMPTZ
        );

        -- Calls table (includes callee_id for P2P calls)
        CREATE TABLE IF NOT EXISTS calls (
            id TEXT PRIMARY KEY,
            client_id TEXT,
            interpreter_id TEXT,
            room_name TEXT NOT NULL,
            started_at TIMESTAMPTZ DEFAULT NOW(),
            ended_at TIMESTAMPTZ,
            duration_minutes INTEGER,
            language TEXT,
            status TEXT DEFAULT 'active',
            callee_id TEXT
        );

        -- Queue requests table (includes target_phone for P2P routing)
        CREATE TABLE IF NOT EXISTS queue_requests (
            id TEXT PRIMARY KEY,
            client_id TEXT,
            client_name TEXT NOT NULL,
            language TEXT NOT NULL,
            target_phone TEXT,
            call_type TEXT,
            room_name TEXT NOT NULL,
            status TEXT DEFAULT 'waiting',
            position INTEGER,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            assigned_at TIMESTAMPTZ,
            assigned_to TEXT,
            completed_at TIMESTAMPTZ
        );

        -- VRI session invites are prepared before interpreter match, but only
        -- become joinable after the queue request is assigned.
        CREATE TABLE IF NOT EXISTS vri_session_invites (
            token TEXT PRIMARY KEY,
            queue_request_id TEXT,
            client_id TEXT,
            guest_name TEXT,
            guest_email TEXT,
            guest_phone TEXT,
            room_name TEXT,
            status TEXT DEFAULT 'prepared',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            expires_at TIMESTAMPTZ NOT NULL,
            activated_at TIMESTAMPTZ,
            ended_at TIMESTAMPTZ
        );

        -- Activity log table
        CREATE TABLE IF NOT EXISTS activity_log (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            description TEXT,
            data JSONB,
            created_by TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        -- Daily stats table
        CREATE TABLE IF NOT EXISTS daily_stats (
            id SERIAL PRIMARY KEY,
            date DATE NOT NULL UNIQUE,
            total_calls INTEGER DEFAULT 0,
            total_minutes INTEGER DEFAULT 0,
            unique_clients INTEGER DEFAULT 0,
            unique_interpreters INTEGER DEFAULT 0,
            avg_wait_time_seconds REAL DEFAULT 0
        );

        -- Interpreter performance table
        CREATE TABLE IF NOT EXISTS interpreter_performance (
            id SERIAL PRIMARY KEY,
            interpreter_id TEXT,
            date DATE NOT NULL,
            calls_completed INTEGER DEFAULT 0,
            minutes_logged INTEGER DEFAULT 0,
            avg_call_duration REAL,
            UNIQUE(interpreter_id, date)
        );

        -- Speed dial (client favorites)
        CREATE TABLE IF NOT EXISTS speed_dial (
            id TEXT PRIMARY KEY,
            client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            phone_number TEXT NOT NULL,
            category TEXT DEFAULT 'personal',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            last_used TIMESTAMPTZ,
            use_count INTEGER DEFAULT 0
        );

        -- Client phone numbers (assigned VRS numbers)
        CREATE TABLE IF NOT EXISTS client_phone_numbers (
            id TEXT PRIMARY KEY,
            client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
            phone_number TEXT UNIQUE NOT NULL,
            is_primary BOOLEAN DEFAULT false,
            assigned_at TIMESTAMPTZ DEFAULT NOW(),
            active BOOLEAN DEFAULT true
        );

        -- Interpreter shifts/schedule
        CREATE TABLE IF NOT EXISTS interpreter_shifts (
            id TEXT PRIMARY KEY,
            interpreter_id TEXT NOT NULL REFERENCES interpreters(id) ON DELETE CASCADE,
            date DATE NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT,
            total_minutes INTEGER DEFAULT 0,
            status TEXT DEFAULT 'scheduled',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(interpreter_id, date)
        );

        -- Interpreter earnings
        CREATE TABLE IF NOT EXISTS interpreter_earnings (
            id TEXT PRIMARY KEY,
            interpreter_id TEXT NOT NULL REFERENCES interpreters(id) ON DELETE CASCADE,
            period_start DATE NOT NULL,
            period_end DATE NOT NULL,
            total_minutes INTEGER DEFAULT 0,
            total_calls INTEGER DEFAULT 0,
            hourly_rate REAL DEFAULT 0,
            total_earnings REAL DEFAULT 0,
            net_earnings REAL DEFAULT 0,
            status TEXT DEFAULT 'pending',
            UNIQUE(interpreter_id, period_start, period_end)
        );

        -- Interpreter operations tools
        CREATE TABLE IF NOT EXISTS interpreter_schedule_windows (
            id TEXT PRIMARY KEY,
            interpreter_id TEXT NOT NULL REFERENCES interpreters(id) ON DELETE CASCADE,
            starts_at TIMESTAMPTZ NOT NULL,
            ends_at TIMESTAMPTZ NOT NULL,
            tenant_id TEXT DEFAULT 'malka',
            service_modes JSONB DEFAULT '["vrs"]',
            languages JSONB DEFAULT '["ASL"]',
            status TEXT DEFAULT 'scheduled',
            manager_note TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS interpreter_availability_sessions (
            id TEXT PRIMARY KEY,
            interpreter_id TEXT NOT NULL REFERENCES interpreters(id) ON DELETE CASCADE,
            status TEXT NOT NULL,
            started_at TIMESTAMPTZ DEFAULT NOW(),
            ended_at TIMESTAMPTZ,
            source TEXT DEFAULT 'interpreter',
            reason TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS interpreter_break_sessions (
            id TEXT PRIMARY KEY,
            interpreter_id TEXT NOT NULL REFERENCES interpreters(id) ON DELETE CASCADE,
            started_at TIMESTAMPTZ DEFAULT NOW(),
            ended_at TIMESTAMPTZ,
            break_type TEXT DEFAULT 'general',
            paid BOOLEAN DEFAULT false,
            reason TEXT,
            source TEXT DEFAULT 'interpreter',
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS interpreter_queue_events (
            id TEXT PRIMARY KEY,
            interpreter_id TEXT NOT NULL REFERENCES interpreters(id) ON DELETE CASCADE,
            request_id TEXT,
            event_type TEXT NOT NULL,
            service_mode TEXT,
            language TEXT,
            wait_seconds INTEGER DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS interpreter_continuity_notes (
            id TEXT PRIMARY KEY,
            interpreter_id TEXT NOT NULL REFERENCES interpreters(id) ON DELETE CASCADE,
            client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
            call_id TEXT REFERENCES calls(id) ON DELETE SET NULL,
            note TEXT NOT NULL,
            visibility TEXT DEFAULT 'self',
            preference_tags JSONB DEFAULT '[]',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS interpreter_team_assignments (
            id TEXT PRIMARY KEY,
            primary_interpreter_id TEXT NOT NULL REFERENCES interpreters(id) ON DELETE CASCADE,
            teammate_interpreter_id TEXT REFERENCES interpreters(id) ON DELETE SET NULL,
            call_id TEXT REFERENCES calls(id) ON DELETE SET NULL,
            room_name TEXT,
            status TEXT DEFAULT 'requested',
            requested_by TEXT,
            requested_at TIMESTAMPTZ DEFAULT NOW(),
            accepted_at TIMESTAMPTZ,
            ended_at TIMESTAMPTZ,
            notes TEXT
        );

        CREATE TABLE IF NOT EXISTS post_call_surveys (
            id TEXT PRIMARY KEY,
            call_id TEXT REFERENCES calls(id) ON DELETE SET NULL,
            respondent_id TEXT NOT NULL,
            respondent_role TEXT NOT NULL,
            rating INTEGER CHECK (rating >= 1 AND rating <= 5),
            tags JSONB DEFAULT '[]',
            comments TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        -- Missed calls (P2P — stored when target is offline)
        CREATE TABLE IF NOT EXISTS missed_calls (
            id TEXT PRIMARY KEY,
            caller_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
            callee_phone TEXT NOT NULL,
            callee_client_id TEXT,
            room_name TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            seen BOOLEAN DEFAULT false
        );

        -- Voicemail messages
        CREATE TABLE IF NOT EXISTS voicemail_messages (
            id TEXT PRIMARY KEY,
            caller_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
            callee_id TEXT REFERENCES clients(id) ON DELETE CASCADE,
            callee_phone TEXT,
            room_name TEXT NOT NULL,
            recording_filename TEXT NOT NULL,
            storage_key TEXT NOT NULL,
            thumbnail_key TEXT,
            file_size_bytes BIGINT,
            duration_seconds INTEGER,
            content_type TEXT DEFAULT 'video/mp4',
            status TEXT DEFAULT 'recording',
            seen BOOLEAN DEFAULT false,
            expires_at TIMESTAMPTZ NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS voicemail_settings (
            id TEXT PRIMARY KEY,
            setting_key TEXT UNIQUE NOT NULL,
            setting_value TEXT NOT NULL,
            updated_by TEXT,
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        -- Device handoff: active sessions (rehydrated after restart)
        CREATE TABLE IF NOT EXISTS active_sessions (
            user_id TEXT PRIMARY KEY,
            room_name TEXT NOT NULL,
            interpreter_id TEXT,
            device_id TEXT,
            registered_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        -- Device handoff: short-lived tokens
        CREATE TABLE IF NOT EXISTS handoff_tokens (
            token TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            room_name TEXT NOT NULL,
            interpreter_id TEXT,
            from_device_id TEXT,
            target_device_id TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            expires_at TIMESTAMPTZ NOT NULL
        );

        -- Server-side key/value state (queue paused flag, totals, etc.)
        CREATE TABLE IF NOT EXISTS server_state (
            key TEXT PRIMARY KEY,
            value TEXT,
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        -- Lightweight schema upgrades for existing PostgreSQL volumes
        ALTER TABLE calls ADD COLUMN IF NOT EXISTS callee_id TEXT;
        ALTER TABLE calls ADD COLUMN IF NOT EXISTS call_type TEXT;
        ALTER TABLE queue_requests ADD COLUMN IF NOT EXISTS target_phone TEXT;
        ALTER TABLE queue_requests ADD COLUMN IF NOT EXISTS call_type TEXT;
        ALTER TABLE clients ADD COLUMN IF NOT EXISTS service_modes JSONB DEFAULT '["vrs"]';
        ALTER TABLE clients ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'malka';
        ALTER TABLE interpreters ADD COLUMN IF NOT EXISTS service_modes JSONB DEFAULT '["vrs"]';
        ALTER TABLE interpreters ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'malka';

        ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_email_key;
        ALTER TABLE interpreters DROP CONSTRAINT IF EXISTS interpreters_email_key;
        CREATE UNIQUE INDEX IF NOT EXISTS clients_tenant_email_idx ON clients (tenant_id, email);
        CREATE UNIQUE INDEX IF NOT EXISTS interpreters_tenant_email_idx ON interpreters (tenant_id, email);
        ALTER TABLE missed_calls ADD COLUMN IF NOT EXISTS callee_client_id TEXT;
        ALTER TABLE missed_calls ADD COLUMN IF NOT EXISTS room_name TEXT;
        ALTER TABLE missed_calls ADD COLUMN IF NOT EXISTS seen BOOLEAN DEFAULT false;

        -- Indexes for performance
        CREATE INDEX IF NOT EXISTS idx_calls_client ON calls(client_id);
        CREATE INDEX IF NOT EXISTS idx_calls_interpreter ON calls(interpreter_id);
        CREATE INDEX IF NOT EXISTS idx_calls_date ON calls(started_at);
        CREATE INDEX IF NOT EXISTS idx_queue_status ON queue_requests(status);
        CREATE INDEX IF NOT EXISTS idx_queue_created ON queue_requests(created_at);
        CREATE INDEX IF NOT EXISTS idx_vri_invites_queue ON vri_session_invites(queue_request_id);
        CREATE INDEX IF NOT EXISTS idx_vri_invites_client ON vri_session_invites(client_id);
        CREATE INDEX IF NOT EXISTS idx_vri_invites_expires ON vri_session_invites(expires_at);
        CREATE INDEX IF NOT EXISTS idx_activity_type ON activity_log(type);
        CREATE INDEX IF NOT EXISTS idx_activity_date ON activity_log(created_at);
        CREATE INDEX IF NOT EXISTS idx_speed_dial_client ON speed_dial(client_id);
        CREATE INDEX IF NOT EXISTS idx_client_phone_client ON client_phone_numbers(client_id);
        CREATE INDEX IF NOT EXISTS idx_shifts_interpreter ON interpreter_shifts(interpreter_id);
        CREATE INDEX IF NOT EXISTS idx_shifts_date ON interpreter_shifts(date);
        CREATE INDEX IF NOT EXISTS idx_earnings_interpreter ON interpreter_earnings(interpreter_id);
        CREATE INDEX IF NOT EXISTS idx_schedule_windows_interpreter ON interpreter_schedule_windows(interpreter_id, starts_at);
        CREATE INDEX IF NOT EXISTS idx_availability_sessions_interpreter ON interpreter_availability_sessions(interpreter_id, started_at DESC);
        CREATE INDEX IF NOT EXISTS idx_break_sessions_interpreter ON interpreter_break_sessions(interpreter_id, started_at DESC);
        CREATE INDEX IF NOT EXISTS idx_queue_events_interpreter ON interpreter_queue_events(interpreter_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_continuity_notes_interpreter_client ON interpreter_continuity_notes(interpreter_id, client_id, updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_team_assignments_primary ON interpreter_team_assignments(primary_interpreter_id, requested_at DESC);
        CREATE INDEX IF NOT EXISTS idx_team_assignments_teammate ON interpreter_team_assignments(teammate_interpreter_id, requested_at DESC);
        CREATE INDEX IF NOT EXISTS idx_post_call_surveys_call ON post_call_surveys(call_id);
        CREATE INDEX IF NOT EXISTS idx_missed_calls_callee ON missed_calls(callee_client_id, seen);
        CREATE INDEX IF NOT EXISTS idx_missed_calls_caller ON missed_calls(caller_id);
        CREATE INDEX IF NOT EXISTS idx_captioners_email ON captioners(email);

        -- Voicemail indexes
        CREATE INDEX IF NOT EXISTS idx_voicemail_callee ON voicemail_messages(callee_id, seen, created_at);
        CREATE INDEX IF NOT EXISTS idx_voicemail_caller ON voicemail_messages(caller_id);
        CREATE INDEX IF NOT EXISTS idx_voicemail_expires ON voicemail_messages(expires_at);
        CREATE INDEX IF NOT EXISTS idx_voicemail_status ON voicemail_messages(status);
        CREATE INDEX IF NOT EXISTS idx_voicemail_room ON voicemail_messages(room_name);

        -- Handoff / session indexes
        CREATE INDEX IF NOT EXISTS idx_active_sessions_device ON active_sessions(device_id);
        CREATE INDEX IF NOT EXISTS idx_handoff_tokens_user ON handoff_tokens(user_id);
        CREATE INDEX IF NOT EXISTS idx_handoff_tokens_expires ON handoff_tokens(expires_at);

        CREATE OR REPLACE FUNCTION prevent_calls_call_type_change()
        RETURNS trigger AS $$
        BEGIN
            IF OLD.call_type IS NOT NULL AND NEW.call_type IS DISTINCT FROM OLD.call_type THEN
                RAISE EXCEPTION 'calls.call_type is immutable once set';
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        DROP TRIGGER IF EXISTS trg_calls_call_type_immutable ON calls;
        CREATE TRIGGER trg_calls_call_type_immutable
            BEFORE UPDATE OF call_type ON calls
            FOR EACH ROW
            EXECUTE FUNCTION prevent_calls_call_type_change();

        -- Contacts & Address Book
        CREATE TABLE IF NOT EXISTS contacts (
            id TEXT PRIMARY KEY,
            client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            email TEXT,
            phone_number TEXT,
            organization TEXT,
            notes TEXT,
            avatar_color TEXT,
            is_favorite BOOLEAN DEFAULT false,
            linked_client_id TEXT,
            merged_into TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_contacts_client ON contacts(client_id);
        CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(client_id, phone_number);
        CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(client_id, email);
        CREATE INDEX IF NOT EXISTS idx_contacts_favorite ON contacts(client_id, is_favorite);

        CREATE TABLE IF NOT EXISTS contact_groups (
            id TEXT PRIMARY KEY,
            client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            color TEXT,
            sort_order INTEGER DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(client_id, name)
        );
        CREATE INDEX IF NOT EXISTS idx_contact_groups_client ON contact_groups(client_id);

        CREATE TABLE IF NOT EXISTS contact_group_members (
            id TEXT PRIMARY KEY,
            contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
            group_id TEXT NOT NULL REFERENCES contact_groups(id) ON DELETE CASCADE,
            UNIQUE(contact_id, group_id)
        );
        CREATE INDEX IF NOT EXISTS idx_cgm_contact ON contact_group_members(contact_id);
        CREATE INDEX IF NOT EXISTS idx_cgm_group ON contact_group_members(group_id);

        CREATE TABLE IF NOT EXISTS blocked_contacts (
            id TEXT PRIMARY KEY,
            client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
            blocked_phone TEXT,
            blocked_email TEXT,
            blocked_client_id TEXT,
            reason TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_blocked_client ON blocked_contacts(client_id);
        CREATE INDEX IF NOT EXISTS idx_blocked_phone ON blocked_contacts(client_id, blocked_phone);
        CREATE INDEX IF NOT EXISTS idx_blocked_email ON blocked_contacts(client_id, blocked_email);

        -- ================================================
        -- Call Management & UX (1I features)
        -- ================================================

        -- Client preferences (DND, media permissions, dark mode, etc.)
        CREATE TABLE IF NOT EXISTS client_preferences (
            client_id TEXT PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
            dnd_enabled BOOLEAN DEFAULT false,
            dnd_message TEXT,
            dark_mode TEXT DEFAULT 'system',  -- 'light', 'dark', 'system'
            camera_default_off BOOLEAN DEFAULT true,
            mic_default_off BOOLEAN DEFAULT true,
            skip_waiting_room BOOLEAN DEFAULT false,
            remember_media_permissions BOOLEAN DEFAULT true,
            notifications_enabled BOOLEAN DEFAULT true,
            notify_missed_calls BOOLEAN DEFAULT true,
            notify_voicemail BOOLEAN DEFAULT true,
            notify_queue_updates BOOLEAN DEFAULT true,
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        ALTER TABLE client_preferences ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN DEFAULT true;
        ALTER TABLE client_preferences ADD COLUMN IF NOT EXISTS notify_missed_calls BOOLEAN DEFAULT true;
        ALTER TABLE client_preferences ADD COLUMN IF NOT EXISTS notify_voicemail BOOLEAN DEFAULT true;
        ALTER TABLE client_preferences ADD COLUMN IF NOT EXISTS notify_queue_updates BOOLEAN DEFAULT true;

        -- Call transfers (interpreter transfers to another number)
        CREATE TABLE IF NOT EXISTS call_transfers (
            id TEXT PRIMARY KEY,
            call_id TEXT NOT NULL,
            from_interpreter_id TEXT,
            to_phone_number TEXT,
            to_interpreter_id TEXT,
            transfer_type TEXT DEFAULT 'blind',  -- 'blind' or 'attended'
            status TEXT DEFAULT 'pending',        -- 'pending', 'accepted', 'completed', 'failed', 'cancelled'
            reason TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            completed_at TIMESTAMPTZ
        );
        CREATE INDEX IF NOT EXISTS idx_transfers_call ON call_transfers(call_id);
        CREATE INDEX IF NOT EXISTS idx_transfers_status ON call_transfers(status);

        -- Conference calls (3-way calling)
        CREATE TABLE IF NOT EXISTS conference_participants (
            id TEXT PRIMARY KEY,
            call_id TEXT NOT NULL,
            participant_id TEXT NOT NULL,
            participant_role TEXT DEFAULT 'party',  -- 'host', 'party'
            joined_at TIMESTAMPTZ DEFAULT NOW(),
            left_at TIMESTAMPTZ,
            status TEXT DEFAULT 'active'
        );
        CREATE INDEX IF NOT EXISTS idx_conf_call ON conference_participants(call_id);
        CREATE INDEX IF NOT EXISTS idx_conf_participant ON conference_participants(participant_id);

        -- In-call text chat messages
        CREATE TABLE IF NOT EXISTS call_chat_messages (
            id TEXT PRIMARY KEY,
            call_id TEXT NOT NULL,
            sender_id TEXT NOT NULL,
            sender_name TEXT NOT NULL,
            message TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_chat_call ON call_chat_messages(call_id);
        CREATE INDEX IF NOT EXISTS idx_chat_created ON call_chat_messages(call_id, created_at);

        -- Extend calls table with transfer and conference columns
        ALTER TABLE calls ADD COLUMN IF NOT EXISTS is_conference BOOLEAN DEFAULT false;
        ALTER TABLE calls ADD COLUMN IF NOT EXISTS parent_call_id TEXT;
        ALTER TABLE calls ADD COLUMN IF NOT EXISTS on_hold BOOLEAN DEFAULT false;
        ALTER TABLE calls ADD COLUMN IF NOT EXISTS call_type TEXT DEFAULT 'vrs';  -- 'vrs', 'p2p', 'transfer', 'conference', 'vco'
        ALTER TABLE calls ADD COLUMN IF NOT EXISTS call_mode TEXT DEFAULT 'vrs'; -- 'vrs', 'vco'

        -- ================================================
        -- TTS Fallback (1H features)
        -- ================================================

        -- TTS voice settings (per-client)
        CREATE TABLE IF NOT EXISTS tts_settings (
            id TEXT PRIMARY KEY,
            client_id TEXT NOT NULL UNIQUE REFERENCES clients(id) ON DELETE CASCADE,
            voice_name TEXT NOT NULL DEFAULT '',
            voice_gender TEXT NOT NULL DEFAULT 'female',
            voice_speed REAL NOT NULL DEFAULT 1.0,
            voice_pitch REAL NOT NULL DEFAULT 1.0,
            sts_mode BOOLEAN NOT NULL DEFAULT false,
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_tts_settings_client ON tts_settings(client_id);

        -- Quick phrases (saved by client for TTS)
        CREATE TABLE IF NOT EXISTS quick_phrases (
            id TEXT PRIMARY KEY,
            client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
            text TEXT NOT NULL,
            label TEXT,
            sort_order INTEGER DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_quick_phrases_client ON quick_phrases(client_id);

        -- ================================================
        -- Auth: OTP codes + Password resets (1A features)
        -- ================================================

        CREATE TABLE IF NOT EXISTS otp_codes (
            id TEXT PRIMARY KEY,
            phone_number TEXT NOT NULL,
            code TEXT NOT NULL,
            purpose TEXT NOT NULL DEFAULT 'login',
            attempts INTEGER DEFAULT 0,
            max_attempts INTEGER DEFAULT 5,
            verified BOOLEAN DEFAULT false,
            expires_at TIMESTAMPTZ NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_otp_phone ON otp_codes(phone_number);
        CREATE INDEX IF NOT EXISTS idx_otp_expires ON otp_codes(expires_at);

        CREATE TABLE IF NOT EXISTS password_resets (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            user_role TEXT NOT NULL DEFAULT 'client',
            token_hash TEXT NOT NULL,
            used BOOLEAN DEFAULT false,
            expires_at TIMESTAMPTZ NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);
        CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token_hash);

        -- ================================================
        -- Visual Voicemail (Video Messaging)
        -- ================================================

        CREATE TABLE IF NOT EXISTS voicemail_messages (
            id TEXT PRIMARY KEY,
            caller_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
            callee_id TEXT REFERENCES clients(id) ON DELETE CASCADE,
            callee_phone TEXT,
            room_name TEXT NOT NULL,
            recording_filename TEXT NOT NULL,
            storage_key TEXT NOT NULL,
            thumbnail_key TEXT,
            file_size_bytes INTEGER,
            duration_seconds INTEGER,
            content_type TEXT DEFAULT 'video/mp4',
            status TEXT DEFAULT 'recording',
            seen BOOLEAN DEFAULT false,
            expires_at TIMESTAMPTZ NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_voicemail_callee ON voicemail_messages(callee_id, seen, created_at);
        CREATE INDEX IF NOT EXISTS idx_voicemail_caller ON voicemail_messages(caller_id);
        CREATE INDEX IF NOT EXISTS idx_voicemail_expires ON voicemail_messages(expires_at);
        CREATE INDEX IF NOT EXISTS idx_voicemail_status ON voicemail_messages(status);

        CREATE TABLE IF NOT EXISTS voicemail_settings (
            id TEXT PRIMARY KEY,
            setting_key TEXT UNIQUE NOT NULL,
            setting_value TEXT NOT NULL,
            updated_by TEXT,
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        -- ================================================
        -- Contact Notes (timestamped notes per contact)
        -- ================================================
        CREATE TABLE IF NOT EXISTS contact_notes (
            id TEXT PRIMARY KEY,
            contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
            author_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
            content TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_contact_notes_contact ON contact_notes(contact_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_contact_notes_author ON contact_notes(author_id);

        -- ================================================
        -- Contact Sync Log (delta sync across devices)
        -- ================================================
        CREATE TABLE IF NOT EXISTS contact_sync_log (
            id TEXT PRIMARY KEY,
            client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
            entity_type TEXT NOT NULL DEFAULT 'contact',
            entity_id TEXT NOT NULL,
            action TEXT NOT NULL,
            snapshot JSONB,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_sync_log_client_time ON contact_sync_log(client_id, created_at DESC);

        -- ================================================
        -- Google OAuth Tokens (for Google Contacts import)
        -- ================================================
        CREATE TABLE IF NOT EXISTS google_oauth_tokens (
            client_id TEXT PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
            access_token TEXT NOT NULL,
            refresh_token TEXT,
            token_type TEXT DEFAULT 'Bearer',
            expires_at TIMESTAMPTZ,
            scope TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
    `;
    await pgPool.query(ddl);
}
// ============================================
// HELPER FUNCTIONS
// ============================================
/**
 * Run a SELECT query. Returns array of row objects.
 * Use $1, $2, ... placeholders in SQL.
 */
async function runQuery(sql, params = []) {
    const { rows } = await pgPool.query(sql, params);
    return rows;
}
/**
 * Run an INSERT query.
 */
async function runInsert(sql, params = []) {
    const { rows } = await pgPool.query(sql, params);
    return rows[0];
}
/**
 * Run an UPDATE/DELETE query. Returns number of affected rows.
 */
async function runUpdate(sql, params = []) {
    const { rowCount } = await pgPool.query(sql, params);
    return rowCount || 0;
}
// ============================================
// ADMIN OPERATIONS
// ============================================
async function getAdminByUsername(username) {
    const rows = await runQuery('SELECT * FROM admins WHERE username = $1', [username]);
    return rows[0];
}
exports.getAdminByUsername = getAdminByUsername;
async function createAdmin({ username, password, name }) {
    const id = (0, uuid_1.v4)();
    const passwordHash = await bcryptjs_1.default.hash(password, 10);
    await runInsert('INSERT INTO admins (id, username, password_hash, name) VALUES ($1, $2, $3, $4)', [id, username, passwordHash, name]);
    return { id, username, name };
}
exports.createAdmin = createAdmin;
// ============================================
// INTERPRETER OPERATIONS
// ============================================
async function getAllInterpreters() {
    const interpreters = await runQuery(`
        SELECT
            i.*,
            COUNT(DISTINCT c.id) as total_calls,
            SUM(CASE WHEN c.started_at >= CURRENT_DATE THEN 1 ELSE 0 END) as calls_today,
            SUM(c.duration_minutes) as total_minutes,
            SUM(CASE WHEN c.started_at >= CURRENT_DATE - INTERVAL '7 days' THEN c.duration_minutes ELSE 0 END) as minutes_week
        FROM interpreters i
        LEFT JOIN calls c ON c.interpreter_id = i.id
        WHERE i.active = true
        GROUP BY i.id
        ORDER BY i.name
    `);
    // Parse languages (JSONB comes back as object in PG, but handle string fallback)
    return interpreters.map(i => ({
        ...i,
        languages: typeof i.languages === 'string' ? JSON.parse(i.languages) : (i.languages || []),
        service_modes: normalizeServiceModes(i.service_modes),
        total_calls: Number(i.total_calls) || 0,
        calls_today: Number(i.calls_today) || 0,
        total_minutes: Number(i.total_minutes) || 0,
        minutes_week: Number(i.minutes_week) || 0
    }));
}
exports.getAllInterpreters = getAllInterpreters;
async function getInterpreter(id) {
    const rows = await runQuery('SELECT * FROM interpreters WHERE id = $1', [id]);
    if (rows.length === 0)
        return null;
    const i = rows[0];
    return {
        ...i,
        languages: typeof i.languages === 'string' ? JSON.parse(i.languages) : (i.languages || []),
        service_modes: normalizeServiceModes(i.service_modes)
    };
}
exports.getInterpreter = getInterpreter;
async function getInterpreterByEmail(email, tenantId) {
    const rows = tenantId
        ? await runQuery('SELECT * FROM interpreters WHERE email = $1 AND tenant_id = $2', [email, tenantId])
        : await runQuery('SELECT * FROM interpreters WHERE email = $1 ORDER BY tenant_id = $2 DESC LIMIT 1', [email, 'malka']);
    if (rows.length === 0)
        return null;
    const i = rows[0];
    return {
        ...i,
        languages: typeof i.languages === 'string' ? JSON.parse(i.languages) : (i.languages || []),
        service_modes: normalizeServiceModes(i.service_modes)
    };
}
exports.getInterpreterByEmail = getInterpreterByEmail;
async function createInterpreter({ name, email, languages, password, serviceModes, service_modes, tenantId, tenant_id }) {
    const id = (0, uuid_1.v4)();
    const passwordHash = await bcryptjs_1.default.hash(password || 'changeme', 10);
    const modes = normalizeServiceModes(serviceModes || service_modes);
    const tenant = tenantId || tenant_id || 'malka';
    await runInsert('INSERT INTO interpreters (id, name, email, password_hash, languages, service_modes, tenant_id) VALUES ($1, $2, $3, $4, $5, $6, $7)', [id, name, email, passwordHash, JSON.stringify(languages || ['ASL']), JSON.stringify(modes), tenant]);
    return { id, name, email, service_modes: modes, tenant_id: tenant };
}
exports.createInterpreter = createInterpreter;
async function updateInterpreter(id, { name, email, languages, active, password, serviceModes, service_modes, tenantId, tenant_id }) {
    const updates = [];
    const params = [];
    let paramIdx = 1;
    if (name !== undefined) {
        updates.push(`name = $${paramIdx++}`);
        params.push(name);
    }
    if (email !== undefined) {
        updates.push(`email = $${paramIdx++}`);
        params.push(email);
    }
    if (languages !== undefined) {
        updates.push(`languages = $${paramIdx++}`);
        params.push(JSON.stringify(languages));
    }
    if (active !== undefined) {
        updates.push(`active = $${paramIdx++}`);
        params.push(!!active);
    }
    if (password !== undefined && password !== '') {
        updates.push(`password_hash = $${paramIdx++}`);
        params.push(await bcryptjs_1.default.hash(password, 10));
    }
    const modes = serviceModes || service_modes;
    if (modes !== undefined) {
        updates.push(`service_modes = $${paramIdx++}`);
        params.push(JSON.stringify(normalizeServiceModes(modes)));
    }
    const tenant = tenantId || tenant_id;
    if (tenant !== undefined) {
        updates.push(`tenant_id = $${paramIdx++}`);
        params.push(tenant);
    }
    if (updates.length > 0) {
        params.push(id);
        await runUpdate(`UPDATE interpreters SET ${updates.join(', ')} WHERE id = $${paramIdx}`, params);
    }
}
exports.updateInterpreter = updateInterpreter;
async function deleteInterpreter(id) {
    await runUpdate('UPDATE interpreters SET active = false WHERE id = $1', [id]);
}
exports.deleteInterpreter = deleteInterpreter;
async function getInterpreterStats(interpreterId) {
    // Per-interpreter stats (called with an ID)
    if (interpreterId) {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        const calls = await runQuery(`SELECT
                COUNT(*) as total_calls,
                COALESCE(SUM(duration_minutes), 0) as total_minutes,
                COALESCE(AVG(duration_minutes), 0) as avg_duration
             FROM calls
             WHERE interpreter_id = $1 AND started_at::date >= $2 AND status = 'completed'`, [interpreterId, monthStart]);
        const earnings = await runQuery(`SELECT COALESCE(SUM(net_earnings), 0) as total_earnings
             FROM interpreter_earnings
             WHERE interpreter_id = $1 AND period_start >= $2`, [interpreterId, monthStart]);
        return {
            totalCalls: Number(calls[0]?.total_calls) || 0,
            totalMinutes: Number(calls[0]?.total_minutes) || 0,
            avgDuration: Math.round(Number(calls[0]?.avg_duration) || 0),
            totalEarnings: Number(earnings[0]?.total_earnings) || 0
        };
    }
    // All-interpreter stats (dashboard)
    return await runQuery(`
        SELECT
            i.id,
            i.name,
            i.email,
            i.languages,
            COUNT(c.id) as total_calls,
            SUM(c.duration_minutes) as total_minutes,
            MAX(c.started_at) as last_call
        FROM interpreters i
        LEFT JOIN calls c ON c.interpreter_id = i.id AND c.started_at >= CURRENT_DATE - INTERVAL '30 days'
        WHERE i.active = true
        GROUP BY i.id
        ORDER BY total_calls DESC
    `);
}
exports.getInterpreterStats = getInterpreterStats;
// ============================================
// CAPTIONER OPERATIONS
// ============================================
async function getAllCaptioners() {
    const captioners = await runQuery(`SELECT * FROM captioners WHERE active = true ORDER BY name`);
    return captioners.map(c => ({
        ...c,
        languages: typeof c.languages === 'string' ? JSON.parse(c.languages) : (c.languages || [])
    }));
}
exports.getAllCaptioners = getAllCaptioners;
async function getCaptioner(id) {
    const rows = await runQuery('SELECT * FROM captioners WHERE id = $1', [id]);
    if (rows.length === 0)
        return null;
    const c = rows[0];
    return {
        ...c,
        languages: typeof c.languages === 'string' ? JSON.parse(c.languages) : (c.languages || [])
    };
}
exports.getCaptioner = getCaptioner;
async function getCaptionerByEmail(email) {
    const rows = await runQuery('SELECT * FROM captioners WHERE email = $1', [email]);
    if (rows.length === 0)
        return null;
    const c = rows[0];
    return {
        ...c,
        languages: typeof c.languages === 'string' ? JSON.parse(c.languages) : (c.languages || [])
    };
}
exports.getCaptionerByEmail = getCaptionerByEmail;
async function createCaptioner({ name, email, languages, password }) {
    const id = (0, uuid_1.v4)();
    const passwordHash = await bcryptjs_1.default.hash(password || 'changeme', 10);
    await runInsert('INSERT INTO captioners (id, name, email, password_hash, languages) VALUES ($1, $2, $3, $4, $5)', [id, name, email, passwordHash, JSON.stringify(languages || ['en'])]);
    return { id, name, email };
}
exports.createCaptioner = createCaptioner;
async function updateCaptioner(id, { name, email, languages, active }) {
    const updates = [];
    const params = [];
    let paramIdx = 1;
    if (name !== undefined) {
        updates.push(`name = $${paramIdx++}`);
        params.push(name);
    }
    if (email !== undefined) {
        updates.push(`email = $${paramIdx++}`);
        params.push(email);
    }
    if (languages !== undefined) {
        updates.push(`languages = $${paramIdx++}`);
        params.push(JSON.stringify(languages));
    }
    if (active !== undefined) {
        updates.push(`active = $${paramIdx++}`);
        params.push(!!active);
    }
    if (updates.length > 0) {
        params.push(id);
        await runUpdate(`UPDATE captioners SET ${updates.join(', ')} WHERE id = $${paramIdx}`, params);
    }
}
exports.updateCaptioner = updateCaptioner;
async function deleteCaptioner(id) {
    await runUpdate('UPDATE captioners SET active = false WHERE id = $1', [id]);
}
exports.deleteCaptioner = deleteCaptioner;
// ============================================
// CLIENT OPERATIONS
// ============================================
async function getAllClients() {
    const clients = await runQuery(`
        SELECT
            c.*,
            COUNT(cl.id) as total_calls,
            MAX(cl.started_at) as last_call
        FROM clients c
        LEFT JOIN calls cl ON cl.client_id = c.id
        GROUP BY c.id
        ORDER BY c.name
    `);
    return clients.map(c => ({
        ...c,
        service_modes: normalizeServiceModes(c.service_modes),
        total_calls: Number(c.total_calls) || 0
    }));
}
exports.getAllClients = getAllClients;
async function getClient(id) {
    const rows = await runQuery('SELECT * FROM clients WHERE id = $1', [id]);
    return rows[0] ? { ...rows[0], service_modes: normalizeServiceModes(rows[0].service_modes) } : rows[0];
}
exports.getClient = getClient;
async function updateClient(id, { name, email, organization, password, serviceModes, service_modes, tenantId, tenant_id }) {
    const updates = [];
    const params = [];
    let paramIdx = 1;
    if (name !== undefined) {
        updates.push(`name = $${paramIdx++}`);
        params.push(name);
    }
    if (email !== undefined) {
        updates.push(`email = $${paramIdx++}`);
        params.push(email);
    }
    if (organization !== undefined) {
        updates.push(`organization = $${paramIdx++}`);
        params.push(organization);
    }
    if (password !== undefined && password !== '') {
        updates.push(`password_hash = $${paramIdx++}`);
        params.push(await bcryptjs_1.default.hash(password, 10));
    }
    const modes = serviceModes || service_modes;
    if (modes !== undefined) {
        updates.push(`service_modes = $${paramIdx++}`);
        params.push(JSON.stringify(normalizeServiceModes(modes)));
    }
    const tenant = tenantId || tenant_id;
    if (tenant !== undefined) {
        updates.push(`tenant_id = $${paramIdx++}`);
        params.push(tenant);
    }
    if (updates.length === 0)
        return 0;
    params.push(id);
    return await runUpdate(`UPDATE clients SET ${updates.join(', ')} WHERE id = $${paramIdx}`, params);
}
exports.updateClient = updateClient;
async function getClientByEmail(email, tenantId) {
    const rows = tenantId
        ? await runQuery('SELECT * FROM clients WHERE email = $1 AND tenant_id = $2', [email, tenantId])
        : await runQuery('SELECT * FROM clients WHERE email = $1 ORDER BY tenant_id = $2 DESC LIMIT 1', [email, 'malka']);
    return rows[0] ? { ...rows[0], service_modes: normalizeServiceModes(rows[0].service_modes) } : rows[0];
}
exports.getClientByEmail = getClientByEmail;
async function createClient({ name, email, organization, password, serviceModes, service_modes, tenantId, tenant_id }) {
    const id = (0, uuid_1.v4)();
    const passwordHash = password ? await bcryptjs_1.default.hash(password, 10) : null;
    const modes = normalizeServiceModes(serviceModes || service_modes);
    const tenant = tenantId || tenant_id || 'malka';
    await runInsert('INSERT INTO clients (id, name, email, password_hash, organization, service_modes, tenant_id) VALUES ($1, $2, $3, $4, $5, $6, $7)', [id, name, email, passwordHash, organization || 'Personal', JSON.stringify(modes), tenant]);
    return { id, name, email, organization, service_modes: modes, tenant_id: tenant };
}
exports.createClient = createClient;
// ============================================
// CALL OPERATIONS
// ============================================
async function createCall({ clientId, interpreterId, roomName, language, callType }) {
    const id = (0, uuid_1.v4)();
    await runInsert('INSERT INTO calls (id, client_id, interpreter_id, room_name, language, status, call_type) VALUES ($1, $2, $3, $4, $5, $6, $7)', [id, clientId, interpreterId, roomName, language, 'active', callType || 'vrs']);
    return id;
}
exports.createCall = createCall;
async function endCall(callId, durationMinutes) {
    return await runUpdate(`UPDATE calls
         SET ended_at = COALESCE(ended_at, NOW()),
             duration_minutes = COALESCE(duration_minutes, $1),
             status = $2
         WHERE id = $3 AND status <> $2`, [durationMinutes, 'completed', callId]);
}
exports.endCall = endCall;
async function getServerState(key) {
    const rows = await runQuery('SELECT value FROM server_state WHERE key = $1', [key]);
    return rows[0]?.value || null;
}
exports.getServerState = getServerState;
async function setServerState(key, value) {
    await runInsert(`INSERT INTO server_state (key, value, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET
            value = EXCLUDED.value,
            updated_at = NOW()`, [key, value]);
}
exports.setServerState = setServerState;
async function getActiveCalls() {
    return await runQuery(`
        SELECT c.*, cl.name as client_name, i.name as interpreter_name
        FROM calls c
        LEFT JOIN clients cl ON cl.id = c.client_id
        LEFT JOIN interpreters i ON i.id = c.interpreter_id
        WHERE c.status = 'active'
    `);
}
exports.getActiveCalls = getActiveCalls;
// ============================================
// QUEUE OPERATIONS
// ============================================
async function addToQueue({ clientId, clientName, language, roomName, targetPhone = null, callType = null }) {
    const id = (0, uuid_1.v4)();
    // Get current position
    const count = await runQuery("SELECT COUNT(*) as count FROM queue_requests WHERE status = 'waiting'");
    await runInsert('INSERT INTO queue_requests (id, client_id, client_name, language, target_phone, call_type, room_name, position) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)', [id, clientId || null, clientName, language, targetPhone, callType, roomName, Number(count[0].count) + 1]);
    return { id, position: Number(count[0].count) + 1 };
}
exports.addToQueue = addToQueue;
async function getQueueRequests(status = 'waiting') {
    const requests = await runQuery(`
        SELECT
            q.*,
            COALESCE(c.tenant_id, 'malka') AS tenant_id,
            COALESCE(c.service_modes, '["vrs"]'::jsonb) AS service_modes,
            COALESCE(
                q.call_type,
                CASE
                    WHEN c.service_modes ? 'vri' AND NOT c.service_modes ? 'vrs' THEN 'vri'
                    WHEN c.service_modes ? 'vrs' THEN 'vrs'
                    WHEN q.target_phone IS NOT NULL THEN 'vrs'
                    ELSE 'vri'
                END
            ) AS service_mode
        FROM queue_requests q
        LEFT JOIN clients c ON c.id = q.client_id
        WHERE q.status = $1
        ORDER BY q.position
        `, [status]);
    // Calculate wait times
    return requests.map((r) => {
        const createdAt = r.created_at ? new Date(r.created_at) : new Date();
        const now = new Date();
        const waitSeconds = Math.floor((now.getTime() - createdAt.getTime()) / 1000);
        return {
            ...r,
            wait_seconds: waitSeconds,
            wait_time: formatWaitTime(waitSeconds)
        };
    });
}
exports.getQueueRequests = getQueueRequests;
async function assignInterpreter(requestId, interpreterId) {
    await runUpdate('UPDATE queue_requests SET status = $1, assigned_to = $2, assigned_at = NOW() WHERE id = $3', ['assigned', interpreterId, requestId]);
    // Reorder remaining queue
    await reorderQueue();
}
exports.assignInterpreter = assignInterpreter;
async function completeRequest(requestId) {
    await runUpdate('UPDATE queue_requests SET status = $1, completed_at = NOW() WHERE id = $2', ['completed', requestId]);
}
exports.completeRequest = completeRequest;
async function removeFromQueue(requestId) {
    await runUpdate('DELETE FROM queue_requests WHERE id = $1', [requestId]);
    await reorderQueue();
}
exports.removeFromQueue = removeFromQueue;
async function reorderQueue() {
    const requests = await runQuery("SELECT id FROM queue_requests WHERE status = 'waiting' ORDER BY created_at");
    for (let i = 0; i < requests.length; i++) {
        await runUpdate('UPDATE queue_requests SET position = $1 WHERE id = $2', [i + 1, requests[i].id]);
    }
}
exports.reorderQueue = reorderQueue;
// ============================================
// VRI SESSION INVITES
// ============================================
async function createVriSessionInvite({ clientId, guestName = null, guestEmail = null, guestPhone = null, roomName = null, status = 'prepared', expiresInMinutes = 30 }) {
    const token = (0, uuid_1.v4)();
    const rows = await runQuery(`INSERT INTO vri_session_invites (
            token, client_id, guest_name, guest_email, guest_phone, room_name, status, expires_at, activated_at
        )
        VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            NOW() + ($8::int * INTERVAL '1 minute'),
            CASE WHEN $7 = 'live' THEN NOW() ELSE NULL END
        )
        RETURNING *`, [token, clientId, guestName || null, guestEmail || null, guestPhone || null, roomName || null, status, expiresInMinutes]);
    return rows[0];
}
exports.createVriSessionInvite = createVriSessionInvite;
async function attachVriInvitesToQueue({ clientId, inviteTokens = [], requestId, roomName }) {
    const tokens = Array.isArray(inviteTokens)
        ? inviteTokens.filter(token => typeof token === 'string' && token.trim()).slice(0, 20)
        : [];
    if (!clientId || !requestId || !tokens.length) {
        return [];
    }
    return await runQuery(`UPDATE vri_session_invites
         SET queue_request_id = $1,
             room_name = $2,
             status = 'waiting'
         WHERE client_id = $3
           AND token = ANY($4::text[])
           AND status IN ('prepared', 'waiting')
           AND expires_at > NOW()
         RETURNING *`, [requestId, roomName, clientId, tokens]);
}
exports.attachVriInvitesToQueue = attachVriInvitesToQueue;
async function activateVriInvitesForQueue({ requestId, roomName, liveMinutes = 240 }) {
    if (!requestId || !roomName) {
        return [];
    }
    return await runQuery(`UPDATE vri_session_invites
         SET status = 'live',
             room_name = COALESCE(room_name, $2),
             activated_at = COALESCE(activated_at, NOW()),
             expires_at = GREATEST(expires_at, NOW() + ($3::int * INTERVAL '1 minute'))
         WHERE queue_request_id = $1
           AND status IN ('prepared', 'waiting')
           AND expires_at > NOW()
         RETURNING *`, [requestId, roomName, liveMinutes]);
}
exports.activateVriInvitesForQueue = activateVriInvitesForQueue;
async function expireVriInvitesForQueue(requestId) {
    if (!requestId) {
        return [];
    }
    return await runQuery(`UPDATE vri_session_invites
         SET status = 'expired',
             ended_at = COALESCE(ended_at, NOW()),
             expires_at = LEAST(expires_at, NOW())
         WHERE queue_request_id = $1
           AND status IN ('prepared', 'waiting', 'live')
         RETURNING *`, [requestId]);
}
exports.expireVriInvitesForQueue = expireVriInvitesForQueue;
async function endVriInvitesForRoom(roomName) {
    if (!roomName) {
        return [];
    }
    return await runQuery(`UPDATE vri_session_invites
         SET status = 'expired',
             ended_at = COALESCE(ended_at, NOW()),
             expires_at = LEAST(expires_at, NOW())
         WHERE room_name = $1
           AND status IN ('prepared', 'waiting', 'live')
         RETURNING *`, [roomName]);
}
exports.endVriInvitesForRoom = endVriInvitesForRoom;
async function getVriSessionInvite(token) {
    const rows = await runQuery(`SELECT *,
            CASE
                WHEN expires_at <= NOW() THEN 'expired'
                ELSE status
            END AS public_status
         FROM vri_session_invites
         WHERE token = $1`, [token]);
    return rows[0] || null;
}
exports.getVriSessionInvite = getVriSessionInvite;
function formatWaitTime(seconds) {
    if (seconds < 60) {
        return `${seconds} sec`;
    }
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (minutes < 60) {
        return `${minutes}m ${secs}s`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
}
// ============================================
// ACTIVITY LOG
// ============================================
async function logActivity(type, description, data, createdBy) {
    const id = (0, uuid_1.v4)();
    await runInsert('INSERT INTO activity_log (id, type, description, data, created_by) VALUES ($1, $2, $3, $4, $5)', [id, type, description, JSON.stringify(data), createdBy]);
}
exports.logActivity = logActivity;
async function getActivityLog({ limit = 50, type, offset = 0 }) {
    let sql;
    let params;
    if (type) {
        sql = `SELECT * FROM activity_log WHERE type = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`;
        params = [type, limit, offset];
    }
    else {
        sql = `SELECT * FROM activity_log ORDER BY created_at DESC LIMIT $1 OFFSET $2`;
        params = [limit, offset];
    }
    const rows = await runQuery(sql, params);
    return rows.map(row => ({
        ...row,
        data: typeof row.data === 'string' ? JSON.parse(row.data) : (row.data || {})
    }));
}
exports.getActivityLog = getActivityLog;
// ============================================
// DASHBOARD STATS
// ============================================
async function getDashboardStats() {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    // Get interpreter count
    const interpreterCount = await runQuery(`
        SELECT
            COUNT(*) as total,
            SUM(CASE WHEN last_active >= NOW() - INTERVAL '5 minutes' THEN 1 ELSE 0 END) as online
        FROM interpreters WHERE active = true
    `);
    // Get client count
    const clientCount = await runQuery('SELECT COUNT(*) as total FROM clients');
    // Get queue count
    const queueCount = await runQuery("SELECT COUNT(*) as count FROM queue_requests WHERE status = 'waiting'");
    // Get active calls
    const activeCalls = await runQuery("SELECT COUNT(*) as count FROM calls WHERE status = 'active'");
    // Get today's stats
    const todayStats = await runQuery(`
        SELECT
            COUNT(*) as total_calls,
            SUM(duration_minutes) as total_minutes,
            COUNT(DISTINCT client_id) as unique_clients,
            COUNT(DISTINCT interpreter_id) as unique_interpreters
        FROM calls WHERE started_at::date = $1
    `, [today]);
    // Get week-over-week comparison
    const weekCompare = await runQuery(`
        SELECT
            COUNT(CASE WHEN started_at::date >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as this_week,
            COUNT(CASE WHEN started_at::date >= CURRENT_DATE - INTERVAL '14 days' AND started_at::date < CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as last_week
        FROM calls
    `);
    // Average wait time
    const avgWait = await runQuery(`
        SELECT AVG(EXTRACT(EPOCH FROM (assigned_at - created_at)) / 60.0) as avg_minutes
        FROM queue_requests
        WHERE assigned_at IS NOT NULL
        AND created_at >= CURRENT_DATE - INTERVAL '7 days'
    `);
    return {
        interpreters: {
            total: Number(interpreterCount[0].total),
            online: Number(interpreterCount[0].online) || 0
        },
        clients: {
            total: Number(clientCount[0].total)
        },
        queue: {
            count: Number(queueCount[0].count),
            avg_wait_minutes: Number(avgWait[0].avg_minutes) || 0
        },
        calls: {
            active: Number(activeCalls[0].count),
            today: Number(todayStats[0].total_calls) || 0,
            today_minutes: Number(todayStats[0].total_minutes) || 0
        },
        growth: {
            this_week: Number(weekCompare[0].this_week) || 0,
            last_week: Number(weekCompare[0].last_week) || 0
        }
    };
}
exports.getDashboardStats = getDashboardStats;
// ============================================
// USAGE STATS
// ============================================
async function getDailyUsageStats(days = 7) {
    const safeDays = Math.max(1, Math.min(365, Math.floor(Number(days) || 7)));
    return await runQuery(`
        SELECT
            started_at::date as date,
            COUNT(*) as calls,
            SUM(duration_minutes) as minutes,
            COUNT(DISTINCT client_id) as unique_clients,
            COUNT(DISTINCT interpreter_id) as unique_interpreters
        FROM calls
        WHERE started_at::date >= CURRENT_DATE - ($1 || ' days')::INTERVAL
        GROUP BY started_at::date
        ORDER BY date
    `, [safeDays]);
}
exports.getDailyUsageStats = getDailyUsageStats;
// ============================================
// SPEED DIAL OPERATIONS
// ============================================
async function getSpeedDialEntries(clientId) {
    return await runQuery('SELECT * FROM speed_dial WHERE client_id = $1 ORDER BY use_count DESC, name', [clientId]);
}
exports.getSpeedDialEntries = getSpeedDialEntries;
async function addSpeedDialEntry({ clientId, name, phoneNumber, category }) {
    const id = (0, uuid_1.v4)();
    await runInsert('INSERT INTO speed_dial (id, client_id, name, phone_number, category) VALUES ($1, $2, $3, $4, $5)', [id, clientId, name, phoneNumber, category || 'personal']);
    return { id, name, phoneNumber };
}
exports.addSpeedDialEntry = addSpeedDialEntry;
async function updateSpeedDialEntry(id, clientId, { name, phoneNumber, category }) {
    const updates = [];
    const params = [];
    let paramIdx = 1;
    if (name !== undefined) {
        updates.push(`name = $${paramIdx++}`);
        params.push(name);
    }
    if (phoneNumber !== undefined) {
        updates.push(`phone_number = $${paramIdx++}`);
        params.push(phoneNumber);
    }
    if (category !== undefined) {
        updates.push(`category = $${paramIdx++}`);
        params.push(category);
    }
    if (updates.length > 0) {
        params.push(id, clientId);
        const result = await runUpdate(`UPDATE speed_dial SET ${updates.join(', ')} WHERE id = $${paramIdx++} AND client_id = $${paramIdx}`, params);
        return result;
    }
    return 0;
}
exports.updateSpeedDialEntry = updateSpeedDialEntry;
async function deleteSpeedDialEntry(id, clientId) {
    return await runUpdate('DELETE FROM speed_dial WHERE id = $1 AND client_id = $2', [id, clientId]);
}
exports.deleteSpeedDialEntry = deleteSpeedDialEntry;
async function incrementSpeedDialUsage(id) {
    await runUpdate('UPDATE speed_dial SET use_count = use_count + 1, last_used = NOW() WHERE id = $1', [id]);
}
exports.incrementSpeedDialUsage = incrementSpeedDialUsage;
// ============================================
// CLIENT PHONE NUMBER OPERATIONS
// ============================================
async function getClientPhoneNumbers(clientId) {
    return await runQuery('SELECT * FROM client_phone_numbers WHERE client_id = $1 AND active = true', [clientId]);
}
exports.getClientPhoneNumbers = getClientPhoneNumbers;
async function assignClientPhoneNumber({ clientId, phoneNumber, isPrimary }) {
    const id = (0, uuid_1.v4)();
    await runUpdate('DELETE FROM client_phone_numbers WHERE phone_number = $1', [phoneNumber]);
    if (isPrimary) {
        await runUpdate('UPDATE client_phone_numbers SET is_primary = false WHERE client_id = $1', [clientId]);
    }
    await runInsert('INSERT INTO client_phone_numbers (id, client_id, phone_number, is_primary) VALUES ($1, $2, $3, $4)', [id, clientId, phoneNumber, !!isPrimary]);
    return { id, phoneNumber, isPrimary };
}
exports.assignClientPhoneNumber = assignClientPhoneNumber;
// ============================================
// INTERPRETER SHIFT OPERATIONS
// ============================================
async function getInterpreterShifts(interpreterId, startDate, endDate) {
    let sql = 'SELECT * FROM interpreter_shifts WHERE interpreter_id = $1';
    const params = [interpreterId];
    let paramIdx = 2;
    if (startDate) {
        sql += ` AND date >= $${paramIdx++}`;
        params.push(startDate);
    }
    if (endDate) {
        sql += ` AND date <= $${paramIdx++}`;
        params.push(endDate);
    }
    sql += ' ORDER BY date DESC';
    return await runQuery(sql, params);
}
exports.getInterpreterShifts = getInterpreterShifts;
async function createInterpreterShift({ interpreterId, date, startTime, endTime, totalMinutes, status }) {
    const id = (0, uuid_1.v4)();
    const rows = await runQuery(`INSERT INTO interpreter_shifts (id, interpreter_id, date, start_time, end_time, total_minutes, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (interpreter_id, date)
         DO UPDATE SET
            start_time = EXCLUDED.start_time,
            end_time = EXCLUDED.end_time,
            total_minutes = EXCLUDED.total_minutes,
            status = EXCLUDED.status
         RETURNING *`, [id, interpreterId, date, startTime, endTime || null, totalMinutes || 0, status || 'scheduled']);
    return rows[0];
}
exports.createInterpreterShift = createInterpreterShift;
async function updateInterpreterShift(id, { interpreterId, endTime, totalMinutes, status }) {
    const updates = [];
    const params = [];
    let paramIdx = 1;
    if (endTime !== undefined) {
        updates.push(`end_time = $${paramIdx++}`);
        params.push(endTime);
    }
    if (totalMinutes !== undefined) {
        updates.push(`total_minutes = $${paramIdx++}`);
        params.push(totalMinutes);
    }
    if (status !== undefined) {
        updates.push(`status = $${paramIdx++}`);
        params.push(status);
    }
    if (updates.length > 0) {
        params.push(id);
        const idParam = paramIdx++;
        let where = `id = $${idParam}`;
        if (interpreterId) {
            params.push(interpreterId);
            where += ` AND interpreter_id = $${paramIdx++}`;
        }
        const rows = await runQuery(`UPDATE interpreter_shifts SET ${updates.join(', ')} WHERE ${where} RETURNING *`, params);
        return rows[0];
    }
    const rows = interpreterId
        ? await runQuery('SELECT * FROM interpreter_shifts WHERE id = $1 AND interpreter_id = $2', [id, interpreterId])
        : await runQuery('SELECT * FROM interpreter_shifts WHERE id = $1', [id]);
    return rows[0] || null;
}
exports.updateInterpreterShift = updateInterpreterShift;
async function getInterpreterScheduleWindows({ startDate, endDate, tenantId, serviceMode, language } = {}) {
    const params = [];
    let sql = `
        SELECT
            w.*,
            i.name AS interpreter_name,
            i.email AS interpreter_email,
            i.service_modes AS interpreter_service_modes,
            i.languages AS interpreter_languages
        FROM interpreter_schedule_windows w
        JOIN interpreters i ON i.id = w.interpreter_id
        WHERE 1 = 1`;
    if (startDate) {
        params.push(startDate);
        sql += ` AND w.starts_at::date >= $${params.length}`;
    }
    if (endDate) {
        params.push(endDate);
        sql += ` AND w.starts_at::date <= $${params.length}`;
    }
    if (tenantId) {
        params.push(tenantId);
        sql += ` AND w.tenant_id = $${params.length}`;
    }
    if (serviceMode) {
        params.push(serviceMode);
        sql += ` AND w.service_modes ? $${params.length}`;
    }
    if (language) {
        params.push(language);
        sql += ` AND w.languages ? $${params.length}`;
    }
    sql += ' ORDER BY w.starts_at ASC, i.name ASC';
    return await runQuery(sql, params);
}
exports.getInterpreterScheduleWindows = getInterpreterScheduleWindows;
async function createInterpreterScheduleWindow({ interpreterId, startsAt, endsAt, tenantId = 'malka', serviceModes = ['vrs'], languages = ['ASL'], status = 'scheduled', managerNote }) {
    const id = (0, uuid_1.v4)();
    const rows = await runQuery(`INSERT INTO interpreter_schedule_windows
            (id, interpreter_id, starts_at, ends_at, tenant_id, service_modes, languages, status, manager_note)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9)
         RETURNING *`, [id, interpreterId, startsAt, endsAt, tenantId, JSON.stringify(serviceModes), JSON.stringify(languages), status, managerNote || null]);
    return rows[0];
}
exports.createInterpreterScheduleWindow = createInterpreterScheduleWindow;
async function updateInterpreterScheduleWindow(id, updates = {}) {
    const fields = [];
    const params = [];
    const mapping = {
        interpreterId: 'interpreter_id',
        startsAt: 'starts_at',
        endsAt: 'ends_at',
        tenantId: 'tenant_id',
        serviceModes: 'service_modes',
        languages: 'languages',
        status: 'status',
        managerNote: 'manager_note'
    };
    for (const [key, column] of Object.entries(mapping)) {
        if (updates[key] === undefined)
            continue;
        params.push(key === 'serviceModes' || key === 'languages' ? JSON.stringify(updates[key]) : updates[key]);
        fields.push(`${column} = $${params.length}${key === 'serviceModes' || key === 'languages' ? '::jsonb' : ''}`);
    }
    if (!fields.length) {
        const rows = await runQuery('SELECT * FROM interpreter_schedule_windows WHERE id = $1', [id]);
        return rows[0] || null;
    }
    params.push(id);
    const rows = await runQuery(`UPDATE interpreter_schedule_windows
         SET ${fields.join(', ')}, updated_at = NOW()
         WHERE id = $${params.length}
         RETURNING *`, params);
    return rows[0] || null;
}
exports.updateInterpreterScheduleWindow = updateInterpreterScheduleWindow;
// ============================================
// INTERPRETER EARNINGS OPERATIONS
// ============================================
async function getInterpreterEarnings(interpreterId, periodStart, periodEnd) {
    return await runQuery(`SELECT * FROM interpreter_earnings
         WHERE interpreter_id = $1 AND period_start >= $2 AND period_end <= $3
         ORDER BY period_start DESC`, [interpreterId, periodStart, periodEnd]);
}
exports.getInterpreterEarnings = getInterpreterEarnings;
async function getInterpreterAnalytics(interpreterId, periodStart, periodEnd) {
    const calls = await runQuery(`SELECT
            COUNT(*) AS total_calls,
            COALESCE(SUM(duration_minutes), 0) AS total_minutes,
            COALESCE(AVG(duration_minutes), 0) AS avg_duration,
            COUNT(*) FILTER (WHERE call_type = 'vrs') AS vrs_calls,
            COUNT(*) FILTER (WHERE call_type = 'vri') AS vri_calls
         FROM calls
         WHERE interpreter_id = $1
           AND started_at::date >= $2
           AND started_at::date <= $3
           AND status IN ('completed', 'ended')`, [interpreterId, periodStart, periodEnd]);
    const breaks = await runQuery(`SELECT
            COUNT(*) AS break_count,
            COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(ended_at, NOW()) - started_at)) / 60), 0) AS break_minutes
         FROM interpreter_break_sessions
         WHERE interpreter_id = $1
           AND started_at::date >= $2
           AND started_at::date <= $3`, [interpreterId, periodStart, periodEnd]);
    const availability = await runQuery(`SELECT
            COUNT(*) AS session_count,
            COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(ended_at, NOW()) - started_at)) / 60), 0) AS signed_on_minutes
         FROM interpreter_availability_sessions
         WHERE interpreter_id = $1
           AND status IN ('available', 'active')
           AND started_at::date >= $2
           AND started_at::date <= $3`, [interpreterId, periodStart, periodEnd]);
    const callRow = calls[0] || {};
    const breakRow = breaks[0] || {};
    const availabilityRow = availability[0] || {};
    const totalMinutes = Number(callRow.total_minutes) || 0;
    const signedOnMinutes = Number(availabilityRow.signed_on_minutes) || 0;
    return {
        periodStart,
        periodEnd,
        calls: {
            total: Number(callRow.total_calls) || 0,
            vrs: Number(callRow.vrs_calls) || 0,
            vri: Number(callRow.vri_calls) || 0,
            minutes: totalMinutes,
            averageMinutes: Math.round(Number(callRow.avg_duration) || 0)
        },
        availability: {
            sessions: Number(availabilityRow.session_count) || 0,
            signedOnMinutes,
            utilizationRate: signedOnMinutes > 0 ? Math.round((totalMinutes / signedOnMinutes) * 1000) / 10 : 0
        },
        breaks: {
            count: Number(breakRow.break_count) || 0,
            minutes: Math.round(Number(breakRow.break_minutes) || 0)
        }
    };
}
exports.getInterpreterAnalytics = getInterpreterAnalytics;
async function logInterpreterQueueEvent({ interpreterId, requestId, eventType, serviceMode, language, waitSeconds = 0 }) {
    const id = (0, uuid_1.v4)();
    const rows = await runQuery(`INSERT INTO interpreter_queue_events
            (id, interpreter_id, request_id, event_type, service_mode, language, wait_seconds)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`, [id, interpreterId, requestId || null, eventType, serviceMode || null, language || null, Math.max(0, Number(waitSeconds) || 0)]);
    return rows[0];
}
exports.logInterpreterQueueEvent = logInterpreterQueueEvent;
async function getInterpreterUtilizationSummary(interpreterId, periodStart, periodEnd) {
    const calls = await runQuery(`SELECT
            COUNT(*) AS total_calls,
            COALESCE(SUM(duration_minutes), 0) AS in_call_minutes,
            COALESCE(SUM(duration_minutes) FILTER (WHERE call_type = 'vrs'), 0) AS vrs_minutes,
            COALESCE(SUM(duration_minutes) FILTER (WHERE call_type = 'vri'), 0) AS vri_minutes
         FROM calls
         WHERE interpreter_id = $1
           AND started_at::date >= $2
           AND started_at::date <= $3
           AND status IN ('completed', 'ended')`, [interpreterId, periodStart, periodEnd]);
    const availability = await runQuery(`SELECT
            COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(ended_at, NOW()) - started_at)) / 60), 0) AS hands_up_minutes
         FROM interpreter_availability_sessions
         WHERE interpreter_id = $1
           AND status IN ('available', 'active')
           AND started_at::date >= $2
           AND started_at::date <= $3`, [interpreterId, periodStart, periodEnd]);
    const breaks = await runQuery(`SELECT
            COUNT(*) AS break_count,
            COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(ended_at, NOW()) - started_at)) / 60), 0) AS break_minutes
         FROM interpreter_break_sessions
         WHERE interpreter_id = $1
           AND started_at::date >= $2
           AND started_at::date <= $3`, [interpreterId, periodStart, periodEnd]);
    const scheduled = await runQuery(`SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (ends_at - starts_at)) / 60), 0) AS scheduled_minutes
         FROM interpreter_schedule_windows
         WHERE interpreter_id = $1
           AND starts_at::date >= $2
           AND starts_at::date <= $3
           AND status IN ('scheduled', 'confirmed', 'pending')`, [interpreterId, periodStart, periodEnd]);
    const events = await runQuery(`SELECT
            COUNT(*) FILTER (WHERE event_type = 'accepted') AS accepted,
            COUNT(*) FILTER (WHERE event_type = 'declined') AS declined,
            COUNT(*) FILTER (WHERE event_type = 'no_answer') AS no_answer,
            COALESCE(AVG(wait_seconds) FILTER (WHERE event_type = 'accepted'), 0) AS avg_wait_seconds,
            COUNT(*) FILTER (WHERE event_type = 'accepted' AND wait_seconds > 120) AS sla_breaches
         FROM interpreter_queue_events
         WHERE interpreter_id = $1
           AND created_at::date >= $2
           AND created_at::date <= $3`, [interpreterId, periodStart, periodEnd]);
    const earnings = await runQuery(`SELECT COALESCE(SUM(net_earnings), SUM(total_earnings), 0) AS earnings_preview
         FROM interpreter_earnings
         WHERE interpreter_id = $1
           AND period_start >= $2
           AND period_end <= $3`, [interpreterId, periodStart, periodEnd]);
    const callRow = calls[0] || {};
    const availabilityRow = availability[0] || {};
    const breakRow = breaks[0] || {};
    const scheduleRow = scheduled[0] || {};
    const eventRow = events[0] || {};
    const earningsRow = earnings[0] || {};
    const targetMinutes = 40 * 60;
    const scheduledMinutes = Math.round(Number(scheduleRow.scheduled_minutes) || 0);
    const handsUpMinutes = Math.round(Number(availabilityRow.hands_up_minutes) || 0);
    const inCallMinutes = Math.round(Number(callRow.in_call_minutes) || 0);
    const breakMinutes = Math.round(Number(breakRow.break_minutes) || 0);
    const accepted = Number(eventRow.accepted) || 0;
    const declined = Number(eventRow.declined) || 0;
    const noAnswer = Number(eventRow.no_answer) || 0;
    const offered = accepted + declined + noAnswer;
    return {
        periodStart,
        periodEnd,
        targetMinutes,
        scheduledMinutes,
        signedOnMinutes: handsUpMinutes + breakMinutes,
        handsUpMinutes,
        inCallMinutes,
        breakMinutes,
        afterCallAdminMinutes: Math.max(0, handsUpMinutes - inCallMinutes),
        remainingTargetMinutes: Math.max(0, targetMinutes - scheduledMinutes),
        earningsPreview: Number(earningsRow.earnings_preview) || 0,
        calls: {
            total: Number(callRow.total_calls) || 0,
            vrsMinutes: Math.round(Number(callRow.vrs_minutes) || 0),
            vriMinutes: Math.round(Number(callRow.vri_minutes) || 0)
        },
        queue: {
            accepted,
            declined,
            noAnswer,
            offered,
            acceptanceRate: offered > 0 ? Math.round((accepted / offered) * 1000) / 10 : 0,
            declineRate: offered > 0 ? Math.round((declined / offered) * 1000) / 10 : 0,
            noAnswerRate: offered > 0 ? Math.round((noAnswer / offered) * 1000) / 10 : 0
        },
        sla: {
            avgWaitSeconds: Math.round(Number(eventRow.avg_wait_seconds) || 0),
            breachCount: Number(eventRow.sla_breaches) || 0,
            breachRate: accepted > 0 ? Math.round((Number(eventRow.sla_breaches || 0) / accepted) * 1000) / 10 : 0
        },
        utilizationRate: handsUpMinutes > 0 ? Math.round((inCallMinutes / handsUpMinutes) * 1000) / 10 : 0,
        adherenceRate: scheduledMinutes > 0 ? Math.round((handsUpMinutes / scheduledMinutes) * 1000) / 10 : 0
    };
}
exports.getInterpreterUtilizationSummary = getInterpreterUtilizationSummary;
async function getAdminUtilizationSummary({ periodStart, periodEnd, tenantId, serviceMode, language }) {
    const interpreters = await getAllInterpreters();
    const arrayValue = (value) => {
        if (Array.isArray(value))
            return value;
        if (typeof value === 'string') {
            try {
                const parsed = JSON.parse(value);
                return Array.isArray(parsed) ? parsed : [];
            }
            catch {
                return value.split(',').map(item => item.trim()).filter(Boolean);
            }
        }
        return [];
    };
    const filtered = interpreters.filter((interpreter) => {
        const modes = arrayValue(interpreter.service_modes);
        const languages = arrayValue(interpreter.languages);
        if (tenantId && interpreter.tenant_id && interpreter.tenant_id !== tenantId)
            return false;
        if (serviceMode && !modes.includes(serviceMode))
            return false;
        if (language && !languages.includes(language))
            return false;
        return true;
    });
    const rows = [];
    for (const interpreter of filtered) {
        const summary = await getInterpreterUtilizationSummary(interpreter.id, periodStart, periodEnd);
        rows.push({
            interpreterId: interpreter.id,
            name: interpreter.name,
            email: interpreter.email,
            tenantId: interpreter.tenant_id || 'malka',
            serviceModes: arrayValue(interpreter.service_modes),
            languages: arrayValue(interpreter.languages),
            ...summary
        });
    }
    const totals = rows.reduce((acc, row) => {
        acc.scheduledMinutes += row.scheduledMinutes;
        acc.handsUpMinutes += row.handsUpMinutes;
        acc.inCallMinutes += row.inCallMinutes;
        acc.breakMinutes += row.breakMinutes;
        acc.afterCallAdminMinutes += row.afterCallAdminMinutes;
        acc.accepted += row.queue.accepted;
        acc.declined += row.queue.declined;
        acc.noAnswer += row.queue.noAnswer;
        acc.slaBreaches += row.sla.breachCount;
        acc.earningsPreview += row.earningsPreview;
        return acc;
    }, {
        scheduledMinutes: 0,
        handsUpMinutes: 0,
        inCallMinutes: 0,
        breakMinutes: 0,
        afterCallAdminMinutes: 0,
        accepted: 0,
        declined: 0,
        noAnswer: 0,
        slaBreaches: 0,
        earningsPreview: 0
    });
    const offered = totals.accepted + totals.declined + totals.noAnswer;
    return {
        periodStart,
        periodEnd,
        totals: {
            ...totals,
            offered,
            fillRate: totals.scheduledMinutes > 0 ? Math.round((totals.handsUpMinutes / totals.scheduledMinutes) * 1000) / 10 : 0,
            productivityRate: totals.handsUpMinutes > 0 ? Math.round((totals.inCallMinutes / totals.handsUpMinutes) * 1000) / 10 : 0,
            acceptanceRate: offered > 0 ? Math.round((totals.accepted / offered) * 1000) / 10 : 0,
            declineRate: offered > 0 ? Math.round((totals.declined / offered) * 1000) / 10 : 0,
            noAnswerRate: offered > 0 ? Math.round((totals.noAnswer / offered) * 1000) / 10 : 0,
            slaBreachRate: totals.accepted > 0 ? Math.round((totals.slaBreaches / totals.accepted) * 1000) / 10 : 0
        },
        interpreters: rows
    };
}
exports.getAdminUtilizationSummary = getAdminUtilizationSummary;
async function getInterpreterBreaks(interpreterId, limit = 20) {
    return await runQuery(`SELECT *
         FROM interpreter_break_sessions
         WHERE interpreter_id = $1
         ORDER BY started_at DESC
         LIMIT $2`, [interpreterId, limit]);
}
exports.getInterpreterBreaks = getInterpreterBreaks;
async function startInterpreterBreak({ interpreterId, breakType, reason, paid = false }) {
    const id = (0, uuid_1.v4)();
    return await runInsert(`INSERT INTO interpreter_break_sessions (id, interpreter_id, break_type, reason, paid)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`, [id, interpreterId, breakType || 'general', reason || null, !!paid]);
}
exports.startInterpreterBreak = startInterpreterBreak;
async function endInterpreterBreak({ interpreterId, breakId }) {
    const rows = await runQuery(`UPDATE interpreter_break_sessions
         SET ended_at = NOW()
         WHERE id = $1 AND interpreter_id = $2 AND ended_at IS NULL
         RETURNING *`, [breakId, interpreterId]);
    return rows[0] || null;
}
exports.endInterpreterBreak = endInterpreterBreak;
async function getInterpreterContinuityNotes(interpreterId, clientId, limit = 20) {
    const params = [interpreterId];
    let sql = `
        SELECT n.*, c.name AS client_name
        FROM interpreter_continuity_notes n
        LEFT JOIN clients c ON c.id = n.client_id
        WHERE n.interpreter_id = $1`;
    if (clientId) {
        params.push(clientId);
        sql += ` AND n.client_id = $${params.length}`;
    }
    params.push(limit);
    sql += ` ORDER BY n.updated_at DESC LIMIT $${params.length}`;
    return await runQuery(sql, params);
}
exports.getInterpreterContinuityNotes = getInterpreterContinuityNotes;
async function createInterpreterContinuityNote({ interpreterId, clientId, callId, note, visibility, preferenceTags }) {
    const id = (0, uuid_1.v4)();
    return await runInsert(`INSERT INTO interpreter_continuity_notes
            (id, interpreter_id, client_id, call_id, note, visibility, preference_tags)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`, [id, interpreterId, clientId || null, callId || null, note, visibility || 'self', JSON.stringify(preferenceTags || [])]);
}
exports.createInterpreterContinuityNote = createInterpreterContinuityNote;
async function createPostCallSurvey({ callId, respondentId, respondentRole, rating, tags, comments }) {
    const id = (0, uuid_1.v4)();
    return await runInsert(`INSERT INTO post_call_surveys (id, call_id, respondent_id, respondent_role, rating, tags, comments)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`, [id, callId || null, respondentId, respondentRole, rating, JSON.stringify(tags || []), comments || null]);
}
exports.createPostCallSurvey = createPostCallSurvey;
async function getInterpreterTeamAssignments(interpreterId, limit = 20) {
    return await runQuery(`SELECT t.*, teammate.name AS teammate_name, primary_interp.name AS primary_interpreter_name
         FROM interpreter_team_assignments t
         LEFT JOIN interpreters teammate ON teammate.id = t.teammate_interpreter_id
         LEFT JOIN interpreters primary_interp ON primary_interp.id = t.primary_interpreter_id
         WHERE t.primary_interpreter_id = $1 OR t.teammate_interpreter_id = $1
         ORDER BY t.requested_at DESC
         LIMIT $2`, [interpreterId, limit]);
}
exports.getInterpreterTeamAssignments = getInterpreterTeamAssignments;
async function requestInterpreterTeamAssignment({ interpreterId, teammateInterpreterId, callId, roomName, notes }) {
    const id = (0, uuid_1.v4)();
    return await runInsert(`INSERT INTO interpreter_team_assignments
            (id, primary_interpreter_id, teammate_interpreter_id, call_id, room_name, requested_by, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`, [id, interpreterId, teammateInterpreterId || null, callId || null, roomName || null, interpreterId, notes || null]);
}
exports.requestInterpreterTeamAssignment = requestInterpreterTeamAssignment;
// ============================================
// CALL HISTORY OPERATIONS
// ============================================
async function getClientCallHistory(clientId, limit = 20, offset = 0) {
    return await runQuery(`SELECT c.*, i.name as interpreter_name,
                callee.name as callee_name,
                COALESCE(callee_phone.phone_number, q.target_phone) as callee_phone
         FROM calls c
         LEFT JOIN interpreters i ON i.id = c.interpreter_id
         LEFT JOIN clients callee ON callee.id = c.callee_id
         LEFT JOIN client_phone_numbers callee_phone
            ON callee_phone.client_id = callee.id
           AND callee_phone.is_primary = true
           AND callee_phone.active = true
         LEFT JOIN queue_requests q
            ON q.room_name = c.room_name
           AND q.client_id = c.client_id
         WHERE c.client_id = $1
         ORDER BY c.started_at DESC
         LIMIT $2 OFFSET $3`, [clientId, limit, offset]);
}
exports.getClientCallHistory = getClientCallHistory;
async function getInterpreterCallHistory(interpreterId, limit = 20, offset = 0) {
    return await runQuery(`SELECT c.*, cl.name as client_name
         FROM calls c
         LEFT JOIN clients cl ON cl.id = c.client_id
         WHERE c.interpreter_id = $1
         ORDER BY c.started_at DESC
         LIMIT $2 OFFSET $3`, [interpreterId, limit, offset]);
}
exports.getInterpreterCallHistory = getInterpreterCallHistory;
// ============================================
// P2P CLIENT-TO-CLIENT OPERATIONS
// ============================================
async function getClientByPhoneNumber(phoneNumber) {
    const rows = await runQuery(`SELECT c.*, cpn.phone_number, cpn.is_primary
         FROM client_phone_numbers cpn
         JOIN clients c ON c.id = cpn.client_id
         WHERE cpn.phone_number = $1 AND cpn.active = true`, [phoneNumber]);
    return rows[0] ? { ...rows[0], service_modes: normalizeServiceModes(rows[0].service_modes) } : null;
}
exports.getClientByPhoneNumber = getClientByPhoneNumber;
async function createP2PCall({ callerId, calleeId, roomName }) {
    const id = (0, uuid_1.v4)();
    await runInsert('INSERT INTO calls (id, client_id, interpreter_id, room_name, language, status, callee_id) VALUES ($1, $2, NULL, $3, NULL, $4, $5)', [id, callerId, roomName, 'p2p_active', calleeId]);
    return id;
}
exports.createP2PCall = createP2PCall;
async function createMissedCall({ callerId, calleePhone, calleeClientId, roomName }) {
    const id = (0, uuid_1.v4)();
    await runInsert('INSERT INTO missed_calls (id, caller_id, callee_phone, callee_client_id, room_name) VALUES ($1, $2, $3, $4, $5)', [id, callerId, calleePhone, calleeClientId || null, roomName || null]);
    return { id };
}
exports.createMissedCall = createMissedCall;
async function getMissedCalls(clientId) {
    return await runQuery(`SELECT mc.*, c.name as caller_name, cp.phone_number as caller_phone
         FROM missed_calls mc
         JOIN clients c ON c.id = mc.caller_id
         LEFT JOIN client_phone_numbers cp
            ON cp.client_id = c.id
           AND cp.is_primary = true
           AND cp.active = true
         WHERE mc.callee_client_id = $1
         ORDER BY mc.created_at DESC`, [clientId]);
}
exports.getMissedCalls = getMissedCalls;
async function markMissedCallsSeen(clientId) {
    await runUpdate('UPDATE missed_calls SET seen = true WHERE callee_client_id = $1 AND seen = false', [clientId]);
}
exports.markMissedCallsSeen = markMissedCallsSeen;
async function getActiveP2PRoomsForClient(clientId) {
    return await runQuery(`SELECT c.id as call_id, c.room_name, c.started_at, c.client_id as caller_id,
                caller.name as caller_name,
                callee.name as callee_name,
                callee.id as callee_id
         FROM calls c
         LEFT JOIN clients caller ON caller.id = c.client_id
         LEFT JOIN clients callee ON callee.id = c.callee_id
         WHERE c.status = 'p2p_active'
           AND (c.client_id = $1 OR c.callee_id = $1)
         ORDER BY c.started_at DESC`, [clientId]);
}
exports.getActiveP2PRoomsForClient = getActiveP2PRoomsForClient;
// ============================================
// CONTACTS & ADDRESS BOOK OPERATIONS
// ============================================
function sanitizePhoneNumberRaw(raw) {
    if (typeof raw !== 'string')
        return null;
    const cleaned = raw.replace(/[^\d+]/g, '');
    if (cleaned.length < 7 || cleaned.length > 16)
        return null;
    return cleaned;
}
async function getContacts(clientId, { search, groupId, favoritesOnly } = {}) {
    let sql = `
        SELECT c.*,
            STRING_AGG(cg.id::text, ',') AS group_ids,
            STRING_AGG(cg.name, ',') AS group_names,
            (SELECT MAX(started_at) FROM calls
             WHERE (client_id = $1 AND callee_id = c.linked_client_id)
                OR (client_id = $1 AND room_name IN
                    (SELECT room_name FROM calls cc WHERE cc.client_id = c.linked_client_id)))
                AS last_call_date
        FROM contacts c
        LEFT JOIN contact_group_members cgm ON cgm.contact_id = c.id
        LEFT JOIN contact_groups cg ON cg.id = cgm.group_id
        WHERE c.client_id = $1 AND c.merged_into IS NULL
    `;
    const params = [clientId];
    let idx = 2;
    if (search) {
        sql += ` AND (c.name ILIKE $${idx} OR c.email ILIKE $${idx} OR c.phone_number ILIKE $${idx} OR c.organization ILIKE $${idx})`;
        params.push(`%${search}%`);
        idx++;
    }
    if (favoritesOnly) {
        sql += ' AND c.is_favorite = true';
    }
    sql += ' GROUP BY c.id ORDER BY c.name';
    return await runQuery(sql, params);
}
exports.getContacts = getContacts;
async function getContact(clientId, contactId) {
    const rows = await runQuery('SELECT c.* FROM contacts c WHERE c.id = $1 AND c.client_id = $2 AND c.merged_into IS NULL', [contactId, clientId]);
    if (!rows.length)
        return null;
    const contact = rows[0];
    const groups = await runQuery(`SELECT cg.* FROM contact_groups cg
         JOIN contact_group_members cgm ON cgm.group_id = cg.id
         WHERE cgm.contact_id = $1`, [contactId]);
    contact.groups = groups;
    return contact;
}
exports.getContact = getContact;
async function createContact({ clientId, name, email, phoneNumber, organization, notes, avatarColor, isFavorite, linkedClientId }) {
    const id = (0, uuid_1.v4)();
    const sanitized = phoneNumber ? sanitizePhoneNumberRaw(phoneNumber) : null;
    await runInsert(`INSERT INTO contacts (id, client_id, name, email, phone_number, organization, notes, avatar_color, is_favorite, linked_client_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`, [id, clientId, name, email || null, sanitized, organization || null, notes || null, avatarColor || null, !!isFavorite, linkedClientId || null]);
    return { id, name };
}
exports.createContact = createContact;
async function updateContact(clientId, contactId, updates) {
    const fields = [];
    const params = [];
    const allowed = ['name', 'email', 'phone_number', 'organization', 'notes', 'avatar_color', 'is_favorite', 'linked_client_id'];
    let idx = 1;
    for (const key of allowed) {
        if (updates[key] !== undefined) {
            if (key === 'phone_number' && updates[key]) {
                const sanitized = sanitizePhoneNumberRaw(updates[key]);
                if (!sanitized)
                    continue;
                fields.push(`${key} = $${idx++}`);
                params.push(sanitized);
            }
            else if (key === 'is_favorite') {
                fields.push(`${key} = $${idx++}`);
                params.push(!!updates[key]);
            }
            else {
                fields.push(`${key} = $${idx++}`);
                params.push(updates[key]);
            }
        }
    }
    if (fields.length === 0)
        return 0;
    fields.push('updated_at = NOW()');
    params.push(contactId, clientId);
    return await runUpdate(`UPDATE contacts SET ${fields.join(', ')} WHERE id = $${idx++} AND client_id = $${idx}`, params);
}
exports.updateContact = updateContact;
async function deleteContact(clientId, contactId) {
    await runUpdate('DELETE FROM contact_group_members WHERE contact_id = $1', [contactId]);
    return await runUpdate('DELETE FROM contacts WHERE id = $1 AND client_id = $2', [contactId, clientId]);
}
exports.deleteContact = deleteContact;
// --- Contact Groups ---
async function getContactGroups(clientId) {
    return await runQuery(`SELECT cg.*, COUNT(cgm.contact_id)::int AS member_count
         FROM contact_groups cg
         LEFT JOIN contact_group_members cgm ON cgm.group_id = cg.id
         WHERE cg.client_id = $1
         GROUP BY cg.id
         ORDER BY cg.sort_order, cg.name`, [clientId]);
}
exports.getContactGroups = getContactGroups;
async function createContactGroup({ clientId, name, color, sortOrder }) {
    const id = (0, uuid_1.v4)();
    await runInsert('INSERT INTO contact_groups (id, client_id, name, color, sort_order) VALUES ($1, $2, $3, $4, $5)', [id, clientId, name, color || null, sortOrder || 0]);
    return { id, name };
}
exports.createContactGroup = createContactGroup;
async function updateContactGroup(clientId, groupId, { name, color, sortOrder }) {
    const fields = [];
    const params = [];
    let idx = 1;
    if (name !== undefined) {
        fields.push(`name = $${idx++}`);
        params.push(name);
    }
    if (color !== undefined) {
        fields.push(`color = $${idx++}`);
        params.push(color);
    }
    if (sortOrder !== undefined) {
        fields.push(`sort_order = $${idx++}`);
        params.push(sortOrder);
    }
    if (!fields.length)
        return 0;
    params.push(groupId, clientId);
    return await runUpdate(`UPDATE contact_groups SET ${fields.join(', ')} WHERE id = $${idx++} AND client_id = $${idx}`, params);
}
exports.updateContactGroup = updateContactGroup;
async function deleteContactGroup(clientId, groupId) {
    await runUpdate('DELETE FROM contact_group_members WHERE group_id = $1', [groupId]);
    return await runUpdate('DELETE FROM contact_groups WHERE id = $1 AND client_id = $2', [groupId, clientId]);
}
exports.deleteContactGroup = deleteContactGroup;
async function setContactGroups(clientId, contactId, groupIds) {
    await runUpdate('DELETE FROM contact_group_members WHERE contact_id = $1', [contactId]);
    for (const gid of groupIds) {
        const id = (0, uuid_1.v4)();
        await runInsert('INSERT INTO contact_group_members (id, contact_id, group_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [id, contactId, gid]);
    }
}
exports.setContactGroups = setContactGroups;
// --- Block List ---
async function getBlockedContacts(clientId) {
    return await runQuery('SELECT * FROM blocked_contacts WHERE client_id = $1 ORDER BY created_at DESC', [clientId]);
}
exports.getBlockedContacts = getBlockedContacts;
async function blockContact({ clientId, blockedPhone, blockedEmail, blockedClientId, reason }) {
    const id = (0, uuid_1.v4)();
    await runInsert(`INSERT INTO blocked_contacts (id, client_id, blocked_phone, blocked_email, blocked_client_id, reason)
         VALUES ($1, $2, $3, $4, $5, $6)`, [id, clientId, blockedPhone || null, blockedEmail || null, blockedClientId || null, reason || null]);
    return { id };
}
exports.blockContact = blockContact;
async function unblockContact(clientId, blockId) {
    return await runUpdate('DELETE FROM blocked_contacts WHERE id = $1 AND client_id = $2', [blockId, clientId]);
}
exports.unblockContact = unblockContact;
async function isContactBlocked(clientId, phoneNumber, email) {
    const conditions = [];
    const params = [clientId];
    let idx = 2;
    if (phoneNumber) {
        conditions.push(`blocked_phone = $${idx++}`);
        params.push(phoneNumber);
    }
    if (email) {
        conditions.push(`blocked_email = $${idx++}`);
        params.push(email);
    }
    if (!conditions.length)
        return false;
    const rows = await runQuery(`SELECT id FROM blocked_contacts WHERE client_id = $1 AND (${conditions.join(' OR ')}) LIMIT 1`, params);
    return rows.length > 0;
}
exports.isContactBlocked = isContactBlocked;
// --- Merge / Dedup ---
async function findDuplicateContacts(clientId) {
    const byPhone = await runQuery(`SELECT phone_number, COUNT(*) AS cnt FROM contacts
         WHERE client_id = $1 AND phone_number IS NOT NULL AND merged_into IS NULL
         GROUP BY phone_number HAVING COUNT(*) > 1`, [clientId]);
    const byEmail = await runQuery(`SELECT email, COUNT(*) AS cnt FROM contacts
         WHERE client_id = $1 AND email IS NOT NULL AND merged_into IS NULL
         GROUP BY email HAVING COUNT(*) > 1`, [clientId]);
    const duplicates = [];
    for (const row of byPhone) {
        const contacts = await runQuery('SELECT * FROM contacts WHERE client_id = $1 AND phone_number = $2 AND merged_into IS NULL', [clientId, row.phone_number]);
        duplicates.push({ field: 'phone_number', value: row.phone_number, contacts });
    }
    for (const row of byEmail) {
        const contacts = await runQuery('SELECT * FROM contacts WHERE client_id = $1 AND email = $2 AND merged_into IS NULL', [clientId, row.email]);
        duplicates.push({ field: 'email', value: row.email, contacts });
    }
    return duplicates;
}
exports.findDuplicateContacts = findDuplicateContacts;
async function mergeContacts(clientId, { primaryId, secondaryIds }) {
    if (!Array.isArray(secondaryIds) || !secondaryIds.length)
        return 0;
    const placeholders = secondaryIds.map((_, i) => `$${i + 2}`).join(',');
    await runUpdate(`UPDATE contact_group_members SET contact_id = $1 WHERE contact_id IN (${placeholders}) ON CONFLICT DO NOTHING`, [primaryId, ...secondaryIds]);
    const mergePlaceholders = secondaryIds.map((_, i) => `$${i + 2}`).join(',');
    await runUpdate(`UPDATE contacts SET merged_into = $1, updated_at = NOW() WHERE id IN (${mergePlaceholders}) AND client_id = $${secondaryIds.length + 2}`, [primaryId, ...secondaryIds, clientId]);
    return secondaryIds.length;
}
exports.mergeContacts = mergeContacts;
// --- Import ---
async function importContacts(clientId, contactsList) {
    const results = { imported: 0, skipped: 0, errors: [] };
    await ensureDefaultGroups(clientId);
    for (const entry of contactsList) {
        try {
            if (!entry.name) {
                results.skipped++;
                continue;
            }
            const sanitized = entry.phone_number ? sanitizePhoneNumberRaw(entry.phone_number) : null;
            if (sanitized) {
                const existing = await runQuery('SELECT id FROM contacts WHERE client_id = $1 AND phone_number = $2 AND merged_into IS NULL LIMIT 1', [clientId, sanitized]);
                if (existing.length) {
                    results.skipped++;
                    continue;
                }
            }
            const id = (0, uuid_1.v4)();
            await runInsert(`INSERT INTO contacts (id, client_id, name, email, phone_number, organization, notes, avatar_color, is_favorite)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, [id, clientId, entry.name, entry.email || null, sanitized, entry.organization || null,
                entry.notes || null, entry.avatar_color || null, !!entry.is_favorite]);
            if (entry.group_ids?.length) {
                for (const gid of entry.group_ids) {
                    const mid = (0, uuid_1.v4)();
                    await runInsert('INSERT INTO contact_group_members (id, contact_id, group_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [mid, id, gid]);
                }
            }
            results.imported++;
        }
        catch (err) {
            results.errors.push({ name: entry.name, error: err.message });
        }
    }
    return results;
}
exports.importContacts = importContacts;
async function migrateSpeedDialToContacts(clientId) {
    const entries = await runQuery('SELECT * FROM speed_dial WHERE client_id = $1', [clientId]);
    let migrated = 0;
    for (const entry of entries) {
        const existing = await runQuery('SELECT id FROM contacts WHERE client_id = $1 AND phone_number = $2 AND merged_into IS NULL LIMIT 1', [clientId, entry.phone_number]);
        if (existing.length)
            continue;
        const id = (0, uuid_1.v4)();
        await runInsert(`INSERT INTO contacts (id, client_id, name, phone_number, organization, is_favorite)
             VALUES ($1, $2, $3, $4, $5, $6)`, [id, clientId, entry.name, entry.phone_number, 'Personal', true]);
        migrated++;
    }
    return migrated;
}
exports.migrateSpeedDialToContacts = migrateSpeedDialToContacts;
async function ensureDefaultGroups(clientId) {
    const defaults = ['Personal', 'Work', 'Family', 'Favorites'];
    for (let i = 0; i < defaults.length; i++) {
        try {
            const id = (0, uuid_1.v4)();
            await runInsert('INSERT INTO contact_groups (id, client_id, name, sort_order) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING', [id, clientId, defaults[i], i]);
        }
        catch (_) { /* already exists */ }
    }
}
exports.ensureDefaultGroups = ensureDefaultGroups;
async function getContactCallHistory(clientId, contactId) {
    const contact = await getContact(clientId, contactId);
    if (!contact)
        return [];
    const conditions = ['c.client_id = $1'];
    const params = [clientId];
    let idx = 2;
    if (contact.linked_client_id) {
        conditions.push(`(c.callee_id = $${idx} OR c.client_id = $${idx})`);
        params.push(contact.linked_client_id);
        idx++;
    }
    if (contact.phone_number) {
        conditions.push(`c.room_name IN (SELECT room_name FROM queue_requests WHERE target_phone = $${idx})`);
        params.push(contact.phone_number);
        idx++;
    }
    if (conditions.length <= 1)
        return [];
    params.push(50);
    return await runQuery(`SELECT c.*, cl.name AS caller_name, callee.name AS callee_name
         FROM calls c
         LEFT JOIN clients cl ON cl.id = c.client_id
         LEFT JOIN clients callee ON callee.id = c.callee_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY c.started_at DESC LIMIT $${idx}`, params);
}
exports.getContactCallHistory = getContactCallHistory;
// ============================================
// CLIENT PREFERENCES OPERATIONS
// ============================================
async function getClientPreferences(clientId) {
    const rows = await runQuery('SELECT * FROM client_preferences WHERE client_id = $1', [clientId]);
    if (rows.length === 0) {
        // Create default preferences
        await runInsert(`INSERT INTO client_preferences (client_id) VALUES ($1) ON CONFLICT DO NOTHING`, [clientId]);
        return {
            client_id: clientId,
            dnd_enabled: false,
            dnd_message: null,
            dark_mode: 'system',
            camera_default_off: true,
            mic_default_off: true,
            skip_waiting_room: false,
            remember_media_permissions: true,
            notifications_enabled: true,
            notify_missed_calls: true,
            notify_voicemail: true,
            notify_queue_updates: true
        };
    }
    return rows[0];
}
exports.getClientPreferences = getClientPreferences;
async function updateClientPreferences(clientId, updates) {
    const allowed = ['dnd_enabled', 'dnd_message', 'dark_mode', 'camera_default_off',
        'mic_default_off', 'skip_waiting_room', 'remember_media_permissions',
        'notifications_enabled', 'notify_missed_calls', 'notify_voicemail',
        'notify_queue_updates'];
    const fields = [];
    const params = [];
    let idx = 1;
    await runInsert(`INSERT INTO client_preferences (client_id) VALUES ($1) ON CONFLICT DO NOTHING`, [clientId]);
    for (const key of allowed) {
        if (updates[key] !== undefined) {
            fields.push(`${key} = $${idx++}`);
            params.push(updates[key]);
        }
    }
    if (fields.length === 0)
        return 0;
    fields.push('updated_at = NOW()');
    params.push(clientId);
    return await runUpdate(`UPDATE client_preferences SET ${fields.join(', ')} WHERE client_id = $${idx}`, params);
}
exports.updateClientPreferences = updateClientPreferences;
async function isClientDND(clientId) {
    const rows = await runQuery('SELECT dnd_enabled FROM client_preferences WHERE client_id = $1', [clientId]);
    return rows.length > 0 && rows[0].dnd_enabled;
}
exports.isClientDND = isClientDND;
// ============================================
// DEVICE HANDOFF OPERATIONS
// ============================================
async function getAllActiveSessions() {
    return await runQuery('SELECT * FROM active_sessions ORDER BY updated_at DESC');
}
exports.getAllActiveSessions = getAllActiveSessions;
async function upsertActiveSession({ userId, roomName, interpreterId = null, deviceId = null }) {
    await runInsert(`INSERT INTO active_sessions (user_id, room_name, interpreter_id, device_id, registered_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         ON CONFLICT (user_id) DO UPDATE SET
            room_name = EXCLUDED.room_name,
            interpreter_id = EXCLUDED.interpreter_id,
            device_id = EXCLUDED.device_id,
            updated_at = NOW()`, [userId, roomName, interpreterId, deviceId]);
}
exports.upsertActiveSession = upsertActiveSession;
async function deleteActiveSession(userId) {
    return await runUpdate('DELETE FROM active_sessions WHERE user_id = $1', [userId]);
}
exports.deleteActiveSession = deleteActiveSession;
async function getAllActiveHandoffTokens() {
    return await runQuery('SELECT * FROM handoff_tokens WHERE expires_at > NOW() ORDER BY created_at DESC');
}
exports.getAllActiveHandoffTokens = getAllActiveHandoffTokens;
async function storeHandoffToken({ token, userId, roomName, interpreterId = null, fromDeviceId = null, targetDeviceId = null, expiresAt }) {
    await runInsert(`INSERT INTO handoff_tokens (
            token, user_id, room_name, interpreter_id, from_device_id, target_device_id, expires_at
         ) VALUES ($1, $2, $3, $4, $5, $6, to_timestamp($7 / 1000.0))
         ON CONFLICT (token) DO UPDATE SET
            user_id = EXCLUDED.user_id,
            room_name = EXCLUDED.room_name,
            interpreter_id = EXCLUDED.interpreter_id,
            from_device_id = EXCLUDED.from_device_id,
            target_device_id = EXCLUDED.target_device_id,
            expires_at = EXCLUDED.expires_at`, [token, userId, roomName, interpreterId, fromDeviceId, targetDeviceId, expiresAt]);
}
exports.storeHandoffToken = storeHandoffToken;
async function deleteHandoffToken(token) {
    return await runUpdate('DELETE FROM handoff_tokens WHERE token = $1', [token]);
}
exports.deleteHandoffToken = deleteHandoffToken;
async function deleteHandoffTokensByUser(userId) {
    return await runUpdate('DELETE FROM handoff_tokens WHERE user_id = $1', [userId]);
}
exports.deleteHandoffTokensByUser = deleteHandoffTokensByUser;
async function deleteExpiredHandoffTokens() {
    return await runUpdate('DELETE FROM handoff_tokens WHERE expires_at <= NOW()');
}
exports.deleteExpiredHandoffTokens = deleteExpiredHandoffTokens;
// ============================================
// CALL TRANSFER OPERATIONS
// ============================================
async function createCallTransfer({ callId, fromInterpreterId, toPhoneNumber, toInterpreterId, transferType, reason }) {
    const id = (0, uuid_1.v4)();
    await runInsert(`INSERT INTO call_transfers (id, call_id, from_interpreter_id, to_phone_number, to_interpreter_id, transfer_type, reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`, [id, callId, fromInterpreterId || null, toPhoneNumber || null,
        toInterpreterId || null, transferType || 'blind', reason || null]);
    return { id };
}
exports.createCallTransfer = createCallTransfer;
async function updateCallTransferStatus(transferId, status) {
    const updates = ['status = $1'];
    const params = [status];
    let idx = 2;
    if (status === 'completed') {
        updates.push(`completed_at = NOW()`);
    }
    params.push(transferId);
    return await runUpdate(`UPDATE call_transfers SET ${updates.join(', ')} WHERE id = $${idx}`, params);
}
exports.updateCallTransferStatus = updateCallTransferStatus;
async function getCallTransfers(callId) {
    return await runQuery('SELECT * FROM call_transfers WHERE call_id = $1 ORDER BY created_at DESC', [callId]);
}
exports.getCallTransfers = getCallTransfers;
async function getPendingTransferForCall(callId) {
    const rows = await runQuery("SELECT * FROM call_transfers WHERE call_id = $1 AND status = 'pending' LIMIT 1", [callId]);
    return rows[0] || null;
}
exports.getPendingTransferForCall = getPendingTransferForCall;
// ============================================
// CONFERENCE CALL OPERATIONS
// ============================================
async function addConferenceParticipant({ callId, participantId, participantRole }) {
    const id = (0, uuid_1.v4)();
    await runInsert(`INSERT INTO conference_participants (id, call_id, participant_id, participant_role)
         VALUES ($1, $2, $3, $4)`, [id, callId, participantId, participantRole || 'party']);
    return { id };
}
exports.addConferenceParticipant = addConferenceParticipant;
async function removeConferenceParticipant(callId, participantId) {
    await runUpdate("UPDATE conference_participants SET left_at = NOW(), status = 'left' WHERE call_id = $1 AND participant_id = $2 AND status = 'active'", [callId, participantId]);
}
exports.removeConferenceParticipant = removeConferenceParticipant;
async function getConferenceParticipants(callId) {
    return await runQuery("SELECT * FROM conference_participants WHERE call_id = $1 AND status = 'active'", [callId]);
}
exports.getConferenceParticipants = getConferenceParticipants;
// ============================================
// IN-CALL CHAT OPERATIONS
// ============================================
async function addChatMessage({ callId, senderId, senderName, message }) {
    const id = (0, uuid_1.v4)();
    await runInsert(`INSERT INTO call_chat_messages (id, call_id, sender_id, sender_name, message)
         VALUES ($1, $2, $3, $4, $5)`, [id, callId, senderId, senderName, message]);
    return { id };
}
exports.addChatMessage = addChatMessage;
async function getChatMessages(callId, limit = 100, offset = 0) {
    return await runQuery(`SELECT * FROM call_chat_messages WHERE call_id = $1 ORDER BY created_at ASC LIMIT $2 OFFSET $3`, [callId, limit, offset]);
}
exports.getChatMessages = getChatMessages;
// ============================================
// CALL HELPER OPERATIONS
// ============================================
async function getCall(callId) {
    const rows = await runQuery('SELECT * FROM calls WHERE id = $1', [callId]);
    return rows[0] || null;
}
exports.getCall = getCall;
async function setCallOnHold(callId, onHold) {
    return await runUpdate('UPDATE calls SET on_hold = $1 WHERE id = $2', [onHold, callId]);
}
exports.setCallOnHold = setCallOnHold;
async function getActiveCallForClient(clientId) {
    const rows = await runQuery("SELECT * FROM calls WHERE (client_id = $1 OR callee_id = $1) AND status IN ('active', 'p2p_active') ORDER BY started_at DESC LIMIT 1", [clientId]);
    return rows[0] || null;
}
exports.getActiveCallForClient = getActiveCallForClient;
// ============================================
// TTS SETTINGS OPERATIONS
// ============================================
async function getTtsSettings(clientId) {
    const rows = await runQuery('SELECT * FROM tts_settings WHERE client_id = $1', [clientId]);
    if (rows.length === 0) {
        return {
            client_id: clientId,
            voice_name: '',
            voice_gender: 'female',
            voice_speed: 1.0,
            voice_pitch: 1.0,
            sts_mode: false
        };
    }
    return rows[0];
}
exports.getTtsSettings = getTtsSettings;
async function upsertTtsSettings(clientId, settings) {
    const allowed = ['voice_name', 'voice_gender', 'voice_speed', 'voice_pitch', 'sts_mode'];
    const fields = [];
    const params = [];
    let idx = 1;
    for (const key of allowed) {
        if (settings[key] !== undefined) {
            fields.push(`${key} = $${idx++}`);
            params.push(settings[key]);
        }
    }
    if (fields.length === 0)
        return 0;
    fields.push('updated_at = NOW()');
    params.push(clientId);
    return await runUpdate(`INSERT INTO tts_settings (id, client_id, ${allowed.filter(k => settings[k] !== undefined).join(', ')})
         VALUES ($${idx + 1}, $${idx}, ${allowed.filter(k => settings[k] !== undefined).map((_, i) => `$${idx + 2 + i}`).join(', ')})
         ON CONFLICT (client_id) DO UPDATE SET ${fields.join(', ')}`, [...params, (0, uuid_1.v4)(), clientId, ...allowed.filter(k => settings[k] !== undefined).map(k => settings[k])]);
}
async function updateTtsSettings(clientId, settings) {
    const allowed = ['voice_name', 'voice_gender', 'voice_speed', 'voice_pitch', 'sts_mode'];
    const fields = [];
    const params = [];
    let idx = 1;
    for (const key of allowed) {
        if (settings[key] !== undefined) {
            fields.push(`${key} = $${idx++}`);
            params.push(settings[key]);
        }
    }
    if (fields.length === 0)
        return 0;
    fields.push('updated_at = NOW()');
    params.push(clientId);
    const result = await runUpdate(`UPDATE tts_settings SET ${fields.join(', ')} WHERE client_id = $${idx}`, params);
    if (result === 0) {
        const id = (0, uuid_1.v4)();
        await runInsert(`INSERT INTO tts_settings (id, client_id, voice_name, voice_gender, voice_speed, voice_pitch, sts_mode)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`, [id, clientId,
            settings.voice_name || '',
            settings.voice_gender || 'female',
            settings.voice_speed ?? 1.0,
            settings.voice_pitch ?? 1.0,
            settings.sts_mode ?? false]);
        return 1;
    }
    return result;
}
exports.updateTtsSettings = updateTtsSettings;
// ============================================
// QUICK PHRASES OPERATIONS
// ============================================
async function getQuickPhrases(clientId) {
    return await runQuery('SELECT * FROM quick_phrases WHERE client_id = $1 ORDER BY sort_order, created_at', [clientId]);
}
exports.getQuickPhrases = getQuickPhrases;
async function addQuickPhrase({ clientId, text, label, sortOrder }) {
    const id = (0, uuid_1.v4)();
    await runInsert('INSERT INTO quick_phrases (id, client_id, text, label, sort_order) VALUES ($1, $2, $3, $4, $5)', [id, clientId, text, label || null, sortOrder || 0]);
    return { id, text, label };
}
exports.addQuickPhrase = addQuickPhrase;
async function updateQuickPhrase(id, clientId, { text, label, sortOrder }) {
    const fields = [];
    const params = [];
    let idx = 1;
    if (text !== undefined) {
        fields.push(`text = $${idx++}`);
        params.push(text);
    }
    if (label !== undefined) {
        fields.push(`label = $${idx++}`);
        params.push(label);
    }
    if (sortOrder !== undefined) {
        fields.push(`sort_order = $${idx++}`);
        params.push(sortOrder);
    }
    if (fields.length === 0)
        return 0;
    params.push(id, clientId);
    return await runUpdate(`UPDATE quick_phrases SET ${fields.join(', ')} WHERE id = $${idx++} AND client_id = $${idx}`, params);
}
exports.updateQuickPhrase = updateQuickPhrase;
async function deleteQuickPhrase(id, clientId) {
    return await runUpdate('DELETE FROM quick_phrases WHERE id = $1 AND client_id = $2', [id, clientId]);
}
exports.deleteQuickPhrase = deleteQuickPhrase;
// ============================================
// VCO CALL OPERATIONS
// ============================================
async function createVCOCall({ clientId, roomName, targetPhone }) {
    const id = (0, uuid_1.v4)();
    await runInsert(`INSERT INTO calls (id, client_id, interpreter_id, room_name, language, status, call_type, call_mode, callee_id)
         VALUES ($1, $2, NULL, $3, NULL, $4, $5, $6, NULL)`, [id, clientId, roomName, 'active', 'vco', 'vco']);
    return id;
}
exports.createVCOCall = createVCOCall;
// ============================================
// OTP CODE OPERATIONS
// ============================================
async function createOtpCode({ phoneNumber, code, purpose = 'login', expiresInMinutes = 10 }) {
    const id = (0, uuid_1.v4)();
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);
    // Invalidate previous unused codes for same phone + purpose
    await runUpdate("UPDATE otp_codes SET verified = true WHERE phone_number = $1 AND purpose = $2 AND verified = false", [phoneNumber, purpose]);
    await runInsert(`INSERT INTO otp_codes (id, phone_number, code, purpose, expires_at) VALUES ($1, $2, $3, $4, $5)`, [id, phoneNumber, code, purpose, expiresAt]);
    return { id, expiresAt };
}
exports.createOtpCode = createOtpCode;
async function verifyOtpCode({ phoneNumber, code, purpose = 'login' }) {
    const rows = await runQuery(`SELECT * FROM otp_codes
         WHERE phone_number = $1 AND purpose = $2 AND verified = false
         ORDER BY created_at DESC LIMIT 1`, [phoneNumber, purpose]);
    if (rows.length === 0) {
        return { valid: false, reason: 'not_found' };
    }
    const otp = rows[0];
    if (otp.attempts >= otp.max_attempts) {
        return { valid: false, reason: 'max_attempts' };
    }
    if (new Date() > new Date(otp.expires_at)) {
        return { valid: false, reason: 'expired' };
    }
    // Increment attempts
    await runUpdate('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1', [otp.id]);
    if (otp.code !== code) {
        return { valid: false, reason: 'wrong_code' };
    }
    // Mark as verified
    await runUpdate('UPDATE otp_codes SET verified = true WHERE id = $1', [otp.id]);
    return { valid: true };
}
exports.verifyOtpCode = verifyOtpCode;
// ============================================
// PASSWORD RESET OPERATIONS
// ============================================
async function createPasswordReset({ userId, userRole, tokenHash, expiresInHours = 1 }) {
    const id = (0, uuid_1.v4)();
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
    await runInsert(`INSERT INTO password_resets (id, user_id, user_role, token_hash, expires_at) VALUES ($1, $2, $3, $4, $5)`, [id, userId, userRole, tokenHash, expiresAt]);
    return { id, expiresAt };
}
exports.createPasswordReset = createPasswordReset;
async function consumePasswordReset(tokenHash) {
    const rows = await runQuery(`SELECT * FROM password_resets WHERE token_hash = $1 AND used = false LIMIT 1`, [tokenHash]);
    if (rows.length === 0) {
        return null;
    }
    const reset = rows[0];
    if (new Date() > new Date(reset.expires_at)) {
        return null;
    }
    // Mark as used
    await runUpdate('UPDATE password_resets SET used = true WHERE id = $1', [reset.id]);
    // Invalidate all other resets for this user
    await runUpdate('UPDATE password_resets SET used = true WHERE user_id = $1 AND id != $2', [reset.user_id, reset.id]);
    return reset;
}
exports.consumePasswordReset = consumePasswordReset;
async function updateClientPassword(userId, newPasswordHash) {
    return await runUpdate('UPDATE clients SET password_hash = $1 WHERE id = $2', [newPasswordHash, userId]);
}
exports.updateClientPassword = updateClientPassword;
async function updateInterpreterPassword(userId, newPasswordHash) {
    return await runUpdate('UPDATE interpreters SET password_hash = $1 WHERE id = $2', [newPasswordHash, userId]);
}
exports.updateInterpreterPassword = updateInterpreterPassword;
// ============================================
// VOICEMAIL OPERATIONS
// ============================================
async function createVoicemailMessage({ id, callerId, calleeId, calleePhone, roomName, recordingFilename, storageKey, expiresAt }) {
    await runInsert(`INSERT INTO voicemail_messages (id, caller_id, callee_id, callee_phone, room_name, recording_filename, storage_key, status, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, [id, callerId, calleeId || null, calleePhone || null, roomName, recordingFilename, storageKey, 'recording', expiresAt]);
}
exports.createVoicemailMessage = createVoicemailMessage;
async function getVoicemailMessage(id) {
    const rows = await runQuery('SELECT * FROM voicemail_messages WHERE id = $1', [id]);
    return rows[0] || null;
}
exports.getVoicemailMessage = getVoicemailMessage;
async function getVoicemailMessageByRoomName(roomName) {
    const rows = await runQuery("SELECT * FROM voicemail_messages WHERE room_name = $1 AND status = 'recording' ORDER BY created_at DESC LIMIT 1", [roomName]);
    return rows[0] || null;
}
exports.getVoicemailMessageByRoomName = getVoicemailMessageByRoomName;
async function updateVoicemailMessage(id, updates) {
    const allowed = ['storage_key', 'thumbnail_key', 'duration_seconds', 'file_size_bytes', 'content_type', 'status', 'seen'];
    const fields = [];
    const params = [];
    let idx = 1;
    for (const key of allowed) {
        if (updates[key] !== undefined) {
            fields.push(`${key} = $${idx++}`);
            params.push(updates[key]);
        }
    }
    if (fields.length === 0)
        return 0;
    params.push(id);
    return await runUpdate(`UPDATE voicemail_messages SET ${fields.join(', ')} WHERE id = $${idx}`, params);
}
exports.updateVoicemailMessage = updateVoicemailMessage;
async function deleteVoicemailMessage(id) {
    return await runUpdate('DELETE FROM voicemail_messages WHERE id = $1', [id]);
}
exports.deleteVoicemailMessage = deleteVoicemailMessage;
async function getVoicemailInbox(calleeId, limit = 20, offset = 0) {
    return await runQuery(`SELECT vm.*, c.name as caller_name, cp.phone_number as caller_phone
         FROM voicemail_messages vm
         LEFT JOIN clients c ON c.id = vm.caller_id
         LEFT JOIN client_phone_numbers cp ON cp.client_id = c.id AND cp.is_primary = true AND cp.active = true
         WHERE vm.callee_id = $1 AND vm.status = 'available'
         ORDER BY vm.created_at DESC
         LIMIT $2 OFFSET $3`, [calleeId, limit, offset]);
}
exports.getVoicemailInbox = getVoicemailInbox;
async function getVoicemailInboxCount(calleeId) {
    const rows = await runQuery(`SELECT COUNT(*) as total FROM voicemail_messages WHERE callee_id = $1 AND status = 'available'`, [calleeId]);
    return Number(rows[0]?.total) || 0;
}
exports.getVoicemailInboxCount = getVoicemailInboxCount;
async function getVoicemailUnreadCount(calleeId) {
    const rows = await runQuery(`SELECT COUNT(*) as count FROM voicemail_messages WHERE callee_id = $1 AND status = 'available' AND seen = false`, [calleeId]);
    return Number(rows[0]?.count) || 0;
}
exports.getVoicemailUnreadCount = getVoicemailUnreadCount;
async function markVoicemailSeen(id, calleeId) {
    return await runUpdate('UPDATE voicemail_messages SET seen = true WHERE id = $1 AND callee_id = $2', [id, calleeId]);
}
exports.markVoicemailSeen = markVoicemailSeen;
async function getVoicemailStorageUsage(calleeId) {
    const rows = await runQuery(`SELECT COALESCE(SUM(file_size_bytes), 0) as total_bytes FROM voicemail_messages WHERE callee_id = $1 AND status = 'available'`, [calleeId]);
    return Number(rows[0]?.total_bytes) || 0;
}
exports.getVoicemailStorageUsage = getVoicemailStorageUsage;
async function getVoicemailMessageCount(calleeId) {
    const rows = await runQuery(`SELECT COUNT(*) as count FROM voicemail_messages WHERE callee_id = $1 AND status = 'available'`, [calleeId]);
    return Number(rows[0]?.count) || 0;
}
exports.getVoicemailMessageCount = getVoicemailMessageCount;
async function getExpiredVoicemailMessages() {
    return await runQuery(`SELECT * FROM voicemail_messages WHERE status = 'available' AND expires_at < NOW()`);
}
exports.getExpiredVoicemailMessages = getExpiredVoicemailMessages;
async function getActiveVoicemailRecordings() {
    return await runQuery(`SELECT * FROM voicemail_messages WHERE status = 'recording'`);
}
exports.getActiveVoicemailRecordings = getActiveVoicemailRecordings;
async function getVoicemailSetting(key) {
    const rows = await runQuery('SELECT setting_value FROM voicemail_settings WHERE setting_key = $1', [key]);
    return rows[0]?.setting_value || null;
}
exports.getVoicemailSetting = getVoicemailSetting;
async function getAllVoicemailSettings() {
    return await runQuery('SELECT * FROM voicemail_settings');
}
exports.getAllVoicemailSettings = getAllVoicemailSettings;
async function setVoicemailSetting(key, value, updatedBy) {
    const id = (0, uuid_1.v4)();
    await runInsert(`INSERT INTO voicemail_settings (id, setting_key, setting_value, updated_by, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`, [id, key, value, updatedBy || null]);
}
exports.setVoicemailSetting = setVoicemailSetting;
async function seedVoicemailSettings() {
    const defaults = [
        ['vm-enabled', 'true'],
        ['vm-max-length', '180'],
        ['vm-retention-days', '30'],
        ['vm-max-messages', '100'],
        ['vm-storage-quota-mb', '500']
    ];
    for (const [key, value] of defaults) {
        const existing = await getVoicemailSetting(key);
        if (!existing) {
            await setVoicemailSetting(key, value, 'system');
        }
    }
}
exports.seedVoicemailSettings = seedVoicemailSettings;
async function getAllVoicemailMessages({ status, callerId, calleeId, limit = 50, offset = 0 } = {}) {
    const conditions = [];
    const params = [];
    let idx = 1;
    if (status) {
        conditions.push(`vm.status = $${idx++}`);
        params.push(status);
    }
    if (callerId) {
        conditions.push(`vm.caller_id = $${idx++}`);
        params.push(callerId);
    }
    if (calleeId) {
        conditions.push(`vm.callee_id = $${idx++}`);
        params.push(calleeId);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit, offset);
    return await runQuery(`SELECT vm.*, c.name as caller_name, cl.name as callee_name
         FROM voicemail_messages vm
         LEFT JOIN clients c ON c.id = vm.caller_id
         LEFT JOIN clients cl ON cl.id = vm.callee_id
         ${where}
         ORDER BY vm.created_at DESC
         LIMIT $${idx++} OFFSET $${idx}`, params);
}
exports.getAllVoicemailMessages = getAllVoicemailMessages;
async function getVoicemailStorageStats() {
    const rows = await runQuery(`
        SELECT
            COUNT(*) as total_messages,
            COALESCE(SUM(file_size_bytes), 0) as total_size_bytes,
            COUNT(CASE WHEN status = 'recording' THEN 1 END) as active_recordings
         FROM voicemail_messages
    `);
    return rows[0] || { total_messages: 0, total_size_bytes: 0, active_recordings: 0 };
}
exports.getVoicemailStorageStats = getVoicemailStorageStats;
// ============================================
// CONTACT NOTES OPERATIONS
// ============================================
async function getContactNotes(contactId) {
    return await runQuery('SELECT * FROM contact_notes WHERE contact_id = $1 ORDER BY created_at DESC', [contactId]);
}
exports.getContactNotes = getContactNotes;
async function createContactNote({ contactId, authorId, content }) {
    const id = (0, uuid_1.v4)();
    await runInsert('INSERT INTO contact_notes (id, contact_id, author_id, content) VALUES ($1, $2, $3, $4)', [id, contactId, authorId, content]);
    return { id, contact_id: contactId, author_id: authorId, content, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
}
exports.createContactNote = createContactNote;
async function updateContactNote(noteId, content) {
    return await runUpdate('UPDATE contact_notes SET content = $1, updated_at = NOW() WHERE id = $2', [content, noteId]);
}
exports.updateContactNote = updateContactNote;
async function deleteContactNote(noteId) {
    return await runUpdate('DELETE FROM contact_notes WHERE id = $1', [noteId]);
}
exports.deleteContactNote = deleteContactNote;
async function getContactTimeline(clientId, contactId) {
    const contact = await getContact(clientId, contactId);
    if (!contact)
        return [];
    const linkedId = contact.linked_client_id;
    const phone = contact.phone_number;
    const parts = [];
    const params = [];
    let idx = 1;
    // Calls
    if (linkedId) {
        params.push(clientId, linkedId);
        parts.push(`(SELECT 'call' AS type, c.id, c.started_at AS timestamp,
            json_build_object('room_name', c.room_name, 'duration_minutes', c.duration_minutes,
                              'status', c.status, 'call_type', c.call_type) AS data
         FROM calls c
         WHERE (c.client_id = $${idx} AND c.callee_id = $${idx + 1})
            OR (c.callee_id = $${idx} AND c.client_id = $${idx + 1}))`);
        idx += 2;
    }
    // Missed calls
    if (linkedId) {
        params.push(linkedId, clientId);
        parts.push(`(SELECT 'missed_call' AS type, mc.id, mc.created_at AS timestamp,
            json_build_object('callee_phone', mc.callee_phone, 'room_name', mc.room_name) AS data
         FROM missed_calls mc
         WHERE (mc.caller_id = $${idx} AND mc.callee_client_id = $${idx + 1})
            OR (mc.callee_client_id = $${idx} AND mc.caller_id = $${idx + 1}))`);
        idx += 2;
    }
    // Voicemail
    if (linkedId) {
        params.push(clientId, linkedId);
        parts.push(`(SELECT 'voicemail' AS type, vm.id, vm.created_at AS timestamp,
            json_build_object('duration_seconds', vm.duration_seconds, 'status', vm.status,
                              'content_type', vm.content_type) AS data
         FROM voicemail_messages vm
         WHERE (vm.caller_id = $${idx} AND vm.callee_id = $${idx + 1})
            OR (vm.callee_id = $${idx} AND vm.caller_id = $${idx + 1}))`);
        idx += 2;
    }
    // Notes
    params.push(contactId);
    parts.push(`(SELECT 'note' AS type, cn.id, cn.created_at AS timestamp,
        json_build_object('content', cn.content, 'author_id', cn.author_id) AS data
     FROM contact_notes cn
     WHERE cn.contact_id = $${idx})`);
    idx++;
    if (parts.length === 0)
        return [];
    params.push(100);
    const sql = parts.join('\n UNION ALL \n') + ` ORDER BY timestamp DESC LIMIT $${idx}`;
    return await runQuery(sql, params);
}
exports.getContactTimeline = getContactTimeline;
// ============================================
// CONTACT SYNC LOG OPERATIONS
// ============================================
async function logContactChange({ clientId, entityType, entityId, action, snapshot }) {
    const id = (0, uuid_1.v4)();
    await runInsert(`INSERT INTO contact_sync_log (id, client_id, entity_type, entity_id, action, snapshot)
         VALUES ($1, $2, $3, $4, $5, $6)`, [id, clientId, entityType, entityId, action, snapshot ? JSON.stringify(snapshot) : null]);
    return id;
}
exports.logContactChange = logContactChange;
async function getContactChangesSince(clientId, sinceTimestamp) {
    return await runQuery(`SELECT id, client_id, entity_type, entity_id, action, snapshot, created_at
         FROM contact_sync_log
         WHERE client_id = $1 AND created_at > $2
         ORDER BY created_at ASC
         LIMIT 500`, [clientId, sinceTimestamp]);
}
exports.getContactChangesSince = getContactChangesSince;
// ============================================
// GOOGLE OAUTH TOKEN OPERATIONS
// ============================================
async function getGoogleOAuthToken(clientId) {
    const rows = await runQuery('SELECT * FROM google_oauth_tokens WHERE client_id = $1', [clientId]);
    return rows[0] || null;
}
exports.getGoogleOAuthToken = getGoogleOAuthToken;
async function upsertGoogleOAuthToken({ clientId, accessToken, refreshToken, tokenType, expiresAt, scope }) {
    await runInsert(`INSERT INTO google_oauth_tokens (client_id, access_token, refresh_token, token_type, expires_at, scope)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (client_id) DO UPDATE SET
            access_token = EXCLUDED.access_token,
            refresh_token = COALESCE(EXCLUDED.refresh_token, google_oauth_tokens.refresh_token),
            token_type = EXCLUDED.token_type,
            expires_at = EXCLUDED.expires_at,
            scope = EXCLUDED.scope,
            updated_at = NOW()`, [clientId, accessToken, refreshToken || null, tokenType || 'Bearer', expiresAt, scope || null]);
}
exports.upsertGoogleOAuthToken = upsertGoogleOAuthToken;
async function deleteGoogleOAuthToken(clientId) {
    return await runUpdate('DELETE FROM google_oauth_tokens WHERE client_id = $1', [clientId]);
}
exports.deleteGoogleOAuthToken = deleteGoogleOAuthToken;
// ============================================
// EXPORT
// ============================================
function pool() {
    return pgPool;
}
exports.pool = pool;
const assignInterpreterToRequest = assignInterpreter;
exports.assignInterpreterToRequest = assignInterpreterToRequest;
//# sourceMappingURL=module.js.map