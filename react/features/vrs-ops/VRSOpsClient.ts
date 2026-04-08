/**
 * VRS Ops API Client
 *
 * Client for communicating with the VRS Ops backend.
 * Handles call logging, tracking, and live dashboard data.
 */

// Config will be loaded from Jitsi's config
declare var config: any;

export interface CallLog {
    id: string;
    roomId: string;
    clientId: string;
    clientName: string;
    interpreterId?: string;
    interpreterName?: string;
    language: string;
    status: string;
    requestedAt: Date;
    startedAt?: Date;
    endedAt?: Date;
    duration?: number;
    waitTime?: number;
}

export interface InterpreterInfo {
    id: string;
    name: string;
    status: 'offline' | 'available' | 'busy' | 'break' | 'away';
    languages: string[];
    totalCallsToday: number;
    totalMinutesToday: number;
    currentCallId?: string;
}

export interface QueueStats {
    pendingRequests: number;
    activeInterpreters: number;
    availableInterpreters: number;
    averageWaitTime: number;
    longestWaitTime: number;
}

export interface LiveDashboard {
    timestamp: Date;
    interpreters: {
        total: number;
        online: number;
        available: number;
        busy: number;
        onBreak: number;
    };
    queue: {
        pending: number;
        averageWait: number;
    };
    calls: {
        active: number;
        list: Array<{
            id: string;
            clientName: string;
            interpreterName: string;
            language: string;
            duration: number;
        }>;
    };
}

/**
 * Get VRS configuration from Jitsi config
 */
function getVRSConfig() {
    const defaults = {
        opsApiUrl: 'http://localhost:3003/api',
        callLogging: { enabled: true }
    };

    if (typeof config !== 'undefined' && config.vrs) {
        return { ...defaults, ...config.vrs };
    }

    return defaults;
}

export class VRSOpsClient {
    private config: any;
    private ws: WebSocket | null = null;
    private listeners: Map<string, Function[]> = new Map();
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;

    constructor() {
        this.config = getVRSConfig();
    }

    // ==================== Authentication ====================

    private getAuthToken(): string | null {
        if (typeof sessionStorage === 'undefined') return null;
        const tokenStr = sessionStorage.getItem('vrs_auth_token');
        if (!tokenStr) return null;
        try {
            const token = JSON.parse(tokenStr);
            return token.token;
        } catch {
            return null;
        }
    }

    private getHeaders(): Record<string, string> {
        const token = this.getAuthToken();
        const headers: Record<string, string> = {
            'Content-Type': 'application/json'
        };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        return headers;
    }

    // ==================== Call Logging ====================

