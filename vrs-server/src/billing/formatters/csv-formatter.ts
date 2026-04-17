/**
 * CSV Billing Formatter
 *
 * Generic CSV export for billing data.
 */

import type { BillingFormatter } from './formatter-interface';
import type { BillingExportData } from '../types';

export class CsvFormatter implements BillingFormatter {
    readonly contentType = 'text/csv';
    readonly fileExtension = 'csv';

    format(data: BillingExportData): string {
        const lines: string[] = [];

        // Header
        lines.push([
            'call_id', 'call_type', 'caller_id', 'interpreter_id',
            'caller_number', 'callee_number', 'start_time', 'end_time',
            'duration_seconds', 'language', 'per_minute_rate', 'total_charge',
            'billing_status', 'corporate_account_id',
        ].join(','));

        // Rows
        for (const cdr of data.records) {
            lines.push([
                csvEscape(cdr.callId),
                csvEscape(cdr.callType),
                csvEscape(cdr.callerId || ''),
                csvEscape(cdr.interpreterId || ''),
                csvEscape(cdr.callerNumber || ''),
                csvEscape(cdr.calleeNumber || ''),
                cdr.startTime.toISOString(),
                cdr.endTime.toISOString(),
                cdr.durationSeconds,
                csvEscape(cdr.language || ''),
                cdr.perMinuteRate.toFixed(4),
                cdr.totalCharge.toFixed(2),
                csvEscape(cdr.billingStatus),
                csvEscape(cdr.corporateAccountId || ''),
            ].join(','));
        }

        return lines.join('\n');
    }
}

function csvEscape(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}
