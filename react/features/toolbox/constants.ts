import { ToolbarButton } from './types';

/**
 * Thresholds for displaying toolbox buttons.
 */
// `requestInterpreter` is promoted to the main toolbar at every width wide
// enough to fit it. It is visibility-gated to clients in its mapStateToProps,
// so it only surfaces on client devices — meaning interpreters and guests see
// exactly the same main bar as before.
export const THRESHOLDS = [
    {
        width: 565,
        order: [ 'microphone', 'camera', 'desktop', 'chat', 'requestInterpreter', 'raisehand', 'reactions', 'participants', 'tileview' ]
    },
    {
        width: 520,
        order: [ 'microphone', 'camera', 'desktop', 'chat', 'requestInterpreter', 'raisehand', 'participants', 'tileview' ]
    },
    {
        width: 470,
        order: [ 'microphone', 'camera', 'desktop', 'chat', 'requestInterpreter', 'raisehand', 'participants' ]
    },
    {
        width: 420,
        order: [ 'microphone', 'camera', 'desktop', 'chat', 'requestInterpreter', 'participants' ]
    },
    {
        width: 370,
        order: [ 'microphone', 'camera', 'chat', 'requestInterpreter', 'participants' ]
    },
    {
        width: 225,
        order: [ 'microphone', 'camera', 'chat' ]
    },
    {
        width: 200,
        order: [ 'microphone', 'camera' ]
    }
];

export const NOT_APPLICABLE = 'N/A';

export const TOOLBAR_TIMEOUT = 4000;

export const DRAWER_MAX_HEIGHT = '80dvh - 64px';

export const NOTIFY_CLICK_MODE = {
    ONLY_NOTIFY: 'ONLY_NOTIFY',
    PREVENT_AND_NOTIFY: 'PREVENT_AND_NOTIFY'
};

// Around 300 to be displayed above components like chat
export const ZINDEX_DIALOG_PORTAL = 302;

/**
 * Color for spinner displayed in the toolbar.
 */
export const SPINNER_COLOR = '#929292';


/**
 * The list of all possible UI buttons.
 *
 * @protected
 * @type Array<string>
 */
export const TOOLBAR_BUTTONS: ToolbarButton[] = [
    'camera',
    'chat',
    'closedcaptions',
    'desktop',
    'download',
    'embedmeeting',
    'etherpad',
    'feedback',
    'filmstrip',
    'fullscreen',
    'hangup',
    'help',
    'highlight',
    'invite',
    'linktosalesforce',
    'livestreaming',
    'microphone',
    'mute-everyone',
    'mute-video-everyone',
    'participants-pane',
    'profile',
    'raisehand',
    'recording',
    'requestInterpreter',
    'security',
    'select-background',
    'settings',
    'shareaudio',
    'noisesuppression',
    'sharedvideo',
    'shortcuts',
    'stats',
    'tileview',
    'toggle-camera',
    'videoquality',
    'whiteboard'
];

/**
 * The toolbar buttons to show when in visitors mode.
 */
export const VISITORS_MODE_BUTTONS: ToolbarButton[] = [
    'chat',
    'hangup',
    'raisehand',
    'settings',
    'tileview',
    'fullscreen',
    'stats',
    'videoquality'
];
