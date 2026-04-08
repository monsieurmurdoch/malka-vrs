/**
 * VRS Operations Module
 *
 * Provides client access to the VRS Ops backend for:
 * - Call logging and tracking
 * - Interpreter status management
 * - Live dashboard data
 * - Real-time updates via WebSocket
 */

export { default as vrsOpsClient, VRSOpsClient } from './VRSOpsClient';
export * from './VRSOpsClient';
