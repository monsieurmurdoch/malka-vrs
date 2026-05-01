/**
 * Smoke test fixtures for demo accounts on iOS/Android.
 *
 * These fixtures provide the seed data needed to run the mobile
 * smoke flow: login → profile → request interpreter → match → call → end.
 *
 * These mirror the PostgreSQL seed data from vrs-server/smoke-seed.js.
 *
 * Usage:
 *   import { DEMO_ACCOUNTS, DEMO_CALL_HISTORY, seedDemoData } from './demo-fixtures';
 *   seedDemoData(); // populates AsyncStorage with demo data
 */

import {
    setPersistentItem,
    getPersistentJson
} from '../../vrs-auth/storage';
import type { UserInfo, Contact, CallRecord } from '../types';

// Extended profile for fixtures that includes interpreter-specific fields
interface DemoUserProfile extends UserInfo {
    languages?: string[];
}

// ---------------
// Demo Accounts
// ---------------

export interface DemoAccount {
    email: string;
    password: string;
    role: 'client' | 'interpreter';
    tenantId: string;
    profile: DemoUserProfile;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
    {
        email: 'client@malkacomm.com',
        password: 'demo1234',
        role: 'client',
        tenantId: 'malka',
        profile: {
            id: 'demo-malka-client',
            name: 'Malka Demo Client',
            role: 'client',
            languages: [ 'ASL', 'English' ],
            serviceModes: [ 'vrs' ]
        }
    },
    {
        email: 'interpreter@malkacomm.com',
        password: 'demo1234',
        role: 'interpreter',
        tenantId: 'malka',
        profile: {
            id: 'demo-malka-interpreter',
            name: 'Malka Demo Interpreter',
            role: 'interpreter',
            languages: [ 'ASL', 'English', 'French' ],
            serviceModes: [ 'vrs', 'vri' ]
        }
    },
    {
        email: 'client@maplecomm.ca',
        password: 'demo1234',
        role: 'client',
        tenantId: 'maple',
        profile: {
            id: 'demo-maple-client',
            name: 'Maple Demo Client',
            role: 'client',
            languages: [ 'ASL', 'English', 'French' ],
            serviceModes: [ 'vri' ]
        }
    },
    {
        email: 'interpreter@maplecomm.ca',
        password: 'demo1234',
        role: 'interpreter',
        tenantId: 'maple',
        profile: {
            id: 'demo-maple-interpreter',
            name: 'Maple Demo Interpreter',
            role: 'interpreter',
            languages: [ 'ASL', 'LSQ', 'English', 'French' ],
            serviceModes: [ 'vri' ]
        }
    }
];

// ---------------
// Demo Contacts
// ---------------

export const DEMO_CONTACTS: Contact[] = [
    {
        id: 'contact-1',
        name: 'Sarah Johnson',
        phoneNumber: '555-0101',
        email: 'sarah@example.com',
        lastCalled: '2026-04-28T14:30:00Z',
        notes: 'Prefers ASL interpreter'
    },
    {
        id: 'contact-2',
        name: 'Maple Corp Front Desk',
        phoneNumber: '555-0200',
        email: 'frontdesk@maplecorp.ca',
        lastCalled: '2026-04-27T09:15:00Z',
        notes: 'Maple Corp'
    },
    {
        id: 'contact-3',
        name: 'Dr. Emily Chen',
        phoneNumber: '555-0303',
        email: 'dr.chen@healthclinic.com',
        lastCalled: '2026-04-25T16:45:00Z',
        notes: 'Medical appointments'
    }
];

// ---------------
// Demo Call History
// ---------------

export const DEMO_CALL_HISTORY: CallRecord[] = [
    {
        id: 'call-1',
        contactName: 'Sarah Johnson',
        phoneNumber: '555-0101',
        direction: 'outgoing',
        duration: 480,
        timestamp: '2026-04-28T14:30:00Z',
        interpreterName: 'Malka Demo Interpreter'
    },
    {
        id: 'call-2',
        contactName: 'Maple Corp Front Desk',
        phoneNumber: '555-0200',
        direction: 'incoming',
        duration: 210,
        timestamp: '2026-04-27T09:15:00Z'
    },
    {
        id: 'call-3',
        contactName: 'Dr. Emily Chen',
        phoneNumber: '555-0303',
        direction: 'outgoing',
        duration: 720,
        timestamp: '2026-04-25T16:45:00Z',
        interpreterName: 'Malka Demo Interpreter'
    },
    {
        id: 'call-4',
        contactName: 'Unknown',
        phoneNumber: '555-0404',
        direction: 'missed',
        duration: 0,
        timestamp: '2026-04-24T11:00:00Z'
    }
];

// ---------------
// Seed Function
// ---------------

/**
 * Seeds AsyncStorage with demo data for smoke testing.
 * Call this on app launch when in development/demo mode.
 */
export function seedDemoData() {
    // Only seed if no data exists
    const existingHistory = getPersistentJson<CallRecord[]>('vrs_call_history');
    if (existingHistory && existingHistory.length > 0) {
        return;
    }

    setPersistentItem('vrs_call_history', JSON.stringify(DEMO_CALL_HISTORY));
    setPersistentItem('vrs_contacts', JSON.stringify(DEMO_CONTACTS));
}

/**
 * Seeds demo data for a specific demo account.
 * Simulates the storage state after login.
 */
export function seedDemoLogin(account: DemoAccount) {
    setPersistentItem('vrs_client_auth', 'true');
    setPersistentItem('vrs_user_role', account.role);
    setPersistentItem('vrs_user_info', JSON.stringify(account.profile));
    setPersistentItem('vrs_auth_token', 'demo-jwt-token-' + account.profile.id);
    seedDemoData();
}
