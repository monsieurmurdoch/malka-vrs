import React, { useState, useCallback } from 'react';

interface PhoneNumpadProps {
    onCall: (phoneNumber: string) => void;
    onHangup: () => void;
    callStatus: 'idle' | 'dialing' | 'ringing' | 'connected' | 'ended';
    callDuration?: string;
    className?: string;
}

const PhoneNumpad: React.FC<PhoneNumpadProps> = ({
    onCall,
    onHangup,
    callStatus,
    callDuration,
    className
}) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [phoneNumber, setPhoneNumber] = useState('');

    const digits = [
        ['1', '2', '3'],
        ['4', '5', '6'], 
        ['7', '8', '9'],
        ['*', '0', '#']
    ];

    const handleDigitPress = useCallback((digit: string) => {
        setPhoneNumber(prev => prev + digit);
    }, []);

    const handleBackspace = useCallback(() => {
        setPhoneNumber(prev => prev.slice(0, -1));
    }, []);

    const handleCall = useCallback(() => {
        if (phoneNumber.trim()) {
            onCall(phoneNumber.trim());
        }
    }, [phoneNumber, onCall]);

    const getStatusText = () => {
        switch (callStatus) {
            case 'connected':
                return `Connected ${callDuration || ''}`;
            case 'dialing':
                return 'Dialing...';
            case 'ringing':
                return 'Ringing...';
            case 'ended':
                return 'Call ended';
            default:
                return 'Ready to dial';
        }
    };

    const isCallActive = callStatus === 'connected' || callStatus === 'dialing' || callStatus === 'ringing';

    const containerStyle = {
        position: 'fixed' as const,
        bottom: '20px',
        right: '20px',
        zIndex: 1000,
        borderRadius: '12px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
        backgroundColor: 'rgba(13, 26, 56, 0.9)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        ...(isExpanded ? { width: '280px', height: 'auto' } : { width: '60px', height: '60px' })
    };

    const toggleButtonStyle = {
        width: '100%',
        height: '60px',
        backgroundColor: 'transparent',
        color: '#fff',
        border: 'none',
        borderRadius: '12px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '24px'
    };

    const numpadButtonStyle = {
        fontSize: '20px',
        fontWeight: 'bold' as const,
        minHeight: '45px',
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        color: '#fff',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: '8px',
        cursor: 'pointer',
        transition: 'all 0.15s ease'
    };

    const inputStyle = {
        width: '100%',
        padding: '12px',
        fontSize: '18px',
        textAlign: 'center' as const,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: '8px',
        color: '#fff',
        fontFamily: 'monospace'
    };

    return (
        <div style={containerStyle} className={className}>
            {!isExpanded ? (
                <button 
                    style={toggleButtonStyle}
                    onClick={() => setIsExpanded(true)}
                    title="Open VRS Dialer"
                >
                    📞
                </button>
            ) : (
                <div style={{ padding: '16px', color: '#fff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <span style={{ fontSize: '16px', fontWeight: 600 }}>VRS Dialer</span>
                        <button
                            onClick={() => setIsExpanded(false)}
                            style={{ 
                                backgroundColor: 'transparent',
                                border: 'none',
                                color: '#fff',
                                cursor: 'pointer',
                                fontSize: '18px',
                                padding: '4px'
                            }}
                        >
                            ✕
                        </button>
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                        <input
                            type="tel"
                            value={phoneNumber}
                            onChange={(e: any) => setPhoneNumber(e.target.value)}
                            placeholder="Enter phone number"
                            maxLength={20}
                            style={inputStyle}
                        />
                    </div>

                    <div style={{ 
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: '8px',
                        marginBottom: '16px'
                    }}>
                        {digits.flat().map(digit => (
                            <button
                                key={digit}
                                style={numpadButtonStyle}
                                onClick={() => handleDigitPress(digit)}
                                disabled={isCallActive}
                            >
                                {digit}
                            </button>
                        ))}
                    </div>

                    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                        <button
                            onClick={handleCall}
                            disabled={!phoneNumber.trim() || isCallActive}
                            style={{
                                flex: 1,
                                padding: '12px',
                                backgroundColor: '#00b25d',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '8px',
                                cursor: phoneNumber.trim() && !isCallActive ? 'pointer' : 'not-allowed',
                                opacity: phoneNumber.trim() && !isCallActive ? 1 : 0.5
                            }}
                        >
                            📞 Call
                        </button>
                        
                        <button
                            onClick={onHangup}
                            disabled={!isCallActive}
                            style={{
                                flex: 1,
                                padding: '12px',
                                backgroundColor: '#d32f2f',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '8px',
                                cursor: isCallActive ? 'pointer' : 'not-allowed',
                                opacity: isCallActive ? 1 : 0.5
                            }}
                        >
                            📞 End
                        </button>
                        
                        <button
                            onClick={handleBackspace}
                            disabled={!phoneNumber || isCallActive}
                            style={{
                                minWidth: '45px',
                                padding: '12px',
                                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '8px',
                                cursor: phoneNumber && !isCallActive ? 'pointer' : 'not-allowed',
                                opacity: phoneNumber && !isCallActive ? 1 : 0.5
                            }}
                        >
                            ⌫
                        </button>
                    </div>

                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '8px',
                        backgroundColor: 'rgba(0, 0, 0, 0.3)',
                        borderRadius: '8px',
                        fontSize: '14px'
                    }}>
                        {(callStatus === 'dialing' || callStatus === 'ringing') && (
                            <span style={{ marginRight: '8px' }}>●</span>
                        )}
                        <span>{getStatusText()}</span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PhoneNumpad;
