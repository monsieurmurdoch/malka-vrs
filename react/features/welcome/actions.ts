import { REQUEST_INTERPRETER } from './actionTypes';

/**
 * Action to request an interpreter for a specific room.
 *
 * @param {string} roomName - The name of the room to request an interpreter for.
 * @returns {{
 *     type: REQUEST_INTERPRETER,
 *     roomName: string
 * }}
 */
export function requestInterpreter(roomName: string) {
    return {
        type: REQUEST_INTERPRETER,
        roomName
    };
}
