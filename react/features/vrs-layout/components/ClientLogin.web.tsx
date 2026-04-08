/**
 * VRS Client Login/Waiting Room Component
 *
 * A specialized waiting room for deaf/hard-of-hearing clients.
 * Displays video preview, connection status, and interpreter queue information.
 */

import React, { useEffect, useState, useRef } from 'react';
import { connect } from 'react-redux';
import { makeStyles } from 'tss-react/mui';
import { translate } from '../../base/i18n/functions';
import type { IReduxState } from '../../app/types';
import { queueService } from '../../interpreter-queue/InterpreterQueueService';

interface IProps {
    /**
     * Translation function.
     */
    t: Function;

    /**
     * The name of the room.
     */
    roomName: string;
}

const useStyles = makeStyles()(theme => ({
    root: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #2D1B69 0%, #1a0f3a 100%)',
        color: 'white',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        padding: '20px',
    },

    container: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '2rem',
        width: '100%',
        maxWidth: '800px',
    },

    logo: {
        fontSize: '2.5rem',
        fontWeight: 300,
        marginBottom: '1rem',
        textAlign: 'center' as const,
    },

    logoMalka: {
        fontStyle: 'italic',
        color: 'white',
    },

    logoVRI: {
        color: '#FF6B35',
        fontWeight: 700,
    },

    subtitle: {
        fontSize: '1rem',
        opacity: 0.9,
        textAlign: 'center' as const,
        marginBottom: '1rem',
    },

    card: {
        background: 'rgba(255, 255, 255, 0.1)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        borderRadius: '20px',
        padding: '2rem',
        width: '100%',
        maxWidth: '600px',
        backdropFilter: 'blur(10px)',
    },

    videoContainer: {
        position: 'relative',
        width: '100%',
        aspectRatio: '16 / 9',
        background: 'rgba(0, 0, 0, 0.3)',
        borderRadius: '12px',
        overflow: 'hidden',
        marginBottom: '1.5rem',
    },

    videoPreview: {
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        transform: 'scaleX(-1)', // Mirror effect
    },

    statusContainer: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        padding: '16px 24px',
        background: 'rgba(255, 107, 53, 0.15)',
        border: '1px solid rgba(255, 107, 53, 0.3)',
        borderRadius: '30px',
        marginBottom: '1rem',
    },

    statusDot: {
        width: '10px',
        height: '10px',
        borderRadius: '50%',
        background: '#FF6B35',
        animation: '$pulse 2s ease-in-out infinite',
    },

    statusText: {
        fontSize: '1.1rem',
        fontWeight: 500,
    },

    statusSubtext: {
        fontSize: '0.9rem',
        opacity: 0.8,
        textAlign: 'center' as const,
    },

    infoGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '1rem',
        width: '100%',
        marginBottom: '1.5rem',
    },

    infoItem: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '1rem',
        background: 'rgba(255, 255, 255, 0.05)',
        borderRadius: '12px',
    },

    infoLabel: {
        fontSize: '0.75rem',
        opacity: 0.7,
        marginBottom: '4px',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
    },

    infoValue: {
        fontSize: '1rem',
        fontWeight: 500,
    },

    buttonContainer: {
        display: 'flex',
        gap: '1rem',
        width: '100%',
    },

    button: {
        flex: 1,
        padding: '14px 24px',
        border: 'none',
        borderRadius: '12px',
        fontSize: '1rem',
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
    },

    buttonPrimary: {
        background: '#FF6B35',
        color: 'white',
    },

    buttonPrimaryHover: {
        background: '#e55a2b',
    },

    buttonSecondary: {
        background: 'rgba(255, 255, 255, 0.1)',
        color: 'white',
        border: '1px solid rgba(255, 255, 255, 0.2)',
    },

    buttonDisabled: {
        opacity: 0.5,
        cursor: 'not-allowed',
    },

    footer: {
        marginTop: '1rem',
        textAlign: 'center' as const,
        fontSize: '0.85rem',
        opacity: 0.6,
    },

    '@keyframes pulse': {
        '0%, 100%': { opacity: 1 },
        '50%': { opacity: 0.5 },
    },

    // RTL support
    rtl: {
        direction: 'rtl' as const,
    },
}));

/**
 * Component that renders the Client Waiting Room for VRS.
 * This is where deaf clients wait for an interpreter to be assigned.
 */