    /**
     * Log a new call request
     */
    async logCallRequest(data: {
        clientId: string;
        clientName: string;
        language: string;
        roomId?: string;
    }): Promise<CallLog | null> {
        if (!this.config.callLogging?.enabled) return null;

        try {
            const response = await fetch(`${this.config.opsApiUrl}/calls`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify(data)
            });

            if (!response.ok) {
                console.error('Failed to log call request:', await response.text());
                return null;
            }

            return await response.json();
        } catch (error) {
            console.error('Error logging call request:', error);
            return null;
        }
    }

    /**
     * Update call status
     */
    async updateCallStatus(callId: string, updates: Partial<CallLog>): Promise<CallLog | null> {
        if (!this.config.callLogging?.enabled) return null;

        try {
            const response = await fetch(`${this.config.opsApiUrl}/calls/${callId}`, {
                method: 'PATCH',
                headers: this.getHeaders(),
                body: JSON.stringify(updates)
            });

            if (!response.ok) {
                console.error('Failed to update call status:', await response.text());
                return null;
            }

            return await response.json();
        } catch (error) {
            console.error('Error updating call status:', error);
            return null;
        }
    }

    /**
     * Get call history
     */
    async getCallHistory(filters?: {
        status?: string;
        date?: string;
        interpreterId?: string;
        limit?: number;
    }): Promise<CallLog[]> {
        try {
            const params = new URLSearchParams();
            if (filters?.status) params.set('status', filters.status);
            if (filters?.date) params.set('date', filters.date);
            if (filters?.interpreterId) params.set('interpreterId', filters.interpreterId);
            if (filters?.limit) params.set('limit', filters.limit.toString());

            const url = `${this.config.opsApiUrl}/calls?${params.toString()}`;
            const response = await fetch(url, {
                headers: this.getHeaders()
            });

            if (!response.ok) {
                console.error('Failed to get call history:', await response.text());
                return [];
            }

            return await response.json();
        } catch (error) {
            console.error('Error getting call history:', error);
            return [];
        }
    }

    // ==================== Dashboard ====================

    /**
     * Get queue statistics
     */
    async getQueueStats(): Promise<QueueStats | null> {
        try {
            const response = await fetch(`${this.config.opsApiUrl}/dashboard/queue`, {
                headers: this.getHeaders()
            });

            if (!response.ok) {
                return null;
            }

            return await response.json();
        } catch (error) {
            console.error('Error getting queue stats:', error);
            return null;
        }
    }

    /**
     * Get live dashboard data
     */
    async getLiveDashboard(): Promise<LiveDashboard | null> {
        try {
            const response = await fetch(`${this.config.opsApiUrl}/dashboard/live`, {
                headers: this.getHeaders()
            });

            if (!response.ok) {
                return null;
            }

            return await response.json();
        } catch (error) {
            console.error('Error getting live dashboard:', error);
            return null;
        }
    }

    /**
     * Get interpreter list
     */
    async getInterpreters(status?: string): Promise<InterpreterInfo[]> {
        try {
            const params = status ? `?status=${status}` : '';
            const response = await fetch(`${this.config.opsApiUrl}/interpreters${params}`, {
                headers: this.getHeaders()
            });

            if (!response.ok) {
                return [];
            }

            return await response.json();
        } catch (error) {
            console.error('Error getting interpreters:', error);
            return [];
        }
    }

    /**
     * Update interpreter status
     */
    async updateInterpreterStatus(interpreterId: string, status: string): Promise<void> {
        try {
            await fetch(`${this.config.opsApiUrl}/interpreters/${interpreterId}/status`, {
                method: 'PATCH',
                headers: this.getHeaders(),
                body: JSON.stringify({ status })
            });
        } catch (error) {
            console.error('Error updating interpreter status:', error);
        }
    }

    // ==================== WebSocket ====================

    /**
     * Connect to WebSocket for live updates
     */
    connectWebSocket(): void {
        if (this.ws) return;

        const wsUrl = this.config.opsApiUrl.replace('/api', '/ws').replace('http', 'ws');

        try {
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                console.log('Connected to VRS Ops WebSocket');
                this.reconnectAttempts = 0;
                this.emit('ws:connected', {});
            };

            this.ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    this.emit(`event:${message.type}`, message.data);
                    this.emit('ws:message', message);
                } catch (error) {
                    console.error('Error parsing WebSocket message:', error);
                }
            };

            this.ws.onclose = () => {
                console.log('Disconnected from VRS Ops WebSocket');
                this.ws = null;
                this.emit('ws:disconnected', {});
                this.attemptReconnect();
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.emit('ws:error', error);
            };
        } catch (error) {
            console.error('Failed to connect WebSocket:', error);
        }
    }

    /**
     * Disconnect WebSocket
     */
    disconnectWebSocket(): void {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    private attemptReconnect(): void {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) return;

        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

        setTimeout(() => {
            this.connectWebSocket();
        }, delay);
    }

    // ==================== Event Emitter ====================

    on(event: string, callback: Function): void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event)!.push(callback);
    }

    off(event: string, callback: Function): void {
        const callbacks = this.listeners.get(event);
        if (callbacks) {
            const index = callbacks.indexOf(callback);
            if (index !== -1) {
                callbacks.splice(index, 1);
            }
        }
    }

    private emit(event: string, data: any): void {
        const callbacks = this.listeners.get(event);
        if (callbacks) {
            callbacks.forEach(cb => {
                try {
                    cb(data);
                } catch (error) {
                    console.error(`Error in event listener for ${event}:`, error);
                }
            });
        }
    }
}

// Singleton instance
export const vrsOpsClient = new VRSOpsClient();

export default vrsOpsClient;
