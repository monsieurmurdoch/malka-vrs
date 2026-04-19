/**
 * Voicemail feature — public exports.
 */

// Redux
export { default as VoicemailInbox } from './components/web/VoicemailInbox';
export { default as VoicemailPlayer } from './components/web/VoicemailPlayer';
export { default as VoicemailPrompt } from './components/web/VoicemailPrompt';
export { default as VoicemailRecording } from './components/web/VoicemailRecording';
export { default as VoicemailBadge } from './components/web/VoicemailBadge';
export { default as VoicemailFab } from './components/web/VoicemailFab';
export { default as VoicemailEmpty } from './components/web/VoicemailEmpty';

// Actions
export {
    loadInbox,
    openMessage,
    closePlayer,
    removeMessage,
    markSeen,
    updateUnreadCount,
    recordingStarted,
    recordingComplete,
    recordingCancelled,
    showPrompt,
    dismissPrompt,
    clearError
} from './actions';

// Types
export type { VoicemailMessage, VoicemailState, VoicemailPromptData, VoicemailRecordingSession } from './types';
