/**
 * In-Call Text Chat Panel — side panel for text communication during video calls.
 *
 * Displays messages in real-time and allows sending text alongside signing.
 */

import React, { useState, useRef, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';

import { sendChatMessage, toggleChatPanel, requestChatHistory } from '../actions';

interface ChatState {
    'features/call-management': {
        chatMessages: Array<{
            id: string;
            senderId: string;
            senderName: string;
            message: string;
            timestamp: number;
        }>;
        chatPanelOpen: boolean;
        currentChatCallId: string | null;
    };
}

interface Props {
    callId: string;
}

const InCallChatPanel = ({ callId }: Props) => {
    const dispatch = useDispatch();
    const messages = useSelector(
        (state: ChatState) => state['features/call-management']?.chatMessages ?? []
    );
    const isOpen = useSelector(
        (state: ChatState) => state['features/call-management']?.chatPanelOpen ?? false
    );
    const [ inputText, setInputText ] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Load chat history when panel opens
    useEffect(() => {
        if (isOpen && callId) {
            dispatch(requestChatHistory(callId));
        }
    }, [ isOpen, callId ]);

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
    }, [ messages ]);

    const handleSend = () => {
        const trimmed = inputText.trim();

        if (!trimmed) {
            return;
        }
        dispatch(sendChatMessage(callId, trimmed));
        setInputText('');
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleToggle = () => {
        dispatch(toggleChatPanel());
    };

    const formatTime = (ts: number) => {
        const d = new Date(ts);

        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <>
            {/* Toggle button */}
            <button
                className = { `chat-toggle-btn ${isOpen ? 'active' : ''}` }
                onClick = { handleToggle }
                title = 'Text Chat'>
                <i className = 'icon-chat' />
                {messages.length > 0 && !isOpen && (
                    <span className = 'chat-badge'>{messages.length}</span>
                )}
            </button>

            {/* Chat panel */}
            {isOpen && (
                <div className = 'in-call-chat-panel'>
                    <div className = 'chat-header'>
                        <span>In-Call Chat</span>
                        <button
                            className = 'chat-close-btn'
                            onClick = { handleToggle }>&times;</button>
                    </div>
                    <div className = 'chat-messages'>
                        {messages.length === 0 && (
                            <div className = 'chat-empty'>No messages yet. Type to start chatting.</div>
                        )}
                        {messages.map(msg => (
                            <div
                                key = { msg.id }
                                className = { `chat-message ${msg.senderId === 'self' ? 'self' : 'other'}` }>
                                <div className = 'chat-message-header'>
                                    <span className = 'chat-sender'>{msg.senderName}</span>
                                    <span className = 'chat-time'>{formatTime(msg.timestamp)}</span>
                                </div>
                                <div className = 'chat-message-text'>{msg.message}</div>
                            </div>
                        ))}
                        <div ref = { messagesEndRef } />
                    </div>
                    <div className = 'chat-input-area'>
                        <textarea
                            value = { inputText }
                            onChange = { e => setInputText(e.target.value ?? '') }
                            onKeyDown = { handleKeyDown }
                            placeholder = 'Type a message...'
                            rows = { 1 } />
                        <button
                            className = 'chat-send-btn'
                            disabled = { !inputText.trim() }
                            onClick = { handleSend }>
                            Send
                        </button>
                    </div>
                </div>
            )}
        </>
    );
};

export default InCallChatPanel;
