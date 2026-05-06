/**
 * VoicemailPlayer — full-screen video player overlay for voicemail playback.
 *
 * Provides play/pause, progress scrubbing, replay, and close controls.
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { closePlayer, removeMessage } from '../../actions';

interface PlayerState {
    'features/voicemail': {
        currentMessage: any;
        playbackUrl: string | null;
    };
}

const OVERLAY_STYLE: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.85)',
    zIndex: 2000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
};

const CONTAINER_STYLE: React.CSSProperties = {
    width: '90%',
    maxWidth: 700,
    background: '#1e1e2e',
    borderRadius: 12,
    overflow: 'hidden'
};

const HEADER_STYLE: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid #2a2a3e'
};

const SENDER_STYLE: React.CSSProperties = {
    fontSize: 15,
    fontWeight: 600,
    color: '#e0e0e0'
};

const TIMESTAMP_STYLE: React.CSSProperties = {
    fontSize: 12,
    color: '#888',
    marginTop: 2
};

const CLOSE_BUTTON_STYLE: React.CSSProperties = {
    background: 'transparent',
    border: 'none',
    color: '#aaa',
    fontSize: 24,
    cursor: 'pointer',
    padding: '0 4px',
    lineHeight: 1
};

const VIDEO_WRAPPER_STYLE: React.CSSProperties = {
    width: '100%',
    background: '#000',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
};

const VIDEO_STYLE: React.CSSProperties = {
    width: '100%',
    maxHeight: '60vh'
};

const CONTROLS_STYLE: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 16px'
};

const PROGRESS_WRAPPER_STYLE: React.CSSProperties = {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: 8
};

const PROGRESS_BAR_STYLE: React.CSSProperties = {
    flex: 1,
    height: 4,
    background: '#333',
    borderRadius: 2,
    cursor: 'pointer',
    position: 'relative'
};

const PROGRESS_FILL_STYLE: React.CSSProperties = {
    height: '100%',
    background: '#4fc3f7',
    borderRadius: 2,
    transition: 'width 0.1s linear'
};

const TIME_STYLE: React.CSSProperties = {
    fontSize: 12,
    color: '#888',
    minWidth: 40
};

const BUTTON_STYLE: React.CSSProperties = {
    background: 'transparent',
    border: 'none',
    color: '#e0e0e0',
    fontSize: 18,
    cursor: 'pointer',
    padding: '4px 8px'
};

const DELETE_BUTTON_STYLE: React.CSSProperties = {
    ...BUTTON_STYLE,
    color: '#e53935',
    fontSize: 14,
    marginLeft: 'auto'
};

function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);

    return `${m}:${s.toString().padStart(2, '0')}`;
}

const VoicemailPlayer: React.FC = () => {
    const dispatch = useDispatch();
    const { currentMessage, playbackUrl } = useSelector(
        (state: PlayerState) => state['features/voicemail'] || {}
    );
    const videoRef = useRef<HTMLVideoElement>(null);
    const progressRef = useRef<HTMLDivElement>(null);
    const [ isPlaying, setIsPlaying ] = useState(false);
    const [ currentTime, setCurrentTime ] = useState(0);
    const [ duration, setDuration ] = useState(0);

    // Auto-play when message is loaded
    useEffect(() => {
        if (videoRef.current && playbackUrl) {
            videoRef.current.play().catch(() => {
                // Autoplay blocked — user needs to click play
            });
        }
    }, [ playbackUrl ]);

    const handleClose = useCallback(() => {
        dispatch(closePlayer() as any);
    }, [ dispatch ]);

    const handleDelete = useCallback(() => {
        if (currentMessage && window.confirm?.('Delete this voicemail?')) {
            dispatch(removeMessage(currentMessage.id) as any);
        }
    }, [ dispatch, currentMessage ]);

    const togglePlay = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;
        if (video.paused) {
            video.play();
        } else {
            video.pause();
        }
    }, []);

    const handleReplay = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;
        video.currentTime = 0;
        video.play();
    }, []);

    const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        const video = videoRef.current;
        const bar = progressRef.current;
        if (!video || !bar) return;

        const rect = bar.getBoundingClientRect();
        const fraction = (e.clientX - rect.left) / rect.width;

        video.currentTime = fraction * duration;
    }, [ duration ]);

    const handleTimeUpdate = useCallback(() => {
        if (videoRef.current) {
            setCurrentTime(videoRef.current.currentTime);
        }
    }, []);

    const handleLoadedMetadata = useCallback(() => {
        if (videoRef.current) {
            setDuration(videoRef.current.duration);
        }
    }, []);

    const handlePlay = useCallback(() => setIsPlaying(true), []);
    const handlePause = useCallback(() => setIsPlaying(false), []);

    if (!currentMessage || !playbackUrl) {
        return null;
    }

    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

    return (
        <div style = { OVERLAY_STYLE }>
            <div style = { CONTAINER_STYLE }>
                <div style = { HEADER_STYLE }>
                    <div>
                        <div style = { SENDER_STYLE }>
                            {currentMessage.caller_name || 'Unknown caller'}
                        </div>
                        <div style = { TIMESTAMP_STYLE }>
                            {new Date(currentMessage.created_at).toLocaleString()}
                        </div>
                    </div>
                    <button
                        onClick = { handleClose }
                        style = { CLOSE_BUTTON_STYLE }
                        type = 'button'>
                        &times;
                    </button>
                </div>
                <div style = { VIDEO_WRAPPER_STYLE }>
                    <video
                        controlsList = 'nodownload'
                        onLoadedMetadata = { handleLoadedMetadata }
                        onPause = { handlePause }
                        onPlay = { handlePlay }
                        onTimeUpdate = { handleTimeUpdate }
                        ref = { videoRef }
                        src = { playbackUrl }
                        style = { VIDEO_STYLE } />
                </div>
                <div style = { CONTROLS_STYLE }>
                    <button
                        onClick = { togglePlay }
                        style = { BUTTON_STYLE }
                        type = 'button'>
                        {isPlaying ? '\u275A\u275A' : '\u25B6'}
                    </button>
                    <div style = { PROGRESS_WRAPPER_STYLE }>
                        <span style = { TIME_STYLE }>{formatTime(currentTime)}</span>
                        <div
                            onClick = { handleProgressClick }
                            ref = { progressRef }
                            style = { PROGRESS_BAR_STYLE }>
                            <div style = {{ ...PROGRESS_FILL_STYLE, width: `${progress}%` }} />
                        </div>
                        <span style = { TIME_STYLE }>{formatTime(duration)}</span>
                    </div>
                    <button
                        onClick = { handleReplay }
                        style = { BUTTON_STYLE }
                        title = 'Replay'
                        type = 'button'>
                        &#8634;
                    </button>
                    <button
                        onClick = { handleDelete }
                        style = { DELETE_BUTTON_STYLE }
                        title = 'Delete'
                        type = 'button'>
                        Delete
                    </button>
                </div>
            </div>
        </div>
    );
};

export default VoicemailPlayer;
