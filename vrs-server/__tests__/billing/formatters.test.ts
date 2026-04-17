/**
 * TRS Formatter Tests
 */

import { TrsFormatter } from '../../src/billing/formatters/trs-formatter';
import { CsvFormatter } from '../../src/billing/formatters/csv-formatter';
import { JsonFormatter } from '../../src/billing/formatters/json-formatter';
import type { BillingExportData } from '../../src/billing/types';

const mockExportData: BillingExportData = {
    records: [
        {
            id: 'cdr-1',
            callId: 'call-1',
            callType: 'vrs',
            callerId: 'client-1',
            interpreterId: 'interp-1',
            startTime: new Date('2025-01-15T10:00:00Z'),
            endTime: new Date('2025-01-15T10:05:00Z'),
            durationSeconds: 300,
            callerNumber: '2125551234',
            calleeNumber: '2125555678',
            language: 'ASL',
            rateTierId: 'tier-1',
            perMinuteRate: 3.5,
            totalCharge: 17.5,
            billingStatus: 'pending',
            trsSubmissionId: null,
            corporateAccountId: null,
            invoiceId: null,
            metadata: {},
            createdAt: new Date('2025-01-15T10:05:00Z'),
        },
    ],
    metadata: {
        exportDate: '2025-01-16T00:00:00Z',
        callType: 'vrs',
        periodStart: '2025-01-01',
        periodEnd: '2025-02-01',
        totalRecords: 1,
        totalCharge: 17.5,
        generatedBy: null,
    },
};

describe('TrsFormatter', () => {
    it('produces pipe-delimited output', () => {
        const formatter = new TrsFormatter();
        const output = formatter.format(mockExportData);

        expect(output).toContain('call_id|call_type|caller_number');
        expect(output).toContain('call-1|vrs|2125551234');
        expect(output).toContain('# TRS Fund Submission');
        expect(output).toContain('# Total Records: 1');
        expect(formatter.contentType).toBe('text/plain');
        expect(formatter.fileExtension).toBe('txt');
    });
});

describe('CsvFormatter', () => {
    it('produces CSV output', () => {
        const formatter = new CsvFormatter();
        const output = formatter.format(mockExportData);

        expect(output).toContain('call_id,call_type,caller_id');
        expect(output).toContain('call-1,vrs,client-1');
        expect(formatter.contentType).toBe('text/csv');
        expect(formatter.fileExtension).toBe('csv');
    });

    it('escapes commas in values', () => {
        const dataWithComma: BillingExportData = {
            ...mockExportData,
            records: [{
                ...mockExportData.records[0],
                language: 'ASL, English',
            }],
        };

        const formatter = new CsvFormatter();
        const output = formatter.format(dataWithComma);
        expect(output).toContain('"ASL, English"');
    });
});

describe('JsonFormatter', () => {
    it('produces valid JSON output', () => {
        const formatter = new JsonFormatter();
        const output = formatter.format(mockExportData);

        const parsed = JSON.parse(output);
        expect(parsed.records).toHaveLength(1);
        expect(parsed.metadata.totalRecords).toBe(1);
        expect(formatter.contentType).toBe('application/json');
        expect(formatter.fileExtension).toBe('json');
    });
});
