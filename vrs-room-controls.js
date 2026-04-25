(function() {
    'use strict';

    var BUTTON_SELECTOR = '[data-vrs-interpreter-button]';
    var TOOLBAR_SELECTOR = '.toolbox-content-items';
    var ws = null;
    var requestId = null;
    var pendingSend = false;
    var state = 'idle';
    var button = null;

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

        if (role === 'interpreter' || role === 'captioner') {
            return false;
        }

        var urlRole = new URLSearchParams(window.location.search).get('role');

        return urlRole !== 'interpreter' && urlRole !== 'captioner';
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
        var id = user.id || token.userId || token.id || ('client-' + Date.now());

        return {
            type: 'auth',
            role: 'client',
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
            matched: 'Interpreter Confirmed',
            error: 'Try Interpreter Again'
        };
        var color = colors[nextState] || colors.idle;

        button.style.background = color[0];
        button.style.borderColor = color[1];
        button.style.color = color[2];
        button.setAttribute('aria-pressed', String(nextState === 'pending' || nextState === 'matched'));
        button.title = nextState === 'pending'
            ? 'Cancel interpreter request'
            : nextState === 'matched'
                ? 'An interpreter accepted and is joining this room'
                : 'Request a sign language interpreter';
        button.querySelector('[data-vrs-interpreter-dot]').style.background = color[3];
        button.querySelector('[data-vrs-interpreter-label]').textContent = labels[nextState] || labels.idle;
    }

    function connectQueue() {
        if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
            return;
        }

        var protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

        ws = new WebSocket(protocol + '//' + window.location.host + '/ws');

        ws.onopen = function() {
            send(authPayload());
            if (pendingSend) {
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
                setState('matched');
            } else if (message.type === 'request_cancelled'
                    || message.type === 'request_declined') {
                requestId = null;
                setState('idle');
            } else if (message.type === 'error' || message.type === 'auth_error') {
                setState('error');
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

    function mountButton() {
        if (!currentRoomName() || !isClientRoomUser() || document.querySelector(BUTTON_SELECTOR)) {
            return;
        }

        var toolbar = document.querySelector(TOOLBAR_SELECTOR);

        if (!toolbar) {
            return;
        }

        button = createButton();
        setState(state);
        toolbar.insertBefore(button, toolbar.children[2] || toolbar.firstChild);
        connectQueue();
    }

    var observer = new MutationObserver(mountButton);

    observer.observe(document.documentElement, { childList: true, subtree: true });
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mountButton);
    } else {
        mountButton();
    }
})();
