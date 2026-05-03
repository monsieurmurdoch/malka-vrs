/**
 * Shared input validation middleware and schemas using Zod.
 *
 * Provides:
 *   - Reusable Zod schemas for common types (email, phone, name, etc.)
 *   - XSS sanitization for stored text fields
 *   - Express middleware that validates req.body / req.query against a schema
 *   - Consistent error response shape: { error, code, details? }
 */

const { z, ZodError } = require('zod');

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// ============================================
// SANITIZATION HELPERS
// ============================================

/**
 * Strip HTML tags and trim whitespace from a string to prevent XSS
 * in stored fields (names, organizations, etc.).
 */
function sanitizeText(value) {
    if (typeof value !== 'string') return value;
    return value
        .replace(/<[^>]*>/g, '')   // strip HTML tags
        .trim();
}

/**
 * Stricter sanitization that also removes encoded entities.
 */
function sanitizeStrict(value) {
    if (typeof value !== 'string') return value;
    return sanitizeText(value)
        .replace(/&[#\w]+;/g, '')  // strip HTML entities like &lt; &amp;
        .replace(/javascript:/gi, '') // strip javascript: URLs
        .replace(/on\w+\s*=/gi, '');  // strip event handlers like onclick=
}

function sanitizeObject(value) {
    if (typeof value === 'string') {
        return sanitizeStrict(value);
    }
    if (Array.isArray(value)) {
        return value.map(sanitizeObject);
    }
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value).map(([key, nested]) => [key, sanitizeObject(nested)])
        );
    }
    return value;
}

// ============================================
// REUSABLE PRIMITIVE SCHEMAS
// ============================================

const emailSchema = z.string().email().max(254).transform(sanitizeText);

const passwordSchema = z.string().min(8).max(128);

const nameSchema = z.string().min(1).max(100).transform(sanitizeStrict);

const organizationSchema = z.string().min(1).max(200).transform(sanitizeStrict).optional();

const roleSchema = z.enum(['client', 'interpreter', 'captioner', 'admin', 'superadmin']);

const phoneNumberSchema = z.string()
    .regex(/^\+?\d{7,16}$/, 'Invalid phone number format')
    .transform(v => v.replace(/[^\d+]/g, ''));

const positiveIntSchema = z.coerce.number().int().positive().finite();

const nonNegativeIntSchema = z.coerce.number().int().nonnegative().finite();

const uuidSchema = z.string().uuid();

const idSchema = z.string().min(1).max(120).transform(sanitizeText);

const roomNameSchema = z.string().min(1).max(120).regex(/^[A-Za-z0-9_-]+$/, 'Invalid room name');

const languageSchema = z.string().min(1).max(20).transform(sanitizeText);

const sanitizedStringSchema = z.string().max(1000).transform(sanitizeStrict);

const optionalSanitizedStringSchema = sanitizedStringSchema.optional();

const metadataSchema = z.record(z.unknown()).optional().default({}).transform(sanitizeObject);

const emptyBodySchema = z.object({}).passthrough();

const languagesArraySchema = z.array(languageSchema).min(1).optional().default(['ASL']);

const serviceModeSchema = z.enum(['vri', 'vrs']);

const serviceModesArraySchema = z.array(serviceModeSchema).min(1).optional();

// ============================================
// EXPRESS ERROR FORMAT
// ============================================

/**
 * Build the standard error response body.
 *
 * { error: string, code: string, details?: object }
 */
function formatValidationErrors(zodError) {
    const details = {};
    for (const issue of zodError.issues) {
        const key = issue.path.join('.') || '_root';
        if (!details[key]) {
            details[key] = issue.message;
        }
    }
    return {
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details
    };
}

/**
 * Express middleware factory.
 * Returns middleware that validates `req[location]` against the given Zod schema.
 *
 * @param {import('zod').ZodSchema} schema
 * @param {'body' | 'query'} location - Which part of the request to validate
 */
function validate(schema, location = 'body') {
    return (req, res, next) => {
        const result = schema.safeParse(req[location]);
        if (!result.success) {
            const { error, code, details } = formatValidationErrors(result.error);
            return res.status(400).json({ error, code, details });
        }
        // Replace with parsed/sanitized values
        req[location] = result.data;
        next();
    };
}

/**
 * Validate a plain object (e.g. WebSocket payload) against a Zod schema.
 * Returns { success, data?, error? }.
 */
function validatePayload(schema, payload) {
    const result = schema.safeParse(payload);
    if (result.success) {
        return { success: true, data: result.data };
    }
    const formatted = formatValidationErrors(result.error);
    return { success: false, error: formatted };
}

function inferErrorCode(statusCode) {
    if (statusCode === 400) return 'BAD_REQUEST';
    if (statusCode === 401) return 'AUTH_REQUIRED';
    if (statusCode === 403) return 'FORBIDDEN';
    if (statusCode === 404) return 'NOT_FOUND';
    if (statusCode === 409) return 'CONFLICT';
    if (statusCode === 410) return 'ENDPOINT_RETIRED';
    if (statusCode === 429) return 'RATE_LIMITED';
    if (statusCode === 503) return 'SERVICE_UNAVAILABLE';
    if (statusCode >= 500) return 'INTERNAL_ERROR';
    return 'ERROR';
}

function normalizeErrorBody(statusCode, body) {
    const safeBody = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
    const error = typeof safeBody.error === 'string' ? safeBody.error : 'Request failed';
    const code = typeof safeBody.code === 'string' ? safeBody.code : inferErrorCode(statusCode);
    const normalized = { ...safeBody, error, code };

    if (IS_PRODUCTION && statusCode >= 500) {
        delete normalized.details;
        normalized.error = 'Internal server error';
        normalized.code = 'INTERNAL_ERROR';
    }

    return normalized;
}

function standardizeErrorResponses(req, res, next) {
    const originalJson = res.json.bind(res);
    res.json = (body) => {
        if (res.statusCode >= 400) {
            return originalJson(normalizeErrorBody(res.statusCode, body));
        }
        return originalJson(body);
    };
    next();
}

function centralizedErrorHandler(logger) {
    return (error, req, res, _next) => {
        const requestLogger = req.log || logger;
        if (requestLogger?.error) {
            requestLogger.error({ err: error }, 'Unhandled server error');
        }

        if (res.headersSent) {
            return;
        }

        res.status(error.statusCode || error.status || 500).json({
            error: error.expose ? error.message : 'Internal server error',
            code: error.code || inferErrorCode(error.statusCode || error.status || 500),
            ...(!IS_PRODUCTION && { details: { message: error.message } })
        });
    };
}

module.exports = {
    z,
    ZodError,
    sanitizeText,
    sanitizeStrict,
    // Primitive schemas
    emailSchema,
    passwordSchema,
    nameSchema,
    organizationSchema,
    roleSchema,
    phoneNumberSchema,
    positiveIntSchema,
    nonNegativeIntSchema,
    uuidSchema,
    idSchema,
    roomNameSchema,
    languageSchema,
    sanitizedStringSchema,
    optionalSanitizedStringSchema,
    metadataSchema,
    emptyBodySchema,
    languagesArraySchema,
    serviceModeSchema,
    serviceModesArraySchema,
    // Helpers
    sanitizeObject,
    formatValidationErrors,
    normalizeErrorBody,
    standardizeErrorResponses,
    centralizedErrorHandler,
    validate,
    validatePayload
};
