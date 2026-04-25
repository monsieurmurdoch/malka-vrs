import React from 'react';
import { connect } from 'react-redux';

import { createToolbarEvent } from '../../../analytics/AnalyticsEvents';
import { sendAnalytics } from '../../../analytics/functions';
import { IReduxState, IStore } from '../../../app/types';
import { isClient } from '../../../base/user-role/functions';
import { queueService } from '../../../interpreter-queue/InterpreterQueueService';
import { cancelInterpreterRequest, requestInterpreter } from '../../../interpreter-queue/actions';
import { showNotification } from '../../../notifications/actions';

interface IProps {
    _interpreterName?: string;
    _isConnected: boolean;
    _isRequestPending: boolean;
    _matchFound: boolean;
    dispatch: IStore['dispatch'];
    visible?: boolean;
}

const BASE_STYLE: React.CSSProperties = {
    alignItems: 'center',
    border: '1px solid rgba(255, 255, 255, 0.22)',
    borderRadius: 8,
    boxShadow: '0 8px 22px rgba(0, 0, 0, 0.28)',
    color: '#fff',
    cursor: 'pointer',
    display: 'inline-flex',
    fontSize: 13,
    fontWeight: 800,
    gap: 8,
    height: 40,
    justifyContent: 'center',
    letterSpacing: 0,
    margin: '0 8px',
    minWidth: 156,
    padding: '0 16px',
    textTransform: 'none',
    transition: 'background 160ms ease, border-color 160ms ease, transform 160ms ease'
};

const STATE_STYLES: Record<'idle' | 'pending' | 'matched', React.CSSProperties> = {
    idle: {
        background: '#2357C6',
        borderColor: '#5E8CFF'
    },
    pending: {
        background: '#D99A12',
        borderColor: '#FFD166',
        color: '#111827'
    },
    matched: {
        background: '#15803D',
        borderColor: '#4ADE80'
    }
};

const DOT_STYLES: Record<'idle' | 'pending' | 'matched', React.CSSProperties> = {
    idle: { background: '#C7D2FE' },
    pending: { background: '#111827' },
    matched: { background: '#BBF7D0' }
};

const RequestInterpreterButton = ({
    _interpreterName,
    _isConnected,
    _isRequestPending,
    _matchFound,
    dispatch,
    visible = true
}: IProps) => {
    if (!visible) {
        return null;
    }

    const state = _matchFound ? 'matched' : _isRequestPending ? 'pending' : 'idle';
    const label = _matchFound
        ? 'Interpreter Confirmed'
        : _isRequestPending
            ? 'Interpreter Requested'
            : 'Request Interpreter';
    const title = _matchFound
        ? (_interpreterName
            ? `${_interpreterName} accepted and is joining`
            : 'An interpreter accepted and is joining')
        : _isRequestPending
            ? 'Cancel interpreter request'
            : 'Request a sign language interpreter';

    const handleClick = () => {
        sendAnalytics(createToolbarEvent('requestInterpreter'));

        if (_matchFound) {
            return;
        }

        if (_isRequestPending) {
            dispatch(cancelInterpreterRequest() as any);
            return;
        }

        if (!_isConnected || !queueService.isConnected()) {
            dispatch(showNotification({
                titleKey: 'vrs.queueUnavailable'
            }, 'medium') as any);
            return;
        }

        dispatch(requestInterpreter('ASL') as any);
        dispatch(showNotification({
            titleKey: 'vrs.interpreterRequested'
        }, 'medium') as any);
    };

    return (
        <button
            aria-label = { label }
            aria-pressed = { _isRequestPending || _matchFound }
            data-vrs-interpreter-button = 'react'
            onClick = { handleClick }
            style = {{ ...BASE_STYLE, ...STATE_STYLES[state] }}
            title = { title }
            type = 'button'>
            <span
                aria-hidden = 'true'
                style = {{
                    ...DOT_STYLES[state],
                    borderRadius: 999,
                    display: 'inline-block',
                    height: 9,
                    width: 9
                }} />
            {label}
        </button>
    );
};

function _mapStateToProps(state: IReduxState) {
    const queueState = state['features/interpreter-queue'];

    return {
        _interpreterName: queueState?.matchData?.interpreterName,
        _isConnected: Boolean(queueState?.isConnected),
        _isRequestPending: Boolean(queueState?.isRequestPending),
        _matchFound: Boolean(queueState?.matchFound),
        visible: isClient()
    };
}

export default connect(_mapStateToProps)(RequestInterpreterButton);
