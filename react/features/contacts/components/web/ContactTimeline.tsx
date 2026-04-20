/**
 * ContactTimeline — unified timeline showing calls, missed calls,
 * voicemails, and notes for a contact.
 */

import React from 'react';
import { makeStyles } from 'tss-react/mui';

import type { TimelineItem } from '../../types';

interface Props {
    timeline: TimelineItem[];
}

const useStyles = makeStyles()(theme => ({
    timelineContainer: {
        display: 'flex',
        flexDirection: 'column',
        gap: '0'
    },

    timelineItem: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
        padding: '8px 0',
        borderBottom: `1px solid ${theme.palette.ui03}`,
        fontSize: '13px'
    },

    timelineIcon: {
        width: '28px',
        height: '28px',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '14px',
        flexShrink: 0
    },

    iconCall: {
        backgroundColor: 'rgba(46, 204, 113, 0.15)',
        color: '#2ECC71'
    },

    iconMissedCall: {
        backgroundColor: 'rgba(231, 76, 60, 0.15)',
        color: '#E74C3C'
    },

    iconVoicemail: {
        backgroundColor: 'rgba(155, 89, 182, 0.15)',
        color: '#9B59B6'
    },

    iconNote: {
        backgroundColor: 'rgba(52, 152, 219, 0.15)',
        color: '#3498DB'
    },

    timelineContent: {
        flex: 1,
        minWidth: 0
    },

    timelinePrimary: {
        color: theme.palette.text01,
        marginBottom: '2px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap' as const
    },

    timelineSecondary: {
        color: theme.palette.text03,
        fontSize: '11px'
    },

    emptyTimeline: {
        color: theme.palette.text03,
        fontSize: '13px',
        padding: '8px 0'
    }
}));

const TYPE_ICONS: Record<string, { icon: string; label: string }> = {
    call: { icon: '\u260E', label: 'Call' },
    missed_call: { icon: '\u26D4', label: 'Missed Call' },
    voicemail: { icon: '\u2709', label: 'Voicemail' },
    note: { icon: '\u270D', label: 'Note' }
};

function formatRelativeTime(timestamp: string): string {
    const now = Date.now();
    const then = new Date(timestamp).getTime();
    const diffMs = now - then;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return new Date(timestamp).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: diffDays > 365 ? 'numeric' : undefined
    });
}

function getItemDescription(item: TimelineItem): string {
    switch (item.type) {
        case 'call': {
            const d = item.data;
            const dur = d.duration_minutes ? ` (${d.duration_minutes}m)` : '';

            return `${d.callee_name || d.caller_name || d.room_name || 'Call'}${dur}`;
        }
        case 'missed_call': {
            const d = item.data;

            return `Missed call from ${d.caller_name || d.caller_phone || 'Unknown'}`;
        }
        case 'voicemail': {
            const d = item.data;

            return `Voicemail${d.duration_seconds ? ` (${d.duration_seconds}s)` : ''}`;
        }
        case 'note': {
            const content = item.data.content || '';

            return content.length > 60 ? content.slice(0, 60) + '...' : content;
        }
        default:
            return '';
    }
}

export default function ContactTimeline({ timeline }: Props) {
    const { classes, cx } = useStyles();

    if (!timeline || timeline.length === 0) {
        return <div className = { classes.emptyTimeline }>No activity yet.</div>;
    }

    return (
        <div className = { classes.timelineContainer }>
            {timeline.map(item => {
                const typeInfo = TYPE_ICONS[item.type] || { icon: '?', label: item.type };
                const iconClass =
                    item.type === 'call' ? classes.iconCall
                    : item.type === 'missed_call' ? classes.iconMissedCall
                    : item.type === 'voicemail' ? classes.iconVoicemail
                    : classes.iconNote;

                return (
                    <div className = { classes.timelineItem } key = { `${item.type}-${item.id}` }>
                        <div className = { cx(classes.timelineIcon, iconClass) }>
                            {typeInfo.icon}
                        </div>
                        <div className = { classes.timelineContent }>
                            <div className = { classes.timelinePrimary }>
                                {getItemDescription(item)}
                            </div>
                            <div className = { classes.timelineSecondary }>
                                {typeInfo.label} &middot; {formatRelativeTime(item.timestamp)}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
