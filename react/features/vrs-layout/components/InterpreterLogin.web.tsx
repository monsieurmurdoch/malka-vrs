/**
 * VRS Interpreter Login/Waiting Room Component
 *
 * A specialized waiting room for interpreters.
 * Displays video preview, availability toggle, and queue information.
 */

import React, { useEffect, useState, useRef } from 'react';
import { connect } from 'react-redux';
import { makeStyles } from 'tss-react/mui';
import { translate } from '../../base/i18n/functions';
import type { IReduxState } from '../../app/types';
import { queueService } from '../../interpreter-queue/InterpreterQueueService';
import { setPersistentItem } from '../../vrs-auth/storage';
import { vrsAuthService } from '../../vrs-auth/VRSSAuthService';

interface IProps {
    /**
     * Translation function.
     */
    t: Function;

    /**
     * The name of the room.
     */
    roomName?: string;
}

interface QueueItem {
    id: string;
    clientName: string;
    language: string;
    waitTime: string;
    roomName?: string;
}

const useStyles = makeStyles()(theme => ({
    root: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #1a2332 0%, #0f1419 100%)',
        color: 'white',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        padding: '20px',
    },

    container: {
        display: 'flex',
        gap: '2rem',
        width: '100%',
        maxWidth: '1200px',
        flexWrap: 'wrap' as const,
        justifyContent: 'center',
    },

    // Left Column - Video & Status
    leftColumn: {
        flex: '1',
        minWidth: '350px',
        maxWidth: '500px',
    },

    // Right Column - Queue
    rightColumn: {
        flex: '1',
        minWidth: '350px',
        maxWidth: '500px',
    },

    header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '1.5rem',
    },

    logo: {
        fontSize: '1.5rem',
        fontWeight: 600,
    },

    logoMalka: {
        fontStyle: 'italic',
    },

    logoVRI: {
        color: '#FF6B35',
    },

    statusToggle: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 16px',
        background: 'rgba(40, 167, 69, 0.2)',
        border: '1px solid rgba(40, 167, 69, 0.4)',
        borderRadius: '20px',
        fontSize: '0.9rem',
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

    card: {
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '16px',
        padding: '1.5rem',
        marginBottom: '1.5rem',
    },

    form: {
        display: 'flex',
        flexDirection: 'column',
        gap: '0.85rem',
    },

    fieldGroup: {
        display: 'flex',
        flexDirection: 'column',
        gap: '0.35rem',
    },

    fieldLabel: {
        fontSize: '0.8rem',
        opacity: 0.75,
        textTransform: 'uppercase',
        letterSpacing: '0.4px',
    },

    input: {
        width: '100%',
        padding: '12px 14px',
        borderRadius: '10px',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        background: 'rgba(0, 0, 0, 0.2)',
        color: 'white',
        fontSize: '0.95rem',
        outline: 'none',
        boxSizing: 'border-box' as const,
    },

    helperText: {
        fontSize: '0.85rem',
        opacity: 0.75,
        lineHeight: 1.5,
    },

    authBanner: {
        padding: '12px 14px',
        borderRadius: '10px',
        fontSize: '0.85rem',
        lineHeight: 1.4,
    },

    authBannerError: {
        background: 'rgba(220, 53, 69, 0.16)',
        border: '1px solid rgba(220, 53, 69, 0.35)',
        color: '#ffd7dc',
    },

    authBannerInfo: {
        background: 'rgba(74, 158, 255, 0.14)',
        border: '1px solid rgba(74, 158, 255, 0.28)',
        color: '#d9ebff',
    },

    videoContainer: {
        position: 'relative',
        width: '100%',
        aspectRatio: '16 / 9',
        background: 'rgba(0, 0, 0, 0.3)',
        borderRadius: '12px',
        overflow: 'hidden',
        marginBottom: '1rem',
    },

    videoPreview: {
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        transform: 'scaleX(-1)',
    },

    statsRow: {
        display: 'flex',
        justifyContent: 'space-around',
        marginBottom: '1rem',
    },

    statItem: {
        textAlign: 'center' as const,
    },

    statValue: {
        fontSize: '2rem',
        fontWeight: 700,
        color: '#FF6B35',
    },

    statLabel: {
        fontSize: '0.75rem',
        opacity: 0.7,
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
    },

    languages: {
        display: 'flex',
        gap: '8px',
        flexWrap: 'wrap' as const,
        marginBottom: '1rem',
    },

    languageTag: {
        padding: '6px 12px',
        background: 'rgba(74, 158, 255, 0.2)',
        border: '1px solid rgba(74, 158, 255, 0.3)',
        borderRadius: '16px',
        fontSize: '0.85rem',
    },

    queueCard: {
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '16px',
        padding: '1.5rem',
    },

    queueHeader: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '1rem',
        paddingBottom: '1rem',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    },

    queueTitle: {
        fontSize: '1.1rem',
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
    },

    liveBadge: {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 10px',
        background: 'rgba(220, 53, 69, 0.2)',
        borderRadius: '12px',
        fontSize: '0.75rem',
        fontWeight: 500,
    },

    liveDot: {
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        background: '#dc3545',
        animation: '$pulse 1.5s ease-in-out infinite',
    },

    queueList: {
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
    },

    queueItem: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px',
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '12px',
        cursor: 'pointer',
        transition: 'all 0.2s',
    },

    queueItemHover: {
        background: 'rgba(255, 107, 53, 0.1)',
        borderColor: 'rgba(255, 107, 53, 0.2)',
    },

    queuePosition: {
        width: '32px',
        height: '32px',
        borderRadius: '8px',
        background: 'rgba(255, 107, 53, 0.2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 600,
        fontSize: '0.9rem',
    },

    queueInfo: {
        flex: 1,
    },

    queueClient: {
        fontWeight: 500,
        marginBottom: '2px',
    },

    queueDetails: {
        fontSize: '0.8rem',
        opacity: 0.7,
        display: 'flex',
        gap: '12px',
    },

    queueTime: {
        fontSize: '0.75rem',
        opacity: 0.6,
    },

    emptyQueue: {
        textAlign: 'center' as const,
        padding: '2rem',
        opacity: 0.5,
    },

    emptyIcon: {
        fontSize: '3rem',
        marginBottom: '0.5rem',
    },

    buttonContainer: {
        display: 'flex',
        gap: '1rem',
    },

    button: {
        flex: 1,
        padding: '12px 20px',
        border: 'none',
        borderRadius: '10px',
        fontSize: '0.95rem',
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.2s',
    },

    buttonPrimary: {
        background: '#FF6B35',
        color: 'white',
    },

    buttonSecondary: {
        background: 'rgba(255, 255, 255, 0.1)',
        color: 'white',
        border: '1px solid rgba(255, 255, 255, 0.2)',
    },

    '@keyframes pulse': {
        '0%, 100%': { opacity: 1 },
        '50%': { opacity: 0.5 },
    },

    rtl: {
        direction: 'rtl' as const,
    },
}));

