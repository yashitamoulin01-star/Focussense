import relayConfig from './relayConfig.json';

/**
 * FocusSense Relay Client
 * Robust One-Click Pairing with challenge-response handshake.
 */
class RelayClient {
    constructor() {
        this.VERSION = "1.1.0";
        this.ws = null;
        this.subscribers = new Set();
        this.statusSubscribers = new Set();
        
        // Status Enum: idle, detecting, handshaking, connected, agent_unavailable, handshake_failed, timeout, version_mismatch
        this.status = 'idle';
        this.reconnectTimeout = null;
        this.handshakeTimeout = null;
        this.currentNonce = null;
    }

    setStatus(newStatus) {
        if (this.status !== newStatus) {
            this.status = newStatus;
            console.log(`[Relay] Status: ${newStatus}`);
            this._notifyStatus();
        }
    }

    connect() {
        // Prevent double-initiation if already searching or handshaking
        if (this.status === 'detecting' || this.status === 'handshaking') {
            return;
        }

        if (this.ws) {
            this.ws.onclose = null;
            this.ws.onerror = null;
            this.ws.close();
        }

        this.setStatus('detecting');
        
        try {
            this.ws = new WebSocket('ws://127.0.0.1:8765');
            this.currentNonce = Math.random().toString(36).substring(7);

            // Timeout for initial detection
            const detectTimeout = setTimeout(() => {
                if (this.status === 'detecting') {
                    this.setStatus('agent_unavailable');
                    if (this.ws) this.ws.close();
                }
            }, 5000);

            this.ws.onopen = () => {
                clearTimeout(detectTimeout);
                this.setStatus('handshaking');
                
                this.send({
                    type: 'HELLO',
                    payload: { nonce: this.currentNonce }
                });

                if (this.handshakeTimeout) clearTimeout(this.handshakeTimeout);
                this.handshakeTimeout = setTimeout(() => {
                    if (this.status === 'handshaking') {
                        this.setStatus('timeout');
                        if (this.ws) this.ws.close();
                    }
                }, 3000);
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (this.status === 'handshaking' && data.type === 'HELLO_ACK') {
                        this._handleHandshake(data.payload);
                        return;
                    }
                    this._notifyData(data);
                } catch (e) {
                    console.error('[Relay] Error parsing message:', e);
                }
            };

            this.ws.onerror = (err) => {
                clearTimeout(detectTimeout);
                if (this.handshakeTimeout) clearTimeout(this.handshakeTimeout);
                if (this.status === 'detecting' || this.status === 'handshaking') {
                    this.setStatus('agent_unavailable');
                }
            };

            this.ws.onclose = () => {
                clearTimeout(detectTimeout);
                if (this.handshakeTimeout) clearTimeout(this.handshakeTimeout);
                
                const wasConnected = this.status === 'connected';
                if (this.status !== 'version_mismatch' && this.status !== 'handshake_failed' && this.status !== 'timeout') {
                    if (wasConnected) {
                        this.setStatus('detecting'); 
                    } else {
                        this.setStatus('agent_unavailable');
                    }
                }
                
                if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
                this.reconnectTimeout = setTimeout(() => this.connect(), 5000);
            };

        } catch (e) {
            this.setStatus('agent_unavailable');
        }
    }

    _handleHandshake(payload) {
        if (this.handshakeTimeout) clearTimeout(this.handshakeTimeout);
        
        const { nonce, version } = payload;

        if (nonce !== this.currentNonce) {
            this.setStatus('handshake_failed');
            if (this.ws) this.ws.close();
            return;
        }

        if (!this._isVersionCompatible(version)) {
            this.setStatus('version_mismatch');
            if (this.ws) this.ws.close();
            return;
        }

        this.send({
            type: 'AUTH_CLIENT',
            payload: { 
                token: relayConfig.token, 
                role: 'app'
            }
        });

        this.setStatus('connected');
    }

    _isVersionCompatible(agentVersion) {
        if (!agentVersion) return false;
        
        const parse = v => v.split('.').map(x => parseInt(x) || 0);
        const [aMajor, aMinor] = parse(agentVersion);
        const [cMajor, cMinor] = parse(this.VERSION);

        if (aMajor !== cMajor) return false;
        return true;
    }

    send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }

    subscribe(fn) {
        this.subscribers.add(fn);
        return () => this.subscribers.delete(fn);
    }

    subscribeStatus(fn) {
        this.statusSubscribers.add(fn);
        fn(this.status);
        return () => this.statusSubscribers.delete(fn);
    }

    _notifyData(data) {
        this.subscribers.forEach(fn => fn(data));
    }

    _notifyStatus() {
        this.statusSubscribers.forEach(fn => fn(this.status));
    }

    disconnect() {
        if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
        if (this.ws) {
            this.ws.onclose = null; // prevent auto-reconnect
            this.ws.close();
        }
        this.setStatus('idle');
    }
}

export const relayClient = new RelayClient();
