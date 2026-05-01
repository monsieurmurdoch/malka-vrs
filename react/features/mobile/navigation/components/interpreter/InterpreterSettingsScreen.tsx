/**
 * Interpreter Settings Screen.
 *
 * Edit profile, service modes, language pairs.
 */

import React, { useCallback, useState } from 'react';
import {
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

import { getPersistentJson, setPersistentItem } from '../../../../vrs-auth/storage';
import { navigateRoot } from '../../rootNavigationContainerRef';
import { screen } from '../../routes';

interface InterpreterProfile {
    id?: string;
    name?: string;
    role?: string;
    languages?: string[];
    serviceModes?: string[];
    captioningEligible?: boolean;
}

const AVAILABLE_LANGUAGES = [
    'ASL', 'LSQ', 'English', 'French', 'Spanish', 'Mandarin'
];

const InterpreterSettingsScreen = () => {
    const profile = getPersistentJson<InterpreterProfile>('vrs_user_info') || {};
    const savedModes = profile.serviceModes || [ 'vrs' ];

    const [ name, setName ] = useState(profile.name || '');
    const [ languages, setLanguages ] = useState<string[]>(profile.languages || [ 'ASL', 'English' ]);
    const [ vrsEnabled, setVrsEnabled ] = useState(savedModes.includes('vrs'));
    const [ vriEnabled, setVriEnabled ] = useState(savedModes.includes('vri'));
    const [ captioningEnabled, setCaptioningEnabled ] = useState(Boolean(profile.captioningEligible));

    const toggleLanguage = useCallback((lang: string) => {
        setLanguages(prev =>
            prev.includes(lang)
                ? prev.filter(l => l !== lang)
                : [ ...prev, lang ]
        );
    }, []);

    const handleSave = useCallback(() => {
        const modes: string[] = [];
        if (vrsEnabled) { modes.push('vrs'); }
        if (vriEnabled) { modes.push('vri'); }
        if (captioningEnabled) { modes.push('captioning'); }

        const updated = {
            ...profile,
            name: name.trim() || profile.name,
            languages,
            serviceModes: modes,
            captioningEligible: captioningEnabled
        };
        setPersistentItem('vrs_user_info', JSON.stringify(updated));
        navigateRoot(screen.interpreter.home);
    }, [ profile, name, languages, vrsEnabled, vriEnabled, captioningEnabled ]);

    return (
        <SafeAreaView style = { styles.container }>
            <View style = { styles.header }>
                <TouchableOpacity onPress = { () => navigateRoot(screen.interpreter.home) }>
                    <Text style = { styles.backText }>{'<'} Back</Text>
                </TouchableOpacity>
                <Text style = { styles.title }>Interpreter Settings</Text>
                <TouchableOpacity onPress = { handleSave }>
                    <Text style = { styles.saveText }>Save</Text>
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle = { styles.content }>
                {/* Name */}
                <Text style = { styles.sectionTitle }>Profile</Text>
                <View style = { styles.field }>
                    <Text style = { styles.label }>Display Name</Text>
                    <TextInput
                        autoCapitalize = 'words'
                        autoCorrect = { false }
                        onChangeText = { setName }
                        placeholderTextColor = '#555'
                        placeholder = 'Your name'
                        style = { styles.input }
                        value = { name } />
                </View>

                {/* Service Modes */}
                <Text style = { styles.sectionTitle }>Service Modes</Text>
                <View style = { styles.row }>
                    <Text style = { styles.rowLabel }>VRS (relay)</Text>
                    <Switch
                        onValueChange = { setVrsEnabled }
                        trackColor = {{ false: '#333', true: '#2979ff' }}
                        value = { vrsEnabled } />
                </View>
                <View style = { styles.row }>
                    <Text style = { styles.rowLabel }>VRI (corporate)</Text>
                    <Switch
                        onValueChange = { setVriEnabled }
                        trackColor = {{ false: '#333', true: '#2979ff' }}
                        value = { vriEnabled } />
                </View>
                <View style = { styles.row }>
                    <Text style = { styles.rowLabel }>Captioning eligible</Text>
                    <Switch
                        onValueChange = { setCaptioningEnabled }
                        trackColor = {{ false: '#333', true: '#2979ff' }}
                        value = { captioningEnabled } />
                </View>

                {/* Languages */}
                <Text style = { styles.sectionTitle }>Language Pairs</Text>
                <View style = { styles.tagGrid }>
                    { AVAILABLE_LANGUAGES.map(lang => {
                        const active = languages.includes(lang);

                        return (
                            <TouchableOpacity
                                accessibilityLabel = { `${active ? 'Remove' : 'Add'} ${lang}` }
                                key = { lang }
                                onPress = { () => toggleLanguage(lang) }
                                style = { [ styles.tag, active && styles.tagActive ] }>
                                <Text style = { [ styles.tagText, active && styles.tagTextActive ] }>
                                    { lang }
                                </Text>
                            </TouchableOpacity>
                        );
                    }) }
                </View>
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    backText: {
        color: '#2979ff',
        fontSize: 15
    },
    container: {
        backgroundColor: '#0a0a1a',
        flex: 1
    },
    content: {
        paddingBottom: 40,
        paddingHorizontal: 20
    },
    field: {
        marginBottom: 16
    },
    header: {
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 14
    },
    input: {
        backgroundColor: '#1a1a2e',
        borderRadius: 10,
        color: '#fff',
        fontSize: 16,
        marginTop: 6,
        padding: 14
    },
    label: {
        color: '#aaa',
        fontSize: 13,
        fontWeight: '500'
    },
    row: {
        alignItems: 'center',
        backgroundColor: '#1a1a2e',
        borderBottomColor: '#252540',
        borderBottomWidth: 1,
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 14
    },
    rowLabel: {
        color: '#ddd',
        fontSize: 15
    },
    saveText: {
        color: '#2979ff',
        fontSize: 15,
        fontWeight: '600'
    },
    sectionTitle: {
        color: '#888',
        fontSize: 12,
        fontWeight: '600',
        letterSpacing: 0.5,
        marginTop: 20,
        marginBottom: 8,
        textTransform: 'uppercase'
    },
    tag: {
        backgroundColor: '#1a1a2e',
        borderRadius: 8,
        marginBottom: 8,
        marginRight: 8,
        paddingHorizontal: 14,
        paddingVertical: 8
    },
    tagActive: {
        backgroundColor: '#2979ff'
    },
    tagGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap'
    },
    tagText: {
        color: '#888',
        fontSize: 14,
        fontWeight: '500'
    },
    tagTextActive: {
        color: '#fff'
    },
    title: {
        color: '#fff',
        fontSize: 17,
        fontWeight: '600'
    }
});

export default InterpreterSettingsScreen;
