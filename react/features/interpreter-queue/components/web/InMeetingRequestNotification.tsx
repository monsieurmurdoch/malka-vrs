import React from 'react';
import { connect } from 'react-redux';
import { makeStyles } from 'tss-react/mui';
import { translate } from '../../../base/i18n/functions';
import { isInterpreter } from '../../../base/user-role/functions';
import Button from '../../../base/ui/components/web/Button';
import { BUTTON_TYPES } from '../../../base/ui/constants.any';
import { InterpreterRequest } from '../../reducer';
import { acceptInterpreterRequest, declineInterpreterRequest } from '../../actions';
import { IReduxState } from '../../../app/types';

interface IProps {
    _pendingRequests: InterpreterRequest[];
    dispatch: Function;
    t: Function;
}

const useStyles = makeStyles()(theme => ({
    container: {
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
    },

    notification: {
        backgroundColor: 'rgba(26, 35, 50, 0.95)',
        border: '2px solid #4a9eff',
        borderRadius: '12px',
        padding: '16px 20px',
        minWidth: '320px',
        maxWidth: '400px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        animation: 'slideInRight 0.3s ease-out',
        '@keyframes slideInRight': {
            from: {
                opacity: 0,
                transform: 'translateX(50px)'
            },
            to: {
                opacity: 1,
                transform: 'translateX(0)'
            }
        }
    },

    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '12px'
    },

    title: {
        color: '#ffffff',
        fontSize: '15px',
        fontWeight: 'bold',
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
    },

    closeButton: {
        background: 'none',
        border: 'none',
        color: 'rgba(255, 255, 255, 0.6)',
        fontSize: '18px',
        cursor: 'pointer',
        padding: '4px',
        borderRadius: '4px',
        transition: 'all 0.2s',
        '&:hover': {
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            color: 'white'
        }
    },

    content: {
        color: '#e0e0e0',
        fontSize: '13px',
        marginBottom: '16px',
        lineHeight: '1.5'
    },

    clientName: {
        color: '#4a9eff',
        fontWeight: 'bold'
    },

    language: {
        color: '#ffc107',
        fontWeight: 'bold'
    },

    roomInfo: {
        fontSize: '11px',
        opacity: 0.7,
        marginTop: '4px'
    },

    actions: {
        display: 'flex',
        gap: '10px'
    },

    acceptButton: {
        flex: 1,
        backgroundColor: '#28a745',
        '&:hover': {
            backgroundColor: '#218838'
        }
    },

    declineButton: {
        flex: 1,
        backgroundColor: '#dc3545',
        '&:hover': {
            backgroundColor: '#c82333'
        }
    },

    ringingIndicator: {
        position: 'absolute',
        top: '-5px',
        right: '-5px',
        width: '12px',
        height: '12px',
        backgroundColor: '#FF6B35',
        borderRadius: '50%',
        animation: 'pulse 1s ease-in-out infinite',
        '@keyframes pulse': {
            '0%, 100%': {
                opacity: 1,
                transform: 'scale(1)'
            },
            '50%': {
                opacity: 0.5,
                transform: 'scale(1.2)'
            }
        }
    },

    badge: {
        position: 'relative'
    }
}));

/**
 * In-meeting request notification for interpreters.
 * Shows incoming interpreter requests while the interpreter is already in a meeting.
 */
const InMeetingRequestNotification = ({ _pendingRequests, dispatch, t }: IProps) => {
    const { classes } = useStyles();

    // Don't render if not an interpreter or no pending requests
    if (!isInterpreter() || _pendingRequests.length === 0) {
        return null;
    }

    const handleAccept = (requestId: string) => {
        dispatch(acceptInterpreterRequest(requestId));
    };

    const handleDecline = (requestId: string) => {
        dispatch(declineInterpreterRequest(requestId));
    };

    const handleDismiss = (requestId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        // Just hide from UI, request remains in queue
        dispatch(declineInterpreterRequest(requestId));
    };

    return (
        <div className={classes.container}>
            {_pendingRequests.map((request) => (
                <div key={request.id} className={classes.notification}>
                    <div className={classes.header}>
                        <div className={classes.badge}>
                            <div className={classes.ringingIndicator} />
                            <span className={classes.title}>
                                🔔 {t('vrs.newInterpreterRequest')}
                            </span>
                        </div>
                        <button
                            className={classes.closeButton}
                            onClick={(e) => handleDismiss(request.id, e)}
                        >
                            ✕
                        </button>
                    </div>

                    <div className={classes.content}>
                        <p>
                            {t('vrs.clientWaiting')}: <span className={classes.clientName}>{request.clientName}</span>
                        </p>
                        <p>
                            {t('vrs.language')}: <span className={classes.language}>{request.language}</span>
                        </p>
                        {request.roomName && (
                            <p className={classes.roomInfo}>
                                📍 Room: {request.roomName}
                            </p>
                        )}
                    </div>

                    <div className={classes.actions}>
                        <Button
                            className={classes.acceptButton}
                            onClick={() => handleAccept(request.id)}
                            label={`✓ ${t('vrs.accept')}`}
                            type={BUTTON_TYPES.PRIMARY}
                        />
                        <Button
                            className={classes.declineButton}
                            onClick={() => handleDecline(request.id)}
                            label={`✗ ${t('vrs.decline')}`}
                            type={BUTTON_TYPES.SECONDARY}
                        />
                    </div>
                </div>
            ))}
        </div>
    );
};

function _mapStateToProps(state: IReduxState) {
    return {
        _pendingRequests: state['features/interpreter-queue']?.pendingRequests || []
    };
}

export default translate(connect(_mapStateToProps)(InMeetingRequestNotification));