const ClientLogin = ({ t, roomName }: IProps) => {
    const { classes, cx } = useStyles();
    const [isRTL, setIsRTL] = useState(false);
    const [videoReady, setVideoReady] = useState(false);
    const [interpreterStatus, setInterpreterStatus] = useState<'searching' | 'found' | 'connected'>('searching');
    const [queuePosition, setQueuePosition] = useState(1);
    const [estimatedWait, setEstimatedWait] = useState(2);
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const hasRequestedRef = useRef(false);

    useEffect(() => {
        // Check for RTL language preference
        const savedLang = localStorage.getItem('vrs_preferred_language');
        if (savedLang === 'ar') {
            setIsRTL(true);
        }

        // Try to get user media for preview
        startVideoPreview();

        const handleRequestQueued = (data: { position?: number }) => {
            const position = data.position || 1;
            setQueuePosition(position);
            setEstimatedWait(Math.max(position * 2, 1));
            setInterpreterStatus('searching');
        };

        const handleMatchFound = () => {
            setInterpreterStatus('found');
        };

        const handleMeetingInitiated = () => {
            setInterpreterStatus('connected');
        };

        const handleConnection = (data: { connected: boolean }) => {
            if (data.connected && !hasRequestedRef.current) {
                hasRequestedRef.current = true;
                queueService.requestInterpreter('ASL', sessionStorage.getItem('vrs_client_name') || 'Guest', roomName);
            }
        };

        queueService.on('requestQueued', handleRequestQueued);
        queueService.on('matchFound', handleMatchFound);
        queueService.on('meetingInitiated', handleMeetingInitiated);
        queueService.on('connection', handleConnection);

        if (!hasRequestedRef.current && queueService.isConnected()) {
            hasRequestedRef.current = true;
            queueService.requestInterpreter('ASL', sessionStorage.getItem('vrs_client_name') || 'Guest', roomName);
        }

        return () => {
            queueService.off('requestQueued', handleRequestQueued);
            queueService.off('matchFound', handleMatchFound);
            queueService.off('meetingInitiated', handleMeetingInitiated);
            queueService.off('connection', handleConnection);
            // Cleanup video stream
            try {
                if (streamRef.current) {
                    streamRef.current.getTracks().forEach(track => {
                        track.stop();
                        track.enabled = false;
                    });
                    streamRef.current = null;
                }
            } catch (err) {
                console.warn('Error cleaning up video stream:', err);
                streamRef.current = null;
            }
        };
    }, [ roomName ]);

    const startVideoPreview = async () => {
        try {
            const stream = await navigator.mediaDevices?.getUserMedia({
                video: { facingMode: 'user', width: 1280, height: 720 },
                audio: false
            });
            if (!stream) {
                return;
            }
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                setVideoReady(true);
            }
        } catch (err) {
            console.warn('Could not access camera for preview:', err);
        }
    };

    const handleJoinMeeting = () => {
        // Store client role
        sessionStorage.setItem('vrs_user_role', 'client');
        sessionStorage.setItem('vrs_client_auth', 'true');

        // Navigate to the meeting
        window.location.href = `/${roomName}`;
    };

    const handleCancel = () => {
        queueService.cancelRequest();
        // Go back to welcome page
        window.location.href = '/vrs-welcome.html';
    };

    return (
        <div className={cx(classes.root, isRTL && classes.rtl)}>
            <div className={classes.container}>
                {/* Logo */}
                <div className={classes.logo}>
                    <span className={classes.logoMalka}>Malka</span>
                    <span className={classes.logoVRI}>VRI</span>
                </div>

                <div className={classes.subtitle}>
                    Video Remote Interpreting - Client Waiting Room
                </div>

                {/* Main Card */}
                <div className={classes.card}>
                    {/* Video Preview */}
                    <div className={classes.videoContainer}>
                        {videoReady ? (
                            <video
                                ref={videoRef}
                                autoPlay
                                muted
                                playsInline
                                className={classes.videoPreview}
                            />
                        ) : (
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                height: '100%',
                                fontSize: '3rem',
                                opacity: 0.5
                            }}>
                                👤
                            </div>
                        )}
                    </div>

                    {/* Status Indicator */}
                    <div className={classes.statusContainer}>
                        <div className={classes.statusDot} />
                        <div>
                            <div className={classes.statusText}>
                                {interpreterStatus === 'searching' && t('vrs.status.searching')}
                                {interpreterStatus === 'found' && t('vrs.status.interpreterFound')}
                                {interpreterStatus === 'connected' && t('vrs.status.connected')}
                            </div>
                            <div className={classes.statusSubtext}>
                                {interpreterStatus === 'searching' &&
                                    `${t('vrs.queue.position')}: ${queuePosition} • ${t('vrs.queue.wait')}: ~${estimatedWait} ${t('vrs.minutes')}`}
                            </div>
                        </div>
                    </div>

                    {/* Info Grid */}
                    <div className={classes.infoGrid}>
                        <div className={classes.infoItem}>
                            <div className={classes.infoLabel}>{t('vrs.room')}</div>
                            <div className={classes.infoValue}>{roomName || '—'}</div>
                        </div>
                        <div className={classes.infoItem}>
                            <div className={classes.infoLabel}>{t('vrs.service')}</div>
                            <div className={classes.infoValue}>ASL / English</div>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className={classes.buttonContainer}>
                        <button
                            className={cx(classes.button, classes.buttonSecondary)}
                            onClick={handleCancel}
                        >
                            {t('vrs.cancel')}
                        </button>
                        <button
                            className={cx(classes.button, classes.buttonPrimary)}
                            onClick={handleJoinMeeting}
                            disabled={interpreterStatus === 'searching'}
                        >
                            {t('vrs.join')}
                        </button>
                    </div>
                </div>

                <div className={classes.footer}>
                    {t('vrs.clientHelp')}
                </div>
            </div>
        </div>
    );
};

function _mapStateToProps(state: IReduxState) {
    return {
        roomName: state['features/base/conference']?.room || ''
    };
}

export default translate(connect(_mapStateToProps)(ClientLogin));
