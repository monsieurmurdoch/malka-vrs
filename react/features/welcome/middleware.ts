import { AnyAction } from 'redux';

import { IStore } from '../app/types';
import MiddlewareRegistry from '../base/redux/MiddlewareRegistry';
import { REQUEST_INTERPRETER } from './actionTypes';

/**
 * Implements the middleware of the welcome feature.
 *
 * @param {Store} store - The redux store.
 * @returns {Function}
 */
MiddlewareRegistry.register((store: IStore) => (next: Function) => (action: AnyAction) => {
    const { dispatch, getState } = store;

    switch (action.type) {
    case REQUEST_INTERPRETER: {
        const { roomName } = action;
        const state = getState();
        const jwtState = state['features/base/jwt'];
        const clientId = jwtState?.user?.id;
        
        // Post to backend queue
        fetch('/api/queue/request', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                roomName, 
                clientId,
                timestamp: new Date().toISOString()
            })
        })
        .then(response => {
            if (response.ok) {
                // Show confirmation message
                if (typeof APP !== 'undefined' && APP.UI?.messageHandler) {
                    APP.UI.messageHandler.showMessage({ 
                        description: 'Interpreter requested. Waiting for assignment...' 
                    });
                }
            } else {
                throw new Error('Request failed');
            }
        })
        .catch(err => {
            console.error('Interpreter request failed:', err);
            // Show error message
            if (typeof APP !== 'undefined' && APP.UI?.messageHandler) {
                APP.UI.messageHandler.showMessage({ 
                    description: 'Failed to request interpreter. Please try again.',
                    type: 'error'
                });
            }
        });
        break;
    }
    }

    return next(action);
});
