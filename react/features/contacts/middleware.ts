/**
 * Middleware for the contacts feature.
 *
 * Listens for WebSocket messages related to contact sync
 * and translates them into Redux actions.
 */

import MiddlewareRegistry from '../base/redux/MiddlewareRegistry';
import { queueService } from '../interpreter-queue/InterpreterQueueService';

import { syncContacts, loadContacts } from './actions';

let _initialized = false;

MiddlewareRegistry.register(store => next => action => {
    const result = next(action);

    // Initialize contacts WS listeners once
    if (!_initialized && queueService) {
        initializeContactsListeners(store);
        _initialized = true;
    }

    return result;
});

/**
 * Wire up WebSocket events from the InterpreterQueueService
 * to Redux dispatches for contacts sync.
 */
function initializeContactsListeners(store: { dispatch: Function; getState: Function }) {
    if (!queueService?.on) {
        return;
    }

    // Another device changed contacts — sync from server
    queueService.on('contactsChanged', () => {
        store.dispatch(syncContacts());
    });

    console.log('[Contacts] Middleware initialized');
}
