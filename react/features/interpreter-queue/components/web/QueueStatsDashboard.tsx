import React, { useState, useEffect } from 'react';
import { connect } from 'react-redux';
import { makeStyles } from 'tss-react/mui';
import { translate } from '../../../base/i18n/functions';
import { isInterpreter } from '../../../base/user-role/functions';
import { IReduxState } from '../../../app/types';
import { QueueState } from '../../reducer';

interface IProps {
    _queueState: QueueState;
    t: Function;
}

const useStyles = makeStyles()(theme => ({
    container: {
        position: 'fixed',
        top: '70px',
        left: '20px',
        backgroundColor: 'rgba(26, 35, 50, 0.9)',
        border: '1px solid rgba(74, 158, 255, 0.3)',
        borderRadius: '12px',
        padding: '16px',
        minWidth: '220px',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
        zIndex: 900
    },

    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '12px',
        paddingBottom: '8px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
    },

    title: {
        color: '#ffffff',
        fontSize: '14px',
        fontWeight: 'bold',
        display: 'flex',
        alignItems: 'center',
        gap: '6px'
    },

    collapseButton: {
        background: 'none',
        border: 'none',
        color: 'rgba(255, 255, 255, 0.6)',
        cursor: 'pointer',
        fontSize: '16px',
        padding: '4px',
        '&:hover': {
            color: 'white'
        }
    },

    stats: {
        display: 'flex',
        flexDirection: 'column',
        gap: '10px'
    },

    collapsed: {
        display: 'none'
    },

    statRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
    },

    statLabel: {
        color: 'rgba(255, 255, 255, 0.7)',
        fontSize: '12px'
    },

    statValue: {
        color: 'white',
        fontSize: '14px',
        fontWeight: 'bold'
    },

    onlineStat: {
        color: '#28a745'
    },

    waitingStat: {
        color: '#FF6B35'
    },

    connectedIndicator: {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '11px',
        color: 'rgba(255, 255, 255, 0.6)',
        marginTop: '8px',
        paddingTop: '8px',
        borderTop: '1px solid rgba(255, 255, 255, 0.1)'
    },

    dot: {
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        backgroundColor: '#28a745'
    },

    dotDisconnected: {
        backgroundColor: '#dc3545'
    }
}));

/**
 * Queue stats dashboard for interpreters.
 * Shows interpreter count, pending requests, and connection status.
 */
const QueueStatsDashboard = ({ _queueState, t }: IProps) => {
    const { classes } = useStyles();
    const [isCollapsed, setIsCollapsed] = useState(false);

    const { isConnected, activeInterpreters, pendingRequests } = _queueState;

    // Don't render if not an interpreter
    if (!isInterpreter()) {
        return null;
    }

    return (
        <div className={classes.container}>
            <div className={classes.header}>
                <span className={classes.title}>
                    📊 {t('vrs.queueStats')}
                </span>
                <button
                    className={classes.collapseButton}
                    onClick={() => setIsCollapsed(!isCollapsed)}
                >
                    {isCollapsed ? '◀' : '▼'}
                </button>
            </div>

            <div className={`${classes.stats} ${isCollapsed ? classes.collapsed : ''}`}>
                <div className={classes.statRow}>
                    <span className={classes.statLabel}>{t('vrs.interpretersOnline')}</span>
                    <span className={`${classes.statValue} ${classes.onlineStat}`}>
                        {activeInterpreters || 1}
                    </span>
                </div>

                <div className={classes.statRow}>
                    <span className={classes.statLabel}>{t('vrs.requestsWaiting')}</span>
                    <span className={`${classes.statValue} ${classes.waitingStat}`}>
                        {pendingRequests?.length || 0}
                    </span>
                </div>

                <div className={classes.statRow}>
                    <span className={classes.statLabel}>{t('vrs.yourStatus')}</span>
                    <span className={classes.statValue}>
                        {isConnected ? t('vrs.online') : t('vrs.offline')}
                    </span>
                </div>
            </div>

            <div className={classes.connectedIndicator}>
                <span className={`${classes.dot} ${!isConnected ? classes.dotDisconnected : ''}`} />
                <span>
                    {isConnected ? t('vrs.connectedToQueue') : t('vrs.disconnectedFromQueue')}
                </span>
            </div>
        </div>
    );
};

function _mapStateToProps(state: IReduxState) {
    return {
        _queueState: state['features/interpreter-queue']
    };
}

export default translate(connect(_mapStateToProps)(QueueStatsDashboard));
