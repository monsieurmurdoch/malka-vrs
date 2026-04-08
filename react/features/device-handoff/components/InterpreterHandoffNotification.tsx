/**
 * InterpreterHandoffNotification
 *
 * Small toast notification shown to the interpreter when a client
 * is switching devices. Auto-dismisses after a few seconds.
 */

import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { handoffInterpreterComplete } from '../actions';

interface NotifyState {
    'features/device-handoff': {
        interpreterNotify: {
            active: boolean;
            userId?: string;
            roomName?: string;
            estimatedDuration?: string;
        } | null;
    };
}

const TOAST_STYLE: React.CSSProperties = {
    position: 'fixed',
    bottom: 80,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 3000,
    background: 'linear-gradient(135deg, #ff6f00 0%, #f57c00 100%)',
    color: '#fff',
    padding: '14px 24px',
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 500,
    boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    animation: 'fadeInUp 0.3s ease-out',
    maxWidth: 400
};

const AUTO_DISMISS_MS = 4000;

const InterpreterHandoffNotification: React.FC = () => {
    const dispatch = useDispatch();
    const interpreterNotify = useSelector(
        (state: NotifyState) => state['features/device-handoff']?.interpreterNotify
    );
    const [ visible, setVisible ] = useState(false);

    useEffect(() => {
        if (interpreterNotify?.active) {
            setVisible(true);

            const timer = setTimeout(() => {
                setVisible(false);
                dispatch(handoffInterpreterComplete({ userId: interpreterNotify.userId || '' }) as any);
            }, AUTO_DISMISS_MS);

            return () => clearTimeout(timer);
        } else {
            setVisible(false);
        }
    }, [ interpreterNotify, dispatch ]);

    if (!visible || !interpreterNotify?.active) {
        return null;
    }

    return (
        <>
            <div style = { TOAST_STYLE }>
                <span style = {{ fontSize: 18 }}>{'\uD83D\uDD04'}</span>
                <span>Client is switching devices... {interpreterNotify.estimatedDuration || '~2s'}</span>
            </div>
            <style>{`
                @keyframes fadeInUp {
                    from {
                        opacity: 0;
                        transform: translateX(-50%) translateY(10px);
                    }
                    to {
                        opacity: 1;
                        transform: translateX(-50%) translateY(0);
                    }
                }
            `}</style>
        </>
    );
};

export default InterpreterHandoffNotification;
