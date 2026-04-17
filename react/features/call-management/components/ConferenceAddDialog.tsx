/**
 * Conference Add Dialog — adds a third party to an existing call (3-way calling).
 */

import React, { useState } from 'react';
import { useDispatch } from 'react-redux';

import { addConferenceParticipant } from '../actions';

interface Props {
    callId: string;
    onClose: () => void;
}

const ConferenceAddDialog = ({ callId, onClose }: Props) => {
    const dispatch = useDispatch();
    const [ phoneNumber, setPhoneNumber ] = useState('');

    const handleAdd = () => {
        if (!phoneNumber.trim()) {
            return;
        }
        dispatch(addConferenceParticipant(callId, phoneNumber));
        onClose();
    };

    return (
        <div className = 'conference-add-dialog'>
            <div className = 'conference-add-card'>
                <div className = 'conference-add-header'>
                    <h3>Add to Call</h3>
                    <button className = 'close-btn' onClick = { onClose }>&times;</button>
                </div>
                <p className = 'conference-add-description'>
                    Add a third person to this call to create a 3-way conference.
                </p>
                <div className = 'conference-add-form'>
                    <label>
                        Phone Number
                        <input
                            type = 'tel'
                            value = { phoneNumber }
                            onChange = { e => setPhoneNumber(e.target.value) }
                            placeholder = 'e.g. +1-555-0123'
                            autoFocus = { true } />
                    </label>
                </div>
                <div className = 'conference-add-actions'>
                    <button className = 'cancel-btn' onClick = { onClose }>Cancel</button>
                    <button
                        className = 'add-btn'
                        disabled = { !phoneNumber.trim() }
                        onClick = { handleAdd }>
                        Add to Call
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConferenceAddDialog;
