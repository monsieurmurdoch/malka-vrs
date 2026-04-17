/**
 * TRS Fund Submission Formatter
 *
 * Produces a pipe-delimited TRS Fund submission format.
 * Column order and field formatting follow general TRS administrator
 * requirements. Can be adapted to specific administrator specs by
 * extending this formatter.
 */

import type { BillingFormatter } from './formatter-interface';
import type { BillingExportData } from '../types';

export class TrsFormatter implements BillingFormatter {
    readonly contentType = 'text/plain';
    readonly fileExtension = 'txt';

    format(data: BillingExportData): string {
        const lines: string[] = [];

        // Header row
        lines.push([
            'call_id',
            'call_type',
            'caller_number',
            'callee_number',
            'start_time',
            'end_time',
            'duration_seconds',
            'per_minute_rate',
            'total_charge',
            'language',
            'billing_status',
        ].join('|'));

        // Data rows
        for (const cdr of data.records) {
            lines.push([
                cdr.callId,
                cdr.callType,
                cdr.callerNumber || '',
                cdr.calleeNumber || '',
                cdr.startTime.toISOString(),
                cdr.endTime.toISOString(),
                cdr.durationSeconds,
                cdr.perMinuteRate.toFixed(4),
                cdr.totalCharge.toFixed(2),
                cdr.language || '',
                cdr.billingStatus,
            ].join('|'));
        }

        // Trailer with metadata
        lines.push('');
        lines.push(`# TRS Fund Submission`);
        lines.push(`# Period: ${data.metadata.periodStart} to ${data.metadata.periodEnd}`);
        lines.push(`# Generated: ${data.metadata.exportDate}`);
        lines.push(`# Total Records: ${data.metadata.totalRecords}`);
        lines.push(`# Total Charge: ${data.metadata.totalCharge.toFixed(2)}`);

        return lines.join('\n');
    }
}
