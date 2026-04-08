import React from 'react';
import { connect } from 'react-redux';
import { useTranslation } from 'react-i18next';

import { requestInterpreter } from '../actions';
import { IReduxState } from '../../app/types';
import Button from '../../base/ui/components/native/Button';
import { BUTTON_TYPES } from '../../base/ui/constants.native';

interface IProps {
    _role?: string;
    _roomName?: string;
    requestInterpreter: (roomName: string) => void;
}

const ClientRequestButton: React.FC<IProps> = ({ _role, _roomName, requestInterpreter }) => {
    const { t } = useTranslation();
    
    // Only show for client role
    if (_role !== 'client') {
        return null;
    }

    const handlePress = () => {
        if (_roomName) {
            requestInterpreter(_roomName);
        }
    };

    return (
        <Button
            accessibilityLabel={t('welcomepage.requestInterpreter')}
            labelKey='welcomepage.requestInterpreter'
            onClick={handlePress}
            type={BUTTON_TYPES.SECONDARY}
        />
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