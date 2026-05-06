const log = require('./logger').module('call-lifecycle');

function logCallEvent(event, fields = {}) {
    log.info({
        event,
        lifecycleEvent: event,
        ...fields
    }, 'call_lifecycle');
}

function logCallError(event, error, fields = {}) {
    log.error({
        err: error,
        event,
        lifecycleEvent: event,
        ...fields
    }, 'call_lifecycle_error');
}

module.exports = {
    logCallEvent,
    logCallError
};
