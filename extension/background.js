const WS_URL = 'ws://127.0.0.1:8765';
let socket = null;
let currentToken = null;
let isConnected = false;

// Initialize connection
function connect() {
    chrome.storage.local.get(['focusToken'], (result) => {
        if (!result.focusToken) {
            console.log('No token found. Waiting for user setup.');
            return;
        }
        currentToken = result.focusToken;

        if (socket) {
            socket.close();
        }

        console.log('Connecting to FocusSense relay...');
        socket = new WebSocket(WS_URL);

        socket.onopen = () => {
            isConnected = true;
            console.log('Connected.');
            // Send auth event
            socket.send(JSON.stringify({
                type: 'AUTH_CLIENT',
                payload: { token: currentToken, role: 'extension' }
            }));

            // Send initial state
            reportCurrentState();
        };

        socket.onclose = () => {
            isConnected = false;
            console.log('Disconnected. Retrying in 5s...');
            setTimeout(connect, 5000);
        };

        socket.onerror = (err) => {
            console.error('WebSocket Error:', err);
            socket.close();
        };
    });
}

// Data collection
function getDomain(url) {
    if (!url) return '';
    try {
        return new URL(url).hostname;
    } catch (e) {
        return '';
    }
}

async function reportCurrentState() {
    if (!isConnected || !socket || socket.readyState !== WebSocket.OPEN) return;

    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const activeTab = tabs[0];

        // Check for any audible tabs (for pseudo-focus detection)
        const audibleTabs = await chrome.tabs.query({ audible: true });
        const isAudible = audibleTabs.length > 0;

        const idleState = await new Promise(resolve => chrome.idle.queryState(60, resolve));

        const payload = {
            domain: activeTab ? getDomain(activeTab.url) : '',
            title: activeTab ? activeTab.title : '',
            url: activeTab ? activeTab.url : '', // Will be filtered locally if needed
            idleState: idleState, // 'active', 'idle', 'locked'
            isAudible: isAudible,
            timestamp: Date.now()
        };

        socket.send(JSON.stringify({
            type: 'ACTIVITY_REPORT',
            payload
        }));
    } catch (err) {
        console.error('Failed to report state:', err);
    }
}

// Event Listeners
chrome.tabs.onActivated.addListener(reportCurrentState);
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.active) {
        reportCurrentState();
    }
});
chrome.windows.onFocusChanged.addListener(reportCurrentState);
chrome.idle.onStateChanged.addListener(reportCurrentState);

// Internal message routing (from popup)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'GET_STATUS') {
        sendResponse({ connected: isConnected });
    } else if (msg.type === 'RECONNECT') {
        connect();
    } else if (msg.type === 'DISCONNECT') {
        if (socket) { socket.onclose = null; socket.close(); socket = null; }
        isConnected = false;
        currentToken = null;
    }
});

// Startup
connect();
