import React from 'react';
import { connect } from 'react-redux';
import { createToolbarEvent } from '../../../analytics/AnalyticsEvents';
import { sendAnalytics } from '../../../analytics/functions';
import { IReduxState } from '../../../app/types';
import { translate } from '../../../base/i18n/functions';
import { IconRaiseHand } from '../../../base/icons/svg';
import AbstractButton, { IProps as AbstractButtonProps } from '../../../base/toolbox/components/AbstractButton';
import { queueService } from '../../../interpreter-queue/InterpreterQueueService';
import { cancelInterpreterRequest, requestInterpreter } from '../../../interpreter-queue/actions';
import { showNotification } from '../../../notifications/actions';
import { isClient } from '../../../base/user-role/functions';

/**
 * The type of the React {@code Component} props of {@link RequestInterpreterButton}.
 */
interface IProps extends AbstractButtonProps {
    _interpreterName?: string;
    _isConnected: boolean;
    _isRequestPending: boolean;
    _matchFound: boolean;
}

class RequestInterpreterButton extends AbstractButton<IProps> {
    accessibilityLabel = 'toolbar.requestInterpreter';
    icon = IconRaiseHand;
    label = 'Request interpreter';
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

        if (this.props._matchFound) {
            return;
        }

        if (this.props._isRequestPending) {
            dispatch(cancelInterpreterRequest());

            return;
        }

        // Check if queue service is connected
        if (!this.props._isConnected || !queueService.isConnected()) {
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

    _isToggled() {
        return this.props._isRequestPending || this.props._matchFound;
    }

    render() {
        if (this.props._matchFound) {
            this.backgroundColor = '#2e7d32';
            this.label = this.props._interpreterName
                ? `Interpreter joining: ${this.props._interpreterName}`
                : 'Interpreter joining';
            this.tooltip = 'An interpreter accepted and is joining this room';
        } else if (this.props._isRequestPending) {
            this.backgroundColor = '#f9a825';
            this.label = 'Interpreter requested';
            this.tooltip = 'Cancel interpreter request';
        } else {
            this.backgroundColor = undefined;
            this.label = 'Request interpreter';
            this.tooltip = 'Request a sign language interpreter';
        }

        return super.render();
    }
}

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

export default translate(connect(_mapStateToProps)(RequestInterpreterButton));
