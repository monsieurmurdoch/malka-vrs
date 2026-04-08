/**
 * DeviceHandoffService
 *
 * Manages seamless device-to-device call transfers via Bluetooth proximity.
 *
 * Responsibilities:
 * - BLE scanning for companion devices (Web Bluetooth API / react-native-ble-plx)
 * - QR code fallback for browsers without Web Bluetooth
 * - Coordinating with the server handoff API (prepare/execute)
 * - Tracking handoff state and emitting events for Redux
 *
 * Flow:
 * 1. startScanning() → discovers nearby BLE devices running MalkaVRS
 * 2. User confirms transfer → initiateHandoff()
 * 3. Server creates one-time token → token sent to target via BLE/QR
 * 4. Target device receives token → receiveHandoff()
 * 5. Target joins room → confirmTrackEstablished()
 * 6. Original device leaves room gracefully
 */

declare var config: any;

// ============================================
// TYPES
// ============================================

export interface CompanionDevice {
    id: string;
    name: string;
    rssi: number;
    accountId?: string;
}

export interface HandoffProgress {
    stage: 'scanning' | 'found' | 'preparing' | 'transferring' | 'establishing' | 'completed' | 'failed';
    message: string;
    companionDevice?: CompanionDevice;
    error?: string;
}

export type HandoffEventType =
    | 'device_found'
    | 'device_lost'
    | 'handoff_started'
    | 'handoff_progress'
    | 'handoff_completed'
    | 'handoff_failed'
    | 'handoff_received'
    | 'handoff_accepted'
    | 'handoff_declined';

export type HandoffEventListener = (data: any) => void;

// ============================================
// BLE CONSTANTS
// ============================================

// Custom GATT service UUID for MalkaVRS handoff
const MALKA_VRS_SERVICE_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

// Characteristic: read → returns hashed account ID for same-account verification
const ACCOUNT_CHAR_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567891';

// Characteristic: write → receives handoff token
const HANDOFF_CHAR_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567892';

// ============================================
// CONFIG HELPER
// ============================================

interface VRSHandoffConfig {
    serverUrl: string;
    bleScanInterval: number;
}

function getHandoffConfig(): VRSHandoffConfig {
    const defaults: VRSHandoffConfig = {
        serverUrl: 'http://localhost:3001',
        bleScanInterval: 5000
    };

    if (typeof config !== 'undefined' && config.vrs) {
        return { ...defaults, ...config.vrs };
    }

    return defaults;
}

// ============================================
// PLATFORM DETECTION
// ============================================

function isWebBluetoothSupported(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.bluetooth === 'object';
}

function isReactNative(): boolean {
    return typeof navigator !== 'undefined' && navigator.product === 'ReactNative';
}

function getStoredAccountId(): string | null {
    try {
        if (typeof sessionStorage === 'undefined') {
            return null;
        }
        const userInfo = sessionStorage.getItem('vrs_user_info');
        if (!userInfo) {
            return null;
        }
        const parsed = JSON.parse(userInfo);

        return parsed?.id || null;
    } catch {
        return null;
    }
}

function getStoredUserId(): string | null {
    try {
        if (typeof sessionStorage === 'undefined') {
            return null;
        }
        const userInfo = sessionStorage.getItem('vrs_user_info');

        return userInfo ? JSON.parse(userInfo)?.id : null;
    } catch {
        return null;
    }
}

// ============================================
// SERVICE
// ============================================

class DeviceHandoffService {
    private listeners: Map<HandoffEventType, HandoffEventListener[]> = new Map();
    private scanning = false;
    private handoffInProgress = false;
    private currentHandoffToken: string | null = null;
    private companionDevices: Map<string, CompanionDevice> = new Map();
    private scanInterval: ReturnType<typeof setInterval> | null = null;
    private bleDevice: BluetoothDevice | null = null;
    private config: VRSHandoffConfig;
    private userId: string | null = null;
    private deviceId: string;

    // React Native BLE Manager (lazy-loaded)
    private rnBleManager: any = null;

    constructor() {
        this.config = getHandoffConfig();
        this.userId = getStoredUserId();
        this.deviceId = this.generateDeviceId();

        if (isReactNative()) {
            this.initReactNativeBLE();
        }
    }

