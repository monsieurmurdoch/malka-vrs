import {
    adminSmokeChecks,
    apiContractEntries,
    apiContractSchemas,
    getApiResponseSchema,
    liveSmokeChecks,
    queueEventSchemas,
    queueSequenceContracts
} from '../../../contracts';

describe('shared API and queue contracts', () => {
    it('keeps smoke manifest endpoint lists available to scripts and tests', () => {
        expect(liveSmokeChecks.map(check => check.label)).toContain('Queue health');
        expect(adminSmokeChecks.map(check => check.label)).toContain('Queue admin stats');
        expect(liveSmokeChecks.every(check => check.base && check.path.startsWith('/'))).toBe(true);
        expect(adminSmokeChecks.every(check => check.base && check.path.startsWith('/'))).toBe(true);
    });

    it('maps API manifest entries to concrete response schemas', () => {
        for (const entry of apiContractEntries) {
            expect(apiContractSchemas[entry.schema]).toBeDefined();
            expect(getApiResponseSchema(entry.method, `${entry.path}?cacheBust=1`)).toBe(apiContractSchemas[entry.schema]);
        }
    });

    it('parses representative shared API client responses', () => {
        expect(apiContractSchemas.authLoginResponse.parse({
            token: 'jwt-token',
            user: {
                email: 'client@example.com',
                id: 'client-1',
                name: 'Client One',
                role: 'client',
                serviceModes: [ 'vrs' ],
                tenantId: 'malka'
            }
        })).toMatchObject({ token: 'jwt-token' });

        expect(apiContractSchemas.contactsListResponse.parse({
            contacts: [ {
                id: 'contact-1',
                handle: 'ruthie',
                isFavorite: true,
                name: 'Ruthie',
                phoneNumber: '+15551234567'
            } ]
        })).toMatchObject({ contacts: [ { id: 'contact-1' } ] });

        expect(apiContractSchemas.callHistoryResponse.parse({
            calls: [ {
                contactName: 'Nataly',
                direction: 'outgoing',
                duration: 120,
                id: 'call-1',
                phoneNumber: '+15557654321',
                timestamp: '2026-05-03T12:00:00.000Z'
            } ]
        })).toMatchObject({ calls: [ { id: 'call-1' } ] });

        expect(apiContractSchemas.voicemailInboxResponse.parse({
            voicemails: [ {
                duration: 24,
                fromName: 'Client',
                id: 'vm-1',
                isRead: false,
                playbackUrl: 'https://example.test/vm.mp4',
                timestamp: '2026-05-03T12:00:00.000Z'
            } ]
        })).toMatchObject({ voicemails: [ { id: 'vm-1' } ] });
    });

    it('parses representative queue WebSocket payloads', () => {
        expect(queueEventSchemas.queueStatus.parse({
            activeInterpreters: [ {
                id: 'interp-1',
                languages: [ 'ASL' ],
                name: 'Interpreter One',
                status: 'active'
            } ],
            pendingRequests: [ {
                clientName: 'Client One',
                id: 'req-1',
                language: 'ASL',
                position: 1,
                roomName: 'vrs-test-room'
            } ],
            totalMatches: 3
        })).toMatchObject({ totalMatches: 3 });

        expect(queueEventSchemas.interpreterRequest.parse({
            clientName: 'Client One',
            id: 'req-1',
            language: 'ASL',
            roomName: 'vrs-test-room'
        })).toMatchObject({ id: 'req-1' });

        expect(queueEventSchemas.meetingInitiated.parse({
            callId: 'call-1',
            clientId: 'client-1',
            interpreterId: 'interp-1',
            requestId: 'req-1',
            roomName: 'vrs-test-room'
        })).toMatchObject({ callId: 'call-1' });

        expect(queueEventSchemas.callEnded.parse({
            callId: 'call-1',
            callType: 'vri',
            clientId: 'client-1',
            durationMinutes: 5,
            endedBy: 'interp-1',
            interpreterId: 'interp-1',
            roomName: 'vri-test-room'
        })).toMatchObject({ callId: 'call-1', callType: 'vri' });
    });

    it('keeps queue sequence contracts pointed at declared event schemas', () => {
        for (const sequence of Object.values(queueSequenceContracts)) {
            for (const eventName of sequence) {
                expect(queueEventSchemas[eventName]).toBeDefined();
            }
        }
    });
});
