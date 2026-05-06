/**
 * VRS Contacts Screen.
 *
 * Displays saved contacts with favorites, search, and call/dial actions.
 * Backed by /api/contacts endpoint.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    FlatList,
    SafeAreaView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { useDispatch } from 'react-redux';

import { appNavigate } from '../../../../app/actions';
import { apiClient } from '../../../../shared/api-client';
import { getPersistentJson, setPersistentItem } from '../../../../vrs-auth/storage';
import { navigateRoot } from '../../rootNavigationContainerRef';
import { mobileLog } from '../../logging';
import { screen } from '../../routes';
import { Contact } from '../../../types';

const DEV_CONTACTS: Contact[] = [
    { id: '1', name: 'Dr. Sarah Chen', phoneNumber: '+12125551234', lastCalled: '2026-04-28', isFavorite: true },
    { id: '2', name: 'Mom', phoneNumber: '+14155559876', lastCalled: '2026-04-27', isFavorite: true },
    { id: '3', name: 'Pizza Palace', phoneNumber: '+12125557777', lastCalled: '2026-04-25' },
    { id: '4', name: 'Work — Front Desk', phoneNumber: '+12125553000', lastCalled: '2026-04-22' },
    { id: '5', name: 'Pharmacy', phoneNumber: '+12125554444' }
];

const FAVORITES_KEY = 'vrs_favorite_contacts';

interface ContactsResponse {
    contacts?: Array<Record<string, unknown>>;
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
        name: stringField(raw.name || raw.displayName || raw.email || raw.phoneNumber || raw.phone_number, 'Unnamed contact'),
        phoneNumber: optionalStringField(raw.phoneNumber || raw.phone_number),
        handle: optionalStringField(raw.handle || raw.contact_handle),
        email: optionalStringField(raw.email),
        lastCalled: optionalStringField(raw.lastCalled || raw.last_called),
        notes: optionalStringField(raw.notes),
        isFavorite: Boolean(raw.isFavorite ?? raw.is_favorite)
    };
}

const ContactsScreen = () => {
    const dispatch = useDispatch();
    const [ search, setSearch ] = useState('');
    const [ showFavoritesOnly, setShowFavoritesOnly ] = useState(false);
    const [ contacts, setContacts ] = useState<Contact[]>(() => {
        const stored = getPersistentJson<Contact[]>('vrs_contacts');
        if (stored && stored.length > 0) {
            return stored;
        }

        return __DEV__ ? DEV_CONTACTS : [];
    });

    // Load favorite IDs from storage
    const favoriteIds = useMemo(() => new Set(
        getPersistentJson<string[]>(FAVORITES_KEY) || contacts.filter(c => c.isFavorite).map(c => c.id)
    ), [ contacts ]);

    useEffect(() => {
        let mounted = true;

        async function loadContacts() {
            const response = await apiClient.get<ContactsResponse>('/api/contacts');

            if (!mounted) {
                return;
            }

            if (response.error) {
                mobileLog('warn', 'contacts_load_failed', { error: response.error });

                return;
            }

            const nextContacts = (response.data?.contacts || []).map(normalizeContact);

            setContacts(nextContacts);
            setPersistentItem('vrs_contacts', JSON.stringify(nextContacts));
        }

        void loadContacts();

        return () => {
            mounted = false;
        };
    }, []);

    const handleToggleFavorite = useCallback((contactId: string) => {
        const ids = new Set(favoriteIds);

        if (ids.has(contactId)) {
            ids.delete(contactId);
        } else {
            ids.add(contactId);
        }

        const updatedContacts = contacts.map(c => ({
            ...c,
            isFavorite: ids.has(c.id)
        }));

        setPersistentItem(FAVORITES_KEY, JSON.stringify([ ...ids ]));
        setContacts(updatedContacts);
        setPersistentItem('vrs_contacts', JSON.stringify(updatedContacts));

        const contact = updatedContacts.find(c => c.id === contactId);

        if (contact) {
            void apiClient.put(`/api/contacts/${contact.id}`, {
                isFavorite: contact.isFavorite
            }).then(response => {
                if (response.error) {
                    mobileLog('warn', 'contact_favorite_sync_failed', {
                        contactId,
                        error: response.error
                    });
                }
            });
        }
    }, [ contacts, favoriteIds ]);

    const handleCall = useCallback((contact: Contact) => {
        const roomName = `vrs-${ Date.now() }`;

        dispatch(appNavigate(roomName, { hidePrejoin: true }));
    }, [ dispatch ]);

    const handleContactPress = useCallback((contact: Contact) => {
        setPersistentItem('vrs_selected_contact', JSON.stringify(contact));
        navigateRoot(screen.vrs.contactDetail);
    }, []);

    const filteredContacts = contacts.filter(c => {
        const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase())
            || c.phoneNumber?.includes(search)
            || c.handle?.toLowerCase().includes(search)
            || c.email?.toLowerCase().includes(search.toLowerCase());

        if (showFavoritesOnly) {
            return matchesSearch && (c.isFavorite || favoriteIds.has(c.id));
        }

        return matchesSearch;
    });

    // Sort: favorites first, then alphabetically
    const sortedContacts = [ ...filteredContacts ].sort((a, b) => {
        const aFav = a.isFavorite || favoriteIds.has(a.id) ? 1 : 0;
        const bFav = b.isFavorite || favoriteIds.has(b.id) ? 1 : 0;

        if (aFav !== bFav) {
            return bFav - aFav;
        }

        return a.name.localeCompare(b.name);
    });

    const renderContact = useCallback(({ item }: { item: Contact }) => {
        const isFav = item.isFavorite || favoriteIds.has(item.id);

        return (
            <TouchableOpacity
                accessibilityLabel = { `${item.name}, ${isFav ? 'favorite' : 'not favorite'}, ${item.phoneNumber || 'no number'}` }
                onPress = { () => handleContactPress(item) }
                style = { styles.contactRow }>
                <View style = { [ styles.avatar, isFav && styles.avatarFav ] }>
                    <Text style = { styles.avatarText }>
                        { item.name.charAt(0).toUpperCase() }
                    </Text>
                </View>
                <View style = { styles.contactInfo }>
                    <Text style = { styles.contactName }>{ item.name }</Text>
                    <Text style = { styles.contactPhone }>
                        { item.handle ? `@${item.handle}` : item.phoneNumber || 'No number' }
                    </Text>
                </View>
                <TouchableOpacity
                    accessibilityLabel = { isFav ? 'Remove from favorites' : 'Add to favorites' }
                    onPress = { () => handleToggleFavorite(item.id) }
                    style = { styles.favButton }>
                    <Text style = { [ styles.favIcon, isFav && styles.favIconActive ] }>
                        { isFav ? '\u2605' : '\u2606' }
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    accessibilityLabel = { `Call ${item.name}` }
                    onPress = { () => handleCall(item) }
                    style = { styles.callIconButton }>
                    <Text style = { styles.callIcon }>{'\u{1F4DE}'}</Text>
                </TouchableOpacity>
            </TouchableOpacity>
        );
    }, [ handleContactPress, handleCall, handleToggleFavorite, favoriteIds ]);

    const favoriteCount = contacts.filter(c => c.isFavorite || favoriteIds.has(c.id)).length;

    return (
        <SafeAreaView style = { styles.container }>
            {/* Search + Filter */}
            <View style = { styles.searchContainer }>
                <TextInput
                    accessibilityLabel = 'Search contacts'
                    onChangeText = { setSearch }
                    placeholder = 'Search contacts'
                    placeholderTextColor = '#666'
                    style = { styles.searchInput }
                    value = { search } />
            </View>
            <View style = { styles.filterRow }>
                <TouchableOpacity
                    accessibilityLabel = { showFavoritesOnly ? 'Show all contacts' : 'Show favorites only' }
                    accessibilityRole = 'switch'
                    onPress = { () => setShowFavoritesOnly(!showFavoritesOnly) }
                    style = { [ styles.filterButton, showFavoritesOnly && styles.filterButtonActive ] }>
                    <Text style = { [ styles.filterText, showFavoritesOnly && styles.filterTextActive ] }>
                        {'\u2605'} Favorites{ favoriteCount > 0 ? ` (${favoriteCount})` : '' }
                    </Text>
                </TouchableOpacity>
                <Text style = { styles.countText }>
                    { sortedContacts.length } contact{ sortedContacts.length !== 1 ? 's' : '' }
                </Text>
            </View>

            {/* List */}
            <FlatList
                data = { sortedContacts }
                keyExtractor = { item => item.id }
                renderItem = { renderContact }
                contentContainerStyle = { styles.listContent }
                ListEmptyComponent = {(
                    <Text style = { styles.empty }>
                        { showFavoritesOnly ? 'No favorite contacts' : search ? 'No contacts found' : 'No contacts yet' }
                    </Text>
                )} />
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    avatar: {
        alignItems: 'center',
        backgroundColor: '#2979ff',
        borderRadius: 20,
        height: 40,
        justifyContent: 'center',
        width: 40
    },
    avatarFav: {
        backgroundColor: '#f47d22'
    },
    avatarText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '600'
    },
    callIcon: {
        fontSize: 22
    },
    callIconButton: {
        padding: 8
    },
    container: {
        backgroundColor: '#0f0f23',
        flex: 1
    },
    contactInfo: {
        flex: 1,
        marginLeft: 12
    },
    contactName: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '500'
    },
    contactPhone: {
        color: '#888',
        fontSize: 13,
        marginTop: 2
    },
    contactRow: {
        alignItems: 'center',
        flexDirection: 'row',
        paddingHorizontal: 20,
        paddingVertical: 12
    },
    countText: {
        color: '#666',
        fontSize: 12
    },
    empty: {
        color: '#666',
        fontSize: 14,
        padding: 40,
        textAlign: 'center'
    },
    favButton: {
        padding: 6
    },
    favIcon: {
        color: '#555',
        fontSize: 20
    },
    favIconActive: {
        color: '#f47d22'
    },
    filterButton: {
        backgroundColor: '#1a1a2e',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 6
    },
    filterButtonActive: {
        backgroundColor: '#f47d22'
    },
    filterRow: {
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingBottom: 8
    },
    filterText: {
        color: '#888',
        fontSize: 13,
        fontWeight: '500'
    },
    filterTextActive: {
        color: '#fff'
    },
    listContent: {
        paddingBottom: 40
    },
    searchContainer: {
        paddingHorizontal: 16,
        paddingVertical: 12
    },
    searchInput: {
        backgroundColor: '#1a1a2e',
        borderRadius: 10,
        color: '#fff',
        fontSize: 15,
        padding: 12
    }
});

export default ContactsScreen;
