/**
 * Mobile Structured Logging Utility.
 *
 * Provides a structured JSON logger for mobile observability.
 * Logs are written to persistent storage and can be flushed to
 * the backend for debugging and analytics.
 *
 * Levels: debug, info, warn, error
 * Each log entry includes: timestamp, level, event, payload, sessionId, platform
 */

import { Platform } from 'react-native';

import { apiClient } from '../../shared/api-client';
import { getPersistentJson, setPersistentItem } from '../../vrs-auth/storage';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
    timestamp: string;
    level: LogLevel;
    event: string;
    payload?: Record<string, unknown>;
    sessionId?: string;
    platform: string;
}

const LOG_STORAGE_KEY = 'vrs_mobile_logs';
const MAX_LOG_ENTRIES = 500;

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
};

let minLogLevel: LogLevel = __DEV__ ? 'debug' : 'info';

const getSessionId = (): string => {
    const stored = getPersistentJson<{ sessionId: string; createdAt: string }>('vrs_session');

    if (stored?.sessionId) {
        return stored.sessionId;
    }

    const newSession = {
        sessionId: `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: new Date().toISOString()
    };

    setPersistentItem('vrs_session', JSON.stringify(newSession));

    return newSession.sessionId;
};

const getStoredLogs = (): LogEntry[] =>
    getPersistentJson<LogEntry[]>(LOG_STORAGE_KEY) || [];

const persistLogs = (logs: LogEntry[]) => {
    const trimmed = logs.slice(-MAX_LOG_ENTRIES);

    setPersistentItem(LOG_STORAGE_KEY, JSON.stringify(trimmed));
};

const mobileLog = (
        level: LogLevel,
        event: string,
        payload?: Record<string, unknown>,
        options?: { console?: boolean; }) => {
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[minLogLevel]) {
        return;
    }

    const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level,
        event,
        payload,
        sessionId: getSessionId(),
        platform: Platform.OS
    };

    // Console output for development
    if (__DEV__ && options?.console !== false) {
        const prefix = `[mobile:${level}]`;
        const tag = event;

        switch (level) {
        case 'error':
            if (Platform.OS === 'web') {
                console.error(prefix, tag, payload);
            } else {
                console.warn(prefix, tag, payload);
            }
            break;
        case 'warn':
            console.warn(prefix, tag, payload);
            break;
        default:
            console.log(prefix, tag, payload);
        }
    }

    // Persist to storage
    const logs = getStoredLogs();

    logs.push(entry);
    persistLogs(logs);
};

export const setMinLogLevel = (level: LogLevel) => {
    minLogLevel = level;
};

export const getMobileLogs = (options?: {
    level?: LogLevel;
    event?: string;
    limit?: number;
}): LogEntry[] => {
    let logs = getStoredLogs();

    if (options?.level) {
        const minPriority = LOG_LEVEL_PRIORITY[options.level];

        logs = logs.filter(l => LOG_LEVEL_PRIORITY[l.level] >= minPriority);
    }

    if (options?.event) {
        logs = logs.filter(l => l.event === options!.event);
    }

    if (options?.limit) {
        logs = logs.slice(-options.limit);
    }

    return logs;
};

export const clearMobileLogs = () => {
    setPersistentItem(LOG_STORAGE_KEY, JSON.stringify([]));
};

export const flushLogs = (): LogEntry[] => {
    const logs = getStoredLogs();

    clearMobileLogs();

    return logs;
};

export const flushMobileLogsToBackend = async (): Promise<{ sent: number; error?: string }> => {
    const logs = getStoredLogs();

    if (logs.length === 0) {
        return { sent: 0 };
    }

    const response = await apiClient.post<{ accepted?: number }>('/api/mobile/logs', { logs });

    if (response.error) {
        return { sent: 0, error: response.error };
    }

    clearMobileLogs();

    return { sent: response.data?.accepted || logs.length };
};

export { mobileLog };
export type { LogEntry, LogLevel };
