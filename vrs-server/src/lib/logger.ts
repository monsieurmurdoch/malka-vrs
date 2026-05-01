import pino from 'pino';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const LOG_LEVEL = process.env.LOG_LEVEL || (IS_PRODUCTION ? 'info' : 'debug');

const transport = IS_PRODUCTION
    ? undefined
    : {
        target: 'pino-pretty',
        options: {
            colorize: true,
            ignore: 'pid,hostname',
            translateTime: 'SYS:HH:MM:ss.l'
        }
    };

const logger = pino({
    level: LOG_LEVEL,
    name: process.env.SERVICE_NAME || 'malka-vrs',
    ...(transport ? { transport } : {}),
    redact: {
        censor: '[REDACTED]',
        paths: [ '*.password', '*.password_hash', '*.token', '*.authorization', '*.cookie' ]
    },
    serializers: {
        err: pino.stdSerializers.err,
        error: pino.stdSerializers.err
    }
});

export function moduleLogger(name: string) {
    return logger.child({ module: name });
}

export default logger;
