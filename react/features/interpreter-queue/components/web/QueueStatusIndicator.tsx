import React, { useEffect, useState, useCallback } from 'react';
import { connect } from 'react-redux';
import { makeStyles } from 'tss-react/mui';
import { translate } from '../../../base/i18n/functions';
import Button from '../../../base/ui/components/web/Button';
import { BUTTON_TYPES } from '../../../base/ui/constants.any';
import { cancelInterpreterRequest } from '../../actions';
import { IReduxState } from '../../../app/types';
import { QueueState } from '../../reducer';
import { isClient } from '../../../base/user-role/functions';

interface IProps {
    _queueState: QueueState;
    dispatch: Function;
    t: Function;
}

const useStyles = makeStyles()(theme => ({
    container: {
        position: 'fixed',
        bottom: '80px',
        left: '50%',
        transform: 'translateX(-50%)',
        backgroundColor: 'rgba(26, 35, 50, 0.95)',
        border: '2px solid #FF6B35',
        borderRadius: '12px',
        padding: '16px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        zIndex: 1000,
        animation: 'slideUp 0.3s ease-out',
        '@keyframes slideUp': {
            from: {
                opacity: 0,
                transform: 'translateX(-50%) translateY(20px)'
            },
            to: {
                opacity: 1,
                transform: 'translateX(-50%) translateY(0)'
            }
        }
    },

    spinner: {
        width: '24px',
        height: '24px',
        border: '3px solid rgba(255, 107, 53, 0.3)',
        borderTopColor: '#FF6B35',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
        '@keyframes spin': {
            to: {
                transform: 'rotate(360deg)'
            }
        }
    },

    content: {
        color: 'white',
        textAlign: 'center'
    },

    title: {
        fontSize: '16px',
        fontWeight: 'bold',
        marginBottom: '4px',
        color: '#FF6B35'
    },

    description: {
        fontSize: '13px',
        opacity: 0.9
    },

    queuePosition: {
        fontSize: '12px',
        opacity: 0.8,
        marginTop: '4px',
        color: '#ffc107'
    },

    matched: {
        border: '2px solid #28a745'
    },

    matchedTitle: {
        color: '#28a745'
    },

    matchedSpinner: {
        border: '3px solid rgba(40, 167, 69, 0.3)',
        borderTopColor: '#28a745'
    },

    cancelButton: {
        minWidth: '80px',
        padding: '8px 16px'
    },

    // Confirmation dialog styles
    confirmOverlay: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000
    },

    confirmDialog: {
        backgroundColor: '#1a2332',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: '12px',
        padding: '24px',
        maxWidth: '400px',
        textAlign: 'center' as const
    },

    confirmText: {
        color: 'white',
        fontSize: '16px',
        marginBottom: '20px'
    },

    confirmButtons: {
        display: 'flex',
        gap: '12px',
        justifyContent: 'center'
    },

    confirmButton: {
        minWidth: '100px',
        padding: '10px 20px'
    },

    confirmButtonCancel: {
        backgroundColor: 'rgba(220, 53, 69, 0.8)',
        color: 'white',
        '&:hover': {
            backgroundColor: '#dc3545'
        }
    },

    confirmButtonKeep: {
        backgroundColor: 'rgba(40, 167, 69, 0.8)',
        color: 'white',
        '&:hover': {
            backgroundColor: '#28a745'
        }
    }
}));

/**
 * In-meeting queue status indicator for clients.
 * Shows when waiting for an interpreter, including queue position and cancel option.
 */
const QueueStatusIndicator = ({ _queueState, dispatch, t }: IProps) => {
    const { classes } = useStyles();
    const [estimatedWait, setEstimatedWait] = useState<number>(0);
    const [showConfirmDialog, setShowConfirmDialog] = useState<boolean>(false);

    const { isRequestPending, queuePosition, matchFound } = _queueState;

    // Estimate wait time based on queue position
    useEffect(() => {
        if (isRequestPending && queuePosition) {
            // Assume ~2 minutes per person in queue
            setEstimatedWait(queuePosition * 2);
        }
    }, [isRequestPending, queuePosition]);

    // Don't render if not a client or no request is pending
    if (!isClient() || (!isRequestPending && !matchFound)) {
        return null;
    }

    const handleCancelClick = useCallback(() => {
        setShowConfirmDialog(true);
    }, []);

    const handleConfirmCancel = useCallback(() => {
        dispatch(cancelInterpreterRequest());
        setShowConfirmDialog(false);
    }, [dispatch]);

    const handleKeepWaiting = useCallback(() => {
        setShowConfirmDialog(false);
    }, []);

    if (matchFound) {
        return (
            <div className={`${classes.container} ${classes.matched}`}>
                <div className={`${classes.spinner} ${classes.matchedSpinner}`} />
                <div className={classes.content}>
                    <div className={`${classes.title} ${classes.matchedTitle}`}>
                        {t('vrs.interpreterJoining')}
                    </div>
                    <div className={classes.description}>
                        {t('vrs.interpreterJoiningDesc')}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <>
            <div className={classes.container}>
                <div className={classes.spinner} />
                <div className={classes.content}>
                    <div className={classes.title}>
                        {t('vrs.waitingForInterpreter')}
                    </div>
                    <div className={classes.description}>
                        {t('vrs.searchingAvailableInterpreter')}
                    </div>
                    {queuePosition && (
                        <div className={classes.queuePosition}>
                            {t('vrs.queuePosition', { position: queuePosition, minutes: estimatedWait })}
                        </div>
                    )}
                </div>
                <Button
                    className={classes.cancelButton}
                    onClick={handleCancelClick}
                    label={t('vrs.cancel')}
                    type={BUTTON_TYPES.SECONDARY}
                />
            </div>

            {/* Confirmation Dialog */}
            {showConfirmDialog && (
                <div className={classes.confirmOverlay}>
                    <div className={classes.confirmDialog}>
                        <div className={classes.confirmText}>
                            {t('vrs.cancelConfirm')}
                        </div>
                        <div className={classes.confirmButtons}>
                            <Button
                                className={`${classes.confirmButton} ${classes.confirmButtonKeep}`}
                                onClick={handleKeepWaiting}
                                label={t('vrs.keepWaiting') || 'Keep Waiting'}
                                type={BUTTON_TYPES.PRIMARY}
                            />
                            <Button
                                className={`${classes.confirmButton} ${classes.confirmButtonCancel}`}
                                onClick={handleConfirmCancel}
                                label={t('vrs.cancelRequest') || 'Cancel Request'}
                                type={BUTTON_TYPES.SECONDARY}
                            />
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

function _mapStateToProps(state: IReduxState) {
    return {
        _queueState: state['features/interpreter-queue']
    };
}

export default translate(connect(_mapStateToProps)(QueueStatusIndicator));
