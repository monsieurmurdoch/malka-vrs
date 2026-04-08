import { IConfig } from "./react/features/base/config/configType";

export {};

declare global {
    interface ILocation extends URL {
        assign(url: string): void;
        replace(url: string): void;
        reload(): void;
    }

    interface IWindow {
        JITSI_MEET_LITE_SDK: boolean;
        JitsiMeetJS: any;
        Twilio?: any;
        config: IConfig;
        document: any;
        innerHeight: number;
        innerWidth: number;
        interfaceConfig: any;
        location: ILocation;
        PressureObserver?: any;
        PressureRecord?: any;
        ReactNativeWebView?: any;
        TextDecoder?: any;
        TextEncoder?: any;
        self: any;
        top: any;

        onerror: (event: string, source: any, lineno: any, colno: any, e: Error) => void;
        onunhandledrejection: (event: any) => void;

        setInterval: typeof setInterval;
        clearInterval: typeof clearInterval;
        setTimeout: typeof setTimeout;
        clearTimeout: typeof clearTimeout;
        setImmediate: typeof setImmediate;
        clearImmediate: typeof clearImmediate;
        addEventListener: Function;
        removeEventListener: Function;
    }

    interface INavigator {
        mediaDevices?: {
            getUserMedia: (constraints?: any) => Promise<MediaStream>;
        };
        product: string;
    }

    interface Storage {
        readonly length: number;
        clear(): void;
        getItem(key: string): string | null;
        key(index: number): string | null;
        removeItem(key: string): void;
        setItem(key: string, value: string): void;
    }

    interface MediaDeviceInfo {
        deviceId: string;
        groupId: string;
        kind: string;
        label: string;
    }

    interface MediaStreamTrack {
        enabled: boolean;
        stop(): void;
    }

    interface MediaStream {
        getAudioTracks(): MediaStreamTrack[];
        getTracks(): MediaStreamTrack[];
        getVideoTracks(): MediaStreamTrack[];
    }

    interface Element {
        closest?(selector: string): Element | null;
    }

    interface EventTarget {
        value?: string;
    }

    interface HTMLInputElement extends EventTarget {
        value: string;
    }

    interface HTMLVideoElement extends Element {
        onplaying: ((event?: any) => void) | null;
        play(): Promise<void>;
        srcObject: any;
        volume: number;
    }

    interface MutationObserver {
        disconnect(): void;
        observe(target: any, options?: any): void;
    }

    var MutationObserver: {
        new(callback: Function): MutationObserver;
    };

    namespace NodeJS {
        interface Timeout {}
    }

    const APP: any;
    const atob: (value: string) => string;
    const btoa: (value: string) => string;
    const document: any;
    const interfaceConfig: any;
    const localStorage: Storage;
    const navigator: INavigator;
    const sessionStorage: Storage;
    const window: IWindow;
}
