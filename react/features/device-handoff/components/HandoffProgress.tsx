/**
 * HandoffProgress
 *
 * Full-screen overlay shown during the handoff transfer process.
 * Displays step-by-step progress with visual indicators.
 */

import React from 'react';
import { useSelector } from 'react-redux';
import type { HandoffProgress as HandoffProgressType } from '../DeviceHandoffService';

interface ProgressState {
    'features/device-handoff': {
        handoffInProgress: boolean;
        progress: HandoffProgressType | null;
    };
}

const OVERLAY_STYLE: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2000,
    background: 'rgba(0, 0, 0, 0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
};

const CARD_STYLE: React.CSSProperties = {
    background: '#1e1e2e',
    borderRadius: 16,
    padding: '40px 48px',
    maxWidth: 400,
    width: '90%',
    textAlign: 'center',
    color: '#fff',
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
};

const TITLE_STYLE: React.CSSProperties = {
    fontSize: 22,
    fontWeight: 700,
    marginBottom: 32,
    color: '#e0e0e0'
};

const STEPS = [
    { key: 'found', label: 'Found device' },
    { key: 'preparing', label: 'Preparing transfer' },
    { key: 'transferring', label: 'Connecting to room' },
    { key: 'establishing', label: 'Establishing video' }
];

function getStageIndex(stage: string): number {
    const order = [ 'scanning', 'found', 'preparing', 'transferring', 'establishing', 'completed' ];
    const idx = order.indexOf(stage);

    return idx === -1 ? 0 : idx;
}

const StepIndicator: React.FC<{ stepKey: string; currentStage: string; index: number }> = ({
    stepKey,
    currentStage,
    index
}) => {
    const currentIdx = getStageIndex(currentStage);
    const stepIdx = index + 1; // offset by 1 since 'scanning' is index 0
    const isDone = currentIdx > stepIdx;
    const isCurrent = currentIdx === stepIdx;

    return (
        <div style = {{
            display: 'flex',
            alignItems: 'center',
            marginBottom: 16,
            opacity: isDone || isCurrent ? 1 : 0.4
        }}>
            <div style = {{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: isDone ? '#4caf50' : isCurrent ? '#2196f3' : '#444',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 13,
                fontWeight: 700,
                marginRight: 14,
                flexShrink: 0
            }}>
                {isDone ? '\u2713' : index + 1}
            </div>
            <span style = {{
                fontSize: 15,
                fontWeight: isCurrent ? 600 : 400
            }}>
                {stepKey}
            </span>
            {isCurrent && (
                <div style = {{
                    marginLeft: 8,
                    width: 14,
                    height: 14,
                    border: '2px solid #2196f3',
                    borderTopColor: 'transparent',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite'
                }} />
            )}
        </div>
    );
};

const HandoffProgress: React.FC = () => {
    const handoffInProgress = useSelector(
        (state: ProgressState) => state['features/device-handoff']?.handoffInProgress || false
    );
    const progress = useSelector(
        (state: ProgressState) => state['features/device-handoff']?.progress
    );

    if (!handoffInProgress || !progress) {
        return null;
    }

    const stage = progress.stage;

    if (stage === 'completed' || stage === 'failed') {
        return null;
    }

    return (
        <div style = { OVERLAY_STYLE }>
            <div style = { CARD_STYLE }>
                <div style = { TITLE_STYLE }>Transferring Call...</div>
                <div style = {{ textAlign: 'left', marginBottom: 24 }}>
                    {STEPS.map((step, idx) => (
                        <StepIndicator
                            currentStage = { stage }
                            index = { idx }
                            key = { step.key }
                            stepKey = { step.label } />
                    ))}
                </div>
                <div style = {{
                    fontSize: 13,
                    color: 'rgba(255,255,255,0.5)',
                    marginTop: 16
                }}>
                    {progress.message || 'Please wait...'}
                </div>
                <div style = {{
                    fontSize: 12,
                    color: 'rgba(255,255,255,0.3)',
                    marginTop: 8
                }}>
                    Do not close this app.
                </div>
            </div>
            <style>{`
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
};

export default HandoffProgress;
