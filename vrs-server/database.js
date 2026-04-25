'use strict';

// Compatibility bridge for legacy CommonJS routes and scripts.
// The canonical PostgreSQL implementation now lives in src/database.ts and
// is compiled to dist/database.js by npm run build.
module.exports = require('./dist/database');
