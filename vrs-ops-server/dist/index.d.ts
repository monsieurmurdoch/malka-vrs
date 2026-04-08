/**
 * VRS Operations Server
 *
 * Backend for:
 * - Call logging and tracking
 * - Interpreter status management
 * - Live dashboard data
 * - Admin API
 */
import { Express } from 'express';
declare const app: Express;
declare const server: import("http").Server<typeof import("http").IncomingMessage, typeof import("http").ServerResponse>;
declare const wss: import("ws").Server<typeof import("ws"), typeof import("http").IncomingMessage>;
export { app, server, wss };
//# sourceMappingURL=index.d.ts.map