const rootLogger = require('../../lib/logger');

export const logger = rootLogger.logger;
export const child = rootLogger.child;
export const createModuleLogger = rootLogger.module;

export default rootLogger;
