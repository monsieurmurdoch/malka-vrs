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

const languageSchema = z.string().min(1).max(20).transform(sanitizeText);

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
    languageSchema,
    languagesArraySchema,
    serviceModeSchema,
    serviceModesArraySchema,
    // Helpers
    formatValidationErrors,
    validate,
    validatePayload
};
