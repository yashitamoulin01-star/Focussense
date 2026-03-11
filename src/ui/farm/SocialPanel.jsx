import React, { useState } from 'react';

export default function SocialPanel({ worldState }) {
    const [isOpen, setIsOpen] = useState(false);

    const bankHours = worldState ? Math.floor(worldState.focusBankMs / (1000 * 60 * 60)) : 0;
    const seedCount = worldState ? (worldState.focusSeeds || 0) : 0;

    // Mock community data (to be replaced with real relay data later)
    const communityStats = {
        totalFocusHours: 12482,
        activeStrivers: 342,
        topMode: 'Deep Coding',
    };

    const focusSpirits = [
        { id: 1, name: 'Striver_42', status: 'Focused', mode: 'Reading' },
        { id: 2, name: 'FlowState9', status: 'Focused', mode: 'Coding' },
        { id: 3, name: 'ZenMaster', status: 'Paused', mode: 'Study' },
    ];

    if (!isOpen) {
        return (
            <button
                className="social-toggle-btn"
                onClick={() => setIsOpen(true)}
                style={{
                    position: 'absolute',
                    right: '24px',
                    top: '170px',
                    zIndex: 100,
                    background: 'hsla(180, 80%, 45%, 0.8)',
                    backdropFilter: 'blur(4px)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '20px',
                    padding: '8px 16px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                }}
            >
                <span style={{ fontSize: '14px' }}>👥</span>
                Community Grove
            </button>
        );
    }

    return (
        <div className="social-panel fade-in" style={{
            position: 'absolute',
            right: '24px',
            top: '170px',
            bottom: '24px',
            width: '280px',
            zIndex: 100,
            background: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            pointerEvents: 'auto'
        }}>
            <div className="panel-header" style={{
                padding: '16px',
                background: 'var(--bg-secondary)',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <h3 style={{ margin: 0, fontSize: '14px', color: 'var(--text-primary)' }}>Community Grove</h3>
                <button
                    onClick={() => setIsOpen(false)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '18px' }}
                >✕</button>
            </div>

            <div className="panel-scroll" style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
                <div className="stat-card" style={{ padding: '12px', marginBottom: '12px', background: 'hsla(180, 80%, 45%, 0.05)', border: '1px solid hsla(180, 80%, 45%, 0.2)' }}>
                    <div style={{ fontSize: '10px', color: 'var(--accent)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '8px' }}>Community Growth</div>
                    <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)' }}>{communityStats.totalFocusHours.toLocaleString()}h</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Focused by all Strivers</div>
                </div>

                <div className="stat-card" style={{ padding: '12px', marginBottom: '20px', background: 'hsla(30, 80%, 45%, 0.05)', border: '1px solid hsla(30, 80%, 45%, 0.2)' }}>
                    <div style={{ fontSize: '10px', color: 'var(--warning)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '8px' }}>Your Contribution</div>
                    <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)' }}>{bankHours}h</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Total Focus Bank</div>
                </div>

                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '12px' }}>Focus Spirits</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {focusSpirits.map(s => (
                        <div key={s.id} style={{
                            padding: '10px',
                            background: 'var(--bg-secondary)',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px'
                        }}>
                            <div style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                background: s.status === 'Focused' ? 'var(--positive)' : 'var(--warning)'
                            }} />
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{s.name}</div>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{s.mode}</div>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="gift-section" style={{ marginTop: '24px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '12px' }}>Your Focus Seeds</div>
                    <div style={{
                        background: 'var(--bg-primary)',
                        padding: '16px',
                        borderRadius: '8px',
                        border: '1px ' + (seedCount > 0 ? 'solid' : 'dashed') + ' var(--accent)',
                        textAlign: 'center'
                    }}>
                        <span style={{ fontSize: '32px' }}>{seedCount > 0 ? '🌱' : '🌑'}</span>
                        <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '8px' }}>
                            {seedCount} {seedCount === 1 ? 'Seed' : 'Seeds'}
                        </div>
                        <div style={{ fontSize: '11px', marginTop: '4px', color: 'var(--text-secondary)' }}>
                            {seedCount > 0
                                ? 'You can gift these to friends in the next update!'
                                : 'Complete a Deep Focus session to earn seeds!'}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
