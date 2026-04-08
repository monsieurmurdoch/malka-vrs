/**
 * Twilio Voice Service for VRS calls
 * Handles outbound calling and voice session management
 */

export interface VoiceCallOptions {
    phoneNumber: string;
    interpreterId: string;
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

class TwilioVoiceService {
    private baseUrl: string;
    private listeners: Map<string, Function[]> = new Map();
    private currentCall: CallStatus = { status: 'idle' };
    private durationInterval?: ReturnType<typeof setInterval>;

    constructor() {
        // Twilio Voice Server for VRS calls
        this.baseUrl = 'http://localhost:3002';
    }

    /**
     * Initiate an outbound call to a phone number
     */
    async makeCall(options: VoiceCallOptions): Promise<boolean> {
        try {
            this.updateCallStatus({ status: 'dialing', startTime: new Date() });

            const response = await fetch(`${this.baseUrl}/api/voice/call`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phoneNumber: options.phoneNumber,
                    interpreterId: options.interpreterId,
                    sessionId: options.sessionId,
                    // This will be the webhook URL for call status updates
                    statusCallbackUrl: `${this.baseUrl}/api/voice/status`
                })
            });

            const result = await response.json();

            if (response.ok) {
                this.updateCallStatus({ 
                    status: 'ringing', 
                    callSid: result.callSid 
                });
                
                // Start polling for status updates
                this.startStatusPolling(result.callSid);
                return true;
            } else {
                this.updateCallStatus({ 
                    status: 'failed', 
                    error: result.error || 'Call failed' 
                });
                return false;
            }
        } catch (error) {
            console.error('Error making call:', error);
            this.updateCallStatus({ 
                status: 'failed', 
                error: error instanceof Error ? error.message : 'Network error' 
            });
            return false;
        }
    }

    /**
     * End the current call
     */
    async hangupCall(): Promise<void> {
        if (!this.currentCall.callSid) return;

        try {
            await fetch(`${this.baseUrl}/api/voice/hangup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ callSid: this.currentCall.callSid })
            });

            this.updateCallStatus({ status: 'ended', endTime: new Date() });
        } catch (error) {
            console.error('Error hanging up call:', error);
            this.updateCallStatus({ status: 'ended', endTime: new Date() });
        }
    }

    /**
     * Get current call status
     */
    getCallStatus(): CallStatus {
        return { ...this.currentCall };
    }

    /**
     * Get formatted call duration
     */
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

    /**
     * Start polling for call status updates
     */
    private startStatusPolling(callSid: string): void {
        const pollInterval = setInterval(async () => {
            try {
                const response = await fetch(`${this.baseUrl}/api/voice/status/${callSid}`);
                const status = await response.json();

                if (response.ok) {
                    this.handleStatusUpdate(status);

                    // Stop polling if call is ended
                    if (status.status === 'completed' || status.status === 'failed' || status.status === 'canceled') {
                        clearInterval(pollInterval);
                    }
                }
            } catch (error) {
                console.error('Error polling call status:', error);
            }
        }, 2000); // Poll every 2 seconds
    }

    /**
     * Handle status updates from Twilio
     */
    private handleStatusUpdate(twilioStatus: any): void {
        let status: CallStatus['status'] = 'idle';

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
            default:
                status = this.currentCall.status;
        }

        this.updateCallStatus({
            status,
            duration: twilioStatus.duration,
            endTime: status === 'ended' ? new Date() : undefined
        });
    }

    /**
     * Start the call duration timer
     */
    private startDurationTimer(): void {
        if (this.durationInterval) {
            clearInterval(this.durationInterval);
        }

        this.durationInterval = setInterval(() => {
            this.emit('durationUpdate', this.getCallDuration());
        }, 1000);
    }

    /**
     * Stop the call duration timer
     */
    private stopDurationTimer(): void {
        if (this.durationInterval) {
            clearInterval(this.durationInterval);
            this.durationInterval = undefined;
        }
    }

    /**
     * Update call status and notify listeners
     */
    private updateCallStatus(update: Partial<CallStatus>): void {
        this.currentCall = { ...this.currentCall, ...update };
        this.emit('statusChange', this.currentCall);
    }

    /**
     * Event emitter methods
     */
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

    /**
     * Cleanup resources
     */
    public cleanup(): void {
        this.stopDurationTimer();
        this.listeners.clear();
        if (this.currentCall.status === 'connected') {
            this.hangupCall();
        }
    }
}

// Singleton instance
export const twilioVoiceService = new TwilioVoiceService();
