/**
 * VRS Admin Dashboard JavaScript
 * Connects to the VRS backend API and WebSocket server
 */

// API Configuration
const IS_LOCAL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const HTTP_PROTOCOL = window.location.protocol === 'https:' ? 'https:' : 'http:';
const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const CONFIG_VRS = typeof config !== 'undefined' ? config.vrs : null;

function isLoopbackUrl(value) {
    if (!value) {
        return false;
    }

    try {
        const parsed = new URL(value, window.location.origin);
        return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    } catch (error) {
        return false;
    }
}

function preferConfiguredUrl(configuredValue, fallbackValue) {
    if (!configuredValue) {
        return fallbackValue;
    }

    if (!IS_LOCAL && isLoopbackUrl(configuredValue)) {
        return fallbackValue;
    }

    return configuredValue;
}

const QUEUE_ORIGIN = preferConfiguredUrl(
    CONFIG_VRS?.queueServiceUrl
        ? CONFIG_VRS.queueServiceUrl.replace(/^ws/, 'http').replace(/\/ws$/, '')
        : null,
    IS_LOCAL ? 'http://localhost:3001' : window.location.origin
);
const OPS_ORIGIN = preferConfiguredUrl(
    CONFIG_VRS?.opsApiUrl
        ? CONFIG_VRS.opsApiUrl.replace(/\/api$/, '')
        : null,
    IS_LOCAL ? 'http://localhost:3003' : `${window.location.origin}/ops`
);
const TWILIO_ORIGIN = preferConfiguredUrl(
    CONFIG_VRS?.twilioVoiceUrl || null,
    IS_LOCAL ? 'http://localhost:3002' : `${window.location.origin}/twilio`
);
const API_BASE = `${QUEUE_ORIGIN}/api`;
const OPS_API_BASE = `${OPS_ORIGIN}/api`;
const AUTH_API_BASE = `${OPS_ORIGIN}/api/auth`;
const WS_URL = preferConfiguredUrl(
    CONFIG_VRS?.queueServiceUrl || null,
    IS_LOCAL ? 'ws://localhost:3001/ws' : `${WS_PROTOCOL}//${window.location.host}/ws`
);

// State
let authToken = localStorage.getItem('vrs_admin_token');
let ws = null;
let refreshInterval = null;
let currentAdminRole = localStorage.getItem('vrs_admin_role') || 'admin';
const scheduledRefreshes = new Map();
let operationsRows = [];
let activeOperationsView = 'live';
let adminScheduleWindows = [];
let adminUtilization = null;

function scheduleRefresh(key, callback, delay = 250) {
    if (scheduledRefreshes.has(key)) {
        return;
    }

    const timer = setTimeout(async () => {
        scheduledRefreshes.delete(key);
        try {
            await callback();
        } catch (error) {
            console.error(`[Refresh:${key}] Error:`, error);
        }
    }, delay);

    scheduledRefreshes.set(key, timer);
}

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    setupNavigation();
    setupEventListeners();
    loadInitialData();
});

function checkAuth() {
    if (!authToken && !window.location.pathname.endsWith('vrs-admin.html')) {
        window.location.href = 'vrs-admin.html';
    }
}

function setupNavigation() {
    // Hash-based navigation
    const handleHash = () => {
        const hash = window.location.hash.slice(1) || 'dashboard';

        // Update nav tabs
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === hash);
        });

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `${hash}-tab`);
        });

        // Load data for the active tab
        loadTabData(hash);
    };

    window.addEventListener('hashchange', handleHash);
    handleHash();
}

function setupEventListeners() {
    // Refresh button
    document.getElementById('refreshBtn')?.addEventListener('click', refreshCurrentTab);

    // Logout button
    document.getElementById('logoutBtn')?.addEventListener('click', logout);

    // Language toggle
    document.getElementById('langToggle')?.addEventListener('click', toggleLanguage);

    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            window.location.hash = tab.dataset.tab || 'dashboard';
        });
    });

    // Add interpreter button
    document.getElementById('addInterpreterBtn')?.addEventListener('click', showAddInterpreterModal);
    document.getElementById('addCaptionerBtn')?.addEventListener('click', showAddCaptionerModal);
    document.getElementById('addAccountBtn')?.addEventListener('click', showAddAccountModal);
    document.getElementById('addClientBtn')?.addEventListener('click', showAddClientModal);
    document.getElementById('exportInterpretersBtn')?.addEventListener('click', () => exportTableCsv('interpreters', getVisibleInterpreters()));
    document.getElementById('exportAccountsBtn')?.addEventListener('click', () => exportTableCsv('accounts', getVisibleAccounts()));
    document.getElementById('exportClientsBtn')?.addEventListener('click', () => exportTableCsv('clients', getVisibleClients()));
    document.querySelectorAll('[data-modal-close]').forEach(button => button.addEventListener('click', closeAdminModal));
    document.querySelectorAll('[data-ops-view]').forEach(button => {
        button.addEventListener('click', () => {
            activeOperationsView = button.dataset.opsView || 'live';
            document.querySelectorAll('[data-ops-view]').forEach(viewButton => {
                viewButton.classList.toggle('active', viewButton.dataset.opsView === activeOperationsView);
            });
            renderOperationsTable();
        });
    });

    // Filter changes
    document.getElementById('opsTenantFilter')?.addEventListener('change', renderOperationsTable);
    document.getElementById('opsServiceFilter')?.addEventListener('change', renderOperationsTable);
    document.getElementById('opsFlowFilter')?.addEventListener('change', renderOperationsTable);
    document.getElementById('opsRoleFilter')?.addEventListener('change', renderOperationsTable);
    document.getElementById('opsStatusFilter')?.addEventListener('change', renderOperationsTable);
    document.getElementById('opsSearch')?.addEventListener('input', debounce(renderOperationsTable, 250));
    document.getElementById('interpreterStatusFilter')?.addEventListener('change', filterInterpreters);
    document.getElementById('interpreterSearch')?.addEventListener('input', debounce(filterInterpreters, 300));
    document.getElementById('accountTenantFilter')?.addEventListener('change', loadAccounts);
    document.getElementById('accountRoleFilter')?.addEventListener('change', loadAccounts);
    document.getElementById('accountServiceFilter')?.addEventListener('change', loadAccounts);
    document.getElementById('clientTenantFilter')?.addEventListener('change', filterClients);
    document.getElementById('clientServiceFilter')?.addEventListener('change', filterClients);
    document.getElementById('clientSearch')?.addEventListener('input', debounce(filterClients, 300));
    document.getElementById('queueTenantFilter')?.addEventListener('change', loadLiveQueue);
    document.getElementById('queueServiceFilter')?.addEventListener('change', loadLiveQueue);
    document.getElementById('queueLanguageFilter')?.addEventListener('change', loadLiveQueue);
    document.getElementById('activityTypeFilter')?.addEventListener('change', loadActivityFeed);
    document.getElementById('activityTenantFilter')?.addEventListener('change', loadActivityFeed);
    document.getElementById('activityServiceFilter')?.addEventListener('change', loadActivityFeed);
    document.getElementById('activityRoleFilter')?.addEventListener('change', loadActivityFeed);
    document.getElementById('exportAuditBtn')?.addEventListener('click', exportAuditCsv);
    document.getElementById('scheduleTenantFilter')?.addEventListener('change', loadAdminScheduleWindows);
    document.getElementById('scheduleServiceFilter')?.addEventListener('change', loadAdminScheduleWindows);
    document.getElementById('scheduleLanguageFilter')?.addEventListener('change', loadAdminScheduleWindows);
    document.getElementById('scheduleWeekStart')?.addEventListener('change', loadAdminScheduleWindows);
    document.getElementById('scheduleStartHour')?.addEventListener('input', debounce(renderAdminScheduling, 150));
    document.getElementById('scheduleEndHour')?.addEventListener('input', debounce(renderAdminScheduling, 150));
    document.getElementById('scheduleTargetCount')?.addEventListener('input', debounce(renderAdminScheduling, 150));
    document.getElementById('addScheduleWindowBtn')?.addEventListener('click', showScheduleWindowModal);
    document.getElementById('exportUtilizationBtn')?.addEventListener('click', exportUtilizationCsv);

    // Queue pause button
    document.getElementById('pauseQueueBtn')?.addEventListener('click', toggleQueue);

    document.addEventListener('click', event => {
        const navTarget = event.target.closest('[data-nav-tab]');
        if (navTarget) {
            event.preventDefault();
            window.location.hash = navTarget.dataset.navTab;
            return;
        }

        const actionTarget = event.target.closest('[data-action]');
        if (!actionTarget) {
            return;
        }

        event.preventDefault();
        const id = actionTarget.dataset.id;

        switch (actionTarget.dataset.action) {
            case 'edit-interpreter':
                editInterpreter(id);
                break;
            case 'edit-captioner':
                editCaptioner(id);
                break;
            case 'edit-client-permissions':
                editClientPermissions(id);
                break;
            case 'edit-account-permissions':
                editAccountPermissions(id);
                break;
            case 'remove-from-queue':
                removeFromQueue(id);
                break;
            case 'approve-schedule-window':
                updateScheduleWindowStatus(id, 'confirmed');
                break;
            case 'reject-schedule-window':
                updateScheduleWindowStatus(id, 'cancelled');
                break;
        }
    });
}

function loadInitialData() {
    updateCurrentUserDisplay();
    validateOpsSession();
    loadDashboardStats();
    loadMonitoringSummary();
    connectWebSocket();

    // Keep ops presence fresh even if a websocket event is missed.
    refreshInterval = setInterval(refreshCurrentTab, 10000);
}

async function validateOpsSession() {
    if (!authToken) {
        return;
    }

    try {
        const session = await fetch(`${AUTH_API_BASE}/validate`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (!session.ok) {
            logout();
            return;
        }

        const data = await session.json();
        localStorage.setItem('vrs_admin_name', data.user.name);
        localStorage.setItem('vrs_admin_email', data.user.email || '');
        localStorage.setItem('vrs_admin_role', data.user.role);
        localStorage.setItem('vrs_admin_tenant', data.user.tenantId || defaultTenantId());
        updateCurrentUserDisplay();
    } catch (error) {
        console.error('[Auth] Validation failed:', error);
    }
}

function loadTabData(tab) {
    switch (tab) {
        case 'dashboard':
            loadDashboardStats();
            loadMonitoringSummary();
            break;
        case 'interpreters':
            loadInterpreters();
            break;
        case 'captioners':
            loadCaptioners();
            break;
        case 'accounts':
            loadAccounts();
            break;
        case 'clients':
            loadClients();
            break;
        case 'queue':
            loadLiveQueue();
            break;
        case 'activity':
            loadActivityFeed();
            break;
        case 'tenants':
            loadTenants();
            break;
    }
}

function refreshCurrentTab() {
    const hash = window.location.hash.slice(1) || 'dashboard';
    loadTabData(hash);
}

// ============================================
// API CALLS
// ============================================

async function apiCall(endpoint, options = {}) {
    const headers = {
        'Content-Type': 'application/json'
    };

    if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers
    });

    if (response.status === 401) {
        logout();
        throw new Error('Unauthorized');
    }

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Request failed');
    }

    return response.json();
}

async function opsApiCall(endpoint, options = {}) {
    const headers = {
        'Content-Type': 'application/json'
    };

    if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
    }

    const response = await fetch(`${OPS_API_BASE}${endpoint}`, {
        ...options,
        headers
    });

    if (response.status === 401 || response.status === 403) {
        if (response.status === 401) {
            logout();
        }

        const error = await response.json().catch(() => ({ error: 'Unauthorized' }));
        throw new Error(error.error || 'Unauthorized');
    }

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(error.error || 'Request failed');
    }

    return response.json();
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function openAdminModal({ title, subtitle = '', body = '', footer = '' }) {
    const modal = document.getElementById('adminModal');
    const titleEl = document.getElementById('adminModalTitle');
    const subtitleEl = document.getElementById('adminModalSubtitle');
    const bodyEl = document.getElementById('adminModalBody');
    const footerEl = document.getElementById('adminModalFooter');

    if (!modal || !titleEl || !subtitleEl || !bodyEl || !footerEl) {
        return;
    }

    titleEl.textContent = title;
    subtitleEl.textContent = subtitle;
    bodyEl.innerHTML = body;
    footerEl.innerHTML = footer;
    modal.querySelectorAll('[data-modal-close]').forEach(button => button.addEventListener('click', closeAdminModal));
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
}

function closeAdminModal() {
    const modal = document.getElementById('adminModal');
    if (!modal) return;
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
}

function parseCsvList(value) {
    return String(value || '')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
}

function getFormValues(form) {
    return Object.fromEntries(new FormData(form).entries());
}

function boolFromFormValue(value) {
    return value === 'true' || value === true;
}

