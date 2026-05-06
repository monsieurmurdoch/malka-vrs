const redis = require('./redis-client');
const log = require('./logger').module('rate-limit');

class RedisRateLimitStore {
    constructor(options = {}) {
        this.prefix = options.prefix || process.env.REDIS_RATE_LIMIT_PREFIX || 'vrs:rate-limit';
        this.windowMs = Number(options.windowMs || 60 * 1000);
        this.localHits = new Map();
    }

    init(options = {}) {
        if (options.windowMs) {
            this.windowMs = Number(options.windowMs);
        }
    }

    async increment(key) {
        const redisKey = this.keyFor(key);

        if (redis.isEnabled()) {
            try {
                const totalHits = await redis.incr(redisKey);

                if (Number.isFinite(totalHits)) {
                    if (totalHits === 1) {
                        await redis.pexpire(redisKey, this.windowMs);
                    }

                    let ttl = await redis.pttl(redisKey);

                    if (!Number.isFinite(ttl) || ttl < 0) {
                        await redis.pexpire(redisKey, this.windowMs);
                        ttl = this.windowMs;
                    }

                    return {
                        resetTime: new Date(Date.now() + ttl),
                        totalHits
                    };
                }
            } catch (err) {
                log.warn({ err, key: redisKey }, 'Redis rate-limit increment failed; using local fallback');
            }
        }

        return this.localIncrement(key);
    }

    async decrement(key) {
        if (redis.isEnabled()) {
            const redisKey = this.keyFor(key);
            try {
                const totalHits = await redis.command(['DECR', redisKey]);
                if (Number.isFinite(totalHits) && totalHits <= 0) {
                    await redis.del(redisKey);
                }
                return;
            } catch (err) {
                log.warn({ err, key: redisKey }, 'Redis rate-limit decrement failed');
            }
        }

        const entry = this.localHits.get(key);
        if (!entry) return;
        entry.totalHits = Math.max(0, entry.totalHits - 1);
        if (entry.totalHits === 0) this.localHits.delete(key);
    }

    async resetKey(key) {
        if (redis.isEnabled()) {
            try {
                await redis.del(this.keyFor(key));
            } catch (err) {
                log.warn({ err, key: this.keyFor(key) }, 'Redis rate-limit reset failed');
            }
        }
        this.localHits.delete(key);
    }

    async resetAll() {
        this.localHits.clear();
    }

    keyFor(key) {
        return `${this.prefix}:${key}`;
    }

    localIncrement(key) {
        const now = Date.now();
        let entry = this.localHits.get(key);

        if (!entry || entry.resetTime.getTime() <= now) {
            entry = {
                resetTime: new Date(now + this.windowMs),
                totalHits: 0
            };
            this.localHits.set(key, entry);
        }

        entry.totalHits += 1;

        return {
            resetTime: entry.resetTime,
            totalHits: entry.totalHits
        };
    }
}

function createRedisRateLimitStore(options = {}) {
    return new RedisRateLimitStore(options);
}

module.exports = {
    RedisRateLimitStore,
    createRedisRateLimitStore
};
