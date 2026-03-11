// ── The hardcoded token is the SAME token in relayConfig.json ──────────────
// When the user clicks "Connect", this is automatically used. No copy-paste needed.
const HARDCODED_TOKEN = '5eb8b02cac60552640a9d33021e11288';

const dot          = document.getElementById('dot');
const statusLabel  = document.getElementById('statusLabel');
const statusSub    = document.getElementById('statusSub');
const connectBtn   = document.getElementById('connectBtn');
const disconnectBtn= document.getElementById('disconnectBtn');
const liveSite     = document.getElementById('liveSite');
const siteDomain   = document.getElementById('siteDomain');
const focusBadge   = document.getElementById('focusBadge');

// Distracting sites list (same as agent)
const DISTRACTING_SITES = ['youtube.com','netflix.com','facebook.com','twitter.com',
    'x.com','reddit.com','twitch.tv','instagram.com','tiktok.com'];

function setConnected() {
    dot.className = 'dot connected';
    statusLabel.textContent = 'Connected ✓';
    statusSub.textContent   = 'Tracking your focus activity';
    connectBtn.style.display = 'none';
    disconnectBtn.style.display = 'block';
    liveSite.style.display = 'flex';
}

function setConnecting() {
    dot.className = 'dot connecting';
    statusLabel.textContent = 'Connecting…';
    statusSub.textContent   = 'Make sure FocusSense is open';
    connectBtn.disabled = true;
    connectBtn.textContent = 'Connecting…';
}

function setDisconnected(reason) {
    dot.className = 'dot disconnected';
    statusLabel.textContent = 'Not Connected';
    statusSub.textContent   = reason || 'FocusSense app not detected';
    connectBtn.style.display = 'block';
    connectBtn.disabled = false;
    connectBtn.textContent = '⚡ Connect to FocusSense';
    disconnectBtn.style.display = 'none';
    liveSite.style.display = 'none';
}

// ── On load: check if already connected ────────────────────────────────────
chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
    if (chrome.runtime.lastError) {
        setDisconnected('Extension error. Try reloading.');
        return;
    }
    if (response && response.connected) {
        setConnected();
        updateLiveSite();
    } else {
        setDisconnected();
    }
});

// Poll current domain if connected
function updateLiveSite() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs || !tabs[0]) return;
        const url = tabs[0].url || '';
        try {
            const hostname = new URL(url).hostname.replace('www.', '');
            siteDomain.textContent = hostname || url;

            const isDistracting = DISTRACTING_SITES.some(s => hostname.includes(s));
            focusBadge.textContent = isDistracting ? 'Drifting' : 'Focused';
            focusBadge.className   = 'focus-badge ' + (isDistracting ? 'distracted' : 'focused');
        } catch (e) {
            siteDomain.textContent = 'Unknown';
        }
    });
}

// ── Connect button ─────────────────────────────────────────────────────────
connectBtn.addEventListener('click', () => {
    setConnecting();
    // Save the token and trigger reconnect
    chrome.storage.local.set({ focusToken: HARDCODED_TOKEN }, () => {
        chrome.runtime.sendMessage({ type: 'RECONNECT' }, () => {
            // Give it 1.5s then check status
            setTimeout(() => {
                chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (res) => {
                    if (res && res.connected) {
                        setConnected();
                        updateLiveSite();
                    } else {
                        setDisconnected('App not running. Start FocusSense first.');
                    }
                });
            }, 1500);
        });
    });
});

// ── Disconnect ──────────────────────────────────────────────────────────────
disconnectBtn.addEventListener('click', () => {
    chrome.storage.local.remove(['focusToken'], () => {
        chrome.runtime.sendMessage({ type: 'DISCONNECT' });
        setDisconnected('Disconnected by user.');
    });
});

// Poll status every 2s to stay in sync
setInterval(() => {
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (res) => {
        if (chrome.runtime.lastError) return;
        if (res && res.connected) {
            setConnected();
            updateLiveSite();
        }
        // Don't auto-reset to disconnected here (avoids flickering)
    });
}, 2000);
