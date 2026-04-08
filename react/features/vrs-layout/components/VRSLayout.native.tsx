import React from 'react';
import {
    ScrollView,
    StyleSheet,
    Text,
    TextStyle,
    View,
    ViewStyle
} from 'react-native';
import { connect } from 'react-redux';

import { IReduxState } from '../../app/types';
import ParticipantView from '../../base/participants/components/ParticipantView.native';
import { getLocalParticipant } from '../../base/participants/functions';
import type { IParticipant } from '../../base/participants/types';
import BaseTheme from '../../base/ui/components/BaseTheme.native';

type VRSConferenceRole = 'client' | 'interpreter' | 'hearing';

interface IVRSPane {
    description: string;
    participant?: IParticipant;
    role: VRSConferenceRole;
    statusText: string;
    title: string;
}

interface IProps {
    _extras: IParticipant[];
    _panes: IVRSPane[];
}

function getStoredVrsRole() {
    if (typeof sessionStorage !== 'undefined') {
        const role = sessionStorage.getItem('vrs_user_role');

        if (role === 'client' || role === 'interpreter') {
            return role;
        }
    }

    if (typeof window !== 'undefined') {
        const role = new URLSearchParams(window.location?.search ?? '').get('role');

        if (role === 'client' || role === 'interpreter') {
            return role;
        }
    }

    return undefined;
}

function getStoredTargetClient() {
    if (typeof sessionStorage === 'undefined') {
        return undefined;
    }

    return sessionStorage.getItem('vrs_target_client') || undefined;
}

function getParticipantName(participant?: IParticipant, fallback = 'Waiting to Join') {
    return participant?.name || participant?.displayName || fallback;
}

function findParticipantByHint(participants: IParticipant[], hint?: string) {
    if (!hint) {
        return undefined;
    }

    const normalizedHint = hint.trim().toLowerCase();

    return participants.find(participant => {
        const candidates = [ participant.id, participant.name, participant.displayName ]
            .filter(Boolean)
            .map(value => value!.toLowerCase());

        return candidates.some(value => value === normalizedHint || value.includes(normalizedHint));
    });
}

function withoutParticipant(participants: IParticipant[], participant?: IParticipant) {
    if (!participant) {
        return participants;
    }

    return participants.filter(({ id }) => id !== participant.id);
}

export function isVrsSession(roomName?: string) {
    if (getStoredVrsRole()) {
        return true;
    }

    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('vrs_target_client')) {
        return true;
    }

    return Boolean(roomName?.startsWith('vrs-'));
}

function resolveParticipants(state: IReduxState) {
    const localParticipant = getLocalParticipant(state);
    const remoteParticipants = Array.from(state['features/base/participants'].remote.values())
        .filter((participant: IParticipant) => !participant.fakeParticipant);
    const localRole = getStoredVrsRole();
    const targetClient = getStoredTargetClient();

    let clientParticipant: IParticipant | undefined;
    let interpreterParticipant: IParticipant | undefined;
    let hearingParticipant: IParticipant | undefined;
    let remainingParticipants = remoteParticipants.slice();

    if (localRole === 'interpreter') {
        interpreterParticipant = localParticipant;
        clientParticipant = findParticipantByHint(remainingParticipants, targetClient) || remainingParticipants[0];
        remainingParticipants = withoutParticipant(remainingParticipants, clientParticipant);
        hearingParticipant = remainingParticipants[0];
        remainingParticipants = withoutParticipant(remainingParticipants, hearingParticipant);
    } else if (localRole === 'client') {
        clientParticipant = localParticipant;
        interpreterParticipant = remainingParticipants[0];
        remainingParticipants = withoutParticipant(remainingParticipants, interpreterParticipant);
        hearingParticipant = remainingParticipants[0];
        remainingParticipants = withoutParticipant(remainingParticipants, hearingParticipant);
    } else {
        hearingParticipant = localParticipant;
        interpreterParticipant = remainingParticipants[0];
        remainingParticipants = withoutParticipant(remainingParticipants, interpreterParticipant);
        clientParticipant = findParticipantByHint(remainingParticipants, targetClient) || remainingParticipants[0];
        remainingParticipants = withoutParticipant(remainingParticipants, clientParticipant);
    }

    return {
        extras: remainingParticipants,
        panes: [
            {
                description: 'Deaf or hard-of-hearing participant',
                participant: clientParticipant,
                role: 'client' as const,
                statusText: clientParticipant ? 'Live' : 'Awaiting client',
                title: 'Client'
            },
            {
                description: 'Interpreter remains visible throughout the call',
                participant: interpreterParticipant,
                role: 'interpreter' as const,
                statusText: interpreterParticipant ? 'Live' : 'Awaiting interpreter',
                title: 'Interpreter'
            },
            {
                description: 'Hearing party on video or phone',
                participant: hearingParticipant,
                role: 'hearing' as const,
                statusText: hearingParticipant ? 'Live' : 'Awaiting hearing party',
                title: 'Hearing Party'
            }
        ]
    };
}

