import React from 'react';
import { FARM_UNLOCKS } from '../../engine/farm/farmConstants.js';

function formatDuration(ms) {
    if (!ms || ms <= 0) return '0s';
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

function getScoreColor(score) {
    if (score >= 80) return 'var(--positive)';
    if (score >= 60) return 'var(--accent)';
    if (score >= 35) return 'var(--warning)';
    return 'var(--negative)';
}

export default function FarmProgressIndicator({ worldState, sessionState, driftState }) {
    const { currentTargetId, growthAccumulatedMs } = worldState;
    const targetItem = FARM_UNLOCKS[currentTargetId];

    if (!targetItem) return null; // No active target

    const requiredMs = targetItem.minutes * 60000;

    // Active session progress
    const isActive = sessionState.status === 'running' || sessionState.status === 'paused';
    const activeFocusMs = isActive ? Math.max(0, sessionState.elapsedMs - (driftState.totalDriftMs || 0)) : 0;

    const totalProgressMs = (growthAccumulatedMs || 0) + activeFocusMs;
    const progressPercent = Math.min(100, (totalProgressMs / requiredMs) * 100);

    // Live quality estimation
    const isDrifting = driftState.isDrifting;
    const driftRatio = isActive && sessionState.elapsedMs > 0 ? (driftState.totalDriftMs || 0) / sessionState.elapsedMs : 0;
    const estQuality = driftRatio <= 0.15 ? 'Healthy' : 'Weak';

    return (
        <div className="farm-progress-indicator card popup-in" style={{ position: 'absolute', bottom: 24, left: 24, width: 320, zIndex: 20, pointerEvents: 'auto', backdropFilter: 'blur(12px)', background: 'var(--glass)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                <div style={{ fontSize: '24px' }}>{targetItem.icon}</div>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Growing Target</div>
                    <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>{targetItem.label}</div>
                </div>
            </div>

            <div style={{ background: 'var(--bg-secondary)', height: '8px', borderRadius: '4px', overflow: 'hidden', marginBottom: '8px' }}>
                <div
                    style={{
                        height: '100%',
                        background: estQuality === 'Healthy' ? 'var(--positive)' : 'var(--warning)',
                        width: `${progressPercent}%`,
                        transition: 'width 1s linear, background-color 0.3s'
                    }}
                />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{formatDuration(totalProgressMs)}</span>
                <span style={{ color: 'var(--text-muted)' }}>of {formatDuration(requiredMs)}</span>
            </div>

            {isActive && (
                <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '8px' }}>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Work Mode</span>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', background: 'var(--bg-card)', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                            {driftState.modeLabel || 'Active'}
                        </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Focus State</span>
                        <span style={{
                            fontSize: '12px',
                            fontWeight: 600,
                            color: '#fff',
                            background: getScoreColor(driftState.focusScore),
                            padding: '2px 8px',
                            borderRadius: '4px',
                            boxShadow: `0 2px 8px ${getScoreColor(driftState.focusScore)}40`
                        }}>
                            {driftState.focusLabel || 'Focused'} ({driftState.focusScore})
                        </span>
                    </div>

                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', textAlign: 'center', marginTop: '4px', fontStyle: 'italic' }}>
                        {driftState.monitoringSource || 'Local activity monitoring'}
                    </div>

                </div>
            )}

        </div>
    );
}
