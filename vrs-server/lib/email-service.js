/**
 * Email Service — sends emails via SMTP (nodemailer).
 *
 * Used for password reset flow.
 * Falls back gracefully if SMTP is not configured.
 */

const log = require('./logger').module('email');

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT, 10) || 587;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@malkavrs.com';
const RESET_BASE_URL = process.env.RESET_BASE_URL || 'http://localhost:8080/client-profile.html';

let transporter = null;
let nodemailerAvailable = false;

function getTransporter() {
    if (transporter) {
        return transporter;
    }

    if (!SMTP_HOST || !SMTP_USER) {
        return null;
    }

    try {
        // eslint-disable-next-line global-require
        const nodemailer = require('nodemailer');
        nodemailerAvailable = true;

        transporter = nodemailer.createTransport({
            host: SMTP_HOST,
            port: SMTP_PORT,
            secure: SMTP_PORT === 465,
            auth: {
                user: SMTP_USER,
                pass: SMTP_PASS
            }
        });

        return transporter;
    } catch (error) {
        log.warn('nodemailer not installed — email sending disabled');
        return null;
    }
}

/**
 * Send a password reset email.
 *
 * @param {string} toEmail — recipient email
 * @param {string} resetToken — raw reset token (will be in the URL)
 * @param {string} userId — user ID
 * @param {string} userRole — 'client' or 'interpreter'
 * @returns {{ sent: boolean, mock: boolean }}
 */
async function sendPasswordResetEmail(toEmail, resetToken, userId, userRole) {
    const resetUrl = `${RESET_BASE_URL}?reset-token=${encodeURIComponent(resetToken)}&reset-user=${encodeURIComponent(userId)}&reset-role=${encodeURIComponent(userRole)}`;

    const transport = getTransporter();

    if (!transport) {
        log.warn({ toEmail, resetUrl }, 'SMTP not configured — reset URL logged instead of emailed (mock mode)');
        return { sent: false, mock: true, resetUrl };
    }

    const htmlBody = `
<!DOCTYPE html>
<html>
<head><style>
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f7fa; margin: 0; padding: 20px; }
.container { max-width: 480px; margin: 0 auto; background: #fff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); padding: 32px; }
h1 { color: #1a365d; font-size: 20px; margin: 0 0 8px; }
p { color: #4a5568; font-size: 14px; line-height: 1.6; margin: 0 0 16px; }
.btn { display: inline-block; background: #2563eb; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; }
.footer { color: #a0aec0; font-size: 12px; margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 16px; }
</style></head>
<body>
<div class="container">
    <h1>Reset Your Password</h1>
    <p>We received a request to reset your MalkaVRS password. Click the button below to choose a new one:</p>
    <p><a class="btn" href="${resetUrl}">Reset Password</a></p>
    <p>Or copy this link into your browser:</p>
    <p style="word-break: break-all; color: #2563eb; font-size: 13px;">${resetUrl}</p>
    <p>This link expires in 1 hour. If you did not request a password reset, you can safely ignore this email.</p>
    <div class="footer">MalkaVRS &mdash; Video Relay Service</div>
</div>
</body>
</html>`;

    try {
        const info = await transport.sendMail({
            from: `"MalkaVRS" <${EMAIL_FROM}>`,
            to: toEmail,
            subject: 'Reset Your MalkaVRS Password',
            html: htmlBody,
            text: `Reset your MalkaVRS password by visiting: ${resetUrl}\n\nThis link expires in 1 hour.`
        });

        log.info({ toEmail, messageId: info.messageId }, 'Password reset email sent');
        return { sent: true, mock: false, messageId: info.messageId };
    } catch (error) {
        log.error({ err: error, toEmail }, 'Failed to send password reset email');
        return { sent: false, mock: false, error: error.message };
    }
}

