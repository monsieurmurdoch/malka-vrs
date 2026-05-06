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

export interface RateLookupContext {
    corporateAccountId?: string | null;
    tenantId?: string | null;
    languagePair?: string | null;
    currency?: string | null;
}

export interface VriRateOverride {
    id: string;
    corporateAccountId: string | null;
    tenantId: string | null;
    serviceMode: string;
    languagePair: string | null;
    currency: string;
    label: string;
    perMinuteRate: number;
    effectiveFrom: string;
    effectiveTo: string | null;
    isActive: boolean;
    metadata: Record<string, unknown>;
    createdAt: Date;
    createdBy: string | null;
}

export interface CreateVriRateOverrideInput {
    corporateAccountId?: string;
    tenantId?: string;
    serviceMode?: string;
    languagePair?: string;
    currency?: string;
    label: string;
    perMinuteRate: number;
    effectiveFrom: string;
    effectiveTo?: string;
    metadata?: Record<string, unknown>;
    createdBy?: string;
}

export interface BillingRateTemplate {
    id: string;
    serviceMode: string;
    languagePair: string;
    currency: string;
    label: string;
    defaultRate: number | null;
    status: string;
    metadata: Record<string, unknown>;
    createdAt: Date;
    createdBy: string | null;
}

// ─── Corporate Accounts ────────────────────────────────────

