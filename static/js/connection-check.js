/**
 * Connection checking utilities for the GPT Clone application
 * This script helps monitor the server connection and automatically reconnect
 */

// Global variables
let reconnectAttempts = 0;
const maxReconnectAttempts = 10; // Increased from 5 to 10
const initialReconnectDelay = 2000; // Start with 2 seconds
const maxReconnectDelay = 30000; // Maximum 30 seconds delay
let reconnectDelay = initialReconnectDelay;
let connectionMonitorInterval = null;
let isReconnecting = false;
let lastConnectionStatus = true; // Assume connection is initially good

// Notify the user about connection status
function showConnectionNotification(message, isError = false) {
    const notificationDiv = document.createElement('div');
    notificationDiv.className = `connection-notification ${isError ? 'error' : 'info'}`;
    notificationDiv.textContent = message;
    
    // Style the notification
    Object.assign(notificationDiv.style, {
        position: 'fixed',
        top: '10px',
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '10px 20px',
        borderRadius: '5px',
        backgroundColor: isError ? '#ffebee' : '#e3f2fd',
        color: isError ? '#b71c1c' : '#0d47a1',
        boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
        zIndex: '9999',
        transition: 'opacity 0.5s ease',
        opacity: '0'
    });
    
    document.body.appendChild(notificationDiv);
    
    // Fade in
    setTimeout(() => {
        notificationDiv.style.opacity = '1';
    }, 10);
    
    // Fade out after 5 seconds
    setTimeout(() => {
        notificationDiv.style.opacity = '0';
        setTimeout(() => {
            if (document.body.contains(notificationDiv)) {
                document.body.removeChild(notificationDiv);
            }
        }, 500);
    }, 5000);
}

// Check server connection
async function checkServerConnection() {
    try {
        // Use a more reliable endpoint with random query param to prevent caching
        const timestamp = Date.now();
        const response = await fetch(`/?check=${timestamp}`, { 
            method: 'HEAD', 
            cache: 'no-store',
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            },
            // Add timeout to prevent hanging requests
            signal: AbortSignal.timeout(5000) 
        });
        
        if (response.ok) {
            console.log('Server connection: OK');
            if (!lastConnectionStatus) {
                // If connection was previously down, notify that it's back
                showConnectionNotification('Connection restored!');
                if (typeof updateApiStatus === 'function') {
                    updateApiStatus('online');
                }
            }
            reconnectAttempts = 0;
            reconnectDelay = initialReconnectDelay; // Reset delay
            lastConnectionStatus = true;
            return true;
        } else {
            console.warn('Server returned non-OK status:', response.status);
            if (lastConnectionStatus) {
                showConnectionNotification('Server connection issue detected.', true);
            }
            lastConnectionStatus = false;
            return false;
        }
    } catch (error) {
        console.error('Connection error:', error);
        if (lastConnectionStatus) {
            showConnectionNotification('Connection to server lost.', true);
        }
        lastConnectionStatus = false;
        return false;
    }
}

// Try to reconnect to the server
async function attemptReconnect() {
    if (isReconnecting) return; // Prevent multiple reconnect attempts
    isReconnecting = true;
    
    if (reconnectAttempts >= maxReconnectAttempts) {
        showConnectionNotification('Maximum reconnection attempts reached. Please reload the page or check your server.', true);
        isReconnecting = false;
        return;
    }
    
    reconnectAttempts++;
    
    // Use exponential backoff for reconnection attempts
    reconnectDelay = Math.min(reconnectDelay * 1.5, maxReconnectDelay);
    
    showConnectionNotification(`Attempting to reconnect (${reconnectAttempts}/${maxReconnectAttempts})...`);
    
    const isConnected = await checkServerConnection();
    
    if (isConnected) {
        showConnectionNotification('Connection restored!');
        // Update API status in the main script if available
        if (typeof updateApiStatus === 'function') {
            updateApiStatus('online');
        }
    } else {
        console.log(`Reconnection attempt ${reconnectAttempts} failed. Will try again in ${reconnectDelay/1000} seconds.`);
        if (reconnectAttempts < maxReconnectAttempts) {
            setTimeout(() => {
                isReconnecting = false;
                attemptReconnect();
            }, reconnectDelay);
        } else {
            isReconnecting = false;
        }
    }
}

// Initialize connection monitoring
function initConnectionMonitor() {
    // Check connection immediately
    checkServerConnection().then(isConnected => {
        if (!isConnected) {
            showConnectionNotification('Server connection failed. Will attempt to reconnect...', true);
            setTimeout(attemptReconnect, reconnectDelay);
        }
    });
    
    // Set up periodic connection checking every 30 seconds
    connectionMonitorInterval = setInterval(() => {
        checkServerConnection().then(isConnected => {
            if (!isConnected && !isReconnecting) {
                setTimeout(attemptReconnect, 1000);
            }
        });
    }, 30000);
    
    // Also set up event listener to detect when connection is lost
    window.addEventListener('online', () => {
        showConnectionNotification('Network connection restored. Checking server connection...');
        checkServerConnection();
    });
    
    window.addEventListener('offline', () => {
        showConnectionNotification('Network connection lost. Please check your internet connection.', true);
        lastConnectionStatus = false;
    });
    
    // Clean up on page unload
    window.addEventListener('beforeunload', () => {
        if (connectionMonitorInterval) {
            clearInterval(connectionMonitorInterval);
        }
    });
}

// Start the connection monitor when the script loads
document.addEventListener('DOMContentLoaded', initConnectionMonitor);
