/**
 * Auth routes — client registration, login, interpreter login, admin login,
 *               phone number login, SMS OTP, password reset.
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const db = require('../database');
const activityLogger = require('../lib/activity-logger');
const { signToken, normalizeAuthClaims, verifyJwtToken } = require('../lib/auth');
const log = require('../lib/logger').module('auth');
const { validate, emailSchema, passwordSchema, nameSchema, organizationSchema, phoneNumberSchema, z } = require('../lib/validation');
const smsService = require('../lib/sms-service');
const emailService = require('../lib/email-service');

const router = express.Router();

const authLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many login attempts, please try again later.', code: 'RATE_LIMITED' }
});

let LEGACY_ADMIN_LOGIN_ENABLED = false;

function setLegacyFlag(val) {
    LEGACY_ADMIN_LOGIN_ENABLED = val;
}

function inferTenantId(req) {
    const host = String(req.headers['x-forwarded-host'] || req.hostname || '').toLowerCase();
    return host.includes('maplecomm.ca') || host.includes('maple') ? 'maple' : 'malka';
}

function defaultClientServiceModes(tenantId) {
    return tenantId === 'maple' ? ['vri'] : ['vrs'];
}

const clientRegisterSchema = z.object({
    name: nameSchema,
    email: emailSchema,
    password: passwordSchema,
    organization: organizationSchema
});

const phoneLoginSchema = z.object({
    phoneNumber: phoneNumberSchema,
    password: z.string().min(1)
});

const otpRequestSchema = z.object({
    phoneNumber: phoneNumberSchema,
    purpose: z.enum(['login'])
});

const otpVerifySchema = z.object({
    phoneNumber: phoneNumberSchema,
    code: z.string().length(6),
    purpose: z.enum(['login'])
});

const forgotPasswordSchema = z.object({
    email: emailSchema
});

const resetPasswordSchema = z.object({
    token: z.string().min(1),
    userId: z.string().min(1),
    role: z.enum(['client', 'interpreter']),
    newPassword: passwordSchema
});

const loginSchema = z.object({
    email: emailSchema,
    password: z.string().min(1)
});

const adminLoginSchema = z.object({
    username: z.string().min(1).max(100),
    password: z.string().min(1)
});

const captionerLoginSchema = loginSchema;

// --- Client registration ---
router.post('/client/register', authLimiter, validate(clientRegisterSchema), async (req, res) => {

    const { name, email, password, organization } = req.body;

    try {
        const existing = await db.getClientByEmail(email);
        if (existing) {
            return res.status(409).json({ error: 'Email already registered', code: 'CONFLICT' });
        }

        const tenantId = inferTenantId(req);
        const serviceModes = defaultClientServiceModes(tenantId);
        const client = await db.createClient({ name, email, password, organization, serviceModes, tenantId });

        let phoneNum;
        if (serviceModes.includes('vrs')) {
            // Assign a unique phone number with collision retry for VRS-capable clients.
            for (let attempt = 0; attempt < 10; attempt++) {
                const candidate = `+1-555-${String(Math.floor(Math.random() * 9000) + 1000).padStart(4, '0')}`;
                const taken = await db.getClientByPhoneNumber(candidate);
                if (!taken) {
                    phoneNum = candidate;
                    break;
                }
            }
            if (!phoneNum) {
                const { v4: uuidv4 } = require('uuid');
                phoneNum = `+1-555-${uuidv4().substring(0, 4)}`;
            }
            await db.assignClientPhoneNumber({ clientId: client.id, phoneNumber: phoneNum, isPrimary: true });
        }

        const token = signToken({ id: client.id, email, name, role: 'client' });

        activityLogger.log('client_registered', { clientId: client.id, name, email, tenantId, serviceModes });

        res.json({
            success: true,
            token,
            user: { id: client.id, name, email, role: 'client', phoneNumber: phoneNum || null, serviceModes, tenantId }
        });
    } catch (error) {
        req.log.error({ err: error }, 'Client registration failed');
        res.status(500).json({ error: 'Registration failed', code: 'INTERNAL_ERROR' });
    }
});

// --- Client login ---
router.post('/client/login', authLimiter, validate(loginSchema), async (req, res) => {
    const { email, password } = req.body;

    try {
        const client = await db.getClientByEmail(email);
        if (!client || !client.password_hash) {
            return res.status(401).json({ error: 'Invalid email or password', code: 'AUTH_FAILED' });
        }

        const isMatch = await bcrypt.compare(password, client.password_hash);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid email or password', code: 'AUTH_FAILED' });
        }

        const phones = await db.getClientPhoneNumbers(client.id);
        const primary = phones.find(p => p.is_primary);

        const token = signToken({ id: client.id, email: client.email, name: client.name, role: 'client' });

        activityLogger.log('client_login', { clientId: client.id });

        res.json({
            success: true,
            token,
            user: {
                id: client.id,
                name: client.name,
                email: client.email,
                role: 'client',
                phoneNumber: primary?.phone_number || null,
                serviceModes: client.service_modes || ['vri'],
                tenantId: client.tenant_id || 'malka'
            }
        });
    } catch (error) {
        req.log.error({ err: error }, 'Client login failed');
        res.status(500).json({ error: 'Login failed', code: 'INTERNAL_ERROR' });
    }
});

// --- Interpreter login ---
router.post('/interpreter/login', authLimiter, validate(loginSchema), async (req, res) => {
    const { email, password } = req.body;

    try {
        const interpreter = await db.getInterpreterByEmail(email);

        if (!interpreter || !interpreter.password_hash) {
            return res.status(401).json({ error: 'Invalid email or password', code: 'AUTH_FAILED' });
        }

        const isMatch = await bcrypt.compare(password, interpreter.password_hash);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid email or password', code: 'AUTH_FAILED' });
        }

        if (!interpreter.active) {
            return res.status(403).json({ error: 'Account is inactive', code: 'ACCOUNT_INACTIVE' });
        }

        const token = signToken({
            id: interpreter.id, email: interpreter.email, name: interpreter.name, role: 'interpreter'
        });

        activityLogger.log('interpreter_login', { interpreterId: interpreter.id });

        res.json({
            success: true,
            token,
            user: {
                id: interpreter.id,
                name: interpreter.name,
                email: interpreter.email,
                role: 'interpreter',
                languages: interpreter.languages,
                serviceModes: interpreter.service_modes || ['vri'],
                tenantId: interpreter.tenant_id || 'malka'
            }
        });
    } catch (error) {
        req.log.error({ err: error }, 'Interpreter login failed');
        res.status(500).json({ error: 'Login failed', code: 'INTERNAL_ERROR' });
    }
});

// --- Captioner login ---
router.post('/captioner/login', authLimiter, validate(captionerLoginSchema), async (req, res) => {
    const { email, password } = req.body;

    try {
        const captioner = await db.getCaptionerByEmail(email);

        if (!captioner || !captioner.password_hash) {
            return res.status(401).json({ error: 'Invalid email or password', code: 'AUTH_FAILED' });
        }

        const isMatch = await bcrypt.compare(password, captioner.password_hash);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid email or password', code: 'AUTH_FAILED' });
        }

        if (!captioner.active) {
            return res.status(403).json({ error: 'Account is inactive', code: 'ACCOUNT_INACTIVE' });
        }

        const token = signToken({
            id: captioner.id, email: captioner.email, name: captioner.name, role: 'captioner'
        });

        activityLogger.log('captioner_login', { captionerId: captioner.id });

        res.json({
            success: true,
            token,
            user: {
                id: captioner.id,
                name: captioner.name,
                email: captioner.email,
                role: 'captioner',
                languages: captioner.languages
            }
        });
    } catch (error) {
        req.log.error({ err: error }, 'Captioner login failed');
        res.status(500).json({ error: 'Login failed', code: 'INTERNAL_ERROR' });
    }
});

// --- Legacy admin login ---
router.post('/admin/login', authLimiter, validate(adminLoginSchema), async (req, res) => {
    if (!LEGACY_ADMIN_LOGIN_ENABLED) {
        return res.status(410).json({
            error: 'Legacy admin login is disabled. Use the ops authentication service.',
            code: 'ENDPOINT_RETIRED'
        });
    }

    const { username, password } = req.body;

    try {
        const admin = await db.getAdminByUsername(username);
        if (!admin) {
            return res.status(401).json({ error: 'Invalid credentials', code: 'AUTH_FAILED' });
        }

        const isMatch = await bcrypt.compare(password, admin.password_hash);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials', code: 'AUTH_FAILED' });
        }

        const token = signToken(
            { id: admin.id, username: admin.username, role: 'admin' },
            '12h'
        );

        activityLogger.log('admin_login', { adminId: admin.id, username: admin.username });

        res.json({
            token,
            admin: { id: admin.id, username: admin.username, name: admin.name }
        });
    } catch (error) {
        req.log.error({ err: error }, 'Login failed');
        res.status(500).json({ error: 'Server error', code: 'INTERNAL_ERROR' });
    }
});

// --- Phone number login ---
router.post('/client/phone-login', authLimiter, validate(phoneLoginSchema), async (req, res) => {
    const { phoneNumber, password } = req.body;

    try {
        const client = await db.getClientByPhoneNumber(phoneNumber);
        if (!client || !client.password_hash) {
            return res.status(401).json({ error: 'Invalid phone number or password', code: 'AUTH_FAILED' });
        }

        const isMatch = await bcrypt.compare(password, client.password_hash);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid phone number or password', code: 'AUTH_FAILED' });
        }

        const phones = await db.getClientPhoneNumbers(client.id);
        const primary = phones.find(p => p.is_primary);

        const token = signToken({ id: client.id, email: client.email, name: client.name, role: 'client' });

        activityLogger.log('client_phone_login', { clientId: client.id, phoneNumber });

        res.json({
            success: true,
            token,
            user: {
                id: client.id,
                name: client.name,
                email: client.email,
                role: 'client',
                phoneNumber: primary?.phone_number || phoneNumber,
                serviceModes: client.service_modes || ['vrs'],
                tenantId: client.tenant_id || 'malka'
            }
        });
    } catch (error) {
        req.log.error({ err: error }, 'Phone login failed');
        res.status(500).json({ error: 'Login failed', code: 'INTERNAL_ERROR' });
    }
});

// --- OTP request (SMS login) ---
router.post('/otp/request', authLimiter, validate(otpRequestSchema), async (req, res) => {
    const { phoneNumber, purpose } = req.body;

    try {
        const client = await db.getClientByPhoneNumber(phoneNumber);
        if (!client) {
            // Return success even if not found to prevent enumeration
            return res.json({ success: true, expiresIn: 600 });
        }

        const code = smsService.generateOtpCode();
        await db.createOtpCode({ phoneNumber, code, purpose });

        const result = await smsService.sendOtp(phoneNumber, code);
        if (result.error === 'rate_limited') {
            return res.status(429).json({ error: 'Too many OTP requests. Try again later.', code: 'RATE_LIMITED' });
        }

        activityLogger.log('otp_requested', { phoneNumber, purpose, mock: result.mock });

        res.json({ success: true, expiresIn: 600 });
    } catch (error) {
        req.log.error({ err: error }, 'OTP request failed');
        res.status(500).json({ error: 'OTP request failed', code: 'INTERNAL_ERROR' });
    }
});

// --- OTP verify (SMS login) ---
router.post('/otp/verify', authLimiter, validate(otpVerifySchema), async (req, res) => {
    const { phoneNumber, code, purpose } = req.body;

    try {
        const otpResult = await db.verifyOtpCode({ phoneNumber, code, purpose });

        if (!otpResult.valid) {
            const status = otpResult.reason === 'not_found' ? 401
                : otpResult.reason === 'expired' ? 401
                    : otpResult.reason === 'too_many_attempts' ? 429 : 401;

            return res.status(status).json({
                error: otpResult.reason === 'too_many_attempts'
                    ? 'Too many failed attempts. Request a new code.'
                    : 'Invalid or expired code',
                code: otpResult.reason === 'too_many_attempts' ? 'TOO_MANY_ATTEMPTS' : 'AUTH_FAILED'
            });
        }

        const client = await db.getClientByPhoneNumber(phoneNumber);
        if (!client) {
            return res.status(401).json({ error: 'Invalid credentials', code: 'AUTH_FAILED' });
        }

        const phones = await db.getClientPhoneNumbers(client.id);
        const primary = phones.find(p => p.is_primary);

        const token = signToken({ id: client.id, email: client.email, name: client.name, role: 'client' });

        activityLogger.log('otp_login', { clientId: client.id, phoneNumber });

        res.json({
            success: true,
            token,
            user: {
                id: client.id,
                name: client.name,
                email: client.email,
                role: 'client',
                phoneNumber: primary?.phone_number || phoneNumber,
                serviceModes: client.service_modes || ['vrs'],
                tenantId: client.tenant_id || 'malka'
            }
        });
    } catch (error) {
        req.log.error({ err: error }, 'OTP verify failed');
        res.status(500).json({ error: 'Verification failed', code: 'INTERNAL_ERROR' });
    }
});

// --- Forgot password ---
router.post('/password/forgot', authLimiter, validate(forgotPasswordSchema), async (req, res) => {
    const { email } = req.body;

    try {
        // Check clients first, then interpreters
        let user = await db.getClientByEmail(email);
        let userRole = 'client';

        if (!user) {
            user = await db.getInterpreterByEmail(email);
            userRole = 'interpreter';
        }

        // Always return success to prevent email enumeration
        if (!user) {
            return res.json({ success: true });
        }

        const rawToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

        await db.createPasswordReset({
            userId: user.id,
            userRole,
            tokenHash,
            expiresInHours: 1
        });

        const result = await emailService.sendPasswordResetEmail(
            email, rawToken, user.id, userRole
        );

        activityLogger.log('password_reset_requested', {
            userId: user.id,
            role: userRole,
            emailSent: result.sent,
            mock: result.mock
        });

        res.json({ success: true });
    } catch (error) {
        req.log.error({ err: error }, 'Forgot password failed');
        // Still return success to prevent enumeration
        res.json({ success: true });
    }
});

// --- Reset password ---
router.post('/password/reset', authLimiter, validate(resetPasswordSchema), async (req, res) => {
    const { token, userId, role, newPassword } = req.body;

    try {
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const resetRecord = await db.consumePasswordReset(tokenHash);

        if (!resetRecord) {
            return res.status(400).json({ error: 'Invalid or expired reset token', code: 'INVALID_TOKEN' });
        }

        if (resetRecord.used) {
            return res.status(400).json({ error: 'Reset token already used', code: 'TOKEN_USED' });
        }

        if (resetRecord.user_id !== userId || resetRecord.user_role !== role) {
            return res.status(400).json({ error: 'Invalid reset request', code: 'INVALID_REQUEST' });
        }

        const salt = await bcrypt.genSalt(12);
        const passwordHash = await bcrypt.hash(newPassword, salt);

        if (role === 'client') {
            await db.updateClientPassword(userId, passwordHash);
        } else if (role === 'interpreter') {
            await db.updateInterpreterPassword(userId, passwordHash);
        }

        activityLogger.log('password_reset_completed', { userId, role });

        res.json({ success: true });
    } catch (error) {
        req.log.error({ err: error }, 'Password reset failed');
        res.status(500).json({ error: 'Password reset failed', code: 'INTERNAL_ERROR' });
    }
});

// --- Change password (authenticated) ---
router.post('/password/change', authLimiter, async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authorization required', code: 'AUTH_REQUIRED' });
    }

    const token = authHeader.replace('Bearer ', '');
    let user;

    try {
        user = normalizeAuthClaims(verifyJwtToken(token));
    } catch {
        return res.status(401).json({ error: 'Invalid token', code: 'AUTH_INVALID' });
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'currentPassword and newPassword are required', code: 'VALIDATION_ERROR' });
    }

    if (newPassword.length < 8) {
        return res.status(400).json({ error: 'New password must be at least 8 characters', code: 'VALIDATION_ERROR' });
    }

    try {
        let dbUser;
        if (user.role === 'client') {
            dbUser = await db.getClient(user.id);
        } else if (user.role === 'interpreter') {
            dbUser = await db.getInterpreter(user.id);
        } else {
            return res.status(403).json({ error: 'Unsupported role', code: 'FORBIDDEN' });
        }

        if (!dbUser || !dbUser.password_hash) {
            return res.status(400).json({ error: 'No password set for this account', code: 'NO_PASSWORD' });
        }

        const valid = await bcrypt.compare(currentPassword, dbUser.password_hash);
        if (!valid) {
            return res.status(401).json({ error: 'Current password is incorrect', code: 'WRONG_PASSWORD' });
        }

        const salt = await bcrypt.genSalt(12);
        const passwordHash = await bcrypt.hash(newPassword, salt);

        if (user.role === 'client') {
            await db.updateClientPassword(user.id, passwordHash);
        } else {
            await db.updateInterpreterPassword(user.id, passwordHash);
        }

        activityLogger.log('password_changed', { userId: user.id, role: user.role });
        res.json({ success: true });
    } catch (error) {
        req.log.error({ err: error }, 'Password change failed');
        res.status(500).json({ error: 'Password change failed', code: 'INTERNAL_ERROR' });
    }
});

module.exports = { router, setLegacyFlag };
