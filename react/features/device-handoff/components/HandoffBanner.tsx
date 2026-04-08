/**
 * HandoffBanner
 *
 * Slide-down banner shown during an active VRS call when a companion
 * device is detected nearby. Allows the user to initiate the transfer.
 */

import React, { useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { initiateHandoff, stopHandoffScanning } from '../actions';
import type { CompanionDevice } from '../DeviceHandoffService';

interface HandoffBannerState {
    'features/device-handoff': {
        companionDevices: CompanionDevice[];
        handoffInProgress: boolean;
    };
}

const BANNER_STYLE: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    background: 'linear-gradient(135deg, #1a237e 0%, #0d47a1 100%)',
    color: '#fff',
    padding: '12px 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    animation: 'slideDown 0.3s ease-out'
};

const DEVICE_INFO_STYLE: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
};

const DEVICE_ICON_STYLE: React.CSSProperties = {
    width: 32,
    height: 32,
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 16
};

const TRANSFER_BUTTON_STYLE: React.CSSProperties = {
    background: '#4caf50',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '8px 20px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 0.2s'
};

const DISMISS_BUTTON_STYLE: React.CSSProperties = {
    background: 'transparent',
    color: 'rgba(255,255,255,0.7)',
    border: '1px solid rgba(255,255,255,0.3)',
    borderRadius: 6,
    padding: '8px 16px',
    fontSize: 13,
    cursor: 'pointer',
    marginLeft: 8
};

const HandoffBanner: React.FC = () => {
    const dispatch = useDispatch();
    const companionDevices = useSelector(
        (state: HandoffBannerState) => state['features/device-handoff']?.companionDevices || []
    );
    const handoffInProgress = useSelector(
        (state: HandoffBannerState) => state['features/device-handoff']?.handoffInProgress || false
    );

    const handleTransfer = useCallback((device: CompanionDevice) => {
        dispatch(initiateHandoff(device) as any);
    }, [ dispatch ]);

    const handleDismiss = useCallback(() => {
        dispatch(stopHandoffScanning() as any);
    }, [ dispatch ]);

    // Don't render if no devices or handoff already in progress
    if (companionDevices.length === 0 || handoffInProgress) {
        return null;
    }

    const primaryDevice = companionDevices[0];

    return (
        <div style = { BANNER_STYLE }>
            <div style = { DEVICE_INFO_STYLE }>
                <div style = { DEVICE_ICON_STYLE }>
                    {primaryDevice.name?.includes('iPad') ? '\uD83D\uDCF1' : '\uD83D\uDCF1'}
                </div>
                <div>
                    <div style = {{ fontWeight: 600, fontSize: 14 }}>
                        {primaryDevice.name || 'Device'} nearby
                    </div>
                    <div style = {{ fontSize: 12, opacity: 0.8 }}>
                        Transfer this call?
                    </div>
                </div>
            </div>
            <div style = {{ display: 'flex', alignItems: 'center' }}>
                <button
                    onClick = { () => handleTransfer(primaryDevice) }
                    style = { TRANSFER_BUTTON_STYLE }
                    type = 'button'>
                    Transfer Call
                </button>
                <button
                    onClick = { handleDismiss }
                    style = { DISMISS_BUTTON_STYLE }
                    type = 'button'>
                    Dismiss
                </button>
            </div>
        </div>
    );
};

export default HandoffBanner;
