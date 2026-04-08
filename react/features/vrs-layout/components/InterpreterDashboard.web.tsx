/**
 * VRS Interpreter Dashboard Component
 *
 * A dashboard for interpreters to view:
 * - Active calls
 * - Queue status
 * - Performance stats
 * - Availability toggle
 */

import React, { useEffect, useState } from 'react';
import { connect } from 'react-redux';
import { makeStyles } from 'tss-react/mui';
import { translate } from '../../base/i18n/functions';
import type { IReduxState } from '../../app/types';
import { vrsAuthService } from '../../vrs-auth/VRSSAuthService';

interface IProps {
    /**
     * Translation function.
     */
    t: Function;
}

interface ActiveCall {
    id: string;
    clientName: string;
    language: string;
    duration: string;
    roomName: string;
}

interface QueueItem {
    id: string;
    clientName: string;
    language: string;
    waitTime: string;
    roomName: string;
}

const useStyles = makeStyles()(theme => ({
    root: {
        minHeight: '100vh',
        background: '#0f1419',
        color: 'white',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    },

    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 24px',
        background: 'rgba(26, 35, 50, 0.8)',
        backdropFilter: 'blur(10px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        position: 'sticky' as const,
        top: 0,
        zIndex: 100,
    },

    headerLeft: {
        display: 'flex',
        alignItems: 'center',
        gap: '24px',
    },

    logo: {
        fontSize: '1.25rem',
        fontWeight: 700,
    },

    logoMalka: {
        fontStyle: 'italic',
    },

    logoVRI: {
        color: '#FF6B35',
    },

    logoBadge: {
        background: '#4a9eff',
        color: 'white',
        padding: '4px 10px',
        borderRadius: '20px',
        fontSize: '0.7rem',
        fontWeight: 600,
        marginLeft: '8px',
    },

    nav: {
        display: 'flex',
        gap: '8px',
    },

    navTab: {
        padding: '8px 16px',
        background: 'transparent',
        border: 'none',
        color: 'rgba(255, 255, 255, 0.6)',
        fontSize: '0.85rem',
        fontWeight: 500,
        cursor: 'pointer',
        borderRadius: '8px',
        transition: 'all 0.2s',
    },

    navTabActive: {
        background: 'rgba(74, 158, 255, 0.2)',
        color: 'white',
    },

    headerRight: {
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
    },

    statusToggle: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 16px',
        background: 'rgba(40, 167, 69, 0.2)',
        border: '1px solid rgba(40, 167, 69, 0.4)',
        borderRadius: '20px',
        fontSize: '0.85rem',
        cursor: 'pointer',
        transition: 'all 0.2s',
    },

    statusToggleBusy: {
        background: 'rgba(220, 53, 69, 0.2)',
        borderColor: 'rgba(220, 53, 69, 0.4)',
    },

    statusDot: {
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        background: '#28a745',
    },

    statusDotBusy: {
        background: '#dc3545',
    },

    logoutBtn: {
        padding: '8px 16px',
        background: 'transparent',
        border: '1px solid rgba(220, 53, 69, 0.5)',
        color: 'rgba(220, 53, 69, 0.8)',
        borderRadius: '10px',
        fontSize: '0.85rem',
        cursor: 'pointer',
        transition: 'all 0.2s',
    },

    mainContent: {
        padding: '24px',
        maxWidth: '1400px',
        margin: '0 auto',
    },

    statsGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        marginBottom: '24px',
    },

    statCard: {
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '12px',
        padding: '20px',
    },

    statCardHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '12px',
    },

    statIcon: {
        fontSize: '1.5rem',
    },

    statValue: {
        fontSize: '2rem',
        fontWeight: 700,
        marginBottom: '4px',
    },

    statLabel: {
        fontSize: '0.85rem',
        opacity: 0.7,
    },

    twoColumn: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
        gap: '24px',
    },

    section: {
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '16px',
        overflow: 'hidden',
    },

    sectionHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 20px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    },

    sectionTitle: {
        fontSize: '1rem',
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
    },

    liveBadge: {
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 8px',
        background: 'rgba(220, 53, 69, 0.2)',
        borderRadius: '10px',
        fontSize: '0.7rem',
        fontWeight: 500,
    },

    liveDot: {
        width: '5px',
        height: '5px',
        borderRadius: '50%',
        background: '#dc3545',
        animation: '$pulse 1.5s ease-in-out infinite',
    },

    list: {
        padding: '8px',
    },

    listItem: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px',
        borderRadius: '10px',
        transition: 'background 0.2s',
    },

    listItemHover: {
        background: 'rgba(255, 255, 255, 0.03)',
    },

    listAvatar: {
        width: '40px',
        height: '40px',
        borderRadius: '10px',
        background: 'rgba(255, 107, 53, 0.2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '1.2rem',
    },

    listInfo: {
        flex: 1,
    },

    listName: {
        fontWeight: 500,
        marginBottom: '2px',
    },

    listDetails: {
        fontSize: '0.8rem',
        opacity: 0.6,
        display: 'flex',
        gap: '12px',
    },

    listAction: {
        fontSize: '0.8rem',
        padding: '6px 12px',
        background: 'rgba(255, 107, 53, 0.2)',
        color: '#FF6B35',
        border: 'none',
        borderRadius: '8px',
        cursor: 'pointer',
        fontWeight: 500,
    },

    emptyState: {
        padding: '40px 20px',
        textAlign: 'center' as const,
        opacity: 0.5,
    },

    emptyIcon: {
        fontSize: '3rem',
        marginBottom: '8px',
    },

    '@keyframes pulse': {
        '0%, 100%': { opacity: 1 },
        '50%': { opacity: 0.5 },
    },
}));