function normalizeEmailList(value) {
    if (!value) {
        return [];
    }

    const values = Array.isArray(value) ? value : String(value).split(',');

    return values
        .map(email => String(email || '').trim())
        .filter(Boolean)
        .filter((email, index, all) => all.findIndex(item => item.toLowerCase() === email.toLowerCase()) === index);
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Send an invoice availability/copy email.
 *
 * Stripe remains the authoritative hosted invoice sender when configured. This
 * helper is for extra client recipients, internal business copies, and non-Stripe
 * invoice delivery. It falls back to audit/mock mode if SMTP is not configured.
 *
 * @param {object} params
 * @returns {{ sent: boolean, mock: boolean, messageId?: string, error?: string }}
 */
async function sendInvoiceEmail(params) {
    const to = normalizeEmailList(params.to);
    const cc = normalizeEmailList(params.cc);
    const bcc = normalizeEmailList(params.bcc);
    const allRecipients = [...to, ...cc, ...bcc];

    if (allRecipients.length === 0) {
        return { sent: false, mock: true, error: 'No invoice email recipients configured' };
    }

    const transport = getTransporter();
    const invoiceUrl = params.hostedUrl || params.invoiceUrl || '';
    const amountText = params.total != null ? `$${Number(params.total).toFixed(2)}` : 'See invoice';
    const subject = params.subject || `Invoice ${params.invoiceNumber || ''} from Malka Communications`.trim();

    if (!transport) {
        log.warn({
            to,
            cc,
            bcc,
            invoiceNumber: params.invoiceNumber,
            invoiceUrl,
        }, 'SMTP not configured — invoice email logged instead of emailed (mock mode)');
        return { sent: false, mock: true, invoiceUrl };
    }

    const htmlBody = `
<!DOCTYPE html>
<html>
<head><style>
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f7fa; margin: 0; padding: 20px; }
.container { max-width: 560px; margin: 0 auto; background: #fff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); padding: 32px; }
h1 { color: #1a365d; font-size: 20px; margin: 0 0 8px; }
p { color: #4a5568; font-size: 14px; line-height: 1.6; margin: 0 0 16px; }
.summary { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; margin: 18px 0; }
.summary strong { display: inline-block; min-width: 140px; color: #1f2937; }
.btn { display: inline-block; background: #2563eb; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; }
.footer { color: #a0aec0; font-size: 12px; margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 16px; }
</style></head>
<body>
<div class="container">
    <h1>Your VRI invoice is ready</h1>
    <p>${escapeHtml(params.organizationName || 'Your organization')} has a new invoice for VRI services.</p>
    <div class="summary">
        <p><strong>Invoice:</strong> ${escapeHtml(params.invoiceNumber || 'Invoice')}</p>
        <p><strong>Billing period:</strong> ${escapeHtml(params.periodStart || '')} to ${escapeHtml(params.periodEnd || '')}</p>
        <p><strong>Total:</strong> ${escapeHtml(amountText)}</p>
    </div>
    ${invoiceUrl ? `<p><a class="btn" href="${escapeHtml(invoiceUrl)}">View invoice</a></p>` : ''}
    ${invoiceUrl ? `<p style="word-break: break-all; color: #2563eb; font-size: 13px;">${escapeHtml(invoiceUrl)}</p>` : ''}
    <p>Questions? Reply to your Malka Communications billing contact.</p>
    <div class="footer">Malka Communications billing</div>
</div>
</body>
</html>`;

    try {
        const info = await transport.sendMail({
            from: `"Malka Communications" <${EMAIL_FROM}>`,
            to,
            cc,
            bcc,
            subject,
            html: htmlBody,
            text: [
                `Invoice ${params.invoiceNumber || ''} is ready.`,
                `Billing period: ${params.periodStart || ''} to ${params.periodEnd || ''}`,
                `Total: ${amountText}`,
                invoiceUrl ? `View invoice: ${invoiceUrl}` : ''
            ].filter(Boolean).join('\n')
        });

        log.info({ to, cc, bcc, messageId: info.messageId }, 'Invoice email sent');
        return { sent: true, mock: false, messageId: info.messageId };
    } catch (error) {
        log.error({ err: error, to, cc, bcc }, 'Failed to send invoice email');
        return { sent: false, mock: false, error: error.message };
    }
}

module.exports = {
    sendPasswordResetEmail,
    sendInvoiceEmail,
    RESET_BASE_URL
};
