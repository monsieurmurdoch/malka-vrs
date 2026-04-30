(function() {
    'use strict';

    var BUTTON_SELECTOR = '[data-vrs-interpreter-button]';
    var TOOLBAR_SELECTOR = '.toolbox-content-items';
    var ws = null;
    var requestId = null;
    var pendingSend = false;
    var pendingInviteSend = false;
    var state = 'idle';
    var button = null;
    var inviteButton = null;
    var lastInviteUrl = '';

    function getStored(key) {
        try {
            return localStorage.getItem(key) || sessionStorage.getItem(key);
        } catch (e) {
            return null;
        }
    }

    function getJson(key) {
        var value = getStored(key);

        if (!value) {
            return {};
        }

        try {
            return JSON.parse(value) || {};
        } catch (e) {
            return {};
        }
    }

    function isClientRoomUser() {
        var role = getStored('vrs_user_role');

        if (role === 'interpreter' || role === 'captioner' || role === 'guest') {
            return false;
        }

        var urlRole = new URLSearchParams(window.location.search).get('role');

        return urlRole !== 'interpreter' && urlRole !== 'captioner' && urlRole !== 'guest';
    }

    function currentRole() {
        return new URLSearchParams(window.location.search).get('role')
            || getStored('vrs_user_role')
            || 'client';
    }

    function currentRoomName() {
        var parts = window.location.pathname.split('/').filter(Boolean);
        var last = parts[parts.length - 1] || '';

        return last && !last.endsWith('.html') ? last : undefined;
    }

    function clientName() {
        var user = getJson('vrs_user_info');
        var token = getJson('vrs_auth_token');

        return user.name || token.name || user.email || token.email || 'Guest';
    }

    function authPayload() {
        var user = getJson('vrs_user_info');
        var token = getJson('vrs_auth_token');
        var role = currentRole();
        var id = user.id || token.userId || token.id || ('client-' + Date.now());

        return {
            type: 'auth',
            role: role,
            userId: id,
            name: clientName(),
            token: token.token
        };
    }

    function send(message) {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(message));
            return true;
        }

        return false;
    }

    function removeStored(key) {
        try { localStorage.removeItem(key); } catch (e) {}
        try { sessionStorage.removeItem(key); } catch (e) {}
    }

    function activeCall() {
        var call = getJson('vrs_active_call');

        return call && call.callId ? call : null;
    }

    function activeCallForCurrentRoom() {
        var call = activeCall();
        var roomName = currentRoomName();

        if (!call || !roomName) {
            return null;
        }

        return !call.roomName || call.roomName === roomName ? call : null;
    }

    function persistActiveCall(data) {
        if (!data || !data.callId) {
            return;
        }

        var previous = activeCall() || {};
        var call = {
            callId: data.callId,
            callType: data.callType || previous.callType || 'vrs',
            roomName: data.roomName || currentRoomName() || previous.roomName,
            role: previous.role || currentRole(),
            startedAt: previous.startedAt || new Date().toISOString()
        };

        try { localStorage.setItem('vrs_active_call', JSON.stringify(call)); } catch (e) {}
        try { sessionStorage.setItem('vrs_active_call', JSON.stringify(call)); } catch (e) {}
    }

    function sendActiveCallEnd() {
        var call = activeCall();

        if (!call) {
            return;
        }

        send({
            type: 'call_end',
            data: {
                callId: call.callId,
                roomName: call.roomName || currentRoomName()
            }
        });
        removeStored('vrs_active_call');
    }

    function waitingRoomVisible() {
        return Boolean(
            document.querySelector('[data-testid="prejoin.screen"]')
            || document.querySelector('.lobby-screen')
            || document.querySelector('.prejoin-dialog-container')
        );
    }

    function roomUiReady() {
        if (waitingRoomVisible()) {
            return false;
        }

        return Boolean(
            document.querySelector('#vrs-layout-root')
            || document.querySelector('#videospace')
            || document.querySelector('#largeVideo')
            || document.querySelector('#largeVideoContainer')
        );
    }

    function setState(nextState) {
        state = nextState;

        if (!button) {
            return;
        }

        var colors = {
            idle: [ '#2357C6', '#5E8CFF', '#FFFFFF', '#C7D2FE' ],
            connecting: [ '#334155', '#64748B', '#FFFFFF', '#CBD5E1' ],
            pending: [ '#D99A12', '#FFD166', '#111827', '#111827' ],
            matched: [ '#15803D', '#4ADE80', '#FFFFFF', '#BBF7D0' ],
            error: [ '#B91C1C', '#FCA5A5', '#FFFFFF', '#FECACA' ]
        };
        var labels = {
            idle: 'Request Interpreter',
            connecting: 'Connecting...',
            pending: 'Interpreter Requested',
            matched: 'Interpreter Connected',
            error: 'Try Interpreter Again'
        };
        var color = colors[nextState] || colors.idle;
        var matched = nextState === 'matched';

        button.style.background = color[0];
        button.style.borderColor = color[1];
        button.style.color = color[2];
        button.disabled = matched;
        button.style.cursor = matched ? 'default' : 'pointer';
        button.style.opacity = matched ? '0.92' : '1';
        button.setAttribute('aria-pressed', String(nextState === 'pending' || nextState === 'matched'));
        button.setAttribute('aria-label', matched ? 'Interpreter connected' : 'Request Interpreter');
        button.title = nextState === 'pending'
            ? 'Cancel interpreter request'
            : nextState === 'matched'
                ? 'Interpreter is connected to this room'
                : 'Request a sign language interpreter';
        button.querySelector('[data-vrs-interpreter-dot]').style.background = color[3];
        button.querySelector('[data-vrs-interpreter-label]').textContent = labels[nextState] || labels.idle;
    }

    function setInviteState(label, disabled) {
        if (!inviteButton) {
            return;
        }
        inviteButton.disabled = Boolean(disabled);
        inviteButton.querySelector('[data-vri-invite-label]').textContent = label;
    }

    function connectQueue() {
        if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
            return;
        }

        var protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

        ws = new WebSocket(protocol + '//' + window.location.host + '/ws');

        ws.onopen = function() {
            send(authPayload());
            if (pendingInviteSend) {
                pendingInviteSend = false;
                handleInviteClick();
            } else if (pendingSend) {
                pendingSend = false;
                requestInterpreter();
            } else if (state === 'connecting') {
                setState('idle');
            }
        };

        ws.onmessage = function(event) {
            var message;

            try {
                message = JSON.parse(event.data);
            } catch (e) {
                return;
            }

            var data = message.data || {};

            if (message.type === 'request_queued') {
                requestId = data.requestId || requestId;
                setState('pending');
            } else if (message.type === 'match_found'
                    || message.type === 'request_accepted'
                    || message.type === 'meeting_initiated') {
                persistActiveCall(data);
                requestId = null;
                setState('matched');
            } else if (message.type === 'request_cancelled'
                    || message.type === 'request_declined') {
                requestId = null;
                setState('idle');
            } else if (message.type === 'vri_invite_prepared') {
                lastInviteUrl = data.inviteUrl || '';
                if (lastInviteUrl && navigator.clipboard) {
                    navigator.clipboard.writeText(lastInviteUrl).then(function() {
                        setInviteState('Invite Copied', false);
                    }).catch(function() {
                        setInviteState('Invite Ready', false);
                    });
                } else {
                    setInviteState('Invite Ready', false);
                }
            } else if (message.type === 'error' || message.type === 'auth_error') {
                setState('error');
                setInviteState('Invite Failed', false);
            } else if (message.type === 'ping') {
                send({ type: 'heartbeat' });
            }
        };

        ws.onclose = function() {
            if (state !== 'pending' && state !== 'matched') {
                setState('idle');
            }
        };

        ws.onerror = function() {
            if (state !== 'pending' && state !== 'matched') {
                setState('error');
            }
        };
    }

    function requestInterpreter() {
        if (!send({
            type: 'request_interpreter',
            data: {
                language: 'ASL',
                clientName: clientName(),
                roomName: currentRoomName()
            }
        })) {
            pendingSend = true;
            setState('connecting');
            connectQueue();
            return;
        }

        setState('pending');
    }

    function handleClick() {
        if (state === 'matched') {
            return;
        }

        if (state === 'pending') {
            send({
                type: 'cancel_request',
                data: { requestId: requestId }
            });
            requestId = null;
            setState('idle');
            return;
        }

        requestInterpreter();
    }

    function handleInviteClick() {
        var call = activeCall();

        if (lastInviteUrl && navigator.clipboard) {
            navigator.clipboard.writeText(lastInviteUrl);
            setInviteState('Invite Copied', false);
            return;
        }

        if (!call || call.callType !== 'vri') {
            return;
        }

        if (!send({
            type: 'prepare_vri_invite',
            data: {
                roomName: call.roomName || currentRoomName()
            }
        })) {
            pendingInviteSend = true;
            connectQueue();
        }

        setInviteState('Creating...', true);
    }

    function createButton() {
        var el = document.createElement('button');

        el.type = 'button';
        el.dataset.vrsInterpreterButton = 'room-control';
        el.setAttribute('aria-label', 'Request Interpreter');
        el.style.alignItems = 'center';
        el.style.border = '1px solid rgba(255, 255, 255, 0.22)';
        el.style.borderRadius = '8px';
        el.style.boxShadow = '0 8px 22px rgba(0, 0, 0, 0.28)';
        el.style.cursor = 'pointer';
        el.style.display = 'inline-flex';
        el.style.fontSize = '13px';
        el.style.fontWeight = '800';
        el.style.gap = '8px';
        el.style.height = '40px';
        el.style.justifyContent = 'center';
        el.style.letterSpacing = '0';
        el.style.margin = '0 8px';
        el.style.minWidth = '156px';
        el.style.padding = '0 16px';
        el.style.transition = 'background 160ms ease, border-color 160ms ease, transform 160ms ease';
        el.innerHTML = '<span data-vrs-interpreter-dot aria-hidden="true" style="border-radius:999px;display:inline-block;height:9px;width:9px"></span><span data-vrs-interpreter-label></span>';
        el.addEventListener('click', handleClick);

        return el;
    }

    function createInviteButton() {
        var el = document.createElement('button');

        el.type = 'button';
        el.dataset.vriInviteButton = 'room-control';
        el.setAttribute('aria-label', 'Invite participant');
        el.style.alignItems = 'center';
        el.style.background = '#334155';
        el.style.border = '1px solid rgba(255, 255, 255, 0.22)';
        el.style.borderRadius = '8px';
        el.style.boxShadow = '0 8px 22px rgba(0, 0, 0, 0.28)';
        el.style.color = '#fff';
        el.style.cursor = 'pointer';
        el.style.display = 'inline-flex';
        el.style.fontSize = '13px';
        el.style.fontWeight = '800';
        el.style.gap = '8px';
        el.style.height = '40px';
        el.style.justifyContent = 'center';
        el.style.letterSpacing = '0';
        el.style.margin = '0 8px';
        el.style.minWidth = '112px';
        el.style.padding = '0 14px';
        el.innerHTML = '<span aria-hidden="true">+</span><span data-vri-invite-label>Invite</span>';
        el.addEventListener('click', handleInviteClick);

        return el;
    }

    function mountButton() {
        if (activeCall()) {
            connectQueue();
        }

        if (!currentRoomName() || !isClientRoomUser() || !roomUiReady() || document.querySelector(BUTTON_SELECTOR)) {
            return;
        }

        var toolbar = document.querySelector(TOOLBAR_SELECTOR);

        if (!toolbar) {
            return;
        }

        if (activeCallForCurrentRoom()) {
            state = 'matched';
        }

        button = createButton();
        setState(state);
        toolbar.insertBefore(button, toolbar.children[2] || toolbar.firstChild);
        var call = activeCall();
        if (call && call.callType === 'vri' && !document.querySelector('[data-vri-invite-button]')) {
            inviteButton = createInviteButton();
            toolbar.insertBefore(inviteButton, button.nextSibling);
        }
        connectQueue();
    }

    var observer = new MutationObserver(mountButton);

    observer.observe(document.documentElement, { childList: true, subtree: true });
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mountButton);
    } else {
        mountButton();
    }

    window.addEventListener('pagehide', sendActiveCallEnd);
    window.addEventListener('beforeunload', sendActiveCallEnd);
})();
