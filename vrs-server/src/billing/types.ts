/**
 * Billing Type Definitions
 *
 * Shared TypeScript interfaces for all billing entities.
 */

import type {
    CallType,
    BillingStatus,
    InvoiceStatus,
    ReconciliationStatus,
} from './config';

// ─── Call Detail Record (CDR) ──────────────────────────────

export interface BillingCdr {
    id: string;
    callId: string;
    callType: CallType;
    callerId: string | null;
    interpreterId: string | null;
    startTime: Date;
    endTime: Date;
    durationSeconds: number;
    callerNumber: string | null;
    calleeNumber: string | null;
    language: string | null;
    rateTierId: string | null;
    perMinuteRate: number;
    totalCharge: number;
    billingStatus: BillingStatus;
    trsSubmissionId: string | null;
    corporateAccountId: string | null;
    invoiceId: string | null;
    metadata: Record<string, unknown>;
    createdAt: Date;
}

export interface CreateCdrInput {
    callId: string;
    callType: CallType;
    callerId?: string;
    interpreterId?: string;
    startTime: Date;
    endTime: Date;
    durationSeconds: number;
    callerNumber?: string;
    calleeNumber?: string;
    language?: string;
    corporateAccountId?: string;
    rateTierId?: string | null;
    perMinuteRate?: number;
    metadata?: Record<string, unknown>;
}

// ─── CDR Status Transitions ────────────────────────────────

export interface CdrStatusTransition {
    id: string;
    cdrId: string;
    fromStatus: BillingStatus;
    toStatus: BillingStatus;
    transitionedAt: Date;
    transitionedBy: string | null;
    reason: string | null;
}

// ─── Rate Tiers ────────────────────────────────────────────

export interface RateTier {
    id: string;
    callType: CallType;
    label: string;
    perMinuteRate: number;
    effectiveFrom: string; // ISO date
    effectiveTo: string | null;
    fccOrderRef: string | null;
    isActive: boolean;
    createdAt: Date;
    createdBy: string | null;
}

export interface CreateRateTierInput {
    callType: CallType;
    label: string;
    perMinuteRate: number;
    effectiveFrom: string;
    effectiveTo?: string;
    fccOrderRef?: string;
    createdBy?: string;
}

// ─── Corporate Accounts ────────────────────────────────────

export interface CorporateAccount {
    id: string;
    tenantId: string;
    organizationName: string;
    billingContactName: string;
    billingContactEmail: string;
    billingContactPhone: string | null;
    currency: string;
    stripeCustomerId: string | null;
    paymentMethod: 'invoice' | 'stripe' | 'wire';
    contractType: 'monthly' | 'per_call' | 'quarterly';
    contractedRateTierId: string | null;
    defaultRatePerMinute: number | null;
    billingDay: number;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    country: string;
    notes: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    createdBy: string | null;
}

export interface CreateCorporateAccountInput {
    tenantId?: string;
    organizationName: string;
    billingContactName: string;
    billingContactEmail: string;
    billingContactPhone?: string;
    currency?: string;
    paymentMethod?: 'invoice' | 'stripe' | 'wire';
    contractType: 'monthly' | 'per_call' | 'quarterly';
    contractedRateTierId?: string;
    defaultRatePerMinute?: number;
    billingDay?: number;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
    notes?: string;
    createdBy?: string;
}

// ─── Invoices ──────────────────────────────────────────────

export interface Invoice {
    id: string;
    corporateAccountId: string;
    invoiceNumber: string;
    billingPeriodStart: string;
    billingPeriodEnd: string;
    subtotal: number;
    tax: number;
    total: number;
    currency: string;
    status: InvoiceStatus;
    stripeInvoiceId: string | null;
    stripePaymentIntentId: string | null;
    issuedAt: Date | null;
    dueDate: string | null;
    paidAt: Date | null;
    createdAt: Date;
    createdBy: string | null;
}

export interface InvoiceItem {
    description: string;
    quantity: number;
    unitAmount: number;
    total: number;
    metadata?: Record<string, unknown>;
}

// ─── Monthly Aggregation ───────────────────────────────────

export interface MonthlyAggregation {
    id: string;
    callType: CallType;
    periodYear: number;
    periodMonth: number;
    totalCalls: number;
    totalMinutes: number;
    totalCharge: number;
    avgDurationSeconds: number | null;
    trsSubmissionId: string | null;
    trsSubmittedAt: Date | null;
    generatedAt: Date;
    generatedBy: string | null;
}

// ─── Reconciliation ────────────────────────────────────────

export interface ReconciliationRecord {
    id: string;
    reconciliationDate: string;
    callType: CallType;
    expectedTotal: number;
    actualTotal: number | null;
    variance: number | null;
    varianceReason: string | null;
    status: ReconciliationStatus;
    resolvedAt: Date | null;
    resolvedBy: string | null;
    notes: string | null;
    createdAt: Date;
}

// ─── Audit Log ─────────────────────────────────────────────

export interface BillingAuditEntry {
    id: string;
    action: string;
    entityType: string;
    entityId: string | null;
    performedBy: string | null;
    details: Record<string, unknown>;
    ipAddress: string | null;
    createdAt: Date;
}

// ─── Export Data ───────────────────────────────────────────

export interface BillingExportData {
    records: BillingCdr[];
    metadata: {
        exportDate: string;
        callType: CallType | 'all';
        periodStart: string;
        periodEnd: string;
        totalRecords: number;
        totalCharge: number;
        generatedBy: string | null;
    };
}

// ─── Query Filters ─────────────────────────────────────────

export interface CdrQueryFilters {
    callType?: CallType;
    billingStatus?: BillingStatus;
    fromDate?: string;
    toDate?: string;
    corporateAccountId?: string;
    limit?: number;
    offset?: number;
}

export interface AuditLogQueryFilters {
    action?: string;
    entityType?: string;
    entityId?: string;
    performedBy?: string;
    fromDate?: string;
    toDate?: string;
    limit?: number;
    offset?: number;
}
