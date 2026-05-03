export const screen = {
    conference: {
        breakoutRooms: 'Breakout Rooms',
        carmode: 'Car Mode',
        chat: 'Chat',
        chatandpolls: {
            main: 'Chat and Polls',
            tab: {
                chat: 'Chat',
                polls: 'Polls'
            }
        },
        container: 'Conference container',
        gifsMenu: 'GIPHY',
        invite: 'Invite',
        liveStream: 'Live stream',
        main: 'Conference',
        participants: 'Participants',
        root: 'Conference root',
        recording: 'Recording',
        salesforce: 'Link to Salesforce',
        security: 'Security Options',
        sharedDocument: 'Shared document',
        speakerStats: 'Speaker Stats',
        subtitles: 'Subtitles',
        whiteboard: 'Whiteboard'
    },
    connecting: 'Connecting',
    dialInSummary: 'Dial-In Info',
    preJoin: 'Pre-Join',
    lobby: {
        chat: 'Lobby chat',
        main: 'Lobby',
        root: 'Lobby root'
    },
    settings: {
        language: 'Language',
        links: {
            help: 'Help',
            privacy: 'Privacy',
            terms: 'Terms'
        },
        main: 'Settings',
        profile: 'Profile'
    },
    unsafeRoomWarning: 'Unsafe Room Warning',
    auth: {
        login: 'Login',
        resetPassword: 'Reset Password'
    },
    vrs: {
        home: 'VRS Home',
        callHistory: 'VRS Call History',
        contacts: 'VRS Contacts',
        contactDetail: 'VRS Contact Detail',
        dialPad: 'VRS Dial Pad',
        voicemail: 'VRS Voicemail'
    },
    vri: {
        console: 'VRI Console',
        settings: 'VRI Settings',
        usage: 'VRI Usage'
    },
    interpreter: {
        home: 'Interpreter Home',
        settings: 'Interpreter Settings',
        earnings: 'Interpreter Earnings'
    },
    welcome: {
        main: 'Welcome',
        tabs: {
            calendar: 'Calendar',
            recent: 'Recent'
        }
    }
} as const;

type LeafRouteNames<T> = T extends string
    ? T
    : T extends Record<string, unknown>
        ? LeafRouteNames<T[keyof T]>
        : never;

export type RootRouteName = LeafRouteNames<typeof screen>;

export type RootStackParamList = {
    [K in RootRouteName]: K extends 'VRS Contact Detail'
        ? { contactId?: string } | undefined
        : K extends 'Conference root'
            ? { roomName?: string } | undefined
            : Record<string, unknown> | undefined;
};
