/**
 * Billing Formatter Interface
 *
 * Defines the contract for export formatters used to produce
 * TRS Fund submissions, CSV exports, and other billing reports.
 */

import type { BillingExportData } from '../types';

export interface BillingFormatter {
    /** The MIME content type for this format */
    readonly contentType: string;

    /** File extension for downloads */
    readonly fileExtension: string;

    /** Format the export data into the target format */
    format(data: BillingExportData): string | Buffer;
}
