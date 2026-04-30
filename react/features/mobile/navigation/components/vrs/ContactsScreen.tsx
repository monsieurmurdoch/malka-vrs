/**
 * VRS Contacts Screen.
 *
 * Displays saved contacts with call/dial actions.
 * Backed by the /api/contacts endpoint.
 */

import React, { useCallback, useEffect, useState } from 'react';
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
import { getPersistentJson, setPersistentItem } from '../../../../vrs-auth/storage';
import { navigateRoot } from '../../rootNavigationContainerRef';
import { screen } from '../../routes';

interface UserInfo {
    id?: string;
}

interface Contact {
    id: string;
    name: string;
    phoneNumber?: string;
    email?: string;
    lastCalled?: string;
}

// Placeholder data — will be replaced with API fetch
const MOCK_CONTACTS: Contact[] = [
    { id: '1', name: 'Dr. Sarah Chen', phoneNumber: '+12125551234', lastCalled: '2026-04-28' },
    { id: '2', name: 'Mom', phoneNumber: '+14155559876', lastCalled: '2026-04-27' },
    { id: '3', name: 'Pizza Palace', phoneNumber: '+12125557777', lastCalled: '2026-04-25' },
    { id: '4', name: 'Work — Front Desk', phoneNumber: '+12125553000', lastCalled: '2026-04-22' },
    { id: '5', name: 'Pharmacy', phoneNumber: '+12125554444' }
];

const ContactsScreen = () => {
    const dispatch = useDispatch();
    const [ search, setSearch ] = useState('');
    const [ contacts, setContacts ] = useState<Contact[]>(MOCK_CONTACTS);

    const filtered = contacts.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase())
        || c.phoneNumber?.includes(search)
    );

    const handleCall = useCallback((contact: Contact) => {
        const roomName = `vrs-${ Date.now() }`;

        dispatch(appNavigate(roomName, { hidePrejoin: true }));
    }, [ dispatch ]);

    const handleContactPress = useCallback((contact: Contact) => {
        setPersistentItem('vrs_selected_contact', contact.id);
        navigateRoot(screen.vrs.contactDetail);
    }, []);

    const renderContact = useCallback(({ item }: { item: Contact }) => (
        <TouchableOpacity
            onPress = { () => handleContactPress(item) }
            style = { styles.contactRow }>
            <View style = { styles.avatar }>
                <Text style = { styles.avatarText }>
                    { item.name.charAt(0).toUpperCase() }
                </Text>
            </View>
            <View style = { styles.contactInfo }>
                <Text style = { styles.contactName }>{ item.name }</Text>
                <Text style = { styles.contactPhone }>
                    { item.phoneNumber || 'No number' }
                </Text>
            </View>
            <TouchableOpacity
                onPress = { () => handleCall(item) }
                style = { styles.callIconButton }>
                <Text style = { styles.callIcon }>{'\u{1F4DE}'}</Text>
            </TouchableOpacity>
        </TouchableOpacity>
    ), [ handleContactPress, handleCall ]);

    return (
        <SafeAreaView style = { styles.container }>
            {/* Search */}
            <View style = { styles.searchContainer }>
                <TextInput
                    onChangeText = { setSearch }
                    placeholder = 'Search contacts'
                    placeholderTextColor = '#666'
                    style = { styles.searchInput }
                    value = { search } />
            </View>

            {/* List */}
            <FlatList
                data = { filtered }
                keyExtractor = { item => item.id }
                renderItem = { renderContact }
                contentContainerStyle = { styles.listContent }
                ListEmptyComponent = {(
                    <Text style = { styles.empty }>
                        { search ? 'No contacts found' : 'No contacts yet' }
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
    empty: {
        color: '#666',
        fontSize: 14,
        padding: 40,
        textAlign: 'center'
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
