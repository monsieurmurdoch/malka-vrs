/**
 * SMS Service — sends SMS messages via Twilio.
 *
 * Used for OTP-based phone login.
 * Falls back gracefully if Twilio is not configured.
 */

const log = require('./logger').module('sms');

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;

let twilioClient = null;

function getTwilioClient() {
    if (twilioClient) {
        return twilioClient;
    }

    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
        return null;
    }

    try {
        // eslint-disable-next-line global-require
        const twilio = require('twilio');
        twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
        return twilioClient;
    } catch (error) {
        log.warn('Twilio SDK not installed — SMS sending disabled');
        return null;
    }
}

// In-memory rate limiter: max 5 OTPs per phone per 15 minutes
const otpRateLimit = new Map();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 5;

function checkRateLimit(phoneNumber) {
    const now = Date.now();
    const key = phoneNumber;
    let entry = otpRateLimit.get(key);

    if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW) {
        entry = { windowStart: now, count: 0 };
        otpRateLimit.set(key, entry);
    }

    entry.count++;

    if (entry.count > RATE_LIMIT_MAX) {
        return false;
    }

    return true;
}

/**
 * Send an SMS message.
 *
 * @param {string} to — phone number in E.164 format (+1-555-0123)
 * @param {string} body — message text
 * @returns {{ sent: boolean, mock: boolean }}
 */
async function sendSms(to, body) {
    const client = getTwilioClient();

    if (!client) {
        log.warn({ to }, 'Twilio not configured — SMS not sent (mock mode)');
        return { sent: false, mock: true };
    }

    try {
        // Normalize phone number for Twilio (remove dashes)
        const normalizedTo = to.replace(/[^+\d]/g, '');
        const normalizedFrom = TWILIO_PHONE_NUMBER.replace(/[^+\d]/g, '');

        const message = await client.messages.create({
            body,
            from: normalizedFrom,
            to: normalizedTo
        });

        log.info({ to: normalizedTo, sid: message.sid }, 'SMS sent');
        return { sent: true, mock: false, sid: message.sid };
    } catch (error) {
        log.error({ err: error, to }, 'Failed to send SMS');
        return { sent: false, mock: false, error: error.message };
    }
}

/**
 * Send an OTP code via SMS.
 *
 * @param {string} phoneNumber — phone number
 * @param {string} code — 6-digit OTP code
 * @returns {{ sent: boolean, mock: boolean }}
 */
async function sendOtp(phoneNumber, code) {
    if (!checkRateLimit(phoneNumber)) {
        return { sent: false, mock: false, error: 'rate_limited' };
    }

    const body = `Your MalkaVRS verification code is ${code}. It expires in 10 minutes. Do not share this code.`;

    return await sendSms(phoneNumber, body);
}

/**
 * Generate a random 6-digit OTP code.
 */
function generateOtpCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

module.exports = {
    sendSms,
    sendOtp,
    generateOtpCode
};
