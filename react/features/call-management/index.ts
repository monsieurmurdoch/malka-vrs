/**
 * Call Management & UX feature.
 *
 * Provides:
 * - Call waiting (visual + vibration alert)
 * - Call transfer (blind & attended)
 * - 3-way calling (conference bridge)
 * - Do Not Disturb mode
 * - In-call text chat
 * - Dark mode
 */

// Side-effect imports: reducer self-registers via ReducerRegistry,
// middleware self-registers via MiddlewareRegistry.
import './reducer';
import './middleware';

export {
    CallWaitingOverlay,
    CallTransferDialog,
    InCallChatPanel,
    DNDToggle,
    DarkModeToggle,
    ConferenceAddDialog
} from './components';

export {
    callWaitingIncoming,
    callWaitingRespond,
    callWaitingDismiss,
    toggleCallHold,
    initiateCallTransfer,
    acceptCallTransfer,
    cancelCallTransfer,
    addConferenceParticipant,
    removeConferenceParticipant,
    sendChatMessage,
    requestChatHistory,
    toggleChatPanel,
    toggleDND,
    setDarkMode,
    preferencesUpdated
} from './actions';