/**
 * Component that renders the Interpreter Waiting Room for VRS.
 * This is where interpreters wait for client assignments.
 */
const InterpreterLogin = ({ t, roomName }: IProps) => {
    const { classes, cx } = useStyles();
    const [isRTL, setIsRTL] = useState(false);
    const [isAvailable, setIsAvailable] = useState(true);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [authError, setAuthError] = useState('');
    const [connectionMessage, setConnectionMessage] = useState('');
    const [interpreterName, setInterpreterName] = useState('Interpreter');
    const [videoReady, setVideoReady] = useState(false);
    const [stats, setStats] = useState({
        callsToday: 0,
        minutesToday: 0,
        currentQueue: 0
    });
    const [queue, setQueue] = useState<QueueItem[]>([]);
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<any>(null);

    useEffect(() => {
        const savedLang = localStorage.getItem('vrs_preferred_language');
        if (savedLang === 'ar') {
            setIsRTL(true);
        }

        const currentUser = vrsAuthService.getUser();
        if (currentUser?.role === 'interpreter' && vrsAuthService.isAuthenticated()) {
            setIsAuthenticated(true);
            setInterpreterName(currentUser.name || currentUser.email || 'Interpreter');
            setEmail(currentUser.email || '');
        }

        startVideoPreview();

        return () => {
            // Cleanup video stream
            if (streamRef.current) {
                streamRef.current.getTracks().forEach((track: any) => track.stop());
                streamRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        if (!isAuthenticated) {
            return;
        }

        const normalizeQueueItem = (item: any): QueueItem => ({
            id: item.id || item.requestId || item.clientId || `${Date.now()}`,
            clientName: item.clientName || item.client_name || 'Guest',
            language: item.language || 'ASL',
            waitTime: item.waitTime || item.wait_time || 'Just now',
            roomName: item.roomName || item.room_name
        });

        const updateQueue = (items: any[] = []) => {
            const nextQueue = items.map(normalizeQueueItem);
            setQueue(nextQueue);
            setStats(prev => ({
                ...prev,
                currentQueue: nextQueue.length
            }));
        };

        const handleConnection = (data: { connected: boolean; message?: string }) => {
            if (data.connected) {
                setConnectionMessage('');
                queueService.updateInterpreterStatus(
                    isAvailable ? 'active' : 'inactive',
                    interpreterName,
                    [ 'ASL', 'en' ]
                );

                return;
            }

            if (data.message) {
                setConnectionMessage(data.message);
            }
        };

        const handleQueueStatus = (data: { pendingRequests?: any[] }) => {
            updateQueue(data.pendingRequests || []);
        };

        const handleInterpreterRequest = (data: any) => {
            setQueue(prev => {
                const nextItem = normalizeQueueItem(data);
                const existing = prev.find(item => item.id === nextItem.id);
                const nextQueue = existing
                    ? prev.map(item => item.id === nextItem.id ? nextItem : item)
                    : [ nextItem, ...prev ];

                setStats(current => ({
                    ...current,
                    currentQueue: nextQueue.length
                }));

                return nextQueue;
            });
        };

        const handleMeetingInitiated = (data: { roomName?: string }) => {
            if (data.roomName) {
                window.location.href = `/${data.roomName}`;
            }
        };

        const handleQueueError = (data: { message?: string }) => {
            setConnectionMessage(data.message || 'Unable to reach the interpreter queue right now.');
        };

        queueService.on('connection', handleConnection);
        queueService.on('queueStatus', handleQueueStatus);
        queueService.on('interpreterRequest', handleInterpreterRequest);
        queueService.on('meetingInitiated', handleMeetingInitiated);
        queueService.on('error', handleQueueError);
        queueService.reconnect();

        return () => {
            queueService.off('connection', handleConnection);
            queueService.off('queueStatus', handleQueueStatus);
            queueService.off('interpreterRequest', handleInterpreterRequest);
            queueService.off('meetingInitiated', handleMeetingInitiated);
            queueService.off('error', handleQueueError);
        };
    }, [ isAuthenticated, interpreterName ]);

    useEffect(() => {
        if (!isAuthenticated || !queueService.isConnected()) {
            return;
        }

        queueService.updateInterpreterStatus(
            isAvailable ? 'active' : 'inactive',
            interpreterName,
            [ 'ASL', 'en' ]
        );
    }, [ isAuthenticated, isAvailable, interpreterName ]);

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
                (videoRef.current as any).srcObject = stream;
                setVideoReady(true);
            }
        } catch (err) {
            console.warn('Could not access camera for preview:', err);
        }
    };

    const toggleAvailability = () => {
        const nextAvailability = !isAvailable;
        setIsAvailable(nextAvailability);

        if (isAuthenticated && queueService.isConnected()) {
            queueService.updateInterpreterStatus(
                nextAvailability ? 'active' : 'inactive',
                interpreterName,
                [ 'ASL', 'en' ]
            );
        }
    };

    const handleInterpreterLogin = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setAuthError('');
        setConnectionMessage('');
        setIsSubmitting(true);

        const result = await vrsAuthService.login({
            role: 'interpreter',
            email: email.trim(),
            password,
            languages: [ 'ASL', 'en' ]
        });

        setIsSubmitting(false);

        if (!result.success || !result.user) {
            setAuthError(result.error || 'Interpreter sign-in failed.');

            return;
        }

        setPersistentItem('vrs_user_role', 'interpreter');
        setInterpreterName(result.user.name || result.user.email || 'Interpreter');
        setEmail(result.user.email || email.trim());
        setPassword('');
        setIsAuthenticated(true);
    };

    const handleJoinQueue = (request: QueueItem) => {
        if (!request.id) {
            return;
        }

        queueService.acceptRequest(request.id, request.roomName || roomName || 'vrs-meeting');
    };

    const handleGoToDashboard = () => {
        window.location.href = '/interpreter-dashboard.html';
    };

    const handleLogout = () => {
        queueService.disconnect();
        vrsAuthService.logout();
        sessionStorage.removeItem('vrs_target_client');
        setQueue([]);
        setStats({
            callsToday: 0,
            minutesToday: 0,
            currentQueue: 0
        });
        setIsAuthenticated(false);
        setConnectionMessage('');
    };

    return (
        <div className={cx(classes.root, isRTL && classes.rtl)}>
            <div className={classes.container}>
                {/* Left Column - Video & Status */}
                <div className={classes.leftColumn}>
                    <div className={classes.header}>
                        <div className={classes.logo}>
                            <span className={classes.logoMalka}>Malka</span>
                            <span className={classes.logoVRI}>VRI</span>
                        </div>
                        <div
                            className={cx(classes.statusToggle, !isAvailable && classes.statusToggleBusy)}
                            onClick={toggleAvailability}
                            style={{ opacity: isAuthenticated ? 1 : 0.55, cursor: isAuthenticated ? 'pointer' : 'not-allowed' }}
                        >
                            <div className={cx(classes.statusDot, !isAvailable && classes.statusDotBusy)} />
                            {isAvailable ? t('vrs.available') : t('vrs.busy')}
                        </div>
                    </div>

                    <div className={classes.card}>
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
                                    🎙️
                                </div>
                            )}
                        </div>

                        <div className={classes.statsRow}>
                            <div className={classes.statItem}>
                                <div className={classes.statValue}>{stats.callsToday}</div>
                                <div className={classes.statLabel}>{t('vrs.callsToday')}</div>
                            </div>
                            <div className={classes.statItem}>
                                <div className={classes.statValue}>{stats.minutesToday}</div>
                                <div className={classes.statLabel}>{t('vrs.minutes')}</div>
                            </div>
                            <div className={classes.statItem}>
                                <div className={classes.statValue}>{stats.currentQueue}</div>
                                <div className={classes.statLabel}>{t('vrs.inQueue')}</div>
                            </div>
                        </div>

                        {isAuthenticated ? (
                            <>
                                <div className={classes.languages}>
                                    <div className={classes.languageTag}>ASL</div>
                                    <div className={classes.languageTag}>English</div>
                                </div>
                                <div className={classes.helperText}>
                                    Signed in as {interpreterName}. Your queue availability is now controlled by real backend auth.
                                </div>
                            </>
                        ) : (
                            <form className={classes.form} onSubmit={handleInterpreterLogin}>
                                <div className={classes.fieldGroup}>
                                    <label className={classes.fieldLabel} htmlFor='vrs-interpreter-email'>
                                        Interpreter Email
                                    </label>
                                    <input
                                        id='vrs-interpreter-email'
                                        className={classes.input}
                                        type='email'
                                        autoComplete='username'
                                        value={email}
                                        onChange={event => setEmail(event.target.value)}
                                        placeholder='interpreter@yourorg.com'
                                        required />
                                </div>
                                <div className={classes.fieldGroup}>
                                    <label className={classes.fieldLabel} htmlFor='vrs-interpreter-password'>
                                        Password
                                    </label>
                                    <input
                                        id='vrs-interpreter-password'
                                        className={classes.input}
                                        type='password'
                                        autoComplete='current-password'
                                        value={password}
                                        onChange={event => setPassword(event.target.value)}
                                        placeholder='Enter your password'
                                        required />
                                </div>
                                <div className={classes.helperText}>
                                    Interpreter queue access now requires a real server-backed login before calls can be accepted.
                                </div>
                                {authError && (
                                    <div className={cx(classes.authBanner, classes.authBannerError)}>
                                        {authError}
                                    </div>
                                )}
                                <button
                                    className={cx(classes.button, classes.buttonPrimary)}
                                    type='submit'
                                    disabled={isSubmitting}>
                                    {isSubmitting ? 'Signing In...' : 'Sign In'}
                                </button>
                            </form>
                        )}
                    </div>

                    <div className={classes.buttonContainer}>
                        <button
                            className={cx(classes.button, classes.buttonSecondary)}
                            onClick={handleGoToDashboard}
                        >
                            {t('vrs.dashboard')}
                        </button>
                        {isAuthenticated && (
                            <button
                                className={cx(classes.button, classes.buttonSecondary)}
                                onClick={handleLogout}>
                                {t('vrs.logout')}
                            </button>
                        )}
                    </div>
                </div>

                {/* Right Column - Queue */}
                <div className={classes.rightColumn}>
                    <div className={classes.queueCard}>
                        <div className={classes.queueHeader}>
                            <div className={classes.queueTitle}>
                                <span className={classes.liveBadge}>
                                    <span className={classes.liveDot} />
                                    {isAuthenticated ? 'LIVE' : 'LOCKED'}
                                </span>
                                {t('vrs.clientQueue')}
                            </div>
                            <span style={{ fontSize: '0.9rem', opacity: 0.7 }}>
                                {queue.length} {t('vrs.waiting')}
                            </span>
                        </div>

                        {!isAuthenticated ? (
                            <div className={cx(classes.authBanner, classes.authBannerInfo)}>
                                Sign in to see live waiting clients, accept assignments, and update your interpreter availability.
                            </div>
                        ) : connectionMessage ? (
                            <div className={cx(classes.authBanner, classes.authBannerError)}>
                                {connectionMessage}
                            </div>
                        ) : queue.length === 0 ? (
                            <div className={classes.emptyQueue}>
                                <div className={classes.emptyIcon}>✅</div>
                                <p>{t('vrs.noClientsWaiting')}</p>
                            </div>
                        ) : (
                            <div className={classes.queueList}>
                                {queue.map((item, index) => (
                                    <div
                                        key={item.id}
                                        className={classes.queueItem}
                                        onClick={() => handleJoinQueue(item)}
                                    >
                                        <div className={classes.queuePosition}>
                                            {index + 1}
                                        </div>
                                        <div className={classes.queueInfo}>
                                            <div className={classes.queueClient}>{item.clientName}</div>
                                            <div className={classes.queueDetails}>
                                                <span>🌐 {item.language}</span>
                                            </div>
                                        </div>
                                        <div className={classes.queueTime}>{item.waitTime}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
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

export default translate(connect(_mapStateToProps)(InterpreterLogin));
