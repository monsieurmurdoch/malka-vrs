const auth = require('../lib/auth');

describe('lib/auth', () => {
    beforeAll(() => {
        auth.init('test-secret-key-for-jest');
    });

    describe('init()', () => {
        it('should store the JWT secret', () => {
            expect(auth.getSecret()).toBe('test-secret-key-for-jest');
        });
    });

    describe('signToken() and verifyJwtToken()', () => {
        it('should sign and verify a token', () => {
            const payload = { id: 'user-1', role: 'client', email: 'a@b.com' };
            const token = auth.signToken(payload);
            expect(typeof token).toBe('string');

            const decoded = auth.verifyJwtToken(token);
            expect(decoded.id).toBe('user-1');
            expect(decoded.role).toBe('client');
            expect(decoded.email).toBe('a@b.com');
        });

        it('should reject an invalid token', () => {
            expect(() => auth.verifyJwtToken('invalid.token.here')).toThrow();
        });

        it('should respect expiresIn option', () => {
            const payload = { id: 'user-2' };
            const token = auth.signToken(payload, '1ms');

            // Token should expire almost immediately
            return new Promise(resolve => {
                setTimeout(() => {
                    expect(() => auth.verifyJwtToken(token)).toThrow();
                    resolve();
                }, 50);
            });
        });
    });

    describe('normalizeAuthClaims()', () => {
        it('should normalize decoded token fields', () => {
            const result = auth.normalizeAuthClaims({
                email: 'test@test.com',
                id: 'uid-1',
                name: 'Test User',
                role: 'interpreter'
            });

            expect(result).toEqual({
                email: 'test@test.com',
                id: 'uid-1',
                name: 'Test User',
                role: 'interpreter',
                username: 'test@test.com'
            });
        });

        it('should fall back to userId for id', () => {
            const result = auth.normalizeAuthClaims({
                userId: 'alt-id',
                role: 'admin'
            });

            expect(result.id).toBe('alt-id');
        });

        it('should fall back to email for username', () => {
            const result = auth.normalizeAuthClaims({
                email: 'e@e.com',
                role: 'client'
            });

            expect(result.username).toBe('e@e.com');
        });
    });

    describe('tokenMatchesRequestedRole()', () => {
        it('should match identical roles', () => {
            expect(auth.tokenMatchesRequestedRole('admin', 'admin')).toBe(true);
            expect(auth.tokenMatchesRequestedRole('client', 'client')).toBe(true);
        });

        it('should allow superadmin to match admin', () => {
            expect(auth.tokenMatchesRequestedRole('admin', 'superadmin')).toBe(true);
        });

        it('should not allow admin to match superadmin', () => {
            expect(auth.tokenMatchesRequestedRole('superadmin', 'admin')).toBe(false);
        });

        it('should reject mismatched roles', () => {
            expect(auth.tokenMatchesRequestedRole('admin', 'client')).toBe(false);
        });
    });
});
