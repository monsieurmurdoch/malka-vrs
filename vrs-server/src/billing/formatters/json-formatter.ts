/**
 * JSON Billing Formatter
 *
 * Pretty-printed JSON export for billing data and audit reports.
 */

import type { BillingFormatter } from './formatter-interface';
import type { BillingExportData } from '../types';

export class JsonFormatter implements BillingFormatter {
    readonly contentType = 'application/json';
    readonly fileExtension = 'json';

    format(data: BillingExportData): string {
        return JSON.stringify(data, null, 2);
    }
}