function getEmptyMessage(role: VRSConferenceRole, hasParticipant: boolean) {
    if (hasParticipant) {
        return 'Joined without an active camera feed.';
    }

    if (role === 'interpreter') {
        return 'An interpreter will appear here as soon as one joins the session.';
    }

    if (role === 'client') {
        return 'The signing participant will appear here when they enter the room.';
    }

    return 'The hearing party will appear here when they join by video or phone.';
}

function Pane({ pane }: { pane: IVRSPane; }) {
    const participantName = getParticipantName(pane.participant, pane.title);

    return (
        <View style = { [
            styles.pane,
            pane.role === 'interpreter' ? styles.interpreterPane : undefined
        ] as ViewStyle[] }>
            <View style = { styles.paneHeader }>
                <View style = { styles.titleBlock }>
                    <Text style = { styles.title }>{pane.title}</Text>
                    <Text numberOfLines = { 1 } style = { styles.description }>{pane.description}</Text>
                </View>
                <View style = { styles.statusBadge as ViewStyle }>
                    <Text style = { styles.statusText }>{pane.statusText}</Text>
                </View>
            </View>
            <View style = { styles.mediaFrame as ViewStyle }>
                {pane.participant
                    ? (
                        <>
                            <ParticipantView
                                avatarSize = { 88 }
                                onPress = { () => undefined }
                                participantId = { pane.participant.id }
                                style = { styles.participantView }
                                useConnectivityInfoLabel = { true }
                                zOrder = { 0 }
                                zoomEnabled = { false } />
                            <View style = { styles.participantLabel as ViewStyle }>
                                <Text numberOfLines = { 1 } style = { styles.participantName }>{participantName}</Text>
                                <Text numberOfLines = { 1 } style = { styles.participantMeta }>{pane.description}</Text>
                            </View>
                        </>
                    )
                    : (
                        <View style = { styles.emptyState as ViewStyle }>
                            <View style = { styles.emptyBadge as ViewStyle }>
                                <Text style = { styles.emptyBadgeText }>{pane.title.charAt(0)}</Text>
                            </View>
                            <Text style = { styles.emptyTitle }>{participantName}</Text>
                            <Text style = { styles.emptyCopy }>{getEmptyMessage(pane.role, false)}</Text>
                        </View>
                    )}
            </View>
        </View>
    );
}