export interface CorporateAccount {
    id: string;
    tenantId: string | null;
    organizationName: string;
    billingContactName: string;
    billingContactEmail: string;
    billingContactPhone: string | null;
    stripeCustomerId: string | null;
    stripePriceId: string | null;
    stripeSubscriptionId: string | null;
    paymentMethod: 'invoice' | 'stripe' | 'wire';
    contractType: 'monthly' | 'per_call' | 'quarterly';
    contractedRateTierId: string | null;
    billingDay: number;
    currency: string;
    taxId: string | null;
    paymentTermsDays: number;
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

export type InvoiceRecipientType = 'to' | 'cc' | 'bcc';

export interface InvoiceRecipient {
    id: string;
    corporateAccountId: string;
    recipientType: InvoiceRecipientType;
    name: string | null;
    email: string;
    isPrimary: boolean;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    createdBy: string | null;
}

export interface UpsertInvoiceRecipientInput {
    id?: string;
    recipientType: InvoiceRecipientType;
    name?: string;
    email: string;
    isPrimary?: boolean;
    isActive?: boolean;
}

export interface CreateCorporateAccountInput {
    tenantId?: string;
    organizationName: string;
    billingContactName: string;
    billingContactEmail: string;
    billingContactPhone?: string;
    invoiceRecipients?: UpsertInvoiceRecipientInput[];
    paymentMethod?: 'invoice' | 'stripe' | 'wire';
    contractType: 'monthly' | 'per_call' | 'quarterly';
    contractedRateTierId?: string;
    billingDay?: number;
    currency?: string;
    taxId?: string;
    paymentTermsDays?: number;
    stripePriceId?: string;
    stripeSubscriptionId?: string;
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
    stripeHostedInvoiceUrl: string | null;
    stripeInvoicePdfUrl: string | null;
    issuedAt: Date | null;
    dueDate: string | null;
    paidAt: Date | null;
    sentAt: Date | null;
    lastSendStatus: string | null;
    lastSendError: string | null;
    stripeHostedUrl: string | null;
    createdAt: Date;
    createdBy: string | null;
}

export interface InvoiceSendEvent {
    id: string;
    invoiceId: string;
    corporateAccountId: string;
    deliveryMode: 'manual' | 'auto' | 'bulk';
    sendStatus: 'sent' | 'partial' | 'failed' | 'skipped';
    stripeInvoiceId: string | null;
    stripeHostedUrl: string | null;
    recipientTo: string[];
    recipientCc: string[];
    recipientBcc: string[];
    businessCopyEmails: string[];
    providerResult: Record<string, unknown>;
    errorMessage: string | null;
    sentAt: Date;
    performedBy: string | null;
}

export interface SendInvoiceOptions {
    performedBy?: string;
    deliveryMode?: 'manual' | 'auto' | 'bulk';
    forceResend?: boolean;
}

export interface InvoiceSendResult {
    invoice: Invoice | null;
    event: InvoiceSendEvent | null;
    sent: boolean;
    status: 'sent' | 'partial' | 'failed' | 'skipped';
    message?: string;
}

export interface BulkInvoiceSendInput {
    corporateAccountIds: string[];
    periodStart: string;
    periodEnd: string;
    autoGenerate?: boolean;
    issueAndSend?: boolean;
    performedBy?: string;
}

export interface BulkInvoiceSendResult {
    periodStart: string;
    periodEnd: string;
    requestedAccountIds: string[];
    generated: number;
    sent: number;
    skipped: number;
    failed: number;
    results: Array<{
        corporateAccountId: string;
        invoiceId: string | null;
        invoiceNumber?: string;
        status: 'generated' | 'sent' | 'skipped' | 'failed';
        message?: string;
    }>;
}

export interface InvoiceItem {
    id?: string;
    invoiceId?: string;
    cdrId?: string | null;
    description: string;
    quantity: number;
    unitAmount: number;
    total: number;
    currency?: string;
    metadata?: Record<string, unknown>;
}

export interface InterpreterScheduleWindow {
    id: string;
    interpreterId: string;
    tenantId: string | null;
    serviceMode: string;
    languagePair: string | null;
    startsAt: Date;
    endsAt: Date;
    status: string;
    source: string;
    createdBy: string | null;
    notes: string | null;
    metadata: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
}

export interface InterpreterAvailabilitySession {
    id: string;
    interpreterId: string;
    tenantId: string | null;
    serviceMode: string | null;
    languagePair: string | null;
    status: string;
    source: string;
    reason: string | null;
    startedAt: Date;
    endedAt: Date | null;
    metadata: Record<string, unknown>;
    createdAt: Date;
}

export interface InterpreterBreakSession {
    id: string;
    interpreterId: string;
    tenantId: string | null;
    breakType: string;
    reason: string | null;
    startedAt: Date;
    endedAt: Date | null;
    metadata: Record<string, unknown>;
    createdAt: Date;
}

export interface InterpreterUtilizationSummary {
    id: string;
    interpreterId: string;
    tenantId: string | null;
    weekStart: string;
    scheduledMinutes: number;
    signedOnMinutes: number;
    availableMinutes: number;
    inCallMinutes: number;
    breakMinutes: number;
    idleMinutes: number;
    acceptedRequests: number;
    declinedRequests: number;
    noAnswerRequests: number;
    utilizationRate: number;
    metadata: Record<string, unknown>;
    generatedAt: Date;
}

export interface InterpreterPayable {
    id: string;
    interpreterId: string;
    tenantId: string | null;
    callId: string | null;
    cdrId: string | null;
    sourceType: string;
    serviceMode: string;
    languagePair: string | null;
    payableMinutes: number;
    rateAmount: number;
    totalAmount: number;
    currency: string;
    status: string;
    periodStart: string | null;
    periodEnd: string | null;
    metadata: Record<string, unknown>;
    createdAt: Date;
    approvedAt: Date | null;
    approvedBy: string | null;
}

export interface ManagerNote {
    id: string;
    entityType: string;
    entityId: string;
    tenantId: string | null;
    noteType: string;
    visibility: string;
    body: string;
    followUpAt: Date | null;
    createdBy: string | null;
    updatedBy: string | null;
    createdAt: Date;
    updatedAt: Date;
    metadata: Record<string, unknown>;
}

export interface CorporateUsageSummary {
    accountId: string;
    periodStart: string;
    periodEnd: string;
    totalCalls: number;
    totalMinutes: number;
    totalCharge: number;
    currency: string;
    day: { totalCalls: number; totalMinutes: number; totalCharge: number };
    week: { totalCalls: number; totalMinutes: number; totalCharge: number };
    month: { totalCalls: number; totalMinutes: number; totalCharge: number };
}

export interface AdminBillingDashboard {
    generatedAt: Date;
    invoiceStatusCounts: Record<string, number>;
    totals: {
        draft: number;
        issued: number;
        paid: number;
        overdue: number;
        cancelled: number;
        outstanding: number;
    };
    activeCorporateAccounts: number;
    recentInvoices: Invoice[];
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