function downloadCsv(filename, rows) {
    if (!rows.length) {
        alert('No rows to export.');
        return;
    }

    const headers = Object.keys(rows[0]);
    const csv = [
        headers.join(','),
        ...rows.map(row => headers.map(header => {
            const value = Array.isArray(row[header]) ? row[header].join('; ') : row[header];
            return `"${String(value ?? '').replace(/"/g, '""')}"`;
        }).join(','))
    ].join('\n');

    const blob = new Blob([ csv ], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function exportTableCsv(type, rows) {
    if (type === 'interpreters') {
        downloadCsv('interpreters', rows.map(interp => ({
            name: interp.name,
            email: interp.email,
            tenant: interp.tenant_id || 'malka',
            serviceModes: interp.service_modes || [],
            languages: interp.languages || [],
            status: interp.connected ? (interp.currentStatus || 'online') : 'offline',
            callsToday: interp.calls_today || 0,
            minutesThisWeek: interp.minutes_week || 0,
            lastActive: formatLastActive(interp)
        })));
        return;
    }

    if (type === 'accounts') {
        downloadCsv('accounts', rows.map(account => ({
            name: account.name,
            role: account.role,
            username: account.username || '',
            email: account.email || '',
            tenant: account.tenantId || 'malka',
            serviceModes: account.serviceModes || [],
            languages: account.languages || [],
            organization: account.organization || '',
            permissions: account.permissions || [],
            active: account.active !== false ? 'active' : 'disabled',
            lastLogin: account.lastLoginAt || 'Never'
        })));
        return;
    }

    downloadCsv('clients', rows.map(client => ({
        name: client.name,
        email: client.email,
        organization: client.organization || 'Personal',
        tenant: client.tenant_id || 'malka',
        serviceModes: client.service_modes || [],
        status: client.connected ? 'online' : 'offline',
        totalCalls: client.total_calls || 0,
        lastCall: client.last_call || 'Never',
        registered: client.created_at || ''
    })));
}

function exportUtilizationCsv() {
    const rows = (adminUtilization?.interpreters || []).map(row => ({
        name: row.name,
        email: row.email,
        tenant: row.tenantId || 'malka',
        serviceModes: row.serviceModes || [],
        languages: row.languages || [],
        scheduledHours: Math.round((row.scheduledMinutes || 0) / 60 * 10) / 10,
        signedOnHours: Math.round((row.signedOnMinutes || 0) / 60 * 10) / 10,
        handsUpHours: Math.round((row.handsUpMinutes || 0) / 60 * 10) / 10,
        inCallHours: Math.round((row.inCallMinutes || 0) / 60 * 10) / 10,
        breakHours: Math.round((row.breakMinutes || 0) / 60 * 10) / 10,
        adminIdleHours: Math.round((row.afterCallAdminMinutes || 0) / 60 * 10) / 10,
        adherenceRate: row.adherenceRate || 0,
        utilizationRate: row.utilizationRate || 0,
        acceptanceRate: row.queue?.acceptanceRate || 0,
        declineRate: row.queue?.declineRate || 0,
        noAnswerRate: row.queue?.noAnswerRate || 0,
        slaBreachRate: row.sla?.breachRate || 0,
        earningsPreview: row.earningsPreview || 0
    }));
    downloadCsv('interpreter-utilization', rows);
}

async function login(username, password) {
    const response = await fetch(`${AUTH_API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: username, password })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Login failed');
    }

    const data = await response.json();
    authToken = data.token;
    localStorage.setItem('vrs_admin_token', authToken);
    localStorage.setItem('vrs_admin_name', data.user.name);
    localStorage.setItem('vrs_admin_email', data.user.email);
    localStorage.setItem('vrs_admin_role', data.user.role);
    localStorage.setItem('vrs_admin_tenant', data.user.tenantId || defaultTenantId());
    currentAdminRole = data.user.role;

    return data;
}

function logout() {
    authToken = null;
    currentAdminRole = 'admin';
    localStorage.removeItem('vrs_admin_token');
    localStorage.removeItem('vrs_admin_remember');
    localStorage.removeItem('vrs_admin_name');
    localStorage.removeItem('vrs_admin_email');
    localStorage.removeItem('vrs_admin_role');
    localStorage.removeItem('vrs_admin_tenant');

    if (ws) {
        ws.close();
    }

    window.location.href = 'vrs-admin.html';
}

function updateCurrentUserDisplay() {
    const name = localStorage.getItem('vrs_admin_name') || 'Admin';
    const role = localStorage.getItem('vrs_admin_role') || currentAdminRole || 'admin';
    currentAdminRole = role;

    const nameEl = document.querySelector('.user-name');
    const roleEl = document.querySelector('.user-role');
    const avatarEl = document.querySelector('.user-avatar');
    const accountsTab = document.querySelector('[data-tab="accounts"]');
    const tenantsTab = document.querySelector('[data-tab="tenants"]');
    const addAccountBtn = document.getElementById('addAccountBtn');

    if (nameEl) {
        nameEl.textContent = name;
    }

    if (roleEl) {
        roleEl.textContent = role === 'superadmin' ? 'Superadmin' : 'Administrator';
    }

    if (avatarEl) {
        avatarEl.textContent = name.charAt(0).toUpperCase();
    }

    if (accountsTab) {
        accountsTab.style.display = 'inline-flex';
    }

    if (tenantsTab) {
        tenantsTab.style.display = role === 'superadmin' ? 'inline-flex' : 'none';
    }

    if (addAccountBtn) {
        addAccountBtn.style.display = 'inline-flex';
    }
}

// ============================================
// WEBSOCKET CONNECTION
// ============================================

function connectWebSocket() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        return;
    }

    ws = new WebSocket(`${WS_URL}?token=${authToken}`);

    ws.onopen = () => {
        console.log('[WebSocket] Connected');

        // Authenticate and subscribe to admin updates
        ws.send(JSON.stringify({
            type: 'auth',
            role: 'admin',
            token: authToken
        }));

        ws.send(JSON.stringify({
            type: 'admin_subscribe'
        }));
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleWebSocketMessage(data);
    };

    ws.onclose = () => {
        console.log('[WebSocket] Disconnected');
        // Attempt to reconnect after 5 seconds
        if (authToken) {
            setTimeout(connectWebSocket, 5000);
        }
    };

    ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
    };
}

function handleWebSocketMessage(data) {
    switch (data.type) {
        case 'dashboard_data':
            scheduleRefresh('dashboard', loadDashboardStats, 100);
            break;
        case 'interpreters_list':
        case 'interpreter_connected':
        case 'interpreter_disconnected':
        case 'interpreter_status_changed':
            scheduleRefresh('dashboard', loadDashboardStats, 150);
            if (window.location.hash.includes('interpreters')) {
                scheduleRefresh('interpreters', loadInterpreters, 150);
            }
            break;
        case 'client_connected':
        case 'client_disconnected':
            scheduleRefresh('dashboard', loadDashboardStats, 150);
            if (window.location.hash.includes('clients')) {
                scheduleRefresh('clients', loadClients, 150);
            }
            break;
        case 'queue_update':
        case 'queue_status':
            if (window.location.hash.includes('queue')) {
                scheduleRefresh('queue', loadLiveQueue, 75);
            }
            renderQueuePreview(data.data);
            scheduleRefresh('dashboard', loadDashboardStats, 75);
            scheduleRefresh('monitoring', loadMonitoringSummary, 250);
            break;
        case 'queue_request_added':
        case 'queue_request_cancelled':
        case 'queue_request_removed':
        case 'queue_match_complete':
        case 'queue_paused':
        case 'queue_resumed':
            scheduleRefresh('dashboard', loadDashboardStats, 75);
            scheduleRefresh('queue', loadLiveQueue, 100);
            scheduleRefresh('monitoring', loadMonitoringSummary, 250);
            break;
        case 'ops_audit':
        case 'activity_logged':
            scheduleRefresh('monitoring', loadMonitoringSummary, 250);
            if (window.location.hash.includes('activity')) {
                scheduleRefresh('activity', loadActivityFeed, 250);
            }
            break;
        case 'ping':
            ws.send(JSON.stringify({ type: 'pong' }));
            break;
    }
}

// ============================================
// DASHBOARD
// ============================================

async function fetchServiceSnapshot(origin, primaryPath, fallbackPath) {
    async function request(path) {
        const response = await fetch(`${origin}${path}`);
        const data = await response.json().catch(() => ({}));

        return {
            ...data,
            ok: response.ok,
            reachable: true,
            statusCode: response.status
        };
    }

    try {
        const snapshot = await request(primaryPath);
        if (snapshot.statusCode === 404 && fallbackPath) {
            return await request(fallbackPath);
        }

        return snapshot;
    } catch (error) {
        return {
            ok: false,
            reachable: false,
            ready: false,
            status: 'offline',
            warnings: [ error.message ]
        };
    }
}

function getStatusBadgeClass(status) {
    if (status === 'ok' || status === 'ready' || status === 'healthy') {
        return 'status-online';
    }

    if (status === 'degraded' || status === 'external') {
        return 'status-busy';
    }

    return 'status-offline';
}

function formatDurationSeconds(seconds) {
    const safeSeconds = Math.max(0, Number(seconds) || 0);

    if (safeSeconds < 60) {
        return `${safeSeconds}s`;
    }

    const minutes = Math.floor(safeSeconds / 60);
    if (minutes < 60) {
        return `${minutes}m ${safeSeconds % 60}s`;
    }

    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
}

function formatDurationFromDate(dateStr) {
    if (!dateStr) {
        return '—';
    }

    return formatDurationSeconds(Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000));
}

function formatWarnings(warnings = []) {
    const filtered = Array.isArray(warnings) ? warnings.filter(Boolean) : [];
    return filtered.length ? filtered.join(', ') : 'None';
}

function syncQueuePauseButton(paused) {
    const btn = document.getElementById('pauseQueueBtn');
    if (!btn) {
        return;
    }

    btn.dataset.paused = paused ? 'true' : 'false';
    btn.textContent = paused ? '▶️ Resume Queue' : '⏸ Pause Queue';
}

async function loadDashboardStats() {
    try {
        const [ stats, activeCalls, dailyUsage, interpreters, clients, queue ] = await Promise.all([
            apiCall('/admin/stats'),
            apiCall('/admin/calls/active').catch(() => []),
            apiCall('/admin/usage/daily?days=7').catch(() => []),
            apiCall('/admin/interpreters').catch(() => allInterpreters),
            apiCall('/admin/clients').catch(() => allClients),
            apiCall('/admin/queue').catch(() => [])
        ]);

        allInterpreters = interpreters;
        allClients = clients;
        updateDashboardStats(stats, activeCalls, dailyUsage);
        buildOperationsRows({ activeCalls, clients, interpreters, queue });
        renderOperationsTable();
        renderActiveInterpretersTable(
            interpreters.filter(interpreter => interpreter.connected && interpreter.currentStatus !== 'offline').slice(0, 5),
            activeCalls
        );
        renderQueuePreview(queue);
    } catch (error) {
        console.error('[Dashboard] Error:', error);
    }
}

async function loadMonitoringSummary() {
    try {
        const [ summary, queueService, opsService, twilioService ] = await Promise.all([
            opsApiCall('/admin/monitoring/summary'),
            fetchServiceSnapshot(QUEUE_ORIGIN, '/api/readiness', '/api/health'),
            fetchServiceSnapshot(OPS_ORIGIN, '/api/readiness', '/api/health'),
            fetchServiceSnapshot(TWILIO_ORIGIN, '/api/readiness', '/health')
        ]);

        renderMonitoringSummary({ summary, queueService, opsService, twilioService });
        syncQueuePauseButton(Boolean(queueService.queue?.paused));
    } catch (error) {
        console.error('[Monitoring] Error:', error);
    }
}

function updateDashboardStats(stats, activeCalls = [], dailyUsage = []) {
    updateStat('totalClients', stats.clients?.total || 0);
    updateStat('totalInterpreters', stats.interpreters?.total || 0);
    updateStat('queueCount', stats.queue?.count || 0);
    updateStat('activeCalls', activeCalls.length || stats.calls?.active || 0);

    const clientsTrend = document.getElementById('clientsTrend');
    if (clientsTrend) {
        clientsTrend.textContent = `${stats.clients?.online || 0} online`;
        clientsTrend.className = 'stat-trend up';
    }

    const clientsSubtext = document.getElementById('clientsSubtext');
    if (clientsSubtext) {
        clientsSubtext.textContent = `${stats.clients?.total || 0} total · ${stats.calls?.today || 0} calls today`;
    }

    const interpretersTrend = document.getElementById('interpretersTrend');
    if (interpretersTrend) {
        interpretersTrend.textContent = `${stats.interpreters?.online || 0} online`;
        interpretersTrend.className = 'stat-trend up';
    }

    const interpretersOnline = document.getElementById('interpretersOnline');
    if (interpretersOnline) {
        interpretersOnline.textContent = `${stats.interpreters?.connected ?? stats.interpreters?.online ?? 0} connected now`;
    }

    const avgWaitTime = document.getElementById('avgWaitTime');
    if (avgWaitTime) {
        avgWaitTime.textContent = `Avg wait: ${Math.round(stats.queue?.avg_wait_minutes || 0)} min`;
    }

    const queueTrend = document.getElementById('queueTrend');
    if (queueTrend) {
        const queueCount = stats.queue?.count || 0;
        queueTrend.textContent = queueCount > 0 ? 'LIVE' : 'CLEAR';
        queueTrend.className = `stat-trend ${queueCount > 0 ? 'up' : 'down'}`;
    }

    const activeCallsTrend = document.getElementById('activeCallsTrend');
    if (activeCallsTrend) {
        const growth = calculateGrowth(stats.growth?.this_week || 0, stats.growth?.last_week || 0);
        activeCallsTrend.textContent = growth;
        activeCallsTrend.className = `stat-trend ${growth.startsWith('+') ? 'up' : 'down'}`;
    }

    const callsToday = document.getElementById('callsToday');
    if (callsToday) {
        callsToday.textContent = `Today: ${stats.calls?.today || 0} calls`;
    }

    renderActiveCallsTable(activeCalls);
    renderWeeklyUsageChart(dailyUsage);
}

function renderMonitoringSummary({ summary, queueService, opsService, twilioService }) {
    const monitoringBody = document.getElementById('monitoringSummaryBody');
    const authBody = document.getElementById('authSummaryBody');

    if (monitoringBody) {
        const services = [
            {
                name: 'Queue Server',
                status: queueService.status || 'offline',
                detail: `${queueService.queue?.pendingRequestCount || queueService.queue?.queueSize || 0} waiting · ${queueService.queue?.activeInterpreterCount || 0} interpreters · warnings: ${formatWarnings(queueService.warnings)}`
            },
            {
                name: 'Ops Server',
                status: opsService.status || summary.status || 'offline',
                detail: `${opsService.services?.opsWebSocketClients || summary.services?.opsWebSocketClients || 0} websocket clients · storage: ${opsService.services?.storageState || summary.services?.storageState || 'unknown'}`
            },
            {
                name: 'Twilio Voice',
                status: twilioService.status || 'offline',
                detail: `${twilioService.activeCalls || 0} active calls · blockers: ${formatWarnings(twilioService.blockers || twilioService.warnings)}`
            },
            {
                name: 'Queue State',
                status: queueService.queue?.paused ? 'degraded' : 'ok',
                detail: queueService.queue?.paused ? 'Queue is paused for new matching' : 'Queue is accepting interpreter matches'
            }
        ];

        monitoringBody.innerHTML = services.map(service => `
            <tr>
                <td>${service.name}</td>
                <td><span class="status-badge ${getStatusBadgeClass(service.status)}"><span class="status-dot"></span>${service.status}</span></td>
                <td style="color: var(--text-secondary);">${service.detail}</td>
            </tr>
        `).join('');
    }

    if (authBody) {
        const combinedWarnings = [
            ...(summary.warnings || []),
            ...(opsService.warnings || []),
            ...(twilioService.warnings || [])
        ];

        const authRows = [
            [ 'Active Accounts', summary.auth?.activeAccounts || 0 ],
            [ 'Recent Failed Attempts', summary.auth?.recentFailedAttempts || 0 ],
            [ 'Locked-Out Buckets', summary.auth?.lockedOutBuckets || 0 ],
            [ 'Bootstrap Superadmin', summary.auth?.bootstrapSuperadminEnabled ? 'Enabled' : 'Disabled' ],
            [ 'Ops Readiness', summary.ready ? 'Ready' : 'Needs attention' ],
            [ 'Open Warnings', formatWarnings(combinedWarnings) ]
        ];

        authBody.innerHTML = authRows.map(([ label, value ]) => `
            <tr>
                <td>${label}</td>
                <td style="font-weight: 600;">${value}</td>
            </tr>
        `).join('');
    }
}

function updateStat(elementId, value) {
    const el = document.getElementById(elementId);
    if (el) {
        el.textContent = value;
    }
}

function calculateGrowth(thisWeek, lastWeek) {
    if (!lastWeek || lastWeek === 0) return '-';
    const growth = ((thisWeek - lastWeek) / lastWeek * 100).toFixed(0);
    return `${growth > 0 ? '+' : ''}${growth}%`;
}

function normalizeStatus(value) {
    return String(value || '').trim().toLowerCase().replace(/_/g, '-');
}

function normalizeServiceMode(value) {
    const normalized = String(value || 'vri').trim().toLowerCase();
    return normalized === 'vrs' ? 'vrs' : 'vri';
}

function formatFlow(value) {
    return normalizeStatus(value) === 'scheduled' ? 'Scheduled' : 'On-demand';
}

function getStatusClass(status) {
    const normalized = normalizeStatus(status);
    const statusClasses = {
        available: 'status-available',
        assigned: 'status-assigned',
        waiting: 'status-waiting',
        connecting: 'status-connecting',
        'in-call': 'status-in-call',
        break: 'status-break',
        offline: 'status-offline',
        completed: 'status-completed',
        cancelled: 'status-attention',
        'no-show': 'status-attention'
    };
    return statusClasses[normalized] || 'status-offline';
}

function formatStatusLabel(status) {
    const normalized = normalizeStatus(status);
    const labels = {
        available: 'Available',
        assigned: 'Assigned',
        waiting: 'Waiting',
        connecting: 'Connecting',
        'in-call': 'In Call',
        break: 'On Break',
        offline: 'Offline',
        completed: 'Completed',
        cancelled: 'Cancelled',
        'no-show': 'No Show'
    };
    return labels[normalized] || 'Offline';
}

function formatRoleLabel(role) {
    const normalized = normalizeStatus(role);
    if (normalized === 'client') return 'Client';
    if (normalized === 'interpreter') return 'Interpreter';
    if (normalized === 'captioner') return 'Captioner';
    if (normalized === 'session') return 'Session';
    return role || 'Unknown';
}

function formatTenantLabel(tenantId) {
    const normalized = String(tenantId || defaultTenantId()).toLowerCase();
    return normalized === 'maple' ? 'Maple' : 'Malka';
}

function formatOperationUpdated(value) {
    if (!value) {
        return 'Live';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return 'Live';
    }

    return formatDateTime(value);
}

function deriveInterpreterStatus(interpreter, activeCallMap) {
    const nameKey = String(interpreter.name || '').toLowerCase();
    const idKey = String(interpreter.id || '');
    if (activeCallMap.has(idKey) || activeCallMap.has(nameKey)) {
        return 'in-call';
    }

    if (interpreter.active === false) {
        return 'offline';
    }

    if (!interpreter.connected) {
        return 'offline';
    }

    const current = normalizeStatus(interpreter.currentStatus);
    if (current === 'online' || current === 'active' || current === 'available') {
        return 'available';
    }
    if (current === 'busy' || current === 'assigned' || current === 'teamed') {
        return 'assigned';
    }
    if (current === 'connecting') {
        return 'connecting';
    }
    if (current === 'in-call') {
        return 'in-call';
    }
    if (current === 'break' || current === 'on-break') {
        return 'break';
    }
    return 'offline';
}

function getPrimaryServiceMode(source, fallback = 'vri') {
    const modes = source?.service_modes || source?.serviceModes;
    if (Array.isArray(modes) && modes.length) {
        return normalizeServiceMode(modes[0]);
    }
    return normalizeServiceMode(source?.serviceMode || source?.service_mode || source?.callType || source?.call_type || fallback);
}

function getFlowForService(serviceMode, source = {}) {
    if (normalizeStatus(source.flow) === 'scheduled' || source.scheduled_at || source.scheduledAt) {
        return 'scheduled';
    }
    return 'on-demand';
}

function buildOperationActiveCallMap(activeCalls = []) {
    const map = new Map();
    activeCalls.forEach(call => {
        [
            call.interpreter_id,
            call.interpreterId,
            String(call.interpreter_name || '').toLowerCase(),
            call.client_id,
            call.clientId,
            String(call.client_name || '').toLowerCase()
        ].filter(Boolean).forEach(key => map.set(String(key), call));
    });
    return map;
}

function buildOperationsRows({ activeCalls = [], clients = [], interpreters = [], queue = [] } = {}) {
    const activeCallMap = buildOperationActiveCallMap(activeCalls);
    const rows = [];
    const queueClientKeys = new Set();
    const activeClientKeys = new Set();

    activeCalls.forEach(call => {
        const serviceMode = getPrimaryServiceMode(call, 'vri');
        const flow = getFlowForService(serviceMode, call);
        const clientName = call.client_name || call.clientName || 'Client';
        const interpreterName = call.interpreter_name || call.interpreterName || 'Unassigned interpreter';

        [call.client_id, call.clientId, String(clientName).toLowerCase()].filter(Boolean).forEach(key => activeClientKeys.add(String(key)));

        rows.push({
            flow,
            id: `call-${call.id || call.room_name || clientName}`,
            info: `${clientName} with ${interpreterName} · ${call.room_name || 'room pending'} · ${formatDurationFromDate(call.started_at)}`,
            name: clientName,
            role: 'session',
            service: serviceMode,
            status: 'in-call',
            tenant: call.tenantId || call.tenant_id || defaultTenantId(),
            updatedAt: call.started_at,
            view: 'live'
        });
    });

    queue.forEach(item => {
        const clientName = item.clientName || item.client_name || 'Unknown client';
        const serviceMode = getPrimaryServiceMode(item, 'vri');
        const flow = getFlowForService(serviceMode, item);
        [item.clientId, item.client_id, String(clientName).toLowerCase()].filter(Boolean).forEach(key => queueClientKeys.add(String(key)));

        rows.push({
            flow,
            id: `queue-${item.id || clientName}`,
            info: `${item.language || 'ASL'} · ${item.roomName || item.room_name || 'room pending'} · wait ${item.wait_time || item.waitTime || '—'}`,
            name: clientName,
            role: 'client',
            service: serviceMode,
            status: 'waiting',
            tenant: item.tenantId || item.tenant_id || defaultTenantId(),
            updatedAt: item.createdAt || item.created_at,
            view: 'live'
        });
    });

    interpreters.forEach(interpreter => {
        const serviceModes = Array.isArray(interpreter.service_modes) && interpreter.service_modes.length
            ? interpreter.service_modes
            : ['vri'];
        const status = deriveInterpreterStatus(interpreter, activeCallMap);
        const currentCall = activeCallMap.get(String(interpreter.id || ''))
            || activeCallMap.get(String(interpreter.name || '').toLowerCase());
        const visibleInLive = status !== 'offline';

        serviceModes.forEach(mode => {
            const serviceMode = normalizeServiceMode(mode);
            rows.push({
                flow: getFlowForService(serviceMode, interpreter),
                id: `interpreter-${interpreter.id || interpreter.email}-${serviceMode}`,
                info: currentCall
                    ? `${currentCall.client_name || 'Client'} · ${currentCall.room_name || 'room pending'}`
                    : `${Array.isArray(interpreter.languages) ? interpreter.languages.join(', ') : interpreter.languages || 'ASL'} · ${formatLastActive(interpreter)}`,
                name: interpreter.name || interpreter.email || 'Interpreter',
                role: 'interpreter',
                service: serviceMode,
                status,
                tenant: interpreter.tenant_id || defaultTenantId(),
                updatedAt: interpreter.last_active,
                view: visibleInLive ? 'live staffing' : 'staffing'
            });
        });
    });

    clients.forEach(client => {
        const clientKeys = [client.id, String(client.name || '').toLowerCase()].filter(Boolean).map(String);
        const isVisible = clientKeys.some(key => queueClientKeys.has(key) || activeClientKeys.has(key));
        if (!isVisible) {
            return;
        }

        const isQueued = clientKeys.some(key => queueClientKeys.has(key));
        const isActive = clientKeys.some(key => activeClientKeys.has(key));
        const status = isActive ? 'in-call' : isQueued ? 'waiting' : 'connecting';
        const serviceMode = getPrimaryServiceMode(client, defaultServiceModesForTenant(client.tenant_id || defaultTenantId())[0]);

        rows.push({
            flow: getFlowForService(serviceMode, client),
            id: `client-${client.id || client.email}`,
            info: `${client.organization || 'Personal'} · ${client.email || 'no email'}`,
            name: client.name || client.email || 'Client',
            role: 'client',
            service: serviceMode,
            status,
            tenant: client.tenant_id || defaultTenantId(),
            updatedAt: client.last_call || client.created_at,
            view: 'live'
        });
    });

    operationsRows = rows.sort((a, b) => {
        const priority = {
            waiting: 1,
            assigned: 2,
            connecting: 3,
            'in-call': 4,
            available: 5,
            break: 6,
            offline: 7,
            completed: 8
        };
        return (priority[normalizeStatus(a.status)] || 99) - (priority[normalizeStatus(b.status)] || 99)
            || String(a.name).localeCompare(String(b.name));
    });
}

function getVisibleOperationsRows() {
    const tenant = getSelectValue('opsTenantFilter');
    const service = getSelectValue('opsServiceFilter');
    const flow = getSelectValue('opsFlowFilter');
    const role = getSelectValue('opsRoleFilter');
    const status = getSelectValue('opsStatusFilter');
    const search = String(document.getElementById('opsSearch')?.value || '').toLowerCase();

    return operationsRows
        .filter(row => activeOperationsView === 'live'
            ? row.view.includes('live')
            : activeOperationsView === 'staffing'
                ? row.view.includes('staffing') || row.role === 'interpreter'
                : row.flow === 'scheduled')
        .filter(row => !tenant || row.tenant === tenant)
        .filter(row => !service || row.service === service)
        .filter(row => !flow || row.flow === flow)
        .filter(row => !role || row.role === role)
        .filter(row => !status || row.status === status)
        .filter(row => !search
            || String(row.name || '').toLowerCase().includes(search)
            || String(row.info || '').toLowerCase().includes(search)
            || String(row.tenant || '').toLowerCase().includes(search));
}

function renderOperationsTable() {
    const tbody = document.getElementById('operationsTableBody');
    if (!tbody) {
        return;
    }

    const rows = getVisibleOperationsRows();

    if (!rows.length) {
        const emptyCopy = activeOperationsView === 'scheduled'
            ? 'No scheduled VRI sessions are visible yet.'
            : activeOperationsView === 'staffing'
                ? 'No staff records match these filters.'
                : 'No live operational rows match these filters.';

        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 24px;">
                    ${emptyCopy}
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = rows.map(row => `
        <tr>
            <td>
                <div style="font-weight: 600;">${escapeHtml(row.name)}</div>
            </td>
            <td>${formatRoleLabel(row.role)}</td>
            <td>${formatTenantLabel(row.tenant)}</td>
            <td>${String(row.service || 'vri').toUpperCase()}</td>
            <td>${formatFlow(row.flow)}</td>
            <td>
                <span class="status-badge ${getStatusClass(row.status)}">
                    <span class="status-dot"></span>
                    ${formatStatusLabel(row.status)}
                </span>
            </td>
            <td><div class="ops-info">${escapeHtml(row.info || '—')}</div></td>
            <td>${formatOperationUpdated(row.updatedAt)}</td>
        </tr>
    `).join('');
}

async function loadActiveInterpreters(activeCalls = []) {
    try {
        const interpreters = await apiCall('/admin/interpreters');
        const active = interpreters.filter(interpreter => interpreter.connected && interpreter.currentStatus !== 'offline');

        renderActiveInterpretersTable(active.slice(0, 5), activeCalls);
    } catch (error) {
        console.error('[Active Interpreters] Error:', error);
    }
}

function renderActiveInterpretersTable(interpreters, activeCalls = []) {
    const tbody = document.getElementById('activeInterpretersList');
    if (!tbody) return;

    if (interpreters.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align: center; color: var(--text-muted); padding: 24px;">
                    No interpreters currently online
                </td>
            </tr>
        `;
        return;
    }

    const activeCallMap = buildOperationActiveCallMap(activeCalls);

    tbody.innerHTML = interpreters.map(interp => {
        const status = deriveInterpreterStatus(interp, activeCallMap);
        const currentCall = activeCallMap.get(String(interp.name || '').toLowerCase());
        const currentCallLabel = currentCall
            ? `${currentCall.client_name || 'Client'} · ${formatDurationFromDate(currentCall.started_at)}`
            : (status === 'assigned' || status === 'in-call' ? 'In progress' : '—');

        return `
            <tr>
                <td>
                    <div style="font-weight: 500;">${interp.name}</div>
                    <div style="font-size: 12px; color: var(--text-muted);">${Array.isArray(interp.languages) ? interp.languages.join(', ') : 'ASL'}</div>
                </td>
                <td>
                    <span class="status-badge ${getStatusClass(status)}">
                        <span class="status-dot"></span>
                        ${formatStatusLabel(status)}
                    </span>
                </td>
                <td>${currentCallLabel}</td>
                <td>${interp.calls_today || 0} calls</td>
            </tr>
        `;
    }).join('');
}

async function renderQueuePreview(queueData = null) {
    try {
        const queue = Array.isArray(queueData) ? queueData : await apiCall('/admin/queue');
        const container = document.getElementById('queuePreview');
        if (!container) return;

        if (queue.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">✅</div>
                    <p>No waiting client requests right now.</p>
                    <p class="help-text">Interpreters who join queue appear under Available Interpreters; this section is only clients waiting for a match.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = queue.slice(0, 5).map(item => {
            const clientName = item.clientName || item.client_name || 'Unknown client';
            const roomName = item.roomName || item.room_name || '—';
            const serviceMode = item.serviceMode || item.service_mode || item.callType || item.call_type || 'vri';

            return `
                <div class="queue-item">
                    <div class="queue-position">${item.position}</div>
                    <div class="queue-info">
                        <div class="queue-client">${clientName}</div>
                        <div class="queue-details">
                            <span>🌐 ${item.language}</span>
                            <span>${String(serviceMode).toUpperCase()}</span>
                            <span>📍 ${roomName}</span>
                        </div>
                        <div class="queue-wait-time">⏱️ ${item.wait_time || item.waitTime || '—'}</div>
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('[Queue Preview] Error:', error);
    }
}

function renderWeeklyUsageChart(dailyUsage = []) {
    const chart = document.getElementById('usageChart');
    const labels = document.getElementById('usageChartLabels');
    const summary = document.getElementById('usageChartSummary');

    if (!chart || !labels || !summary) {
        return;
    }

    if (!dailyUsage.length) {
        chart.innerHTML = '<div class="empty-state" style="padding: 32px 0; width: 100%;"><p>No usage data yet</p></div>';
        labels.innerHTML = '';
        summary.textContent = 'Waiting for completed calls to populate usage history.';
        return;
    }

    const maxCalls = Math.max(...dailyUsage.map(day => Number(day.calls) || 0), 1);
    const totalCalls = dailyUsage.reduce((sum, day) => sum + (Number(day.calls) || 0), 0);
    const totalMinutes = dailyUsage.reduce((sum, day) => sum + (Number(day.minutes) || 0), 0);

    chart.innerHTML = dailyUsage.map(day => {
        const calls = Number(day.calls) || 0;
        const height = Math.max(12, Math.round((calls / maxCalls) * 100));
        const isToday = day.date === new Date().toISOString().split('T')[0];

        return `<div class="chart-bar ${isToday ? 'today' : ''}" style="height: ${height}%" title="${day.date}: ${calls} calls"></div>`;
    }).join('');

    labels.innerHTML = dailyUsage.map(day => {
        const date = new Date(`${day.date}T00:00:00`);
        return `<span>${date.toLocaleDateString('en-US', { weekday: 'short' })}</span>`;
    }).join('');

    summary.textContent = `${totalCalls} calls over the last ${dailyUsage.length} days · ${Math.round(totalMinutes)} total minutes`;
}

function renderActiveCallsTable(activeCalls = []) {
    const tbody = document.getElementById('activeCallsTableBody');
    const summary = document.getElementById('activeCallsSummary');
    if (!tbody || !summary) {
        return;
    }

    summary.textContent = activeCalls.length
        ? `${activeCalls.length} live call${activeCalls.length === 1 ? '' : 's'} in progress`
        : 'No live calls right now';

    if (!activeCalls.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align: center; color: var(--text-muted); padding: 24px;">
                    No active calls in progress
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = activeCalls.map(call => `
        <tr>
            <td>${call.client_name || 'Unknown client'}</td>
            <td>${call.interpreter_name || 'Unassigned'}</td>
            <td>${call.room_name || '—'}</td>
            <td>${formatDurationFromDate(call.started_at)}</td>
        </tr>
    `).join('');
}
// ============================================
// INTERPRETERS
// ============================================

let allInterpreters = [];

async function loadInterpreters() {
    try {
        allInterpreters = await apiCall('/admin/interpreters');
        renderInterpretersTable(allInterpreters);
        await loadAdminScheduleWindows();
    } catch (error) {
        console.error('[Interpreters] Error:', error);
    }
}

function renderInterpretersTable(interpreters) {
    const tbody = document.getElementById('interpretersTableBody');
    if (!tbody) return;

    if (interpreters.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align: center; color: var(--text-muted); padding: 24px;">
                    No interpreters found
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = interpreters.map(interp => {
        const status = deriveInterpreterStatus(interp, new Map());

        return `
            <tr>
                <td><div style="font-weight: 500;">${interp.name}</div></td>
                <td style="color: var(--text-secondary);">${interp.email}</td>
                <td>${Array.isArray(interp.languages) ? interp.languages.join(', ') : interp.languages}</td>
                <td>${formatServiceModes(interp.service_modes)}</td>
                <td>
                    <span class="status-badge ${getStatusClass(status)}">
                        <span class="status-dot"></span>
                        ${formatStatusLabel(status)}
                    </span>
                </td>
                <td>${interp.calls_today || 0}</td>
                <td>${interp.minutes_week || 0}</td>
                <td>${formatLastActive(interp)}</td>
                <td>
                    <button class="btn btn-secondary" style="padding: 6px 12px; font-size: 12px;" data-action="edit-interpreter" data-id="${interp.id}">Edit</button>
                </td>
            </tr>
        `;
    }).join('');
}

function formatServiceModes(modes) {
    const values = parseServiceModes(modes, []);
    if (!values.length) return 'VRI';
    return values.map(mode => String(mode).toUpperCase()).join(', ');
}

function formatLastActive(interp) {
    if (!interp.connected) {
        if (interp.last_active) {
            const date = new Date(interp.last_active);
            const now = new Date();
            const hours = Math.floor((now - date) / (1000 * 60 * 60));
            if (hours < 1) return '< 1 hour ago';
            if (hours < 24) return `${hours}h ago`;
            return `${Math.floor(hours / 24)}d ago`;
        }
        return 'Unknown';
    }
    return 'Now';
}

async function filterInterpreters() {
    renderInterpretersTable(getVisibleInterpreters());
    renderAdminScheduling();
}

function toDateInputValue(date) {
    return date.toISOString().split('T')[0];
}

function getScheduleWeekStart() {
    const input = document.getElementById('scheduleWeekStart');
    if (input && input.value) return input.value;
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    const value = toDateInputValue(monday);
    if (input) input.value = value;
    return value;
}

function getScheduleWeekEnd() {
    const start = new Date(`${getScheduleWeekStart()}T00:00:00`);
    start.setDate(start.getDate() + 6);
    return toDateInputValue(start);
}

async function loadAdminScheduleWindows() {
    try {
        const params = new URLSearchParams();
        params.set('startDate', getScheduleWeekStart());
        params.set('endDate', getScheduleWeekEnd());
        const tenant = document.getElementById('scheduleTenantFilter')?.value || '';
        const service = document.getElementById('scheduleServiceFilter')?.value || '';
        const language = document.getElementById('scheduleLanguageFilter')?.value || '';
        if (tenant) params.set('tenantId', tenant);
        if (service) params.set('serviceMode', service);
        if (language) params.set('language', language);
        const [windowsData, utilizationData] = await Promise.all([
            apiCall(`/admin/scheduling/windows?${params.toString()}`),
            apiCall(`/admin/scheduling/utilization?${params.toString()}`)
        ]);
        adminScheduleWindows = windowsData.windows || [];
        adminUtilization = utilizationData.utilization || null;
    } catch (error) {
        console.error('[Scheduling] Error:', error);
        adminScheduleWindows = [];
        adminUtilization = null;
    }
    renderAdminScheduling();
}

function getScheduleFilteredInterpreters() {
    const tenantFilter = document.getElementById('scheduleTenantFilter')?.value || '';
    const serviceFilter = document.getElementById('scheduleServiceFilter')?.value || '';
    const languageFilter = document.getElementById('scheduleLanguageFilter')?.value || '';

    return allInterpreters.filter(interp => {
        const tenant = String(interp.tenant_id || interp.tenant || '').toLowerCase();
        const services = parseServiceModes(interp.service_modes);
        const languages = Array.isArray(interp.languages) ? interp.languages : String(interp.languages || '').split(',').map(value => value.trim());

        if (tenantFilter && tenant && tenant !== tenantFilter) return false;
        if (serviceFilter && !services.includes(serviceFilter)) return false;
        if (languageFilter && !languages.map(String).map(value => value.toUpperCase()).includes(languageFilter.toUpperCase())) return false;
        return true;
    });
}

function renderAdminScheduling() {
    const roster = getScheduleFilteredInterpreters();
    const cards = document.getElementById('scheduleCoverageCards');
    const tbody = document.getElementById('scheduleRosterBody');
    const grid = document.getElementById('scheduleCoverageGrid');
    const pendingBody = document.getElementById('pendingScheduleBody');
    if (!cards || !tbody || !grid || !pendingBody) return;

    const activeCount = roster.filter(interp => ['available', 'assigned', 'in-call'].includes(deriveInterpreterStatus(interp, new Map()))).length;
    const vrsCount = roster.filter(interp => parseServiceModes(interp.service_modes).includes('vrs')).length;
    const vriCount = roster.filter(interp => parseServiceModes(interp.service_modes).includes('vri')).length;
    const totalMinutes = roster.reduce((sum, interp) => sum + Number(interp.minutes_week || 0), 0);
    const serviceFilter = document.getElementById('scheduleServiceFilter')?.value || '';
    const languageFilter = document.getElementById('scheduleLanguageFilter')?.value || '';
    const selectedCoverage = roster.filter(interp => {
        const status = deriveInterpreterStatus(interp, new Map());
        return ['available', 'assigned', 'in-call'].includes(status);
    }).length;
    const gapLabel = selectedCoverage > 0 ? 'Covered' : 'Gap';
    const utilizationTotals = adminUtilization?.totals || {};
    const utilizationByInterpreter = new Map((adminUtilization?.interpreters || []).map(row => [String(row.interpreterId), row]));

    cards.innerHTML = `
        <div class="coverage-card">
            <div class="coverage-value">${activeCount}</div>
            <div class="coverage-label">Active Now</div>
            <div class="coverage-note">Available, assigned, or in-call interpreters matching these filters.</div>
        </div>
        <div class="coverage-card">
            <div class="coverage-value">${vrsCount} / ${vriCount}</div>
            <div class="coverage-label">VRS / VRI Pool</div>
            <div class="coverage-note">Eligible roster count by service mode.</div>
        </div>
        <div class="coverage-card">
            <div class="coverage-value">${Math.round(totalMinutes)}</div>
            <div class="coverage-label">Minutes Week</div>
            <div class="coverage-note">Interpreter signed-on/call minutes currently reported by roster.</div>
        </div>
        <div class="coverage-card">
            <div class="coverage-value">${Math.round(utilizationTotals.fillRate || 0)}%</div>
            <div class="coverage-label">Fill Rate</div>
            <div class="coverage-note">${gapLabel}. Scheduled coverage filled by hands-up time.</div>
        </div>
        <div class="coverage-card">
            <div class="coverage-value">${Math.round(utilizationTotals.productivityRate || 0)}%</div>
            <div class="coverage-label">Productivity</div>
            <div class="coverage-note">In-call minutes as a share of hands-up minutes.</div>
        </div>
        <div class="coverage-card">
            <div class="coverage-value">${Math.round(utilizationTotals.acceptanceRate || 0)}%</div>
            <div class="coverage-label">Acceptance</div>
            <div class="coverage-note">Accepted requests vs accepted/declined/no-answer events.</div>
        </div>
        <div class="coverage-card">
            <div class="coverage-value">${Math.round(utilizationTotals.slaBreachRate || 0)}%</div>
            <div class="coverage-label">SLA Impact</div>
            <div class="coverage-note">Accepted requests above the current 120s queue wait threshold.</div>
        </div>
    `;

    renderCoverageGrid(grid);
    renderPendingScheduleChanges(pendingBody);

    if (!roster.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10" style="text-align: center; color: var(--text-muted); padding: 24px;">
                    No interpreters match the scheduling filters.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = roster.map(interp => {
        const status = deriveInterpreterStatus(interp, new Map());
        const services = formatServiceModes(interp.service_modes);
        const languages = Array.isArray(interp.languages) ? interp.languages.join(', ') : (interp.languages || 'ASL');
        const utilization = utilizationByInterpreter.get(String(interp.id)) || {};
        const note = status === 'available'
            ? 'Ready for assignment'
            : status === 'offline'
                ? 'Not available for coverage'
                : status === 'break'
                    ? 'On break, excluded from queue'
                    : 'System-driven active state';

        return `
            <tr>
                <td><div style="font-weight: 500;">${interp.name || 'Interpreter'}</div><div style="color: var(--text-muted); font-size: 12px;">${interp.email || ''}</div></td>
                <td>${services}</td>
                <td>${languages}</td>
                <td>
                    <span class="status-badge ${getStatusClass(status)}">
                        <span class="status-dot"></span>
                        ${formatStatusLabel(status)}
                    </span>
                </td>
                <td>${interp.calls_today || 0}</td>
                <td>${interp.minutes_week || 0}</td>
                <td>${Math.round(utilization.adherenceRate || 0)}%</td>
                <td>${Math.round((utilization.breakMinutes || 0) / 60 * 10) / 10}h</td>
                <td>${Math.round(utilization.sla?.breachRate || 0)}%</td>
                <td class="ops-info">${note}</td>
            </tr>
        `;
    }).join('');
}

function renderCoverageGrid(container) {
    const startHour = Math.max(0, Math.min(23, Number(document.getElementById('scheduleStartHour')?.value || 8)));
    const endHour = Math.max(startHour + 1, Math.min(24, Number(document.getElementById('scheduleEndHour')?.value || 18)));
    const target = Math.max(1, Number(document.getElementById('scheduleTargetCount')?.value || 1));
    const weekStart = new Date(`${getScheduleWeekStart()}T00:00:00`);
    const days = Array.from({ length: 7 }, (_, index) => {
        const date = new Date(weekStart);
        date.setDate(weekStart.getDate() + index);
        return date;
    });

    let html = '<div class="coverage-hour-cell header"></div>';
    html += days.map(day => `<div class="coverage-hour-cell header">${day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div>`).join('');

    for (let hour = startHour; hour < endHour; hour += 1) {
        html += `<div class="coverage-hour-cell header">${String(hour).padStart(2, '0')}:00</div>`;
        for (const day of days) {
            const slotStart = new Date(day);
            slotStart.setHours(hour, 0, 0, 0);
            const slotEnd = new Date(slotStart);
            slotEnd.setHours(hour + 1, 0, 0, 0);
            const covering = adminScheduleWindows.filter(window => {
                const status = String(window.status || '').toLowerCase();
                if (status === 'cancelled' || status === 'unavailable' || status === 'time-off') return false;
                const startsAt = new Date(window.starts_at);
                const endsAt = new Date(window.ends_at);
                return startsAt < slotEnd && endsAt > slotStart;
            }).length;
            const state = covering < target ? 'gap' : covering > target + 1 ? 'over' : 'covered';
            html += `<div class="coverage-hour-cell ${state}"><strong>${covering}</strong><br><span>${state === 'gap' ? 'gap' : state === 'over' ? 'over' : 'covered'}</span></div>`;
        }
    }

    container.innerHTML = html;
}

function renderPendingScheduleChanges(tbody) {
    const pending = adminScheduleWindows.filter(window => String(window.status || '').toLowerCase() === 'pending');
    if (!pending.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 24px;">
                    No pending schedule changes.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = pending.map(window => `
        <tr>
            <td><span class="status-badge status-waiting"><span class="status-dot"></span>Pending</span></td>
            <td>${escapeHtml(window.interpreter_name || 'Interpreter')}</td>
            <td>${formatDateTime(window.starts_at)} → ${formatDateTime(window.ends_at)}</td>
            <td>${formatServiceModes(window.service_modes)}</td>
            <td class="ops-info">${escapeHtml(window.manager_note || 'Interpreter schedule change awaiting manager review.')}</td>
            <td>
                <button class="btn btn-primary" style="padding: 6px 12px; font-size: 12px;" data-action="approve-schedule-window" data-id="${window.id}">Approve</button>
                <button class="btn btn-secondary" style="padding: 6px 12px; font-size: 12px;" data-action="reject-schedule-window" data-id="${window.id}">Reject</button>
            </td>
        </tr>
    `).join('');
}

function showScheduleWindowModal() {
    const roster = getScheduleFilteredInterpreters();
    const weekStart = getScheduleWeekStart();
    const interpreterOptions = roster.map(interp => `<option value="${escapeHtml(interp.id)}">${escapeHtml(interp.name || interp.email || 'Interpreter')}</option>`).join('');
    openAdminModal({
        title: 'Manager Schedule Override',
        subtitle: 'Add a coverage window, time-off block, or pending schedule change for manager review.',
        body: `
            <form id="scheduleWindowForm" class="form-grid">
                <div class="form-field full">
                    <label>Interpreter</label>
                    <select name="interpreterId" required>${interpreterOptions || '<option value="">No interpreters match filters</option>'}</select>
                </div>
                <div class="form-field">
                    <label>Starts</label>
                    <input name="startsAt" type="datetime-local" value="${weekStart}T09:00" required>
                </div>
                <div class="form-field">
                    <label>Ends</label>
                    <input name="endsAt" type="datetime-local" value="${weekStart}T17:00" required>
                </div>
                <div class="form-field">
                    <label>Tenant</label>
                    <select name="tenantId">
                        <option value="malka">Malka</option>
                        <option value="maple">Maple</option>
                    </select>
                </div>
                <div class="form-field">
                    <label>Status</label>
                    <select name="status">
                        <option value="confirmed">Confirmed</option>
                        <option value="pending">Pending Review</option>
                        <option value="unavailable">Unavailable</option>
                        <option value="time-off">Time Off</option>
                    </select>
                </div>
                <div class="form-field">
                    <label>Service Modes</label>
                    <input name="serviceModes" value="${escapeHtml(document.getElementById('scheduleServiceFilter')?.value || 'vrs')}">
                </div>
                <div class="form-field">
                    <label>Languages</label>
                    <input name="languages" value="${escapeHtml(document.getElementById('scheduleLanguageFilter')?.value || 'ASL')}">
                </div>
                <div class="form-field full">
                    <label>Manager Note</label>
                    <textarea name="managerNote" rows="3" placeholder="Reason, override context, or coverage note"></textarea>
                </div>
            </form>
        `,
        footer: `
            <button class="btn btn-secondary" type="button" data-modal-close>Cancel</button>
            <button class="btn btn-primary" type="button" id="saveScheduleWindowBtn">Save Window</button>
        `
    });
    document.getElementById('saveScheduleWindowBtn')?.addEventListener('click', saveScheduleWindow);
}

async function saveScheduleWindow() {
    const form = document.getElementById('scheduleWindowForm');
    if (!form) return;
    const data = new FormData(form);
    try {
        await apiCall('/admin/scheduling/windows', {
            method: 'POST',
            body: JSON.stringify({
                interpreterId: data.get('interpreterId'),
                startsAt: data.get('startsAt'),
                endsAt: data.get('endsAt'),
                tenantId: data.get('tenantId'),
                status: data.get('status'),
                serviceModes: parseCsvList(data.get('serviceModes')).map(value => value.toLowerCase()),
                languages: parseCsvList(data.get('languages')),
                managerNote: data.get('managerNote')
            })
        });
        closeAdminModal();
        await loadAdminScheduleWindows();
    } catch (error) {
        alert(error.message);
    }
}

async function updateScheduleWindowStatus(id, status) {
    try {
        await apiCall(`/admin/scheduling/windows/${encodeURIComponent(id)}`, {
            method: 'PUT',
            body: JSON.stringify({ status })
        });
        await loadAdminScheduleWindows();
    } catch (error) {
        alert(error.message);
    }
}

function showAddInterpreterModal() {
    const tenantId = defaultTenantId();
    const serviceModes = defaultServiceModesForTenant(tenantId);

    openAdminModal({
        title: 'Add Interpreter',
        subtitle: 'Creates both the login account and interpreter roster profile for this tenant.',
        body: `
            <form id="interpreterCreateForm" class="form-grid">
                <div class="form-field">
                    <label>Name</label>
                    <input name="name" required autocomplete="name">
                </div>
                <div class="form-field">
                    <label>Primary email</label>
                    <input name="email" type="email" autocomplete="email">
                </div>
                <div class="form-field">
                    <label>Username</label>
                    <input name="username" placeholder="optional if email is supplied">
                </div>
                <div class="form-field">
                    <label>Temporary password</label>
                    <input name="password" value="interpreter123!" required>
                </div>
                <div class="form-field">
                    <label>Tenant</label>
                    <select name="tenantId" ${currentAdminRole === 'superadmin' ? '' : 'disabled'}>
                        <option value="malka" ${tenantId === 'malka' ? 'selected' : ''}>Malka</option>
                        <option value="maple" ${tenantId === 'maple' ? 'selected' : ''}>Maple</option>
                    </select>
                </div>
                <div class="form-field">
                    <label>Languages</label>
                    <input name="languages" value="ASL, English">
                </div>
                <div class="form-field full">
                    <label>Queues</label>
                    <div style="display:flex; gap:16px;">${serviceCheckboxes('serviceModes', serviceModes)}</div>
                </div>
            </form>
        `,
        footer: `
            <button class="btn btn-secondary" type="button" data-modal-close>Cancel</button>
            <button class="btn btn-primary" type="submit" form="interpreterCreateForm">Create Interpreter</button>
        `
    });

    document.getElementById('interpreterCreateForm')?.addEventListener('submit', event => {
        event.preventDefault();
        const form = event.currentTarget;
        const values = getFormValues(form);
        const modes = selectedCheckboxValues(form, 'serviceModes');
        const selectedTenant = currentAdminRole === 'superadmin' ? values.tenantId : tenantId;
        if (!values.email && !values.username) {
            alert('Provide either an email or a username.');
            return;
        }
        createInterpreter(
            values.name,
            values.email,
            parseCsvList(values.languages),
            values.username,
            modes.length ? modes : defaultServiceModesForTenant(selectedTenant),
            selectedTenant,
            values.password
        );
    }, { once: true });
}

function defaultTenantId() {
    return localStorage.getItem('vrs_admin_tenant') || (location.hostname.includes('maplecomm.ca') ? 'maple' : 'malka');
}

function defaultServiceModesForTenant(tenantId = defaultTenantId()) {
    return tenantId === 'maple' ? ['vri'] : ['vrs'];
}

function parseServiceModes(value, fallback = defaultServiceModesForTenant()) {
    const modes = String(value || fallback.join(','))
        .split(',')
        .map(mode => mode.trim().toLowerCase())
        .filter(mode => mode === 'vri' || mode === 'vrs');
    return modes.length ? Array.from(new Set(modes)) : fallback;
}

function appendQueryParam(params, key, value) {
    if (value) {
        params.set(key, value);
    }
}

function getSelectValue(id) {
    return document.getElementById(id)?.value || '';
}

function buildQueryString(filters) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([ key, value ]) => appendQueryParam(params, key, value));
    const query = params.toString();
    return query ? `?${query}` : '';
}

function getVisibleInterpreters() {
    const statusFilter = document.getElementById('interpreterStatusFilter')?.value;
    const searchTerm = document.getElementById('interpreterSearch')?.value.toLowerCase();

    return allInterpreters
        .filter(interp => {
            if (!statusFilter || statusFilter === 'all') return true;
            return deriveInterpreterStatus(interp, new Map()) === statusFilter;
        })
        .filter(interp => !searchTerm
            || String(interp.name || '').toLowerCase().includes(searchTerm)
            || String(interp.email || '').toLowerCase().includes(searchTerm));
}

function serviceCheckboxes(name, selected = []) {
    const selectedModes = Array.isArray(selected) ? selected : parseServiceModes(selected);
    const modes = new Set(selectedModes);

    return `
        <label><input type="checkbox" name="${name}" value="vrs" ${modes.has('vrs') ? 'checked' : ''}> VRS</label>
        <label><input type="checkbox" name="${name}" value="vri" ${modes.has('vri') ? 'checked' : ''}> VRI</label>
    `;
}

function selectedCheckboxValues(form, name) {
    return Array.from(form.querySelectorAll(`input[name="${name}"]:checked`)).map(input => input.value);
}

async function createInterpreter(name, email, languages, username, serviceModes = defaultServiceModesForTenant(), tenantId = defaultTenantId(), password = 'interpreter123!') {
    try {
        await opsApiCall('/admin/accounts', {
            method: 'POST',
            body: JSON.stringify({
                email,
                languages,
                name,
                password,
                role: 'interpreter',
                serviceModes,
                tenantId,
                username
            })
        });

        await apiCall('/admin/interpreters', {
            method: 'POST',
            body: JSON.stringify({ name, email, languages, password, serviceModes, tenantId })
        });

        closeAdminModal();
        alert(`Interpreter created successfully.\n${username ? `username: ${username}\n` : ''}${email ? `email: ${email}\n` : ''}password: ${password}`);
        loadInterpreters();
        loadAccounts();
        loadMonitoringSummary();
    } catch (error) {
        alert('Failed to create interpreter: ' + error.message);
    }
}

async function editInterpreter(id) {
    const interp = allInterpreters.find(item => String(item.id) === String(id));
    if (!interp) return;

    if (!allAccounts.length) {
        await loadAccounts();
    }

    const account = allAccounts.find(item => {
        if (!interp.email || !item.email) return false;
        return String(item.email).toLowerCase() === String(interp.email).toLowerCase()
            && item.role === 'interpreter';
    });
    const tenantId = interp.tenant_id || defaultTenantId();
    const profile = account?.profile || {};

    openAdminModal({
        title: interp.name || 'Interpreter Profile',
        subtitle: `${interp.email || 'No email'} · ${tenantId} · ${formatServiceModes(interp.service_modes)}`,
        body: `
            <form id="interpreterEditForm" class="form-grid">
                <div class="form-field">
                    <label>Name</label>
                    <input name="name" value="${escapeHtml(interp.name)}" required>
                </div>
                <div class="form-field">
                    <label>Primary email</label>
                    <input name="email" type="email" value="${escapeHtml(interp.email || '')}">
                </div>
                <div class="form-field">
                    <label>Login email</label>
                    <input name="loginEmail" type="email" value="${escapeHtml(account?.email || interp.email || '')}">
                </div>
                <div class="form-field">
                    <label>Username</label>
                    <input name="username" value="${escapeHtml(account?.username || '')}" placeholder="optional if email is supplied">
                </div>
                <div class="form-field">
                    <label>Company email</label>
                    <input name="companyEmail" type="email" value="${escapeHtml(profile.companyEmail || '')}" placeholder="optional">
                </div>
                <div class="form-field">
                    <label>Other email</label>
                    <input name="alternateEmail" type="email" value="${escapeHtml(profile.alternateEmail || '')}" placeholder="optional">
                </div>
                <div class="form-field">
                    <label>Tenant</label>
                    <select name="tenantId" ${currentAdminRole === 'superadmin' ? '' : 'disabled'}>
                        <option value="malka" ${tenantId === 'malka' ? 'selected' : ''}>Malka</option>
                        <option value="maple" ${tenantId === 'maple' ? 'selected' : ''}>Maple</option>
                    </select>
                </div>
                <div class="form-field">
                    <label>Status</label>
                    <select name="active">
                        <option value="true" ${interp.active === false ? '' : 'selected'}>Active</option>
                        <option value="false" ${interp.active === false ? 'selected' : ''}>Disabled</option>
                    </select>
                </div>
                <div class="form-field">
                    <label>Languages</label>
                    <input name="languages" value="${escapeHtml(Array.isArray(interp.languages) ? interp.languages.join(', ') : interp.languages || 'ASL')}">
                </div>
                <div class="form-field">
                    <label>Reset password</label>
                    <input name="password" placeholder="leave blank to keep current password">
                </div>
                <div class="form-field full">
                    <label>Queues</label>
                    <div style="display:flex; gap:16px;">${serviceCheckboxes('serviceModes', interp.service_modes || defaultServiceModesForTenant(tenantId))}</div>
                </div>
                <div class="form-field full">
                    <label>Manager comments</label>
                    <textarea name="managerComments" placeholder="Operational notes, QA comments, onboarding items">${escapeHtml(profile.managerComments || '')}</textarea>
                </div>
            </form>
            <div class="profile-panels">
                <div class="profile-panel">
                    <h3>Schedule</h3>
                    <p>Last active: ${escapeHtml(formatLastActive(interp))}</p>
                    <textarea form="interpreterEditForm" name="scheduleNotes" placeholder="Availability, recurring schedule, blackout notes">${escapeHtml(profile.scheduleNotes || '')}</textarea>
                </div>
                <div class="profile-panel">
                    <h3>Billing</h3>
                    <p>${Number(interp.minutes_week || 0)} minutes this week.<br>${Number(interp.calls_today || 0)} calls today.</p>
                    <textarea form="interpreterEditForm" name="billingNotes" placeholder="Rate notes, invoicing cadence, billing flags">${escapeHtml(profile.billingNotes || '')}</textarea>
                </div>
                <div class="profile-panel">
                    <h3>Payment Info</h3>
                    <p>Internal payout notes only. Do not store bank secrets here.</p>
                    <textarea form="interpreterEditForm" name="paymentInfo" placeholder="Payout method summary, invoice contact, tax form status">${escapeHtml(profile.paymentInfo || '')}</textarea>
                </div>
            </div>
        `,
        footer: `
            <button class="btn btn-secondary" type="button" data-modal-close>Cancel</button>
            <button class="btn btn-primary" type="submit" form="interpreterEditForm">Save Profile</button>
        `
    });

    document.getElementById('interpreterEditForm')?.addEventListener('submit', async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const values = getFormValues(form);
        const selectedTenant = currentAdminRole === 'superadmin' ? values.tenantId : tenantId;
        const serviceModes = selectedCheckboxValues(form, 'serviceModes');

        try {
            await apiCall(`/admin/interpreters/${id}`, {
                method: 'PUT',
                body: JSON.stringify({
                    active: boolFromFormValue(values.active),
                    email: values.email,
                    languages: parseCsvList(values.languages),
                    name: values.name,
                    password: values.password || undefined,
                    serviceModes: serviceModes.length ? serviceModes : defaultServiceModesForTenant(selectedTenant),
                    tenantId: selectedTenant
                })
            });

            if (account) {
                const accountBody = {
                    active: boolFromFormValue(values.active),
                    email: values.loginEmail || values.email || undefined,
                    languages: parseCsvList(values.languages),
                    name: values.name,
                    password: values.password || undefined,
                    profile: {
                        alternateEmail: values.alternateEmail || '',
                        billingNotes: values.billingNotes || '',
                        companyEmail: values.companyEmail || '',
                        managerComments: values.managerComments || '',
                        paymentInfo: values.paymentInfo || '',
                        scheduleNotes: values.scheduleNotes || ''
                    },
                    serviceModes: serviceModes.length ? serviceModes : defaultServiceModesForTenant(selectedTenant)
                };
                if (currentAdminRole === 'superadmin') {
                    accountBody.tenantId = selectedTenant;
                }
                if (values.username) {
                    accountBody.username = values.username;
                }

                await opsApiCall(`/admin/accounts/${account.id}`, {
                    method: 'PUT',
                    body: JSON.stringify(accountBody)
                });
            }

            closeAdminModal();
            await loadInterpreters();
            await loadAccounts();
            alert('Interpreter profile updated.');
        } catch (error) {
            alert(`Failed to update interpreter: ${error.message}`);
        }
    }, { once: true });
}

// ============================================
// CAPTIONERS
// ============================================

let allCaptioners = [];

async function loadCaptioners() {
    try {
        allCaptioners = await apiCall('/admin/captioners');
        renderCaptionersTable(allCaptioners);
    } catch (error) {
        console.error('[Captioners] Error:', error);
    }
}

function renderCaptionersTable(captioners) {
    const tbody = document.getElementById('captionersTableBody');
    if (!tbody) {
        return;
    }

    if (captioners.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 24px;">
                    No captioners found
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = captioners.map(captioner => `
        <tr>
            <td><div style="font-weight: 500;">${captioner.name}</div></td>
            <td style="color: var(--text-secondary);">${captioner.email}</td>
            <td>${Array.isArray(captioner.languages) ? captioner.languages.join(', ') : captioner.languages}</td>
            <td>
                <span class="status-badge ${captioner.active === false ? 'status-offline' : 'status-online'}">
                    <span class="status-dot"></span>
                    ${captioner.active === false ? 'Disabled' : 'Active'}
                </span>
            </td>
            <td>${formatDate(captioner.created_at)}</td>
            <td>
                <button class="btn btn-secondary" style="padding: 6px 12px; font-size: 12px;" data-action="edit-captioner" data-id="${captioner.id}">Edit</button>
            </td>
        </tr>
    `).join('');
}

function showAddCaptionerModal() {
    if (currentAdminRole !== 'superadmin') {
        alert('Only the superadmin account can create captioner accounts.');
        return;
    }

    const name = prompt('Captioner Name:');
    if (!name) return;

    const email = prompt('Email:', '');
    if (!email) return;

    const username = prompt('Username (optional if email is supplied):', email ? email.split('@')[0] : '');
    const languages = prompt('Languages (comma-separated, e.g., English, Spanish):', 'English');
    const tenantId = prompt('Tenant ID:', defaultTenantId());
    if (!tenantId) return;
    const modes = prompt('Service modes (comma-separated: vri, vrs):', defaultServiceModesForTenant(tenantId).join(','));
    if (!modes) return;

    createCaptioner(name, email, languages.split(',').map(language => language.trim()).filter(Boolean), username, parseServiceModes(modes, defaultServiceModesForTenant(tenantId)), tenantId);
}

async function createCaptioner(name, email, languages, username, serviceModes = defaultServiceModesForTenant(), tenantId = defaultTenantId()) {
    try {
        await opsApiCall('/admin/accounts', {
            method: 'POST',
            body: JSON.stringify({
                email,
                languages,
                name,
                password: 'captioner123!',
                role: 'captioner',
                serviceModes,
                tenantId,
                username
            })
        });

        await apiCall('/admin/captioners', {
            method: 'POST',
            body: JSON.stringify({ name, email, languages, password: 'captioner123!' })
        });

        alert(`Captioner created successfully.\n${username ? `username: ${username}\n` : ''}${email ? `email: ${email}\n` : ''}password: captioner123!`);
        loadCaptioners();
        loadAccounts();
        loadMonitoringSummary();
    } catch (error) {
        alert('Failed to create captioner: ' + error.message);
    }
}

async function editCaptioner(captionerId) {
    const captioner = allCaptioners.find(item => item.id === captionerId);
    if (!captioner) {
        return;
    }

    const name = prompt('Captioner name:', captioner.name);
    if (!name) return;

    const email = prompt('Email:', captioner.email || '');
    if (!email) return;

    const languages = prompt(
        'Languages (comma-separated):',
        Array.isArray(captioner.languages) ? captioner.languages.join(', ') : (captioner.languages || 'English')
    );
    const active = confirm('Should this captioner account remain active?');

    try {
        await apiCall(`/admin/captioners/${captionerId}`, {
            method: 'PUT',
            body: JSON.stringify({
                active,
                email,
                languages: languages.split(',').map(language => language.trim()).filter(Boolean),
                name
            })
        });

        loadCaptioners();
    } catch (error) {
        alert('Failed to update captioner: ' + error.message);
    }
}

// ============================================
// ACCOUNTS
// ============================================

let allAccounts = [];

async function loadAccounts() {
    try {
        const tenantFilter = currentAdminRole === 'superadmin'
            ? getSelectValue('accountTenantFilter')
            : defaultTenantId();
        allAccounts = await opsApiCall(`/admin/accounts${buildQueryString({
            role: getSelectValue('accountRoleFilter'),
            serviceMode: getSelectValue('accountServiceFilter'),
            tenantId: tenantFilter
        })}`);
        renderAccountsTable(allAccounts);
    } catch (error) {
        console.error('[Accounts] Error:', error);
    }
}

function renderAccountsTable(accounts) {
    const tbody = document.getElementById('accountsTableBody');
    if (!tbody) {
        return;
    }

    if (!accounts.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10" style="text-align: center; color: var(--text-muted); padding: 24px;">
                    No managed accounts found yet
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = accounts.map(account => `
        <tr>
            <td><div style="font-weight: 500;">${account.name}</div></td>
            <td>${account.role}</td>
            <td>${account.username || '—'}</td>
            <td style="color: var(--text-secondary);">${account.email || '—'}</td>
            <td>${account.tenantId || 'malka'}</td>
            <td>${formatServiceModes(account.serviceModes)}</td>
            <td>${Array.isArray(account.languages) && account.languages.length ? account.languages.join(', ') : '—'}</td>
            <td>${account.lastLoginAt ? formatDateTime(account.lastLoginAt) : 'Never'}</td>
            <td>
                <span class="status-badge ${account.active ? 'status-online' : 'status-offline'}">
                    <span class="status-dot"></span>
                    ${account.active ? 'Active' : 'Disabled'}
                </span>
            </td>
            <td>
                <button class="btn btn-secondary" style="padding: 6px 12px; font-size: 12px;" data-action="edit-account-permissions" data-id="${account.id}">Edit</button>
            </td>
        </tr>
    `).join('');
}

function getVisibleAccounts() {
    return allAccounts.slice();
}

function showAddAccountModal() {
    const tenantId = defaultTenantId();
    const serviceModes = defaultServiceModesForTenant(tenantId);

    openAdminModal({
        title: 'Add Staff Account',
        subtitle: 'Creates an admin, interpreter, or captioner login account.',
        body: `
            <form id="accountCreateForm" class="form-grid">
                <div class="form-field">
                    <label>Role</label>
                    <select name="role" required>
                        <option value="interpreter">Interpreter</option>
                        <option value="captioner">Captioner</option>
                        <option value="admin">Tenant Admin</option>
                        ${currentAdminRole === 'superadmin' ? '<option value="superadmin">Superadmin</option>' : ''}
                    </select>
                </div>
                <div class="form-field">
                    <label>Name</label>
                    <input name="name" required autocomplete="name">
                </div>
                <div class="form-field">
                    <label>Email</label>
                    <input name="email" type="email" autocomplete="email">
                </div>
                <div class="form-field">
                    <label>Username</label>
                    <input name="username" placeholder="optional if email is supplied">
                </div>
                <div class="form-field">
                    <label>Temporary password</label>
                    <input name="password" value="interpreter123!" required>
                </div>
                <div class="form-field">
                    <label>Tenant</label>
                    <select name="tenantId" ${currentAdminRole === 'superadmin' ? '' : 'disabled'}>
                        <option value="malka" ${tenantId === 'malka' ? 'selected' : ''}>Malka</option>
                        <option value="maple" ${tenantId === 'maple' ? 'selected' : ''}>Maple</option>
                    </select>
                </div>
                <div class="form-field">
                    <label>Languages</label>
                    <input name="languages" value="ASL, English">
                </div>
                <div class="form-field">
                    <label>Organization</label>
                    <input name="organization" placeholder="optional">
                </div>
                <div class="form-field full">
                    <label>Queues</label>
                    <div style="display:flex; gap:16px;">${serviceCheckboxes('serviceModes', serviceModes)}</div>
                </div>
                <div class="form-field full">
                    <label>Permissions</label>
                    <input name="permissions" placeholder="accounts:manage, vri:manage">
                </div>
            </form>
        `,
        footer: `
            <button class="btn btn-secondary" type="button" data-modal-close>Cancel</button>
            <button class="btn btn-primary" type="submit" form="accountCreateForm">Create Account</button>
        `
    });

    document.getElementById('accountCreateForm')?.addEventListener('submit', event => {
        event.preventDefault();
        const form = event.currentTarget;
        const values = getFormValues(form);
        const selectedTenant = currentAdminRole === 'superadmin' ? values.tenantId : tenantId;
        const modes = selectedCheckboxValues(form, 'serviceModes');
        if (!values.email && !values.username) {
            alert('Provide either an email or a username.');
            return;
        }

        createAccount({
            email: values.email,
            languages: parseCsvList(values.languages),
            name: values.name,
            organization: values.organization,
            password: values.password,
            permissions: parseCsvList(values.permissions),
            role: values.role,
            serviceModes: modes.length ? modes : defaultServiceModesForTenant(selectedTenant),
            tenantId: selectedTenant,
            username: values.username
        });
    }, { once: true });
}

async function createAccount(payload) {
    try {
        const response = await opsApiCall('/admin/accounts', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        const credentialParts = [];
        if (payload.username) {
            credentialParts.push(`username: ${payload.username}`);
        }
        if (payload.email) {
            credentialParts.push(`email: ${payload.email}`);
        }
        credentialParts.push(`password: ${payload.password}`);

        closeAdminModal();
        alert(`Account created successfully.\n${credentialParts.join('\n')}`);
        loadAccounts();
        loadMonitoringSummary();
    } catch (error) {
        alert(`Failed to create account: ${error.message}`);
    }
}

async function editAccountPermissions(id) {
    const account = allAccounts.find(item => String(item.id) === String(id));
    if (!account) return;

    const tenantId = account.tenantId || defaultTenantId();
    const profile = account.profile || {};

    openAdminModal({
        title: account.name || 'Account',
        subtitle: `${formatRoleLabel(account.role)} · ${tenantId} · ${formatServiceModes(account.serviceModes)}`,
        body: `
            <form id="accountEditForm" class="form-grid">
                <div class="form-field">
                    <label>Role</label>
                    <input value="${escapeHtml(formatRoleLabel(account.role))}" disabled>
                </div>
                <div class="form-field">
                    <label>Status</label>
                    <select name="active">
                        <option value="true" ${account.active === false ? '' : 'selected'}>Active</option>
                        <option value="false" ${account.active === false ? 'selected' : ''}>Disabled</option>
                    </select>
                </div>
                <div class="form-field">
                    <label>Name</label>
                    <input name="name" value="${escapeHtml(account.name || '')}" required>
                </div>
                <div class="form-field">
                    <label>Email</label>
                    <input name="email" type="email" value="${escapeHtml(account.email || '')}">
                </div>
                <div class="form-field">
                    <label>Username</label>
                    <input name="username" value="${escapeHtml(account.username || '')}" placeholder="optional if email is supplied">
                </div>
                <div class="form-field">
                    <label>Tenant</label>
                    <select name="tenantId" ${currentAdminRole === 'superadmin' ? '' : 'disabled'}>
                        <option value="malka" ${tenantId === 'malka' ? 'selected' : ''}>Malka</option>
                        <option value="maple" ${tenantId === 'maple' ? 'selected' : ''}>Maple</option>
                    </select>
                </div>
                <div class="form-field">
                    <label>Languages</label>
                    <input name="languages" value="${escapeHtml(Array.isArray(account.languages) ? account.languages.join(', ') : 'ASL')}">
                </div>
                <div class="form-field">
                    <label>Reset password</label>
                    <input name="password" placeholder="leave blank to keep current password">
                </div>
                <div class="form-field full">
                    <label>Queues</label>
                    <div style="display:flex; gap:16px;">${serviceCheckboxes('serviceModes', account.serviceModes || defaultServiceModesForTenant(tenantId))}</div>
                </div>
                <div class="form-field full">
                    <label>Organization</label>
                    <input name="organization" value="${escapeHtml(account.organization || '')}" placeholder="optional">
                </div>
                <div class="form-field full">
                    <label>Permissions</label>
                    <input name="permissions" value="${escapeHtml(Array.isArray(account.permissions) ? account.permissions.join(', ') : '')}" placeholder="accounts:manage, vri:manage">
                </div>
                <div class="form-field full">
                    <label>Manager comments</label>
                    <textarea name="managerComments" placeholder="Internal admin notes">${escapeHtml(profile.managerComments || '')}</textarea>
                </div>
            </form>
        `,
        footer: `
            <button class="btn btn-secondary" type="button" data-modal-close>Cancel</button>
            <button class="btn btn-primary" type="submit" form="accountEditForm">Save Account</button>
        `
    });

    document.getElementById('accountEditForm')?.addEventListener('submit', async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const values = getFormValues(form);
        const selectedTenant = currentAdminRole === 'superadmin' ? values.tenantId : tenantId;
        const serviceModes = selectedCheckboxValues(form, 'serviceModes');

        try {
            const body = {
                active: boolFromFormValue(values.active),
                email: values.email || undefined,
                languages: parseCsvList(values.languages),
                name: values.name,
                organization: values.organization || '',
                password: values.password || undefined,
                permissions: parseCsvList(values.permissions),
                profile: {
                    managerComments: values.managerComments || ''
                },
                serviceModes: serviceModes.length ? serviceModes : defaultServiceModesForTenant(selectedTenant),
                username: values.username || undefined
            };
            if (currentAdminRole === 'superadmin') {
                body.tenantId = selectedTenant;
            }

            await opsApiCall(`/admin/accounts/${id}`, {
                method: 'PUT',
                body: JSON.stringify(body)
            });

            closeAdminModal();
            await loadAccounts();
            await loadMonitoringSummary();
            alert('Account updated.');
        } catch (error) {
            alert(`Failed to update account: ${error.message}`);
        }
    }, { once: true });
}

// ============================================
// CLIENTS
// ============================================

let allClients = [];

async function loadClients() {
    try {
        allClients = await apiCall('/admin/clients');
        filterClients();
    } catch (error) {
        console.error('[Clients] Error:', error);
    }
}

function filterClients() {
    renderClientsTable(getVisibleClients());
}

function getVisibleClients() {
    const tenant = getSelectValue('clientTenantFilter');
    const service = getSelectValue('clientServiceFilter');
    const search = String(document.getElementById('clientSearch')?.value || '').toLowerCase();

    return allClients
        .filter(client => !tenant || client.tenant_id === tenant)
        .filter(client => !service || (client.service_modes || []).includes(service))
        .filter(client => !search
            || String(client.name || '').toLowerCase().includes(search)
            || String(client.email || '').toLowerCase().includes(search)
            || String(client.organization || '').toLowerCase().includes(search));
}

function renderClientsTable(clients) {
    const tbody = document.getElementById('clientsTableBody');
    if (!tbody) return;

    if (clients.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10" style="text-align: center; color: var(--text-muted); padding: 24px;">
                    No clients found
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = clients.map(client => `
        <tr>
            <td><div style="font-weight: 500;">${client.name}</div></td>
            <td style="color: var(--text-secondary);">${client.email}</td>
            <td>${client.organization || 'Personal'}</td>
            <td>${formatServiceModes(client.service_modes)}</td>
            <td>${client.tenant_id || 'malka'}</td>
            <td>
                <span class="status-badge ${client.connected ? 'status-online' : 'status-offline'}">
                    <span class="status-dot"></span>
                    ${client.connected ? 'Online' : 'Offline'}
                </span>
            </td>
            <td>${client.total_calls || 0}</td>
            <td>${client.last_call || 'Never'}</td>
            <td>${formatDate(client.created_at)}</td>
            <td>
                <button class="btn btn-secondary" style="padding: 6px 12px; font-size: 12px;" data-action="edit-client-permissions" data-id="${client.id}">Permissions</button>
            </td>
        </tr>
    `).join('');
}

function showAddClientModal() {
    const tenantId = defaultTenantId();
    const serviceModes = defaultServiceModesForTenant(tenantId);

    openAdminModal({
        title: 'Add Client / Corporate Account',
        subtitle: 'Creates a client login profile. Use VRI-only service modes for corporate VRI accounts.',
        body: `
            <form id="clientCreateForm" class="form-grid">
                <div class="form-field">
                    <label>Account Type</label>
                    <select name="accountType">
                        <option value="corporate" ${serviceModes.includes('vri') ? 'selected' : ''}>Corporate VRI</option>
                        <option value="personal" ${serviceModes.includes('vrs') ? 'selected' : ''}>Personal VRS</option>
                    </select>
                </div>
                <div class="form-field">
                    <label>Name</label>
                    <input name="name" required autocomplete="name">
                </div>
                <div class="form-field">
                    <label>Email</label>
                    <input name="email" type="email" autocomplete="email">
                </div>
                <div class="form-field">
                    <label>Temporary password</label>
                    <input name="password" value="client123!" required>
                </div>
                <div class="form-field">
                    <label>Tenant</label>
                    <select name="tenantId" ${currentAdminRole === 'superadmin' ? '' : 'disabled'}>
                        <option value="malka" ${tenantId === 'malka' ? 'selected' : ''}>Malka</option>
                        <option value="maple" ${tenantId === 'maple' ? 'selected' : ''}>Maple</option>
                    </select>
                </div>
                <div class="form-field">
                    <label>Organization</label>
                    <input name="organization" value="${tenantId === 'maple' ? 'Maple Corporate Pilot' : 'Personal'}">
                </div>
                <div class="form-field full">
                    <label>Service Permissions</label>
                    <div style="display:flex; gap:16px;">${serviceCheckboxes('serviceModes', serviceModes)}</div>
                </div>
            </form>
        `,
        footer: `
            <button class="btn btn-secondary" type="button" data-modal-close>Cancel</button>
            <button class="btn btn-primary" type="submit" form="clientCreateForm">Create Client</button>
        `
    });

    document.getElementById('clientCreateForm')?.addEventListener('submit', event => {
        event.preventDefault();
        const form = event.currentTarget;
        const values = getFormValues(form);
        const selectedTenant = currentAdminRole === 'superadmin' ? values.tenantId : tenantId;
        const modes = selectedCheckboxValues(form, 'serviceModes');

        createClient({
            email: values.email,
            name: values.name,
            organization: values.organization || (values.accountType === 'corporate' ? 'Corporate' : 'Personal'),
            password: values.password,
            serviceModes: modes.length ? modes : defaultServiceModesForTenant(selectedTenant),
            tenantId: selectedTenant
        });
    }, { once: true });
}

async function createClient(payload) {
    try {
        await apiCall('/admin/clients', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        closeAdminModal();
        await loadClients();
        alert('Client created.');
    } catch (error) {
        alert(`Failed to create client: ${error.message}`);
    }
}

async function editClientPermissions(id) {
    const client = allClients.find(item => String(item.id) === String(id));
    if (!client) return;

    const tenantId = client.tenant_id || defaultTenantId();

    openAdminModal({
        title: client.name || 'Client Profile',
        subtitle: `${client.organization || 'Personal'} · ${tenantId} · ${formatServiceModes(client.service_modes)}`,
        body: `
            <form id="clientEditForm" class="form-grid">
                <div class="form-field">
                    <label>Name</label>
                    <input name="name" value="${escapeHtml(client.name || '')}" required>
                </div>
                <div class="form-field">
                    <label>Email</label>
                    <input name="email" type="email" value="${escapeHtml(client.email || '')}">
                </div>
                <div class="form-field">
                    <label>Organization</label>
                    <input name="organization" value="${escapeHtml(client.organization || 'Personal')}">
                </div>
                <div class="form-field">
                    <label>Tenant</label>
                    <select name="tenantId" ${currentAdminRole === 'superadmin' ? '' : 'disabled'}>
                        <option value="malka" ${tenantId === 'malka' ? 'selected' : ''}>Malka</option>
                        <option value="maple" ${tenantId === 'maple' ? 'selected' : ''}>Maple</option>
                    </select>
                </div>
                <div class="form-field">
                    <label>Reset password</label>
                    <input name="password" placeholder="leave blank to keep current password">
                </div>
                <div class="form-field full">
                    <label>Service Permissions</label>
                    <div style="display:flex; gap:16px;">${serviceCheckboxes('serviceModes', client.service_modes || defaultServiceModesForTenant(tenantId))}</div>
                </div>
            </form>
        `,
        footer: `
            <button class="btn btn-secondary" type="button" data-modal-close>Cancel</button>
            <button class="btn btn-primary" type="submit" form="clientEditForm">Save Client</button>
        `
    });

    document.getElementById('clientEditForm')?.addEventListener('submit', async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const values = getFormValues(form);
        const selectedTenant = currentAdminRole === 'superadmin' ? values.tenantId : tenantId;
        const modes = selectedCheckboxValues(form, 'serviceModes');

        try {
            await apiCall(`/admin/clients/${id}`, {
                method: 'PUT',
                body: JSON.stringify({
                    email: values.email || undefined,
                    name: values.name,
                    organization: values.organization || 'Personal',
                    password: values.password || undefined,
                    serviceModes: modes.length ? modes : defaultServiceModesForTenant(selectedTenant),
                    tenantId: selectedTenant
                })
            });
            closeAdminModal();
            await loadClients();
            alert('Client updated.');
        } catch (error) {
            alert(`Failed to update client: ${error.message}`);
        }
    }, { once: true });
}

function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ============================================
// LIVE QUEUE
// ============================================

async function loadLiveQueue() {
    try {
        const [ queue, queueService ] = await Promise.all([
            apiCall(`/admin/queue${buildQueryString({
                language: getSelectValue('queueLanguageFilter'),
                serviceMode: getSelectValue('queueServiceFilter'),
                tenantId: getSelectValue('queueTenantFilter')
            })}`),
            fetchServiceSnapshot(QUEUE_ORIGIN, '/api/readiness', '/api/health').catch(() => null)
        ]);

        if (queueService) {
            syncQueuePauseButton(Boolean(queueService.queue?.paused));
        }

        renderLiveQueue(queue);
    } catch (error) {
        console.error('[Queue] Error:', error);
    }
}

function renderLiveQueue(queue) {
    const container = document.getElementById('liveQueueList');
    if (!container) return;

    if (queue.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">✅</div>
                <p>No waiting client requests right now.</p>
                <p class="help-text">Available interpreters are listed separately on the dashboard and Interpreters tab.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = queue.map(item => {
        const clientName = item.clientName || item.client_name || 'Unknown client';
        const roomName = item.roomName || item.room_name || '—';
        const waitTime = item.wait_time || item.waitTime || '—';
        const tenantId = item.tenantId || item.tenant_id || 'malka';
        const serviceMode = item.serviceMode || item.service_mode || item.callType || item.call_type || 'vri';

        return `
        <div class="queue-item">
            <div class="queue-position">${item.position}</div>
            <div class="queue-info">
                <div class="queue-client">${clientName}</div>
                <div class="queue-details">
                    <span>🌐 ${item.language}</span>
                    <span>${String(serviceMode).toUpperCase()}</span>
                    <span>${tenantId}</span>
                    <span>📍 ${roomName}</span>
                    <span>🕐 ${waitTime}</span>
                </div>
            </div>
            <div class="queue-actions">
                <button class="btn btn-secondary" data-action="remove-from-queue" data-id="${item.id}">Remove</button>
            </div>
        </div>
        `;
    }).join('');
}

async function toggleQueue() {
    const btn = document.getElementById('pauseQueueBtn');
    const isPaused = btn?.dataset.paused === 'true';

    try {
        const result = await apiCall(`/admin/queue/${isPaused ? 'resume' : 'pause'}`, {
            method: 'POST'
        });

        syncQueuePauseButton(Boolean(result.paused));
        loadLiveQueue();
        loadMonitoringSummary();
    } catch (error) {
        alert('Failed to toggle queue: ' + error.message);
    }
}

async function removeFromQueue(requestId) {
    if (!confirm('Remove this request from the queue?')) return;

    try {
        await apiCall(`/admin/queue/${requestId}`, {
            method: 'DELETE'
        });
        loadLiveQueue();
    } catch (error) {
        alert('Failed to remove: ' + error.message);
    }
}

// ============================================
// ACTIVITY
// ============================================

async function loadActivityFeed() {
    try {
        const activityQuery = buildQueryString({
            limit: '50',
            role: getSelectValue('activityRoleFilter'),
            serviceMode: getSelectValue('activityServiceFilter'),
            tenantId: getSelectValue('activityTenantFilter'),
            type: getSelectValue('activityTypeFilter')
        });
        const auditQuery = buildQueryString({
            limit: '50',
            role: getSelectValue('activityRoleFilter'),
            serviceMode: getSelectValue('activityServiceFilter'),
            tenantId: getSelectValue('activityTenantFilter'),
            event: getSelectValue('activityTypeFilter')
        });
        const [ queueActivity, opsAudit ] = await Promise.all([
            apiCall(`/admin/activity${activityQuery}`).catch(() => []),
            opsApiCall(`/admin/audit${auditQuery}`).catch(() => [])
        ]);

        const mergedActivity = [
            ...queueActivity,
            ...opsAudit.map(item => ({
                created_at: item.timestamp,
                data: item.details,
                description: item.event.replace(/_/g, ' '),
                type: item.event
            }))
        ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        renderActivityFeed(mergedActivity.slice(0, 100));
    } catch (error) {
        console.error('[Activity] Error:', error);
    }
}

async function exportAuditCsv() {
    const query = buildQueryString({
        role: getSelectValue('activityRoleFilter'),
        serviceMode: getSelectValue('activityServiceFilter'),
        tenantId: getSelectValue('activityTenantFilter'),
        event: getSelectValue('activityTypeFilter'),
        limit: '5000'
    });
    try {
        const response = await fetch(`${OPS_API_BASE}/admin/audit/export.csv${query}`, {
            headers: { Authorization: `Bearer ${authToken}` }
        });
        if (!response.ok) {
            throw new Error('Export failed');
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `admin-audit-${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    } catch (error) {
        alert(`Failed to export audit CSV: ${error.message}`);
    }
}

function renderActivityFeed(activity) {
    const container = document.getElementById('activityFeed');
    if (!container) return;

    const iconBg = {
        'admin_login': 'rgba(138, 98, 206, 0.15)',
        'admin_logout': 'rgba(138, 98, 206, 0.15)',
        'interpreter_created': 'rgba(40, 167, 69, 0.15)',
        'interpreter_updated': 'rgba(74, 158, 255, 0.15)',
        'interpreter_online': 'rgba(40, 167, 69, 0.15)',
        'interpreter_offline': 'rgba(108, 117, 125, 0.15)',
        'interpreter_status_change': 'rgba(255, 193, 7, 0.15)',
        'client_connected': 'rgba(74, 158, 255, 0.15)',
        'client_disconnected': 'rgba(108, 117, 125, 0.15)',
        'client_created': 'rgba(138, 98, 206, 0.15)',
        'queue_request_added': 'rgba(255, 107, 53, 0.15)',
        'queue_request_cancelled': 'rgba(220, 53, 69, 0.15)',
        'queue_match_complete': 'rgba(40, 167, 69, 0.15)',
        'queue_paused': 'rgba(255, 193, 7, 0.15)',
        'queue_resumed': 'rgba(40, 167, 69, 0.15)',
        'call_started': 'rgba(74, 158, 255, 0.15)',
        'call_ended': 'rgba(108, 117, 125, 0.15)',
    };

    const icons = {
        'admin_login': '🔐',
        'admin_logout': '🚪',
        'interpreter_created': '➕',
        'interpreter_updated': '✏️',
        'interpreter_online': '🟢',
        'interpreter_offline': '⚫',
        'interpreter_status_change': '🔄',
        'client_connected': '👤',
        'client_disconnected': '📴',
        'client_created': '👥',
        'queue_request_added': '⏳',
        'queue_request_cancelled': '❌',
        'queue_match_complete': '✅',
        'queue_paused': '⏸️',
        'queue_resumed': '▶️',
        'call_started': '📞',
        'call_ended': '📵',
        'account_created': '🛡️',
        'account_updated': '✏️',
        'login_failed': '⚠️',
        'login_success': '✅',
        'login_rate_limited': '⛔',
    };

    container.innerHTML = activity.map(item => `
        <div class="activity-item">
            <div class="activity-icon" style="background: ${iconBg[item.type] || 'rgba(255, 255, 255, 0.1)'}">
                ${icons[item.type] || '📌'}
            </div>
            <div class="activity-content">
                <div class="activity-title">${item.description || item.type}</div>
                <div style="color: var(--text-secondary); font-size: 13px;">
                    ${formatActivityDescription(item)}
                </div>
                <div class="activity-time">${formatTimeAgo(item.created_at)}</div>
            </div>
        </div>
    `).join('');
}

function formatActivityDescription(item) {
    if (item.data) {
        try {
            const data = typeof item.data === 'string' ? JSON.parse(item.data) : item.data;

            if (item.type === 'interpreter_status_change') {
                return `${data.interpreterName} changed status to ${data.status}`;
            }
            if (item.type === 'queue_match_complete') {
                return `${data.interpreterName} matched with ${data.clientName}`;
            }
            if (item.type === 'queue_request_added') {
                return `${data.clientName} joined the queue`;
            }
            if (item.type === 'interpreter_online') {
                return `${data.interpreterName} is now online`;
            }
            if (item.type === 'call_started') {
                return `Call started in room ${data.roomName}`;
            }
            if (item.type === 'account_created') {
                return `${data.createdRole} account created by ${data.actorRole}`;
            }
            if (item.type === 'account_updated') {
                return `${data.updatedRole || 'account'} permissions updated for ${data.tenantId || 'tenant'}`;
            }
            if (item.type === 'login_failed') {
                return `${data.identifier || 'unknown'} failed to authenticate`;
            }
            if (item.type === 'login_success') {
                return `${data.identifier || data.username || 'unknown'} signed in`;
            }
        } catch (e) {}
    }

    return '';
}

function formatTimeAgo(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

function formatDateTime(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        month: 'short'
    });
}

// ============================================
// TENANTS
// ============================================

async function loadTenants() {
    const tbody = document.getElementById('tenantsTableBody');
    if (!tbody) return;

    if (currentAdminRole !== 'superadmin') {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 24px;">
                    Superadmin access required
                </td>
            </tr>
        `;
        return;
    }

    try {
        const tenants = await opsApiCall('/admin/tenants');
        if (!tenants.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 24px;">
                        No tenants found yet
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = tenants.map(tenant => `
            <tr>
                <td><div style="font-weight: 600;">${tenant.tenantId}</div></td>
                <td>${tenant.activeAccounts || 0} / ${tenant.accounts || 0}</td>
                <td>${tenant.admins || 0}</td>
                <td>${tenant.interpreters || 0}</td>
                <td>${tenant.captioners || 0}</td>
                <td>${formatServiceModes(tenant.serviceModes)}</td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('[Tenants] Error:', error);
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; color: var(--accent-red); padding: 24px;">
                    Failed to load tenant overview
                </td>
            </tr>
        `;
    }
}

// ============================================
// UTILITIES
// ============================================

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

let currentLang = 'en';
function toggleLanguage() {
    currentLang = currentLang === 'en' ? 'ar' : 'en';
    const btn = document.getElementById('langToggle');
    btn.textContent = currentLang === 'en' ? '🇺🇸 EN' : '🇸🇦 AR';
    document.documentElement.dir = currentLang === 'ar' ? 'rtl' : 'ltr';
}

// Make functions available globally
window.login = login;
window.logout = logout;
window.removeFromQueue = removeFromQueue;
window.loadInterpreters = loadInterpreters;
window.loadClients = loadClients;
window.loadLiveQueue = loadLiveQueue;
window.loadActivityFeed = loadActivityFeed;
window.loadAccounts = loadAccounts;
window.loadTenants = loadTenants;