const VRSLayout = ({ _extras, _panes }: IProps) => {
    const visiblePanes = _panes.filter(pane => Boolean(pane.participant));

    if (!visiblePanes.length) {
        return null;
    }

    if (visiblePanes.length === 1) {
        return (
            <View style = { styles.root as ViewStyle }>
                <View style = { styles.singlePaneContainer as ViewStyle }>
                    <Pane pane = { visiblePanes[0] } />
                </View>
                {_extras.length > 0 && (
                    <View style = { styles.extraParticipants as ViewStyle }>
                        <Text style = { styles.extraParticipantsTitle }>
                            {`Additional participants (${_extras.length})`}
                        </Text>
                        <ScrollView
                            contentContainerStyle = { styles.extraParticipantsList as ViewStyle }
                            horizontal = { true }
                            showsHorizontalScrollIndicator = { false }>
                            {_extras.map(participant => (
                                <View key = { participant.id } style = { styles.extraChip as ViewStyle }>
                                    <Text numberOfLines = { 1 } style = { styles.extraChipText }>
                                        {getParticipantName(participant, participant.id)}
                                    </Text>
                                </View>
                            ))}
                        </ScrollView>
                    </View>
                )}
            </View>
        );
    }

    if (visiblePanes.length === 2) {
        return (
            <View style = { styles.root as ViewStyle }>
                <View style = { styles.twoPaneColumn as ViewStyle }>
                    {visiblePanes.map((pane, index) => (
                        <View
                            key = { pane.role }
                            style = { [
                                styles.twoPaneItem,
                                index === 0 ? styles.twoPaneItemSpacing : undefined
                            ] as ViewStyle[] }>
                            <Pane pane = { pane } />
                        </View>
                    ))}
                </View>
                {_extras.length > 0 && (
                    <View style = { styles.extraParticipants as ViewStyle }>
                        <Text style = { styles.extraParticipantsTitle }>
                            {`Additional participants (${_extras.length})`}
                        </Text>
                        <ScrollView
                            contentContainerStyle = { styles.extraParticipantsList as ViewStyle }
                            horizontal = { true }
                            showsHorizontalScrollIndicator = { false }>
                            {_extras.map(participant => (
                                <View key = { participant.id } style = { styles.extraChip as ViewStyle }>
                                    <Text numberOfLines = { 1 } style = { styles.extraChipText }>
                                        {getParticipantName(participant, participant.id)}
                                    </Text>
                                </View>
                            ))}
                        </ScrollView>
                    </View>
                )}
            </View>
        );
    }

    const [ clientPane, interpreterPane, hearingPane ] = _panes;

    return (
        <View style = { styles.root as ViewStyle }>
            <View style = { styles.topRow as ViewStyle }>
                <Pane pane = { interpreterPane } />
            </View>
            <View style = { styles.bottomRow as ViewStyle }>
                <View style = { styles.bottomPane as ViewStyle }>
                    <Pane pane = { clientPane } />
                </View>
                <View style = { styles.bottomPane as ViewStyle }>
                    <Pane pane = { hearingPane } />
                </View>
            </View>
            {_extras.length > 0 && (
                <View style = { styles.extraParticipants as ViewStyle }>
                    <Text style = { styles.extraParticipantsTitle }>
                        {`Additional participants (${_extras.length})`}
                    </Text>
                    <ScrollView
                        contentContainerStyle = { styles.extraParticipantsList as ViewStyle }
                        horizontal = { true }
                        showsHorizontalScrollIndicator = { false }>
                        {_extras.map(participant => (
                            <View key = { participant.id } style = { styles.extraChip as ViewStyle }>
                                <Text numberOfLines = { 1 } style = { styles.extraChipText }>
                                    {getParticipantName(participant, participant.id)}
                                </Text>
                            </View>
                        ))}
                    </ScrollView>
                </View>
            )}
        </View>
    );
};

function _mapStateToProps(state: IReduxState) {
    const { extras, panes } = resolveParticipants(state);

    return {
        _extras: extras,
        _panes: panes
    };
}

