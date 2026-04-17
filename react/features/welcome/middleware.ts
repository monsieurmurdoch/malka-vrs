import { AnyAction } from 'redux';

import { IStore } from '../app/types';
import MiddlewareRegistry from '../base/redux/MiddlewareRegistry';

// Historically this middleware handled a REQUEST_INTERPRETER action by POSTing
// to /api/queue/request. That action type collides with the one dispatched by
// the toolbar's RequestInterpreterButton (in features/interpreter-queue), so
// it ran every time the button was clicked and hit an endpoint that no longer
// exists on the VRS server. The queue flow is now entirely WebSocket-based —
// see features/interpreter-queue/InterpreterQueueService — so this middleware
// is intentionally a no-op and left in place only so the MiddlewareRegistry
// import chain in app/middlewares.any.ts stays stable.
MiddlewareRegistry.register((_store: IStore) => (next: Function) => (action: AnyAction) => next(action));
