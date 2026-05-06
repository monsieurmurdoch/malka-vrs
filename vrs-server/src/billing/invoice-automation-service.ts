/**
 * Invoice Automation Service
 *
 * Runs the VRI invoice batch on a daily schedule when enabled. The batch is
 * idempotent at the invoice-period level, so reruns reuse existing invoices
 * instead of creating duplicates.
 */

import * as billingDb from '../lib/billing-db';
import { createModuleLogger } from '../lib/logger';
import { runDueInvoiceAutomation } from './vri-billing-pipeline';

const log = createModuleLogger('invoice-automation');

let timer: NodeJS.Timeout | null = null;
let lastRunKey: string | null = null;

function todayKey(date: Date): string {
    return date.toISOString().slice(0, 10);
}

function shouldRunNow(now: Date): boolean {
    const targetHour = parseInt(process.env.BILLING_AUTO_INVOICE_HOUR_UTC || '6', 10);
    const safeTargetHour = Number.isFinite(targetHour) ? Math.max(0, Math.min(23, targetHour)) : 6;

    return now.getUTCHours() === safeTargetHour && lastRunKey !== todayKey(now);
}

export function startInvoiceAutomation(): void {
    if (timer || process.env.BILLING_AUTO_INVOICE_ENABLED !== 'true') {
        return;
    }

    timer = setInterval(async () => {
        if (!billingDb.isBillingDbReady()) {
            return;
        }

        const now = new Date();
        if (!shouldRunNow(now)) {
            return;
        }

        lastRunKey = todayKey(now);
        try {
            const result = await runDueInvoiceAutomation({
                asOfDate: lastRunKey,
                autoSend: process.env.BILLING_AUTO_INVOICE_SEND !== 'false',
                performedBy: 'billing-auto-run',
            });
            log.info({
                generated: result.generated,
                sent: result.sent,
                skipped: result.skipped,
                failed: result.failed,
            }, 'Due invoice batch complete');
        } catch (error) {
            lastRunKey = null;
            log.error({ err: error }, 'Due invoice batch failed');
        }
    }, 60 * 60 * 1000);

    if (typeof timer.unref === 'function') {
        timer.unref();
    }
}

export function stopInvoiceAutomation(): void {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
}
