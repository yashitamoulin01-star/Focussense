import './FarmOverlay.css';
import { generateLiveCoachBite } from '../../engine/ai/coach.js';
import { analyzeSession } from '../../engine/session/stabilityAnalyzer.js';

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

export default function FarmOverlay({ sessionState, driftState, worldState, sessions, onStart, onPause, onResume, onStop, onDeselect }) {
    const { status, elapsedMs } = sessionState;
    const isActive = status === 'running' || status === 'paused';

    // Calculate running "live" focus if a session is active
    const activeFocusMs = isActive ? Math.max(0, elapsedMs - (driftState.totalDriftMs || 0)) : 0;

    // HUD Data
    const totalBankMs = worldState.focusBankMs + activeFocusMs;
    const { selectedEntityId } = worldState;

    let selectionDetails = null;
    if (selectedEntityId) {
        if (selectedEntityId === 'pond' || selectedEntityId === 'pond_locked') {
            const isUnlocked = worldState.unlocks.pond.state === 'unlocked';
            selectionDetails = {
                name: 'Pond', type: 'Structure', description: isUnlocked ? 'A calm place for fish to swim.' : 'Unlocks at 4 hours focus',
                stats: { role: 'Habitat & Water Supply', resilience: 'Persistent', repair: 'None Required', status: isUnlocked ? 'Pristine' : 'In Construction', statusColor: isUnlocked ? 'var(--positive)' : 'var(--warning)' }
            };
        } else if (selectedEntityId === 'house') {
            const isUnlocked = worldState.unlocks.house.state === 'unlocked';
            selectionDetails = {
                name: 'Farm House', type: 'Structure', description: isUnlocked ? 'Home sweet home.' : 'Unlocks at 6 hours focus',
                stats: { role: 'Farm Hub', resilience: 'Persistent', repair: 'None Required', status: isUnlocked ? 'Built' : 'In Construction', statusColor: isUnlocked ? 'var(--accent)' : 'var(--warning)' }
            };
        } else if (worldState.plots.find(p => p.id === selectedEntityId)) {
            const p = worldState.plots.find(p => p.id === selectedEntityId);
            const isDead = p.state === 'dead';
            selectionDetails = {
                name: 'Farm Plot', type: 'Soil', description: p.cropId ? `Growing ${p.cropId}` : 'Empty plot ready for seeds.',
                stats: { role: 'Crop Production', resilience: 'Fragile (Decays in hours)', repair: 'Needs short focus sessions', status: isDead ? 'Withered' : `${p.health || 100}% Healthy`, statusColor: isDead ? 'var(--negative)' : 'var(--positive)' }
            };
        } else if (worldState.animals.find(a => a.id === selectedEntityId)) {
            const a = worldState.animals.find(a => a.id === selectedEntityId);
            selectionDetails = {
                name: 'Animal', type: 'Creature', description: 'A happy farm animal.',
                stats: { role: 'Companionship', resilience: 'Sturdy (Decays in days)', repair: 'Needs interactive play', status: a.mood || 'Content', statusColor: 'var(--positive)' }
            };
        } else if (worldState.family.find(f => f.id === selectedEntityId)) {
            selectionDetails = {
                name: 'Family', type: 'Person', description: 'Enjoying the farm life.',
                stats: { role: 'Community', resilience: 'Robust', repair: 'Needs milestones met', status: 'Joyful', statusColor: 'var(--positive)' }
            };
        } else if (selectedEntityId === 'coach') {
            const lastSession = sessions && sessions.length > 0 ? sessions[sessions.length - 1] : null;
            const analysis = lastSession ? analyzeSession(lastSession) : null;
            const bite = generateLiveCoachBite(lastSession, analysis, isActive);
            selectionDetails = {
                name: 'AI Focus Coach',
                type: 'Intelligence NPC',
                description: bite,
                isCoach: true,
                stats: { role: 'Session Guide', resilience: 'Immutable', repair: 'N/A', status: isActive ? 'Monitoring' : 'Standby', statusColor: 'var(--accent)' }
            };
        }
    }

    return (
        <div className="farm-overlay-container pointer-events-none">

            {/* Top HUD */}
            <div className="farm-hud pointer-events-auto">
                <div className="hud-stat">
                    <span className="hud-icon">💡</span>
                    <div className="hud-val-container">
                        <span className="hud-val">{formatDuration(totalBankMs)}</span>
                        <span className="hud-lbl">Focus Bank</span>
                    </div>
                </div>
                {isActive && (
                    <div className={`hud-stat ${driftState.focusScore < 60 ? 'hud-drifting' : 'hud-active'}`}>
                        <span className="hud-icon">{driftState.focusScore >= 80 ? '🔥' : driftState.focusScore >= 60 ? '⚡' : '⚠️'}</span>
                        <div className="hud-val-container">
                            <span className="hud-val">{driftState.focusScore} <span style={{ fontSize: '10px' }}>/ 100</span></span>
                            <span className="hud-lbl">{driftState.focusLabel}</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Timer Controls (Top Right) */}
            <div className="farm-controls pointer-events-auto">
                {status === 'idle' || status === 'completed' ? (
                    <button className="btn btn-primary btn-sm" onClick={onStart}>▶ Start Focus</button>
                ) : (
                    <>
                        {status === 'running' ? (
                            <button className="btn btn-secondary btn-sm" onClick={onPause}>❚❚ Pause</button>
                        ) : (
                            <button className="btn btn-primary btn-sm" onClick={onResume}>▶ Resume</button>
                        )}
                        <button className="btn btn-danger btn-sm" onClick={onStop}>■ Stop</button>
                    </>
                )}
            </div>

            {/* Selected Entity Bottom Pane */}
            {selectionDetails && (
                <div className="farm-selection-pane pointer-events-auto slide-up">
                    <div className="selection-header">
                        <div>
                            <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--text-primary)' }}>{selectionDetails.name}</h3>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{selectionDetails.type}</span>
                        </div>
                        <button className="btn-icon" onClick={onDeselect}>✕</button>
                    </div>
                    <p style={{
                        marginTop: '12px',
                        marginBottom: selectionDetails.stats ? '16px' : 0,
                        fontSize: selectionDetails.isCoach ? '15px' : '13px',
                        color: selectionDetails.isCoach ? 'var(--accent)' : 'var(--text-secondary)',
                        fontStyle: selectionDetails.isCoach ? 'italic' : 'normal',
                        fontWeight: selectionDetails.isCoach ? 600 : 400,
                        lineHeight: 1.5
                    }}>
                        {selectionDetails.isCoach ? `"${selectionDetails.description}"` : selectionDetails.description}
                    </p>

                    {selectionDetails.stats && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px', background: 'var(--bg-primary)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-muted)' }}>Growth Role</span><span style={{ fontWeight: 500 }}>{selectionDetails.stats.role}</span></div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-muted)' }}>Resilience Type</span><span style={{ fontWeight: 500 }}>{selectionDetails.stats.resilience}</span></div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-muted)' }}>Repair Behavior</span><span style={{ fontWeight: 500 }}>{selectionDetails.stats.repair}</span></div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-muted)' }}>Condition</span><span style={{ fontWeight: 700, color: selectionDetails.stats.statusColor || 'var(--text-primary)' }}>{selectionDetails.stats.status}</span></div>
                        </div>
                    )}
                </div>
            )}

        </div>
    );
}
