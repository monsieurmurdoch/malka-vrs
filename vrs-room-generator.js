/**
 * VRS Room Generation System
 * 
 * This replaces the static HTML approach with dynamic room generation
 * for the MalkaVRI system.
 */

// Generate secure random room IDs using crypto API
function generateVRSRoomId() {
    const adjectives = ['secure', 'private', 'safe', 'trusted', 'verified', 'professional'];
    const nouns = ['meeting', 'session', 'conference', 'room', 'space', 'hub'];
    const rand = new Uint32Array(3);
    crypto.getRandomValues(rand);
    const numbers = (rand[0] % 10000).toString().padStart(4, '0');

    const adj = adjectives[rand[1] % adjectives.length];
    const noun = nouns[rand[2] % nouns.length];

    return `vrs-${adj}-${noun}-${numbers}`;
}

// Create client meeting room
function createClientMeetingRoom() {
    const roomId = generateVRSRoomId();
    const meetingUrl = `${window.location.origin}/${roomId}`;
    
    // Store room info for tracking
    sessionStorage.setItem('vrs_room_type', 'client');
    sessionStorage.setItem('vrs_room_id', roomId);
    
    return {
        roomId,
        meetingUrl,
        type: 'client'
    };
}

// Create interpreter meeting room
function createInterpreterMeetingRoom() {
    const roomId = generateVRSRoomId();
    const meetingUrl = `${window.location.origin}/${roomId}`;
    
    // Store room info for tracking
    sessionStorage.setItem('vrs_room_type', 'interpreter');
    sessionStorage.setItem('vrs_room_id', roomId);
    
    return {
        roomId,
        meetingUrl,
        type: 'interpreter'
    };
}

// Join existing room (for interpreters joining client rooms)
function joinExistingRoom(roomId) {
    if (!roomId || roomId.length < 5) {
        throw new Error('Invalid room ID');
    }
    
    const meetingUrl = `${window.location.origin}/${roomId}`;
    
    return {
        roomId,
        meetingUrl,
        type: 'join'
    };
}

// Parse room ID from current URL (like original Jitsi)
function getCurrentRoomId() {
    const path = window.location.pathname;
    const roomId = path.substring(path.lastIndexOf('/') + 1) || undefined;
    
    // Validate room ID format
    if (roomId && (roomId === 'index.html' || roomId.includes('.'))) {
        return undefined;
    }
    
    return roomId;
}

// Check if current page is in a meeting room
function isInMeetingRoom() {
    const roomId = getCurrentRoomId();
    return roomId && roomId.length > 0;
}

// Initialize VRS room system
function initializeVRS() {
    // If we're not in a room and not on welcome page, redirect appropriately
    if (!isInMeetingRoom() && window.location.pathname !== '/') {
        // Check if user is trying to access old static pages
        if (window.location.pathname.includes('.html')) {
            // Redirect to dynamic system
            window.location.href = '/';
            return;
        }
    }
    
    // Set up VRS-specific configurations
    if (window.config) {
        // Ensure welcome page is enabled for room generation
        window.config.welcomePage = window.config.welcomePage || {};
        window.config.welcomePage.disabled = false;
    }
    
    if (window.interfaceConfig) {
        // Enable room name generation
        window.interfaceConfig.GENERATE_ROOMNAMES_ON_WELCOME_PAGE = true;
        window.interfaceConfig.APP_NAME = 'MalkaVRI';
    }
}

// VRS specific room creation with role-based logic
function createVRSMeeting(userType = 'client') {
    let roomInfo;
    
    if (userType === 'interpreter') {
        roomInfo = createInterpreterMeetingRoom();
    } else {
        roomInfo = createClientMeetingRoom();
    }
    
    // Add VRS-specific metadata
    roomInfo.createdAt = new Date().toISOString();
    roomInfo.userType = userType;
    
    // Store in session for tracking
    sessionStorage.setItem('vrs_meeting_info', JSON.stringify(roomInfo));
    
    return roomInfo;
}

// Export functions for global use
window.VRSRoomGenerator = {
    generateVRSRoomId,
    createClientMeetingRoom,
    createInterpreterMeetingRoom,
    joinExistingRoom,
    getCurrentRoomId,
    isInMeetingRoom,
    createVRSMeeting,
    initializeVRS
};

// Auto-initialize when script loads
document.addEventListener('DOMContentLoaded', initializeVRS);

console.log('VRS Room Generation System loaded');