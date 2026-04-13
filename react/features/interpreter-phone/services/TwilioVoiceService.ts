/**
 * Twilio Voice Service for VRS calls.
 *
 * This registers the current interpreter as a Twilio Client so the PSTN leg
 * has a stable browser/mobile identity to dial.
 */

declare var config: any;

declare global {
    interface Window {
        Twilio?: any;
    }
}

export interface VoiceCallOptions {
    phoneNumber: string;
    interpreterId?: string;
    sessionId: string;
}

export interface CallStatus {
    callSid?: string;
    status: 'idle' | 'dialing' | 'ringing' | 'connected' | 'ended' | 'failed';
    duration?: number;
    startTime?: Date;
    endTime?: Date;
    error?: string;
}

function getVRSConfig() {
    const defaults = {
        twilioVoiceUrl: 'http://localhost:3002',
        twilioClientSdkUrl: 'https://sdk.twilio.com/js/client/v1.13/twilio.min.js',
        opsApiUrl: 'http://localhost:3003/api',
        callLogging: {
            enabled: true,
            logEvents: true,
            logQuality: true
        }
    };

    if (typeof config !== 'undefined' && config.vrs) {
        return { ...defaults, ...config.vrs };
    }

    return defaults;
}

function getStoredJson<T>(key: string): T | null {
    try {
        const localRaw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
        if (localRaw) {
            if (typeof sessionStorage !== 'undefined') {
                sessionStorage.setItem(key, localRaw);
            }

            return JSON.parse(localRaw) as T;
        }

        const sessionRaw = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(key) : null;
        if (sessionRaw) {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(key, sessionRaw);
            }

            return JSON.parse(sessionRaw) as T;
        }
    } catch (error) {
        return null;
    }

    return null;
}

class TwilioVoiceService {
    private config: any;
    private listeners: Map<string, Function[]> = new Map();
    private currentCall: CallStatus = { status: 'idle' };
    private durationInterval?: ReturnType<typeof setInterval>;
    private statusPollingInterval?: ReturnType<typeof setInterval>;
    private deviceReadyPromise?: Promise<void>;
    private twilioDevice: any = null;
    private currentInterpreterIdentity: string | null = null;

    constructor() {
        this.config = getVRSConfig();
    }

    private getInterpreterIdentity(explicitIdentity?: string): string {
        if (explicitIdentity) {
            return explicitIdentity;
        }

        const storedUser = getStoredJson<{ id?: string; name?: string }>('vrs_user_info');
        const storedToken = getStoredJson<{ userId?: string }>('vrs_auth_token');

        return storedUser?.id
            || storedToken?.userId
            || (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('vrs_user_role') === 'interpreter'
                ? `interpreter-${Date.now()}`
                : `interpreter-${Date.now()}`);
    }

    private async loadTwilioSdk(): Promise<any> {
        if (typeof window === 'undefined') {
            throw new Error('Twilio browser client can only be initialized in the browser.');
        }

        if (window.Twilio?.Device) {
            return window.Twilio;
        }

        await new Promise<void>((resolve, reject) => {
            const existingScript = document.querySelector('script[data-twilio-client-sdk="true"]') as
                HTMLScriptElement | null;
            if (existingScript) {
                (existingScript as any).addEventListener('load', () => resolve(), { once: true });
                (existingScript as any).addEventListener(
                    'error',
                    () => reject(new Error('Failed to load Twilio Voice SDK.')),
                    { once: true }
                );
                return;
            }

            const script = document.createElement('script');
            script.src = this.config.twilioClientSdkUrl;
            script.async = true;
            script.dataset.twilioClientSdk = 'true';
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Failed to load Twilio Voice SDK.'));
            document.head.appendChild(script);
        });

        if (!window.Twilio?.Device) {
            throw new Error('Twilio Voice SDK loaded, but Twilio.Device is unavailable.');
        }

        return window.Twilio;
    }

    private async fetchClientToken(identity: string): Promise<string> {
        const response = await fetch(`${this.config.twilioVoiceUrl}/api/voice/token/${encodeURIComponent(identity)}`);
        const result = await response.json();

        if (!response.ok || !result.token) {
            throw new Error(result.error || 'Failed to fetch Twilio client token.');
        }

        return result.token;
    }

    private async ensureDeviceReady(identity?: string): Promise<string> {
        const interpreterIdentity = this.getInterpreterIdentity(identity);

        if (this.twilioDevice && this.currentInterpreterIdentity === interpreterIdentity) {
            return interpreterIdentity;
        }

        if (this.deviceReadyPromise && this.currentInterpreterIdentity === interpreterIdentity) {
            await this.deviceReadyPromise;
            return interpreterIdentity;
        }

        this.deviceReadyPromise = (async () => {
            const Twilio = await this.loadTwilioSdk();
            const token = await this.fetchClientToken(interpreterIdentity);

            this.currentInterpreterIdentity = interpreterIdentity;

            if (this.twilioDevice?.disconnectAll) {
                this.twilioDevice.disconnectAll();
            }

            this.twilioDevice = Twilio.Device;

            this.twilioDevice.ready(() => {
                this.emit('deviceReady', { identity: interpreterIdentity });
            });

            this.twilioDevice.error((error: any) => {
                const message = error?.message || 'Twilio browser client error';
                this.updateCallStatus({ status: 'failed', error: message });
                this.emit('deviceError', error);
            });

            this.twilioDevice.incoming((connection: any) => {
                connection.accept();
                this.updateCallStatus({
                    status: 'connected',
                    startTime: this.currentCall.startTime || new Date()
                });
                this.startDurationTimer();
            });

            this.twilioDevice.disconnect(() => {
                this.stopDurationTimer();
                this.updateCallStatus({ status: 'ended', endTime: new Date() });
            });

            this.twilioDevice.setup(token, {
                closeProtection: true,
                debug: false
            });
        })();

        await this.deviceReadyPromise;

        return interpreterIdentity;
    }

