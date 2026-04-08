import React from 'react';
import { connect } from 'react-redux';

import { requestInterpreter } from '../actions';
import { IReduxState } from '../../app/types';

interface IProps {
    _role?: string;
    _roomName?: string;
    requestInterpreter: (roomName: string) => void;
}

const ClientRequestButton: React.FC<IProps> = ({ _role, _roomName, requestInterpreter }) => {
    // Only show for client role
    if (_role !== 'client') {
        return null;
    }

    const handleClick = () => {
        if (_roomName) {
            requestInterpreter(_roomName);
        }
    };

    return (
        <button 
            onClick={handleClick} 
            className="request-interpreter-button"
            type="button"
        >
            Request Interpreter
        </button>
    );
};

const mapStateToProps = (state: IReduxState) => {
    const jwtState = state['features/base/jwt'];
    const conferenceState = state['features/base/conference'];
    
    return {
        _role: jwtState?.user?.role || 'guest',
        _roomName: conferenceState?.room || ''
    };
};

export default connect(mapStateToProps, { requestInterpreter })(ClientRequestButton);