    private generateDeviceId(): string {
        let id = typeof sessionStorage !== 'undefined'
            ? sessionStorage.getItem('malka_device_id')
            : null;

        if (!id) {
            id = `device-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
            if (typeof sessionStorage !== 'undefined') {
                sessionStorage.setItem('malka_device_id', id);
            }
        }

        return id;
    }

    private async initReactNativeBLE() {
        try {
            const { BleManager } = require('react-native-ble-plx');
            this.rnBleManager = new BleManager();
        } catch {
            console.warn('[DeviceHandoff] react-native-ble-plx not available');
        }
    }

    // ============================================
    // EVENT SYSTEM
    // ============================================

    on(event: HandoffEventType, callback: HandoffEventListener) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event)!.push(callback);
    }

    off(event: HandoffEventType, callback: HandoffEventListener) {
        const eventListeners = this.listeners.get(event);
        if (eventListeners) {
            const index = eventListeners.indexOf(callback);
            if (index > -1) {
                eventListeners.splice(index, 1);
            }
        }
    }

    private emit(event: HandoffEventType, data?: any) {
        const eventListeners = this.listeners.get(event);
        if (eventListeners) {
            eventListeners.forEach(cb => {
                try {
                    cb(data);
                } catch (error) {
                    console.error(`[DeviceHandoff] Error in listener for ${event}:`, error);
                }
            });
        }
    }

    // ============================================
    // SCANNING (Web Bluetooth)
    // ============================================

    /**
     * Start scanning for companion devices via BLE.
     * On web, uses the Web Bluetooth API (Chrome/Edge).
     * On mobile, uses react-native-ble-plx.
     */
    async startScanning() {
        if (this.scanning) {
            return;
        }

        if (!this.userId) {
            console.warn('[DeviceHandoff] Cannot scan without a userId');
            return;
        }

        this.scanning = true;
        this.emit('handoff_progress', {
            stage: 'scanning',
            message: 'Scanning for nearby devices...'
        } as HandoffProgress);

        if (isReactNative()) {
            this.startNativeScanning();
        } else if (isWebBluetoothSupported()) {
            // Web Bluetooth doesn't support background scanning —
            // we rely on periodic checks and device discovery via requestDevice.
            // Start periodic scan attempts.
            this.scanInterval = setInterval(() => {
                this.checkForCompanions();
            }, this.config.bleScanInterval);
        } else {
            console.info('[DeviceHandoff] BLE not supported — use QR code fallback');
            this.scanning = false;
        }
    }

    /**
     * Stop scanning for companion devices.
     */
    stopScanning() {
        this.scanning = false;

        if (this.scanInterval) {
            clearInterval(this.scanInterval);
            this.scanInterval = null;
        }

        if (this.rnBleManager) {
            this.rnBleManager.stopDeviceScan();
        }
    }

    /**
     * Web Bluetooth: attempt to discover a companion device.
     * Note: Web Bluetooth requires user gesture for requestDevice(),
     * so this is a best-effort check using cached/connected devices.
     */
    private async checkForCompanions() {
        if (!this.scanning || !navigator.bluetooth) {
            return;
        }

        try {
            // Use getDevices() if available (Chrome 96+) to get previously paired devices
            if (typeof navigator.bluetooth.getDevices === 'function') {
                const devices = await navigator.bluetooth.getDevices();
                for (const device of devices) {
                    if (device.name && device.name.startsWith('MalkaVRS')) {
                        const companion: CompanionDevice = {
                            id: device.id,
                            name: device.name,
                            rssi: -50 // RSSI not available via getDevices, estimate
                        };
                        this.addCompanionDevice(companion);
                    }
                }
            }
        } catch {
            // Silently ignore — BLE scanning is opportunistic
        }
    }

    /**
     * Prompt user to select a BLE device (requires user gesture on web).
     * Call this from a button click handler.
     */
    async requestCompanionDevice(): Promise<CompanionDevice | null> {
        if (!isWebBluetoothSupported()) {
            console.warn('[DeviceHandoff] Web Bluetooth not supported');

            return null;
        }

        try {
            const device = await navigator.bluetooth.requestDevice({
                filters: [{ services: [MALKA_VRS_SERVICE_UUID] }],
                optionalServices: [ACCOUNT_CHAR_UUID, HANDOFF_CHAR_UUID]
            });

            this.bleDevice = device;

            const companion: CompanionDevice = {
                id: device.id,
                name: device.name || 'Unknown Device',
                rssi: -40 // nearby since user selected it
            };

            // Verify same account
            const sameAccount = await this.verifySameAccount(device);
            if (!sameAccount) {
                console.warn('[DeviceHandoff] Device is logged into a different account');

                return null;
            }

            this.addCompanionDevice(companion);

            return companion;
        } catch (error: any) {
            if (error.name === 'NotFoundError') {
                // User cancelled the picker
                return null;
            }
            console.error('[DeviceHandoff] Error requesting device:', error);

            return null;
        }
    }

    private async verifySameAccount(device: BluetoothDevice): Promise<boolean> {
        try {
            const server = await device.gatt?.connect();
            if (!server) {
                return false;
            }

            const service = await server.getPrimaryService(MALKA_VRS_SERVICE_UUID);
            const char = await service.getCharacteristic(ACCOUNT_CHAR_UUID);
            const value = await char.readValue();
            const decoder = new TextDecoder();
            const remoteAccountId = decoder.decode(value);
            const localAccountId = getStoredAccountId();

            // Disconnect after reading
            device.gatt?.disconnect();

            return localAccountId !== null && remoteAccountId === localAccountId;
        } catch (error) {
            console.warn('[DeviceHandoff] Could not verify account:', error);

            return false;
        }
    }

    // ============================================
    // SCANNING (React Native)
    // ============================================

    private startNativeScanning() {
        if (!this.rnBleManager) {
            return;
        }

        this.rnBleManager.startDeviceScan(
            [MALKA_VRS_SERVICE_UUID],
            null,
            (error: any, device: any) => {
                if (error) {
                    console.error('[DeviceHandoff] BLE scan error:', error);
                    return;
                }

                if (device && device.name && device.name.startsWith('MalkaVRS')) {
                    const companion: CompanionDevice = {
                        id: device.id,
                        name: device.name,
                        rssi: device.rssi || -100
                    };
                    this.addCompanionDevice(companion);
                }
            }
        );
    }

    private addCompanionDevice(device: CompanionDevice) {
        const isNew = !this.companionDevices.has(device.id);
        this.companionDevices.set(device.id, device);

        if (isNew) {
            console.log(`[DeviceHandoff] Companion found: ${device.name} (${device.id})`);
            this.emit('device_found', device);
        }
    }

    // ============================================
    // HANDOFF INITIATION (sending device)
    // ============================================

    /**
     * Initiate a handoff to the specified companion device.
     * Called by the user on the sending device.
     */
    async initiateHandoff(companionDevice: CompanionDevice): Promise<HandoffProgress> {
        if (this.handoffInProgress) {
            return {
                stage: 'failed',
                message: 'Handoff already in progress'
            };
        }

        if (!this.userId) {
            return {
                stage: 'failed',
                message: 'No user ID — cannot initiate handoff'
            };
        }

        this.handoffInProgress = true;
        this.emit('handoff_started', { companionDevice });
        this.emit('handoff_progress', {
            stage: 'preparing',
            message: 'Preparing handoff...',
            companionDevice
        } as HandoffProgress);

        try {
            // Step 1: Ask the server to create a one-time handoff token
            const prepareResult = await this.callServer('POST', '/api/handoff/prepare', {
                userId: this.userId,
                targetDeviceId: companionDevice.id
            });

            if (!prepareResult || prepareResult.error) {
                throw new Error(prepareResult?.error || 'Failed to prepare handoff');
            }

            this.currentHandoffToken = prepareResult.token;

            this.emit('handoff_progress', {
                stage: 'transferring',
                message: 'Sending to target device...',
                companionDevice
            } as HandoffProgress);

            // Step 2: Send the token to the companion device
            const sent = await this.sendTokenToCompanion(companionDevice, prepareResult.token);

            if (!sent) {
                // Fallback: return QR code data
                console.log('[DeviceHandoff] BLE send failed — use QR fallback');

                return {
                    stage: 'transferring',
                    message: 'Scan QR code on target device',
                    companionDevice,
                    error: 'BLE transfer not available — use QR code'
                };
            }

            return {
                stage: 'transferring',
                message: 'Token sent to target device',
                companionDevice
            };
        } catch (error: any) {
            this.handoffInProgress = false;
            const progress: HandoffProgress = {
                stage: 'failed',
                message: error.message || 'Handoff failed',
                error: error.message
            };
            this.emit('handoff_failed', progress);
            this.emit('handoff_progress', progress);

            return progress;
        }
    }

    /**
     * Send the handoff token to a companion device via BLE.
     */
    private async sendTokenToCompanion(companion: CompanionDevice, token: string): Promise<boolean> {
        if (isReactNative() && this.rnBleManager) {
            return this.sendTokenNative(companion.id, token);
        }

        if (isWebBluetoothSupported() && this.bleDevice) {
            return this.sendTokenWebBluetooth(token);
        }

        return false;
    }

    private async sendTokenWebBluetooth(token: string): Promise<boolean> {
        try {
            const server = await this.bleDevice?.gatt?.connect();
            if (!server) {
                return false;
            }

            const service = await server.getPrimaryService(MALKA_VRS_SERVICE_UUID);
            const char = await service.getCharacteristic(HANDOFF_CHAR_UUID);
            const encoder = new TextEncoder();
            await char.writeValue(encoder.encode(token));

            this.bleDevice?.gatt?.disconnect();

            return true;
        } catch (error) {
            console.error('[DeviceHandoff] BLE write failed:', error);

            return false;
        }
    }

    private async sendTokenNative(deviceId: string, token: string): Promise<boolean> {
        try {
            const device = await this.rnBleManager.connectToDevice(deviceId);
            await device.discoverAllServicesAndCharacteristics();

            await device.writeCharacteristicWithResponseForService(
                MALKA_VRS_SERVICE_UUID,
                HANDOFF_CHAR_UUID,
                btoa(token)
            );

            await this.rnBleManager.cancelDeviceConnection(deviceId);

            return true;
        } catch (error) {
            console.error('[DeviceHandoff] Native BLE write failed:', error);

            return false;
        }
    }

    // ============================================
    // HANDOFF RECEPTION (receiving device)
    // ============================================

    /**
     * Called when this device receives a handoff token
     * (either via BLE characteristic write, QR scan, or WebSocket).
     */
    async receiveHandoff(token: string): Promise<HandoffProgress> {
        this.emit('handoff_received', { token });

        return {
            stage: 'found',
            message: 'Handoff token received'
        };
    }

    /**
     * Accept a handoff by redeeming the token on the server and getting room info.
     */
    async acceptHandoff(token: string): Promise<{
        roomName: string;
        interpreterId: string | null;
        userId: string;
        fromDeviceId: string;
    } | HandoffProgress> {
        try {
            this.emit('handoff_progress', {
                stage: 'establishing',
                message: 'Joining call on this device...'
            } as HandoffProgress);

            const result = await this.callServer('POST', '/api/handoff/execute', {
                token,
                newDeviceId: this.deviceId
            });

            if (!result || result.error) {
                throw new Error(result?.error || 'Failed to execute handoff');
            }

            this.emit('handoff_accepted', result);
            this.emit('handoff_progress', {
                stage: 'establishing',
                message: `Joining room ${result.roomName}...`
            } as HandoffProgress);

            return result;
        } catch (error: any) {
            const progress: HandoffProgress = {
                stage: 'failed',
                message: error.message || 'Handoff acceptance failed',
                error: error.message
            };
            this.emit('handoff_failed', progress);
            this.emit('handoff_progress', progress);

            return progress;
        }
    }

    /**
     * Decline a handoff offer.
     */
    declineHandoff(token: string) {
        this.emit('handoff_declined', { token });
    }

    // ============================================
    // HANDOFF COMPLETION
    // ============================================

    /**
     * Confirm that the receiving device's video track is established.
     * Signals to the sending device that it's safe to leave.
     */
    async confirmTrackEstablished(roomName: string) {
        this.handoffInProgress = false;
        this.currentHandoffToken = null;

        this.emit('handoff_completed', { roomName });
        this.emit('handoff_progress', {
            stage: 'completed',
            message: 'Call transferred successfully'
        } as HandoffProgress);
    }

    // ============================================
    // QR CODE HELPERS
    // ============================================

    /**
     * Generate a URL that can be encoded as a QR code for the receiving device.
     */
    getHandoffQRData(): string | null {
        if (!this.currentHandoffToken) {
            return null;
        }

        return `${this.config.serverUrl}/handoff/${this.currentHandoffToken}`;
    }

    /**
     * Parse a handoff token from a QR code URL.
     */
    static parseHandoffUrl(url: string): string | null {
        try {
            const parsed = new URL(url);
            const match = parsed.pathname.match(/^\/handoff\/([a-f0-9]+)$/);

            return match ? match[1] : null;
        } catch {
            return null;
        }
    }

    // ============================================
    // SERVER COMMUNICATION
    // ============================================

    private async callServer(method: string, path: string, body?: any): Promise<any> {
        const url = `${this.config.serverUrl}${path}`;

        const options: RequestInit = {
            method,
            headers: { 'Content-Type': 'application/json' }
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        const response = await fetch(url, options);

        return response.json();
    }

    // ============================================
    // GETTERS
    // ============================================

    isScanning(): boolean {
        return this.scanning;
    }

    isHandoffInProgress(): boolean {
        return this.handoffInProgress;
    }

    getCompanionDevices(): CompanionDevice[] {
        return Array.from(this.companionDevices.values());
    }

    getDeviceId(): string {
        return this.deviceId;
    }

    getCurrentToken(): string | null {
        return this.currentHandoffToken;
    }

    isBleSupported(): boolean {
        return isReactNative() ? Boolean(this.rnBleManager) : isWebBluetoothSupported();
    }

    // ============================================
    // CLEANUP
    // ============================================

    disconnect() {
        this.stopScanning();
        this.handoffInProgress = false;
        this.currentHandoffToken = null;
        this.companionDevices.clear();
        this.bleDevice = null;

        if (this.rnBleManager) {
            this.rnBleManager.destroy();
            this.rnBleManager = null;
        }

        this.listeners.clear();
    }
}

// ============================================
// SINGLETON
// ============================================

const isBrowser = typeof window !== 'undefined';
let _instance: DeviceHandoffService | null = null;

function getInstance(): DeviceHandoffService | null {
    if (!isBrowser) {
        return null;
    }

    if (!_instance) {
        _instance = new DeviceHandoffService();
    }

    return _instance;
}

export const handoffService = {
    get instance(): DeviceHandoffService {
        return getInstance() as DeviceHandoffService;
    },
    on: (...args: Parameters<DeviceHandoffService['on']>) => getInstance()?.on(...args),
    off: (...args: Parameters<DeviceHandoffService['off']>) => getInstance()?.off(...args),
    startScanning: (...args: Parameters<DeviceHandoffService['startScanning']>) =>
        getInstance()?.startScanning(...args),
    stopScanning: () => getInstance()?.stopScanning(),
    requestCompanionDevice: (...args: Parameters<DeviceHandoffService['requestCompanionDevice']>) =>
        getInstance()?.requestCompanionDevice(...args),
    initiateHandoff: (...args: Parameters<DeviceHandoffService['initiateHandoff']>) =>
        getInstance()?.initiateHandoff(...args),
    receiveHandoff: (...args: Parameters<DeviceHandoffService['receiveHandoff']>) =>
        getInstance()?.receiveHandoff(...args),
    acceptHandoff: (...args: Parameters<DeviceHandoffService['acceptHandoff']>) =>
        getInstance()?.acceptHandoff(...args),
    declineHandoff: (...args: Parameters<DeviceHandoffService['declineHandoff']>) =>
        getInstance()?.declineHandoff(...args),
    confirmTrackEstablished: (...args: Parameters<DeviceHandoffService['confirmTrackEstablished']>) =>
        getInstance()?.confirmTrackEstablished(...args),
    getHandoffQRData: () => getInstance()?.getHandoffQRData(),
    isScanning: () => Boolean(getInstance()?.isScanning()),
    isHandoffInProgress: () => Boolean(getInstance()?.isHandoffInProgress()),
    getCompanionDevices: () => getInstance()?.getCompanionDevices() || [],
    getDeviceId: () => getInstance()?.getDeviceId() || '',
    isBleSupported: () => Boolean(getInstance()?.isBleSupported()),
    disconnect: () => getInstance()?.disconnect(),
    parseHandoffUrl: DeviceHandoffService.parseHandoffUrl
};

export default DeviceHandoffService;
