/**
 * VRS Authentication Service
 *
 * Handles role-based authentication for VRS (Video Relay Service).
 * Roles: client, interpreter, admin
 *
 * Flow:
 * 1. Client selects role on welcome page
 * 2. Frontend calls auth endpoint to get JWT token
 * 3. Token stored in sessionStorage (client) or requires login (interpreter/admin)
 * 4. Token validated on each session start
 */

export { default as VRSSAuthService } from './VRSSAuthService';
export { default as RoleProtectedComponent } from './components/RoleProtectedComponent';
export * from './constants';
export * from './types';
