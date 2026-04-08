import React from 'react';
import { makeStyles } from 'tss-react/mui';

import Button from '../../../base/ui/components/web/Button';
import { BUTTON_TYPES } from '../../../base/ui/constants.any';

export interface InterpreterRequest {
    id: string;
    clientName: string;
    language: string;
    timestamp: number;
    roomName?: string;
}

interface IProps {
    request: InterpreterRequest;
    onAccept: (requestId: string) => void;
    onDecline: (requestId: string) => void;
    onDismiss: (requestId: string) => void;
}

const useStyles = makeStyles()(theme => {
    return {
        popup: {
            position: 'fixed',
            top: '20px',
            right: '20px',
            backgroundColor: '#1a2332',
            border: '2px solid #4a9eff',
            borderRadius: '8px',
            padding: '20px',
            minWidth: '320px',
            maxWidth: '400px',
            zIndex: 1000,
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
            animation: 'slideInRight 0.3s ease-out'
        },
        
        header: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px'
        },
        
        title: {
            color: '#ffffff',
            fontSize: '16px',
            fontWeight: 'bold',
            margin: 0
        },
        
        closeButton: {
            background: 'none',
            border: 'none',
            color: '#ffffff',
            fontSize: '18px',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '4px',
            
            '&:hover': {
                backgroundColor: 'rgba(255, 255, 255, 0.1)'
            }
        },
        
        content: {
            color: '#e0e0e0',
            marginBottom: '20px',
            lineHeight: '1.4'
        },
        
        clientName: {
            color: '#4a9eff',
            fontWeight: 'bold'
        },
        
        language: {
            color: '#ffc107',
            fontWeight: 'bold'
        },
        
        actions: {
            display: 'flex',
            gap: '12px'
        },
        
        acceptButton: {
            flex: 1,
            backgroundColor: '#28a745',
            border: 'none',
            
            '&:hover': {
                backgroundColor: '#218838'
            }
        },
        
        declineButton: {
            flex: 1,
            backgroundColor: '#dc3545',
            border: 'none',
            
            '&:hover': {
                backgroundColor: '#c82333'
            }
        }
    };
});

const InterpreterRequestPopup: React.FC<IProps> = ({
    request,
    onAccept,
    onDecline,
    onDismiss
}) => {
    const { classes } = useStyles();
    
    const handleAccept = () => onAccept(request.id);
    const handleDecline = () => onDecline(request.id);
    const handleClose = () => onDismiss(request.id);
    
    const timeAgo = () => {
        const seconds = Math.floor((Date.now() - request.timestamp) / 1000);
        if (seconds < 60) return `${seconds}s ago`;
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        return `${hours}h ago`;
    };
    
    return (
        <div className={classes.popup}>
            <div className={classes.header}>
                <h3 className={classes.title}>🌐 Interpreter Request</h3>
                <button className={classes.closeButton} onClick={handleClose}>
                    ✕
                </button>
            </div>
            
            <div className={classes.content}>
                <p>
                    Client <span className={classes.clientName}>{request.clientName}</span> is requesting 
                    an interpreter for <span className={classes.language}>{request.language}</span> language.
                </p>
                <p style={{ fontSize: '12px', opacity: 0.8 }}>
                    Requested {timeAgo()}
                </p>
            </div>
            
            <div className={classes.actions}>
                <Button
                    className={classes.acceptButton}
                    onClick={handleAccept}
                    label="✅ Accept"
                    type={BUTTON_TYPES.PRIMARY}
                />
                <Button
                    className={classes.declineButton}
                    onClick={handleDecline}
                    label="❌ Decline"
                    type={BUTTON_TYPES.SECONDARY}
                />
            </div>
        </div>
    );
};

export default InterpreterRequestPopup;