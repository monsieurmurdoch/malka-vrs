/**
 * Contact Detail Screen.
 *
 * Shows contact info, call history with this contact, and notes.
 * Reached from ContactsScreen by tapping a contact.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { useDispatch } from 'react-redux';

import { appNavigate } from '../../../../app/actions';
import { apiClient } from '../../../../shared/api-client';
import { getPersistentItem, getPersistentJson, setPersistentItem } from '../../../../vrs-auth/storage';
import { navigateRoot } from '../../rootNavigationContainerRef';
import { mobileLog } from '../../logging';
import { screen } from '../../routes';
import { CallRecord, Contact } from '../../../types';

interface ContactResponse {
    contact?: Record<string, unknown>;
}

function stringField(value: unknown, fallback = ''): string {
    return typeof value === 'string' && value ? value : fallback;
}

function optionalStringField(value: unknown): string | undefined {
    return typeof value === 'string' && value ? value : undefined;
}

function normalizeContact(raw: Record<string, unknown>): Contact {
    return {
        id: String(raw.id),
        name: stringField(raw.name || raw.displayName || raw.email || raw.phoneNumber || raw.phone_number, 'Unknown'),
        phoneNumber: optionalStringField(raw.phoneNumber || raw.phone_number),
        handle: optionalStringField(raw.handle || raw.contact_handle),
        email: optionalStringField(raw.email),
        notes: optionalStringField(raw.notes)
    };
}

const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;

    return `${m}m ${s}s`;
};

const formatTime = (iso: string) => {
    const d = new Date(iso);

    return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
        + ` ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};

const ContactDetailScreen = () => {
    const dispatch = useDispatch();

    // In a real app these come from route params; using storage for now
    const contacts = getPersistentJson<Contact[]>('vrs_contacts') || [];
    const selectedContact = getPersistentJson<Contact>('vrs_selected_contact');
    const legacyContactId = getPersistentItem('vrs_selected_contact') || '';
    const selectedId = selectedContact?.id || legacyContactId;
    const initialContact = contacts.find(c => c.id === selectedId) || selectedContact || {
        id: selectedId,
        name: 'Unknown',
        phoneNumber: '',
        handle: '',
        email: ''
    };

    const [ contact, setContact ] = useState<Contact>(initialContact);
    const [ notes, setNotes ] = useState(initialContact.notes || '');

    useEffect(() => {
        if (!selectedId) {
            return;
        }

        let mounted = true;

        apiClient.get<ContactResponse>(`/api/contacts/${selectedId}`).then(response => {
            if (!mounted) {
                return;
            }

            if (response.error || !response.data?.contact) {
                if (response.error) {
                    mobileLog('warn', 'contact_detail_load_failed', {
                        contactId: selectedId,
                        error: response.error
                    });
                }

                return;
            }

            const nextContact = normalizeContact(response.data.contact);

            setContact(nextContact);
            setNotes(nextContact.notes || '');
        });

        return () => {
            mounted = false;
        };
    }, [ selectedId ]);

    // Filter call history to this contact
    const allHistory = getPersistentJson<CallRecord[]>('vrs_call_history') || [];
    const callHistory = allHistory.filter(
        c => c.contactName.toLowerCase() === contact.name.toLowerCase()
    );

    const handleCall = useCallback(() => {
        const roomName = `vrs-${Date.now()}`;

        dispatch(appNavigate(roomName, { hidePrejoin: true }));
    }, [ dispatch ]);

    const handleSaveNotes = useCallback(() => {
        const hasContact = contacts.some(c => c.id === contact.id);
        const nextContact = { ...contact, notes };
        const updated = hasContact
            ? contacts.map(c => (c.id === contact.id ? nextContact : c))
            : [ nextContact, ...contacts ];

        setPersistentItem('vrs_contacts', JSON.stringify(updated));
        setContact(nextContact);
        setPersistentItem('vrs_selected_contact', JSON.stringify(nextContact));
        void apiClient.put(`/api/contacts/${contact.id}`, { notes }).then(response => {
            if (response.error) {
                mobileLog('warn', 'contact_notes_sync_failed', {
                    contactId: contact.id,
                    error: response.error
                });
            }
        });
    }, [ contacts, contact, notes ]);

    const handleBack = useCallback(() => {
        navigateRoot(screen.vrs.contacts);
    }, []);

    return (
        <SafeAreaView style = { styles.container }>
            <View style = { styles.header }>
                <TouchableOpacity
                    accessibilityLabel = 'Back to contacts'
                    onPress = { handleBack }>
                    <Text style = { styles.backText }>{'<'} Contacts</Text>
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle = { styles.content }>
                {/* Contact Info */}
                <View style = { styles.profileCard }>
                    <View style = { styles.avatar }>
                        <Text style = { styles.avatarText }>
                            { contact.name.charAt(0).toUpperCase() }
                        </Text>
                    </View>
                    <Text style = { styles.name }>{ contact.name }</Text>
                    { contact.handle ? (
                        <Text style = { styles.phone }>{ `@${contact.handle}` }</Text>
                    ) : null }
                    { contact.phoneNumber ? (
                        <Text style = { styles.phone }>{ contact.phoneNumber }</Text>
                    ) : null }
                    { contact.email ? (
                        <Text style = { styles.email }>{ contact.email }</Text>
                    ) : null }

                    <TouchableOpacity
                        accessibilityLabel = { `Call ${contact.name}` }
                        onPress = { handleCall }
                        style = { styles.callButton }>
                        <Text style = { styles.callButtonText }>Call</Text>
                    </TouchableOpacity>
                </View>

                {/* Notes */}
                <Text style = { styles.sectionTitle }>Notes</Text>
                <TextInput
                    blurOnSubmit = { false }
                    multiline
                    onBlur = { handleSaveNotes }
                    onChangeText = { setNotes }
                    placeholder = 'Add notes about this contact...'
                    placeholderTextColor = '#555'
                    style = { styles.notesInput }
                    value = { notes } />

                {/* Call History */}
                <Text style = { styles.sectionTitle }>
                    Call History ({ callHistory.length })
                </Text>
                { callHistory.length === 0 ? (
                    <Text style = { styles.empty }>No calls with this contact yet</Text>
                ) : (
                    callHistory.map(call => (
                        <View key = { call.id } style = { styles.historyRow }>
                            <Text style = { styles.historyTime }>
                                { formatTime(call.timestamp) }
                            </Text>
                            <Text style = { styles.historyDuration }>
                                { formatDuration(call.duration) }
                            </Text>
                            { call.interpreterName && (
                                <Text style = { styles.historyInterpreter }>
                                    via { call.interpreterName }
                                </Text>
                            ) }
                        </View>
                    ))
                ) }
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    avatar: {
        alignItems: 'center',
        backgroundColor: '#2979ff',
        borderRadius: 32,
        height: 64,
        justifyContent: 'center',
        marginBottom: 12,
        width: 64
    },
    avatarText: {
        color: '#fff',
        fontSize: 28,
        fontWeight: '600'
    },
    backText: {
        color: '#2979ff',
        fontSize: 15
    },
    callButton: {
        alignItems: 'center',
        backgroundColor: '#2979ff',
        borderRadius: 10,
        marginTop: 16,
        paddingVertical: 10,
        width: '100%'
    },
    callButtonText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '600'
    },
    container: {
        backgroundColor: '#0f0f23',
        flex: 1
    },
    content: {
        paddingBottom: 40,
        paddingHorizontal: 20
    },
    email: {
        color: '#888',
        fontSize: 13,
        marginTop: 2
    },
    empty: {
        color: '#555',
        fontSize: 13,
        fontStyle: 'italic',
        paddingVertical: 8
    },
    header: {
        paddingHorizontal: 20,
        paddingVertical: 14
    },
    historyDuration: {
        color: '#aaa',
        fontSize: 12
    },
    historyInterpreter: {
        color: '#666',
        fontSize: 11
    },
    historyRow: {
        backgroundColor: '#1a1a2e',
        borderBottomColor: '#252540',
        borderBottomWidth: 1,
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        paddingHorizontal: 14,
        paddingVertical: 10
    },
    historyTime: {
        color: '#ddd',
        fontSize: 13,
        fontWeight: '500'
    },
    name: {
        color: '#fff',
        fontSize: 22,
        fontWeight: '700'
    },
    notesInput: {
        backgroundColor: '#1a1a2e',
        borderRadius: 10,
        color: '#ddd',
        fontSize: 14,
        minHeight: 80,
        padding: 14,
        textAlignVertical: 'top'
    },
    phone: {
        color: '#aaa',
        fontSize: 15,
        marginTop: 4
    },
    profileCard: {
        alignItems: 'center',
        backgroundColor: '#1a1a2e',
        borderRadius: 16,
        marginBottom: 20,
        padding: 24
    },
    sectionTitle: {
        color: '#888',
        fontSize: 12,
        fontWeight: '600',
        letterSpacing: 0.5,
        marginBottom: 8,
        marginTop: 16,
        textTransform: 'uppercase'
    }
});

export default ContactDetailScreen;