/**
 * Component that renders the Interpreter Dashboard.
 */
const InterpreterDashboard = ({ t }: IProps) => {
    const { classes, cx } = useStyles();
    const [activeTab, setActiveTab] = useState<'overview' | 'queue' | 'history'>('overview');
    const [isAvailable, setIsAvailable] = useState(true);
    const [stats, setStats] = useState({
        callsToday: 8,
        minutesToday: 127,
        avgCallDuration: '15.9',
        clientsServed: 8
    });
    const [activeCalls, setActiveCalls] = useState<ActiveCall[]>([
        { id: '1', clientName: 'John Smith', language: 'ASL', duration: '12:34', roomName: 'abc-def-123' },
    ]);
    const [queue, setQueue] = useState<QueueItem[]>([
        { id: '1', clientName: 'Sarah Johnson', language: 'ASL', waitTime: '2 min', roomName: 'xyz-uvw-456' },
        { id: '2', clientName: 'Mike Chen', language: 'ASL', waitTime: '5 min', roomName: 'qwe-rty-789' },
    ]);

    const toggleAvailability = () => {
        setIsAvailable(!isAvailable);
        // TODO: Send to server
    };

    const handleJoinCall = (roomName: string) => {
        window.location.href = `/${roomName}`;
    };

    const handleAcceptQueue = (clientId: string, roomName: string) => {
        window.location.href = `/${roomName}`;
    };

    const handleLogout = () => {
        vrsAuthService.logout();
        window.location.href = '/vrs-welcome.html';
    };

    return (
        <div className={classes.root}>
            {/* Header */}
            <header className={classes.header}>
                <div className={classes.headerLeft}>
                    <div className={classes.logo}>
                        <span className={classes.logoMalka}>Malka</span>
                        <span className={classes.logoVRI}>VRI</span>
                        <span className={classes.logoBadge}>INTERPRETER</span>
                    </div>
                    <nav className={classes.nav}>
                        <button
                            className={cx(classes.navTab, activeTab === 'overview' && classes.navTabActive)}
                            onClick={() => setActiveTab('overview')}
                        >
                            {t('vrs.overview')}
                        </button>
                        <button
                            className={cx(classes.navTab, activeTab === 'queue' && classes.navTabActive)}
                            onClick={() => setActiveTab('queue')}
                        >
                            {t('vrs.queue')}
                        </button>
                        <button
                            className={cx(classes.navTab, activeTab === 'history' && classes.navTabActive)}
                            onClick={() => setActiveTab('history')}
                        >
                            {t('vrs.history')}
                        </button>
                    </nav>
                </div>
                <div className={classes.headerRight}>
                    <div
                        className={cx(classes.statusToggle, !isAvailable && classes.statusToggleBusy)}
                        onClick={toggleAvailability}
                    >
                        <div className={cx(classes.statusDot, !isAvailable && classes.statusDotBusy)} />
                        {isAvailable ? t('vrs.available') : t('vrs.busy')}
                    </div>
                    <button className={classes.logoutBtn} onClick={handleLogout}>
                        {t('vrs.logout')}
                    </button>
                </div>
            </header>

            {/* Main Content */}
            <main className={classes.mainContent}>
                {/* Stats Grid */}
                <div className={classes.statsGrid}>
                    <div className={classes.statCard}>
                        <div className={classes.statCardHeader}>
                            <span className={classes.statIcon}>📞</span>
                        </div>
                        <div className={classes.statValue}>{stats.callsToday}</div>
                        <div className={classes.statLabel}>{t('vrs.callsToday')}</div>
                    </div>
                    <div className={classes.statCard}>
                        <div className={classes.statCardHeader}>
                            <span className={classes.statIcon}>⏱️</span>
                        </div>
                        <div className={classes.statValue}>{stats.minutesToday}</div>
                        <div className={classes.statLabel}>{t('vrs.minutesToday')}</div>
                    </div>
                    <div className={classes.statCard}>
                        <div className={classes.statCardHeader}>
                            <span className={classes.statIcon}>📊</span>
                        </div>
                        <div className={classes.statValue}>{stats.avgCallDuration}</div>
                        <div className={classes.statLabel}>{t('vrs.avgDuration')}</div>
                    </div>
                    <div className={classes.statCard}>
                        <div className={classes.statCardHeader}>
                            <span className={classes.statIcon}>👥</span>
                        </div>
                        <div className={classes.statValue}>{stats.clientsServed}</div>
                        <div className={classes.statLabel}>{t('vrs.clientsServed')}</div>
                    </div>
                </div>

                {/* Two Column Layout */}
                <div className={classes.twoColumn}>
                    {/* Active Calls */}
                    <div className={classes.section}>
                        <div className={classes.sectionHeader}>
                            <h2 className={classes.sectionTitle}>
                                <span className={classes.liveBadge}>
                                    <span className={classes.liveDot} />
                                    LIVE
                                </span>
                                {t('vrs.activeCalls')}
                            </h2>
                            <span style={{ fontSize: '0.85rem', opacity: 0.6 }}>
                                {activeCalls.length}
                            </span>
                        </div>
                        <div className={classes.list}>
                            {activeCalls.length === 0 ? (
                                <div className={classes.emptyState}>
                                    <div className={classes.emptyIcon}>✅</div>
                                    <p>{t('vrs.noActiveCalls')}</p>
                                </div>
                            ) : (
                                activeCalls.map(call => (
                                    <div key={call.id} className={classes.listItem}>
                                        <div className={classes.listAvatar}>👤</div>
                                        <div className={classes.listInfo}>
                                            <div className={classes.listName}>{call.clientName}</div>
                                            <div className={classes.listDetails}>
                                                <span>🌐 {call.language}</span>
                                                <span>⏱️ {call.duration}</span>
                                            </div>
                                        </div>
                                        <button
                                            className={classes.listAction}
                                            onClick={() => handleJoinCall(call.roomName)}
                                        >
                                            {t('vrs.join')}
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Queue */}
                    <div className={classes.section}>
                        <div className={classes.sectionHeader}>
                            <h2 className={classes.sectionTitle}>
                                <span className={classes.liveBadge}>
                                    <span className={classes.liveDot} />
                                    LIVE
                                </span>
                                {t('vrs.waitingQueue')}
                            </h2>
                            <span style={{ fontSize: '0.85rem', opacity: 0.6 }}>
                                {queue.length} {t('vrs.waiting')}
                            </span>
                        </div>
                        <div className={classes.list}>
                            {queue.length === 0 ? (
                                <div className={classes.emptyState}>
                                    <div className={classes.emptyIcon}>✅</div>
                                    <p>{t('vrs.queueEmpty')}</p>
                                </div>
                            ) : (
                                queue.map(item => (
                                    <div key={item.id} className={classes.listItem}>
                                        <div className={classes.listAvatar}>⏳</div>
                                        <div className={classes.listInfo}>
                                            <div className={classes.listName}>{item.clientName}</div>
                                            <div className={classes.listDetails}>
                                                <span>🌐 {item.language}</span>
                                                <span>🕐 {item.waitTime}</span>
                                            </div>
                                        </div>
                                        <button
                                            className={classes.listAction}
                                            onClick={() => handleAcceptQueue(item.id, item.roomName)}
                                        >
                                            {t('vrs.accept')}
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

function _mapStateToProps(state: IReduxState) {
    return {};
}

export default translate(connect(_mapStateToProps)(InterpreterDashboard));
