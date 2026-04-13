/**
 * Auth routes — client registration, login, interpreter login, admin login.
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('../database');
const activityLogger = require('../lib/activity-logger');
const { signToken, normalizeAuthClaims, verifyJwtToken } = require('../lib/auth');

const router = express.Router();

const authLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many login attempts, please try again later.' }
});

let LEGACY_ADMIN_LOGIN_ENABLED = false;

function setLegacyFlag(val) {
    LEGACY_ADMIN_LOGIN_ENABLED = val;
}

function validateRequired(body, fields) {
    for (const field of fields) {
        const value = body[field];
        if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
            return `Missing required field: ${field}`;
        }
    }
    return null;
}

// --- Client registration ---
router.post('/client/register', authLimiter, async (req, res) => {
    const validationError = validateRequired(req.body, ['name', 'email', 'password']);
    if (validationError) {
        return res.status(400).json({ error: validationError });
    }

    const { name, email, password, organization } = req.body;

    try {
        const existing = await db.getClientByEmail(email);
        if (existing) {
            return res.status(409).json({ error: 'Email already registered' });
        }

        const client = await db.createClient({ name, email, password, organization });

        // Assign a unique phone number with collision retry
        let phoneNum;
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

        const token = signToken({ id: client.id, email, name, role: 'client' });

        activityLogger.log('client_registered', { clientId: client.id, name, email });

        res.json({
            success: true,
            token,
            user: { id: client.id, name, email, role: 'client', phoneNumber: phoneNum }
        });
    } catch (error) {
        console.error('[Client Register] Error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// --- Client login ---
router.post('/client/login', authLimiter, async (req, res) => {
    const validationError = validateRequired(req.body, ['email', 'password']);
    if (validationError) {
        return res.status(400).json({ error: validationError });
    }

    const { email, password } = req.body;

    try {
        const client = await db.getClientByEmail(email);
        if (!client || !client.password_hash) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const isMatch = await bcrypt.compare(password, client.password_hash);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid email or password' });
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
                phoneNumber: primary?.phone_number || null
            }
        });
    } catch (error) {
        console.error('[Client Login] Error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// --- Interpreter login ---
router.post('/interpreter/login', authLimiter, async (req, res) => {
    const validationError = validateRequired(req.body, ['email', 'password']);
    if (validationError) {
        return res.status(400).json({ error: validationError });
    }

    const { email, password } = req.body;

    try {
        const interpreter = await db.getInterpreterByEmail(email);

        if (!interpreter || !interpreter.password_hash) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const isMatch = await bcrypt.compare(password, interpreter.password_hash);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        if (!interpreter.active) {
            return res.status(403).json({ error: 'Account is inactive' });
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
                languages: interpreter.languages
            }
        });
    } catch (error) {
        console.error('[Interpreter Login] Error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// --- Captioner login ---
router.post('/captioner/login', authLimiter, async (req, res) => {
    const validationError = validateRequired(req.body, ['email', 'password']);
    if (validationError) {
        return res.status(400).json({ error: validationError });
    }

    const { email, password } = req.body;

    try {
        const captioner = await db.getCaptionerByEmail(email);

        if (!captioner || !captioner.password_hash) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const isMatch = await bcrypt.compare(password, captioner.password_hash);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        if (!captioner.active) {
            return res.status(403).json({ error: 'Account is inactive' });
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
        console.error('[Captioner Login] Error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// --- Legacy admin login ---
router.post('/admin/login', authLimiter, async (req, res) => {
    if (!LEGACY_ADMIN_LOGIN_ENABLED) {
        return res.status(410).json({
            error: 'Legacy admin login is disabled. Use the ops authentication service.'
        });
    }

    const validationError = validateRequired(req.body, ['username', 'password']);
    if (validationError) {
        return res.status(400).json({ error: validationError });
    }

    const { username, password } = req.body;

    try {
        const admin = await db.getAdminByUsername(username);
        if (!admin) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const isMatch = await bcrypt.compare(password, admin.password_hash);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials' });
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
        console.error('[Login] Error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = { router, setLegacyFlag };
