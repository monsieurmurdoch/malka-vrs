import React, { useState } from 'react';
import { makeStyles } from 'tss-react/mui';

import Button from '../../../base/ui/components/web/Button';
import { BUTTON_TYPES } from '../../../base/ui/constants.any';
import { InterpreterRequest } from './InterpreterRequestPopup';

interface IProps {
    requests: InterpreterRequest[];
    onAccept: (requestId: string) => void;
    onDecline: (requestId: string) => void;
    onRemove: (requestId: string) => void;
}

const useStyles = makeStyles()(theme => {
    return {
        container: {
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            zIndex: 999
        },
        
        toggleButton: {
            backgroundColor: '#4a9eff',
            border: 'none',
            borderRadius: '50%',
            width: '50px',
            height: '50px',
            color: 'white',
            fontSize: '16px',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
            position: 'relative',
            
            '&:hover': {
                backgroundColor: '#3d8bef'
            }
        },
        
        badge: {
            position: 'absolute',
            top: '-5px',
            right: '-5px',
            backgroundColor: '#dc3545',
            color: 'white',
            borderRadius: '50%',
            width: '20px',
            height: '20px',
            fontSize: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 'bold'
        },
        
        panel: {
            position: 'absolute',
            bottom: '60px',
            right: '0',
            backgroundColor: '#1a2332',
            border: '2px solid #4a9eff',
            borderRadius: '8px',
            padding: '16px',
            minWidth: '300px',
            maxWidth: '400px',
            maxHeight: '400px',
            overflowY: 'auto',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)'
        },
        
        header: {
            color: '#ffffff',
            fontSize: '14px',
            fontWeight: 'bold',
            marginBottom: '12px',
            borderBottom: '1px solid #4a9eff',
            paddingBottom: '8px'
        },
        
        requestItem: {
            backgroundColor: '#2d3748',
            border: '1px solid #4a9eff',
            borderRadius: '6px',
            padding: '12px',
            marginBottom: '8px',
            
            '&:last-child': {
                marginBottom: 0
            }
        },
        
        requestHeader: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '8px'
        },
        
        clientName: {
            color: '#4a9eff',
            fontWeight: 'bold',
            fontSize: '13px'
        },
        
        timestamp: {
            color: '#a0a0a0',
            fontSize: '11px'
        },
        
        language: {
            color: '#ffc107',
            fontSize: '12px',
            marginBottom: '8px'
        },
        
        actions: {
            display: 'flex',
            gap: '6px'
        },
        
        actionButton: {
            flex: 1,
            fontSize: '11px',
            padding: '4px 8px',
            minHeight: '28px'
        },
        
        acceptButton: {
            backgroundColor: '#28a745',
            
            '&:hover': {
                backgroundColor: '#218838'
            }
        },
        
        declineButton: {
            backgroundColor: '#dc3545',
            
            '&:hover': {
                backgroundColor: '#c82333'
            }
        },
        
        removeButton: {
            backgroundColor: '#6c757d',
            
            '&:hover': {
                backgroundColor: '#5a6268'
            }
        },
        
        emptyState: {
            color: '#a0a0a0',
            fontSize: '12px',
            textAlign: 'center',
            fontStyle: 'italic'
        }
    };
});

const MinimizedRequestList: React.FC<IProps> = ({
    requests,
    onAccept,
    onDecline,
    onRemove
}) => {
    const { classes } = useStyles();
    const [isExpanded, setIsExpanded] = useState(false);
    
    const timeAgo = (timestamp: number) => {
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        if (seconds < 60) return `${seconds}s ago`;
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        return `${hours}h ago`;
    };
    
    if (requests.length === 0) {
        return null;
    }
    
    return (
        <div className={classes.container}>
            <button
                className={classes.toggleButton}
                onClick={() => setIsExpanded(!isExpanded)}
                title={`${requests.length} pending interpreter requests`}
            >
                📋
                {requests.length > 0 && (
                    <span className={classes.badge}>
                        {requests.length > 9 ? '9+' : requests.length}
                    </span>
                )}
            </button>
            
            {isExpanded && (
                <div className={classes.panel}>
                    <div className={classes.header}>
                        Pending Requests ({requests.length})
                    </div>
                    
                    {requests.length === 0 ? (
                        <div className={classes.emptyState}>
                            No pending requests
                        </div>
                    ) : (
                        requests.map(request => (
                            <div key={request.id} className={classes.requestItem}>
                                <div className={classes.requestHeader}>
                                    <span className={classes.clientName}>
                                        {request.clientName}
                                    </span>
                                    <span className={classes.timestamp}>
                                        {timeAgo(request.timestamp)}
                                    </span>
                                </div>
                                
                                <div className={classes.language}>
                                    Language: {request.language}
                                </div>
                                
                                <div className={classes.actions}>
                                    <Button
                                        className={`${classes.actionButton} ${classes.acceptButton}`}
                                        onClick={() => onAccept(request.id)}
                                        label="Accept"
                                        type={BUTTON_TYPES.PRIMARY}
                                    />
                                    <Button
                                        className={`${classes.actionButton} ${classes.declineButton}`}
                                        onClick={() => onDecline(request.id)}
                                        label="Decline"
                                        type={BUTTON_TYPES.SECONDARY}
                                    />
                                    <Button
                                        className={`${classes.actionButton} ${classes.removeButton}`}
                                        onClick={() => onRemove(request.id)}
                                        label="×"
                                        type={BUTTON_TYPES.SECONDARY}
                                    />
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
};

export default MinimizedRequestList;