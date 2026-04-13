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

    // Add interpreter button
    document.getElementById('addInterpreterBtn')?.addEventListener('click', showAddInterpreterModal);
    document.getElementById('addCaptionerBtn')?.addEventListener('click', showAddCaptionerModal);
    document.getElementById('addAccountBtn')?.addEventListener('click', showAddAccountModal);

    // Filter changes
    document.getElementById('interpreterStatusFilter')?.addEventListener('change', filterInterpreters);
    document.getElementById('interpreterSearch')?.addEventListener('input', debounce(filterInterpreters, 300));

    // Queue pause button
    document.getElementById('pauseQueueBtn')?.addEventListener('click', toggleQueue);
}

function loadInitialData() {
    updateCurrentUserDisplay();
    validateOpsSession();
    loadDashboardStats();
    loadMonitoringSummary();
    connectWebSocket();

    // Auto-refresh every 30 seconds
    refreshInterval = setInterval(refreshCurrentTab, 30000);
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
        accountsTab.style.display = role === 'superadmin' ? 'inline-flex' : 'none';
    }

    if (addAccountBtn) {
        addAccountBtn.style.display = role === 'superadmin' ? 'inline-flex' : 'none';
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
        case 'queue_update':
            renderLiveQueue(data.data);
            renderQueuePreview(data.data);
            scheduleRefresh('dashboard', loadDashboardStats, 150);
            scheduleRefresh('monitoring', loadMonitoringSummary, 250);
            break;
        case 'queue_request_added':
        case 'queue_request_cancelled':
        case 'queue_request_removed':
        case 'queue_match_complete':
        case 'queue_paused':
        case 'queue_resumed':
            scheduleRefresh('dashboard', loadDashboardStats, 150);
            scheduleRefresh('queue', loadLiveQueue, 200);
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
        const [ stats, activeCalls, dailyUsage ] = await Promise.all([
            apiCall('/admin/stats'),
            apiCall('/admin/calls/active').catch(() => []),
            apiCall('/admin/usage/daily?days=7').catch(() => [])
        ]);

        updateDashboardStats(stats, activeCalls, dailyUsage);
        loadActiveInterpreters(activeCalls);
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
        clientsTrend.textContent = `${stats.clients?.total || 0} total`;
        clientsTrend.className = 'stat-trend up';
    }

    const clientsSubtext = document.getElementById('clientsSubtext');
    if (clientsSubtext) {
        clientsSubtext.textContent = `${stats.calls?.today || 0} calls placed today`;
    }

    const interpretersTrend = document.getElementById('interpretersTrend');
    if (interpretersTrend) {
        interpretersTrend.textContent = `${stats.interpreters?.online || 0} online`;
        interpretersTrend.className = 'stat-trend up';
    }

    const interpretersOnline = document.getElementById('interpretersOnline');
    if (interpretersOnline) {
        interpretersOnline.textContent = `${stats.interpreters?.online || 0} online now`;
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
    renderQueuePreview();
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

    const activeCallMap = new Map(activeCalls.map(call => [
        String(call.interpreter_name || '').toLowerCase(),
        call
    ]));

    tbody.innerHTML = interpreters.map(interp => {
        const statusClass = interp.currentStatus === 'online' ? 'status-online' :
                           interp.currentStatus === 'busy' ? 'status-busy' : 'status-in-call';
        const statusText = interp.currentStatus === 'online' ? 'Available' :
                          interp.currentStatus === 'busy' ? 'Busy' : 'In Call';
        const currentCall = activeCallMap.get(String(interp.name || '').toLowerCase());
        const currentCallLabel = currentCall
            ? `${currentCall.client_name || 'Client'} · ${formatDurationFromDate(currentCall.started_at)}`
            : (interp.currentStatus === 'busy' || interp.currentStatus === 'in-call' ? 'In progress' : '—');

        return `
            <tr>
                <td>
                    <div style="font-weight: 500;">${interp.name}</div>
                    <div style="font-size: 12px; color: var(--text-muted);">${Array.isArray(interp.languages) ? interp.languages.join(', ') : 'ASL'}</div>
                </td>
                <td>
                    <span class="status-badge ${statusClass}">
                        <span class="status-dot"></span>
                        ${statusText}
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
                    <p>No one in queue right now!</p>
                </div>
            `;
            return;
        }

        container.innerHTML = queue.slice(0, 5).map(item => `
            <div class="queue-item">
                <div class="queue-position">${item.position}</div>
                <div class="queue-info">
                    <div class="queue-client">${item.client_name}</div>
                    <div class="queue-details">
                        <span>🌐 ${item.language}</span>
                        <span>📍 ${item.room_name}</span>
                    </div>
                    <div class="queue-wait-time">⏱️ ${item.wait_time}</div>
                </div>
            </div>
        `).join('');
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
                <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 24px;">
                    No interpreters found
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = interpreters.map(interp => {
        const statusClass = interp.connected && interp.currentStatus === 'online' ? 'status-online' :
                           interp.connected && interp.currentStatus === 'busy' ? 'status-busy' :
                           interp.connected && interp.currentStatus === 'in-call' ? 'status-in-call' : 'status-offline';
        const statusText = !interp.connected ? 'Offline' :
                          interp.currentStatus === 'online' ? 'Available' :
                          interp.currentStatus === 'busy' ? 'Busy' :
                          interp.currentStatus === 'in-call' ? 'In Call' : 'Offline';

        return `
            <tr>
                <td><div style="font-weight: 500;">${interp.name}</div></td>
                <td style="color: var(--text-secondary);">${interp.email}</td>
                <td>${Array.isArray(interp.languages) ? interp.languages.join(', ') : interp.languages}</td>
                <td>
                    <span class="status-badge ${statusClass}">
                        <span class="status-dot"></span>
                        ${statusText}
                    </span>
                </td>
                <td>${interp.calls_today || 0}</td>
                <td>${interp.minutes_week || 0}</td>
                <td>${formatLastActive(interp)}</td>
                <td>
                    <button class="btn btn-secondary" style="padding: 6px 12px; font-size: 12px;" onclick="editInterpreter('${interp.id}')">Edit</button>
                </td>
            </tr>
        `;
    }).join('');
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
    const statusFilter = document.getElementById('interpreterStatusFilter')?.value;
    const searchTerm = document.getElementById('interpreterSearch')?.value.toLowerCase();

    let filtered = [...allInterpreters];

    if (statusFilter && statusFilter !== 'all') {
        filtered = filtered.filter(interp => {
            if (statusFilter === 'online') return interp.connected && interp.currentStatus === 'online';
            if (statusFilter === 'busy') return interp.connected && interp.currentStatus === 'busy';
            if (statusFilter === 'offline') return !interp.connected || interp.currentStatus === 'offline';
            return true;
        });
    }

    if (searchTerm) {
        filtered = filtered.filter(interp =>
            interp.name.toLowerCase().includes(searchTerm) ||
            interp.email.toLowerCase().includes(searchTerm)
        );
    }

    renderInterpretersTable(filtered);
}

function showAddInterpreterModal() {
    if (currentAdminRole !== 'superadmin') {
        alert('Only the superadmin account can create interpreter accounts.');
        return;
    }

    const name = prompt('Interpreter Name:');
    if (!name) return;

    const email = prompt('Email (optional):', '');
    const username = prompt('Username (optional if email is supplied):', email ? email.split('@')[0] : '');
    if (!email && !username) return;

    const languages = prompt('Languages (comma-separated, e.g., ASL, BSL):', 'ASL');

    createInterpreter(name, email, languages.split(',').map(l => l.trim()), username);
}

async function createInterpreter(name, email, languages, username) {
    try {
        await opsApiCall('/admin/accounts', {
            method: 'POST',
            body: JSON.stringify({
                email,
                languages,
                name,
                password: 'interpreter123!',
                role: 'interpreter',
                username
            })
        });

        await apiCall('/admin/interpreters', {
            method: 'POST',
            body: JSON.stringify({ name, email, languages, password: 'interpreter123!' })
        });

        alert(`Interpreter created successfully.\n${username ? `username: ${username}\n` : ''}${email ? `email: ${email}\n` : ''}password: interpreter123!`);
        loadInterpreters();
        loadAccounts();
        loadMonitoringSummary();
    } catch (error) {
        alert('Failed to create interpreter: ' + error.message);
    }
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
                <button class="btn btn-secondary" style="padding: 6px 12px; font-size: 12px;" onclick="editCaptioner('${captioner.id}')">Edit</button>
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

    createCaptioner(name, email, languages.split(',').map(language => language.trim()).filter(Boolean), username);
}

async function createCaptioner(name, email, languages, username) {
    try {
        await opsApiCall('/admin/accounts', {
            method: 'POST',
            body: JSON.stringify({
                email,
                languages,
                name,
                password: 'captioner123!',
                role: 'captioner',
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

async function loadAccounts() {
    if (currentAdminRole !== 'superadmin') {
        renderAccountsTable([]);
        return;
    }

    try {
        const accounts = await opsApiCall('/admin/accounts');
        renderAccountsTable(accounts);
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
                <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 24px;">
                    ${currentAdminRole === 'superadmin' ? 'No managed accounts found yet' : 'Superadmin access required'}
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
            <td>${Array.isArray(account.languages) && account.languages.length ? account.languages.join(', ') : '—'}</td>
            <td>${account.lastLoginAt ? formatDateTime(account.lastLoginAt) : 'Never'}</td>
            <td>
                <span class="status-badge ${account.active ? 'status-online' : 'status-offline'}">
                    <span class="status-dot"></span>
                    ${account.active ? 'Active' : 'Disabled'}
                </span>
            </td>
        </tr>
    `).join('');
}

function showAddAccountModal() {
    if (currentAdminRole !== 'superadmin') {
        alert('Only the superadmin account can create new accounts.');
        return;
    }

    const role = prompt('Account role (superadmin, admin, interpreter, captioner):', 'interpreter');
    if (!role) {
        return;
    }

    const name = prompt('Account name:');
    if (!name) {
        return;
    }

    const username = prompt('Username (optional if email is supplied):', '');
    const email = prompt('Email (optional):', '');
    const password = prompt(
        'Temporary password:',
        role === 'interpreter' ? 'interpreter123!' : role === 'captioner' ? 'captioner123!' : 'admin123!'
    );

    if (!password) {
        return;
    }

    const languages = role === 'interpreter' || role === 'captioner'
        ? prompt('Languages (comma-separated):', 'ASL, English')
        : '';

    createAccount({
        email,
        languages: languages ? languages.split(',').map(language => language.trim()).filter(Boolean) : [],
        name,
        password,
        role: role.trim().toLowerCase(),
        username
    });
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

        alert(`Account created successfully.\n${credentialParts.join('\n')}`);
        loadAccounts();
        loadMonitoringSummary();
    } catch (error) {
        alert(`Failed to create account: ${error.message}`);
    }
}

// ============================================
// CLIENTS
// ============================================

async function loadClients() {
    try {
        const clients = await apiCall('/admin/clients');
        renderClientsTable(clients);
    } catch (error) {
        console.error('[Clients] Error:', error);
    }
}

function renderClientsTable(clients) {
    const tbody = document.getElementById('clientsTableBody');
    if (!tbody) return;

    if (clients.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 24px;">
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
            <td>${client.total_calls || 0}</td>
            <td>${client.last_call || 'Never'}</td>
            <td>${formatDate(client.created_at)}</td>
            <td>
                <button class="btn btn-secondary" style="padding: 6px 12px; font-size: 12px;">View</button>
            </td>
        </tr>
    `).join('');
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
            apiCall('/admin/queue'),
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
                <p>No one in queue right now!</p>
            </div>
        `;
        return;
    }

    container.innerHTML = queue.map(item => `
        <div class="queue-item">
            <div class="queue-position">${item.position}</div>
            <div class="queue-info">
                <div class="queue-client">${item.client_name}</div>
                <div class="queue-details">
                    <span>🌐 ${item.language}</span>
                    <span>📍 ${item.room_name}</span>
                    <span>🕐 ${item.wait_time}</span>
                </div>
            </div>
            <div class="queue-actions">
                <button class="btn btn-secondary" onclick="removeFromQueue('${item.id}')">Remove</button>
            </div>
        </div>
    `).join('');
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
        const [ queueActivity, opsAudit ] = await Promise.all([
            apiCall('/admin/activity?limit=50').catch(() => []),
            opsApiCall('/admin/audit?limit=50').catch(() => [])
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
