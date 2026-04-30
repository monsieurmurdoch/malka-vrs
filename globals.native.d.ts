import { IConfig } from "./react/features/base/config/configType";

export {};

declare global {
    interface ILocation extends URL {
        assign(url: string): void;
        replace(url: string): void;
        reload(): void;
    }

    interface IWindow {
        __WHITELABEL__?: {
            tenantId?: string;
            appName?: string;
            assets?: { logo?: string; logoWhite?: string; [k: string]: string | undefined };
            features?: { [k: string]: any };
            [k: string]: any;
        };
        JITSI_MEET_LITE_SDK: boolean;
        JitsiMeetJS: any;
        Twilio?: any;
        confirm?: (message: string) => boolean;
        config: IConfig;
        crypto?: {
            subtle?: {
                importKey: (format: string, keyData: any, algorithm: any, extractable: boolean, keyUsages: string[]) => Promise<any>;
                sign: (algorithm: any, key: any, data: any) => Promise<ArrayBuffer>;
            };
        };
        document: any;
        innerHeight: number;
        innerWidth: number;
        interfaceConfig: any;
        location: ILocation;
        matchMedia?: (query: string) => { matches: boolean; addListener: Function; removeListener: Function; addEventListener: Function; removeEventListener: Function };
        open?: (url: string, target?: string, features?: string) => any;
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
        bluetooth?: any;
        mediaDevices?: {
            getUserMedia: (constraints?: any) => Promise<MediaStream>;
        };
        product: string;
        vibrate?: (pattern: number | number[]) => boolean;
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
        files?: FileList | null;
        value: string;
    }

    interface HTMLVideoElement extends Element {
        currentTime: number;
        duration: number;
        paused: boolean;
        pause(): void;
        play(): Promise<void>;
        onplaying: ((event?: any) => void) | null;
        srcObject: any;
        volume: number;
    }

    interface HTMLDivElement extends Element {
        getBoundingClientRect(): { left: number; top: number; right: number; bottom: number; width: number; height: number };
        scrollIntoView?(options?: any): void;
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
    const alert: (message?: any) => void;
    const atob: (value: string) => string;
    const BluetoothDevice: any;
    type BluetoothDevice = any;
    const btoa: (value: string) => string;
    const confirm: (message?: string) => boolean;
    const crypto: IWindow['crypto'];
    const document: any;
    const interfaceConfig: any;
    const localStorage: Storage;
    const navigator: INavigator;
    const sessionStorage: Storage;
    const TextDecoder: IWindow['TextDecoder'];
    const TextEncoder: IWindow['TextEncoder'];
    const window: IWindow;
}
