import { IStore } from "./react/features/app/types";
import { IConfig } from "./react/features/base/config/configType";

export {};

declare global {
    const APP: {
        store: IStore;
        UI: any;
        API: any;
        conference: any;
        debugLogs: any;
    };
    const interfaceConfig: any;

    interface Window {
        config: IConfig;
        JITSI_MEET_LITE_SDK?: boolean;
        interfaceConfig?: any;
        JitsiMeetJS?: any;
        JitsiMeetElectron?: any;
        PressureObserver?: any;
        PressureRecord?: any;
        ReactNativeWebView?: any;
        // selenium tests handler
        _sharedVideoPlayer: any;
        alwaysOnTop: { api: any };
    }

    interface Document {
        mozCancelFullScreen?: Function;
        webkitExitFullscreen?: Function;
    }

    const config: IConfig;

    const JitsiMeetJS: any;

    interface HTMLMediaElement {
        setSinkId: (id: string) => Promise<undefined>;
        stop: () => void;
    }

    // ── Web Bluetooth API ────────────────────────────────
    // Needed by DeviceHandoffService for BLE-based call transfer.

    type BluetoothServiceUUID = string | number;
    type BluetoothCharacteristicUUID = string | number;

    interface BluetoothRequestDeviceFilter {
        services?: BluetoothServiceUUID[];
        name?: string;
        namePrefix?: string;
    }

    interface RequestDeviceOptions {
        filters?: BluetoothRequestDeviceFilter[];
        optionalServices?: BluetoothServiceUUID[];
        acceptAllDevices?: boolean;
    }

    interface BluetoothRemoteGATTCharacteristic {
        readonly value: DataView | null;
        readValue(): Promise<DataView>;
        writeValue(value: BufferSource): Promise<void>;
    }

    interface BluetoothRemoteGATTService {
        getCharacteristic(characteristic: BluetoothCharacteristicUUID): Promise<BluetoothRemoteGATTCharacteristic>;
        getCharacteristics(characteristic?: BluetoothCharacteristicUUID): Promise<BluetoothRemoteGATTCharacteristic[]>;
    }

    interface BluetoothRemoteGATTServer {
        readonly connected: boolean;
        connect(): Promise<BluetoothRemoteGATTServer>;
        disconnect(): void;
        getPrimaryService(service: BluetoothServiceUUID): Promise<BluetoothRemoteGATTService>;
        getPrimaryServices(service?: BluetoothServiceUUID): Promise<BluetoothRemoteGATTService[]>;
    }

    interface BluetoothDevice extends EventTarget {
        readonly id: string;
        readonly name?: string;
        readonly gatt?: BluetoothRemoteGATTServer;
        forget(): Promise<void>;
    }

    interface Bluetooth extends EventTarget {
        getDevices(): Promise<BluetoothDevice[]>;
        requestDevice(options?: RequestDeviceOptions): Promise<BluetoothDevice>;
    }

    interface Navigator {
        readonly bluetooth?: Bluetooth;
    }
}
