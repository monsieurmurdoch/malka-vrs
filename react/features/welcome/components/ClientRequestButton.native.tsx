import React from 'react';
import { useTranslation } from 'react-i18next';
import { connect } from 'react-redux';

import { IReduxState } from '../../app/types';
import Button from '../../base/ui/components/native/Button';
import { BUTTON_TYPES } from '../../base/ui/constants.native';
import { cancelInterpreterRequest, requestInterpreter } from '../../interpreter-queue/actions';
import { QueueState } from '../../interpreter-queue/reducer';
import { getPersistentItem } from '../../vrs-auth/storage';

interface IProps {
    _isConnected: boolean;
    _isRequestPending: boolean;
    _queuePosition?: number;
    _role?: string;
    cancelInterpreterRequest: () => void;
    requestInterpreter: (language?: string) => void;
}

const ClientRequestButton: React.FC<IProps> = ({
    _isConnected,
    _isRequestPending,
    _queuePosition,
    _role,
    cancelInterpreterRequest: dispatchCancelInterpreterRequest,
    requestInterpreter: dispatchRequestInterpreter
}) => {
    const { t } = useTranslation();
    const handlePress = React.useCallback(() => {
        if (_isRequestPending) {
            dispatchCancelInterpreterRequest();

            return;
        }

        dispatchRequestInterpreter('ASL');
    }, [
        _isRequestPending,
        dispatchCancelInterpreterRequest,
        dispatchRequestInterpreter
    ]);

    // Only show for client role.
    if (_role !== 'client') {
        return null;
    }

    const pendingLabel = typeof _queuePosition === 'number'
        ? t('welcomepage.waitingForInterpreterWithPosition', {
            position: _queuePosition
        })
        : t('welcomepage.waitingForInterpreter');

    return (
        <Button
            accessibilityLabel = { _isRequestPending
                ? pendingLabel
                : t('welcomepage.requestInterpreter') }
            disabled = { !_isConnected && !_isRequestPending }
            label = { _isRequestPending
                ? t('welcomepage.cancelInterpreterRequest')
                : t('welcomepage.requestInterpreter') }
            onClick = { handlePress }
            type = { _isRequestPending ? BUTTON_TYPES.DESTRUCTIVE : BUTTON_TYPES.SECONDARY } />
    );
};

const mapStateToProps = (state: IReduxState) => {
    const jwtState = state['features/base/jwt'];
    const queueState = state['features/interpreter-queue'] as QueueState | undefined;
    const storedRole = getPersistentItem('vrs_user_role');
    const isClientAuth = getPersistentItem('vrs_client_auth') === 'true';

    return {
        _isConnected: Boolean(queueState?.isConnected),
        _isRequestPending: Boolean(queueState?.isRequestPending),
        _queuePosition: queueState?.queuePosition,
        _role: jwtState?.user?.role || storedRole || (isClientAuth ? 'client' : 'guest')
    };
};

export default connect(mapStateToProps, {
    cancelInterpreterRequest,
    requestInterpreter
})(ClientRequestButton);