    async makeCall(options: VoiceCallOptions): Promise<boolean> {
        try {
            const interpreterIdentity = await this.ensureDeviceReady(options.interpreterId);

            this.updateCallStatus({ status: 'dialing', startTime: new Date(), error: undefined });

            const response = await fetch(`${this.config.twilioVoiceUrl}/api/voice/call`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phoneNumber: options.phoneNumber,
                    interpreterId: interpreterIdentity,
                    sessionId: options.sessionId
                })
            });

            const result = await response.json();

            if (response.ok) {
                this.updateCallStatus({
                    status: 'ringing',
                    callSid: result.callSid
                });
                this.startStatusPolling(result.callSid);
                return true;
            }

            this.updateCallStatus({
                status: 'failed',
                error: result.error || 'Call failed'
            });
            return false;
        } catch (error) {
            console.error('Error making call:', error);
            this.updateCallStatus({
                status: 'failed',
                error: error instanceof Error ? error.message : 'Network error'
            });
            return false;
        }
    }

    async hangupCall(): Promise<void> {
        if (!this.currentCall.callSid) {
            return;
        }

        try {
            await fetch(`${this.config.twilioVoiceUrl}/api/voice/hangup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ callSid: this.currentCall.callSid })
            });
        } catch (error) {
            console.error('Error hanging up call:', error);
        } finally {
            this.stopDurationTimer();
            this.stopStatusPolling();
            this.updateCallStatus({ status: 'ended', endTime: new Date() });
        }
    }

    getCallStatus(): CallStatus {
        return { ...this.currentCall };
    }

    getCallDuration(): string {
        if (!this.currentCall.startTime || this.currentCall.status !== 'connected') {
            return '';
        }

        const now = new Date();
        const duration = Math.floor((now.getTime() - this.currentCall.startTime.getTime()) / 1000);
        const minutes = Math.floor(duration / 60);
        const seconds = duration % 60;

        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    private startStatusPolling(callSid: string): void {
        this.stopStatusPolling();

        this.statusPollingInterval = setInterval(async () => {
            try {
                const response = await fetch(`${this.config.twilioVoiceUrl}/api/voice/status/${callSid}`);
                const status = await response.json();

                if (response.ok) {
                    this.handleStatusUpdate(status);

                    if (status.status === 'completed' || status.status === 'failed' || status.status === 'canceled') {
                        this.stopStatusPolling();
                    }
                }
            } catch (error) {
                console.error('Error polling call status:', error);
            }
        }, 2000);
    }

    private stopStatusPolling(): void {
        if (this.statusPollingInterval) {
            clearInterval(this.statusPollingInterval);
            this.statusPollingInterval = undefined;
        }
    }

    private handleStatusUpdate(twilioStatus: any): void {
        let status: CallStatus['status'] = this.currentCall.status;

        switch (twilioStatus.status) {
            case 'ringing':
                status = 'ringing';
                break;
            case 'in-progress':
                status = 'connected';
                if (!this.currentCall.duration) {
                    this.startDurationTimer();
                }
                break;
            case 'completed':
            case 'canceled':
            case 'failed':
                status = 'ended';
                this.stopDurationTimer();
                break;
        }

        this.updateCallStatus({
            status,
            duration: twilioStatus.duration,
            endTime: status === 'ended' ? new Date() : undefined
        });
    }

    private startDurationTimer(): void {
        if (this.durationInterval) {
            clearInterval(this.durationInterval);
        }

        this.durationInterval = setInterval(() => {
            this.emit('durationUpdate', this.getCallDuration());
        }, 1000);
    }

    private stopDurationTimer(): void {
        if (this.durationInterval) {
            clearInterval(this.durationInterval);
            this.durationInterval = undefined;
        }
    }

    private updateCallStatus(update: Partial<CallStatus>): void {
        this.currentCall = { ...this.currentCall, ...update };
        this.emit('statusChange', this.currentCall);
    }

    public on(event: string, callback: Function): void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event)!.push(callback);
    }

    public off(event: string, callback: Function): void {
        const eventListeners = this.listeners.get(event);
        if (eventListeners) {
            const index = eventListeners.indexOf(callback);
            if (index > -1) {
                eventListeners.splice(index, 1);
            }
        }
    }

    private emit(event: string, data: any): void {
        const eventListeners = this.listeners.get(event);
        if (eventListeners) {
            eventListeners.forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Error in event listener for ${event}:`, error);
                }
            });
        }
    }

    public cleanup(): void {
        this.stopDurationTimer();
        this.stopStatusPolling();
        this.listeners.clear();

        if (this.currentCall.status === 'connected') {
            void this.hangupCall();
        }
    }
}

export const twilioVoiceService = new TwilioVoiceService();
