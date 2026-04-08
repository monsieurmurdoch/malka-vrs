import React, { useState, useEffect } from 'react';
import { connect } from 'react-redux';
import { makeStyles } from 'tss-react/mui';
import { translate } from '../../../base/i18n/functions';
import { isInterpreter } from '../../../base/user-role/functions';
import { queueService } from '../../InterpreterQueueService';
import { IReduxState } from '../../../app/types';

interface IProps {
    _isConnected: boolean;
    t: Function;
}

const useStyles = makeStyles()(theme => ({
    container: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 12px',
        backgroundColor: 'rgba(26, 35, 50, 0.8)',
        borderRadius: '20px',
        border: '1px solid rgba(255, 255, 255, 0.1)'
    },

    statusIndicator: {
        width: '10px',
        height: '10px',
        borderRadius: '50%',
        transition: 'all 0.3s ease'
    },

    statusOnline: {
        backgroundColor: '#28a745',
        boxShadow: '0 0 8px rgba(40, 167, 69, 0.6)'
    },

    statusOffline: {
        backgroundColor: '#6c757d'
    },

    statusBusy: {
        backgroundColor: '#dc3545',
        boxShadow: '0 0 8px rgba(220, 53, 69, 0.6)'
    },

    label: {
        fontSize: '13px',
        color: 'white',
        fontWeight: 500
    },

    toggle: {
        position: 'relative',
        width: '44px',
        height: '24px',
        backgroundColor: '#6c757d',
        borderRadius: '12px',
        cursor: 'pointer',
        transition: 'all 0.3s ease'
    },

    toggleActive: {
        backgroundColor: '#28a745'
    },

    toggleKnob: {
        position: 'absolute',
        top: '2px',
        left: '2px',
        width: '20px',
        height: '20px',
        backgroundColor: 'white',
        borderRadius: '50%',
        transition: 'all 0.3s ease',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
    },

    toggleKnobActive: {
        transform: 'translateX(20px)'
    },

    busyToggle: {
        position: 'relative',
        width: '44px',
        height: '24px',
        backgroundColor: '#6c757d',
        borderRadius: '12px',
        cursor: 'pointer',
        transition: 'all 0.3s ease'
    },

    busyToggleActive: {
        backgroundColor: '#dc3545'
    },

    dropdown: {
        position: 'relative'
    },

    menu: {
        position: 'absolute',
        top: '100%',
        right: 0,
        marginTop: '8px',
        backgroundColor: '#1a2332',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '8px',
        padding: '8px 0',
        minWidth: '200px',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
        zIndex: 1000
    },

    menuItem: {
        padding: '10px 16px',
        color: 'white',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        transition: 'background 0.2s',
        '&:hover': {
            backgroundColor: 'rgba(255, 255, 255, 0.1)'
        }
    },

    menuItemSelected: {
        backgroundColor: 'rgba(40, 167, 69, 0.2)'
    },

    menuIcon: {
        fontSize: '16px'
    }
}));

type InterpreterStatus = 'offline' | 'available' | 'busy';

/**
 * Interpreter status toggle component.
 * Allows interpreters to switch between Available, Busy, and Offline modes.
 */
const InterpreterStatusToggle = ({ _isConnected, t }: IProps) => {
    const { classes } = useStyles();
    const [status, setStatus] = useState<InterpreterStatus>('offline');
    const [showMenu, setShowMenu] = useState(false);

    useEffect(() => {
        // Initialize status from queue service if available
        if (queueService.isConnected()) {
            setStatus('available');
        }
    }, []);

    const handleStatusChange = (newStatus: InterpreterStatus) => {
        setStatus(newStatus);
        setShowMenu(false);

        // Update queue service
        switch (newStatus) {
            case 'available':
                queueService.updateInterpreterStatus('active', undefined, ['en', 'ASL']);
                break;
            case 'busy':
                queueService.updateInterpreterStatus('inactive');
                break;
            case 'offline':
                queueService.updateInterpreterStatus('inactive');
                break;
        }
    };

    // Don't render if not an interpreter
    if (!isInterpreter()) {
        return null;
    }

    const statusConfig = {
        offline: { icon: '⚫', label: t('vrs.statusOffline'), class: classes.statusOffline },
        available: { icon: '🟢', label: t('vrs.statusAvailable'), class: classes.statusOnline },
        busy: { icon: '🔴', label: t('vrs.statusBusy'), class: classes.statusBusy }
    };

    const currentConfig = statusConfig[status];

    return (
        <div className={classes.dropdown}>
            <div
                className={classes.container}
                onClick={() => setShowMenu(!showMenu)}
                style={{ cursor: 'pointer' }}
            >
                <div className={`${classes.statusIndicator} ${currentConfig.class}`} />
                <span className={classes.label}>{currentConfig.label}</span>
                <span style={{ fontSize: '10px', opacity: 0.7 }}>▼</span>
            </div>

            {showMenu && (
                <div className={classes.menu} onClick={(e) => e.stopPropagation()}>
                    <div
                        className={`${classes.menuItem} ${status === 'available' ? classes.menuItemSelected : ''}`}
                        onClick={() => handleStatusChange('available')}
                    >
                        <span className={classes.menuIcon}>🟢</span>
                        <span>{t('vrs.statusAvailable')}</span>
                    </div>
                    <div
                        className={`${classes.menuItem} ${status === 'busy' ? classes.menuItemSelected : ''}`}
                        onClick={() => handleStatusChange('busy')}
                    >
                        <span className={classes.menuIcon}>🔴</span>
                        <span>{t('vrs.statusBusy')}</span>
                    </div>
                    <div
                        className={`${classes.menuItem} ${status === 'offline' ? classes.menuItemSelected : ''}`}
                        onClick={() => handleStatusChange('offline')}
                    >
                        <span className={classes.menuIcon}>⚫</span>
                        <span>{t('vrs.statusOffline')}</span>
                    </div>
                </div>
            )}
        </div>
    );
};

function _mapStateToProps(state: IReduxState) {
    return {
        _isConnected: state['features/interpreter-queue']?.isConnected || false
    };
}

export default translate(connect(_mapStateToProps)(InterpreterStatusToggle));
