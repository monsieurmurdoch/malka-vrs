/**
 * Call Transfer Dialog — shown to interpreters to initiate a transfer.
 *
 * Supports blind and attended transfers to a phone number or another interpreter.
 */

import React, { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';

import { initiateCallTransfer, cancelCallTransfer } from '../actions';

interface CallManagementState {
    'features/call-management': {
        transferStatus: string;
        activeTransfer: {
            transferId: string;
            callId: string;
            transferType: string;
            toPhoneNumber: string | null;
        } | null;
    };
}

interface Props {
    callId: string;
    onClose: () => void;
}

const CallTransferDialog = ({ callId, onClose }: Props) => {
    const dispatch = useDispatch();
    const transferStatus = useSelector(
        (state: CallManagementState) => state['features/call-management']?.transferStatus
    );
    const activeTransfer = useSelector(
        (state: CallManagementState) => state['features/call-management']?.activeTransfer
    );

    const [ toPhoneNumber, setToPhoneNumber ] = useState('');
    const [ transferType, setTransferType ] = useState<'blind' | 'attended'>('blind');
    const [ reason, setReason ] = useState('');

    const handleTransfer = () => {
        if (!toPhoneNumber.trim()) {
            return;
        }
        dispatch(initiateCallTransfer(callId, toPhoneNumber, undefined, transferType, reason || undefined));
    };

    const handleCancel = () => {
        if (activeTransfer?.transferId) {
            dispatch(cancelCallTransfer(activeTransfer.transferId));
        }
        onClose();
    };

    return (
        <div className = 'call-transfer-dialog'>
            <div className = 'call-transfer-card'>
                <div className = 'call-transfer-header'>
                    <h3>Transfer Call</h3>
                    <button className = 'close-btn' onClick = { onClose }>&times;</button>
                </div>

                {transferStatus === 'pending' ? (
                    <div className = 'call-transfer-pending'>
                        <p>Transferring to <strong>{activeTransfer?.toPhoneNumber || toPhoneNumber}</strong>...</p>
                        <div className = 'transfer-spinner' />
                        <button className = 'cancel-btn' onClick = { handleCancel }>
                            Cancel Transfer
                        </button>
                    </div>
                ) : (
                    <>
                        <div className = 'call-transfer-form'>
                            <label>
                                Phone Number
                                <input
                                    type = 'tel'
                                    value = { toPhoneNumber }
                                    onChange = { e => setToPhoneNumber(e.target.value) }
                                    placeholder = 'e.g. +1-555-0123' />
                            </label>

                            <label>
                                Transfer Type
                                <select
                                    value = { transferType }
                                    onChange = { e => setTransferType(e.target.value as 'blind' | 'attended') }>
                                    <option value = 'blind'>Blind Transfer</option>
                                    <option value = 'attended'>Attended Transfer</option>
                                </select>
                            </label>

                            <label>
                                Reason (optional)
                                <input
                                    type = 'text'
                                    value = { reason }
                                    onChange = { e => setReason(e.target.value) }
                                    placeholder = 'e.g. Customer requested' />
                            </label>
                        </div>

                        <div className = 'call-transfer-actions'>
                            <button className = 'cancel-btn' onClick = { onClose }>Cancel</button>
                            <button
                                className = 'transfer-btn'
                                disabled = { !toPhoneNumber.trim() }
                                onClick = { handleTransfer }>
                                Transfer
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default CallTransferDialog;