const styles = StyleSheet.create({
    bottomPane: {
        flex: 1
    },

    bottomRow: {
        columnGap: BaseTheme.spacing[2],
        flex: 1,
        flexDirection: 'row'
    },

    description: {
        color: 'rgba(226, 236, 247, 0.78)',
        fontSize: 12
    },

    emptyBadge: {
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderColor: 'rgba(255, 255, 255, 0.12)',
        borderRadius: 32,
        borderWidth: 1,
        height: 64,
        justifyContent: 'center',
        width: 64
    },

    emptyBadgeText: {
        color: BaseTheme.palette.text01,
        fontSize: 24,
        fontWeight: '700'
    },

    emptyCopy: {
        color: 'rgba(226, 236, 247, 0.78)',
        fontSize: 13,
        lineHeight: 20,
        textAlign: 'center'
    } as TextStyle,

    emptyState: {
        alignItems: 'center',
        flex: 1,
        gap: BaseTheme.spacing[2],
        justifyContent: 'center',
        padding: BaseTheme.spacing[3]
    },

    emptyTitle: {
        color: BaseTheme.palette.text01,
        fontSize: 18,
        fontWeight: '700'
    },

    extraChip: {
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderColor: 'rgba(255, 255, 255, 0.12)',
        borderRadius: 999,
        borderWidth: 1,
        marginRight: BaseTheme.spacing[1],
        maxWidth: 180,
        paddingHorizontal: BaseTheme.spacing[2],
        paddingVertical: BaseTheme.spacing[1]
    },

    extraChipText: {
        color: BaseTheme.palette.text01,
        fontSize: 12,
        fontWeight: '600'
    },

    extraParticipants: {
        marginTop: BaseTheme.spacing[2]
    },

    extraParticipantsList: {
        paddingTop: BaseTheme.spacing[1]
    },

    extraParticipantsTitle: {
        color: 'rgba(226, 236, 247, 0.78)',
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 0.8,
        textTransform: 'uppercase'
    },

    interpreterPane: {
        borderColor: 'rgba(86, 176, 255, 0.32)'
    },

    mediaFrame: {
        backgroundColor: 'rgba(9, 18, 31, 0.96)',
        borderRadius: 18,
        flex: 1,
        overflow: 'hidden'
    },

    pane: {
        backgroundColor: 'rgba(15, 28, 45, 0.92)',
        borderColor: 'rgba(255, 255, 255, 0.08)',
        borderRadius: 20,
        borderWidth: 1,
        flex: 1,
        overflow: 'hidden',
        padding: BaseTheme.spacing[2]
    },

    paneHeader: {
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: BaseTheme.spacing[1.5]
    },

    participantLabel: {
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
        bottom: 0,
        left: 0,
        paddingHorizontal: BaseTheme.spacing[2],
        paddingVertical: BaseTheme.spacing[1.5],
        position: 'absolute',
        right: 0
    },

    participantMeta: {
        color: 'rgba(233, 241, 247, 0.82)',
        fontSize: 11,
        marginTop: BaseTheme.spacing[0.5]
    },

    participantName: {
        color: BaseTheme.palette.text01,
        fontSize: 15,
        fontWeight: '700'
    },

    participantView: {
        flex: 1
    },

    root: {
        flex: 1,
        padding: BaseTheme.spacing[2]
    },

    singlePaneContainer: {
        flex: 1
    },

    statusBadge: {
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 999,
        borderWidth: 1,
        paddingHorizontal: BaseTheme.spacing[1.5],
        paddingVertical: BaseTheme.spacing[0.75]
    },

    statusText: {
        color: BaseTheme.palette.text01,
        fontSize: 11,
        fontWeight: '600'
    },

    title: {
        color: BaseTheme.palette.text01,
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 1,
        marginBottom: BaseTheme.spacing[0.5],
        textTransform: 'uppercase'
    },

    titleBlock: {
        flex: 1,
        paddingRight: BaseTheme.spacing[1]
    },

    twoPaneColumn: {
        flex: 1
    },

    twoPaneItem: {
        flex: 1
    },

    twoPaneItemSpacing: {
        marginBottom: BaseTheme.spacing[2]
    },

    topRow: {
        flex: 1.15,
        marginBottom: BaseTheme.spacing[2]
    }
});

export default connect(_mapStateToProps)(VRSLayout);
