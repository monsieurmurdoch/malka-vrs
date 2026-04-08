import React from 'react';
import { connect } from 'react-redux';
import { createToolbarEvent } from '../../../analytics/AnalyticsEvents';
import { sendAnalytics } from '../../../analytics/functions';
import { translate } from '../../../base/i18n/functions';
import { IconUser } from '../../../base/icons/svg';
import AbstractButton, { IProps as AbstractButtonProps } from '../../../base/toolbox/components/AbstractButton';
import { queueService } from '../../../interpreter-queue/InterpreterQueueService';
import { requestInterpreter } from '../../../interpreter-queue/actions';
import { showNotification } from '../../../notifications/actions';

/**
 * The type of the React {@code Component} props of {@link RequestInterpreterButton}.
 */
interface IProps extends AbstractButtonProps {
}

class RequestInterpreterButton extends AbstractButton<IProps> {
    accessibilityLabel = 'toolbar.requestInterpreter';
    icon = IconUser;
    label = 'Request Interpreter';
    tooltip = 'Request a sign language interpreter';

    /**
     * Handles clicking / pressing the button.
     *
     * @protected
     * @returns {void}
     */
    _handleClick() {
        sendAnalytics(createToolbarEvent('requestInterpreter'));

        const { dispatch } = this.props;

        // Check if queue service is connected
        if (!queueService.isConnected()) {
            dispatch(showNotification({
                titleKey: 'vrs.queueUnavailable'
            }, 'medium'));
            console.warn('Interpreter queue service not connected');
            return;
        }

        dispatch(requestInterpreter('ASL'));

        // Notify user that request was sent
        dispatch(showNotification({
            titleKey: 'vrs.interpreterRequested'
        }, 'medium'));

        console.log('Request Interpreter clicked - request sent');
    }
}

function _mapStateToProps(state: any) {
    return {};
}

export default translate(connect(_mapStateToProps)(RequestInterpreterButton));
