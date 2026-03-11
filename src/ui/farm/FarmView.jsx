import React, { useState, useEffect, useCallback } from 'react';
import { getFarmWorld, saveFarmWorld, subscribeFarmWorld } from '../../engine/farm/worldState.js';
import { WORK_MODES } from '../../themes/themes.js';
import TargetSelectionPanel from './TargetSelectionPanel.jsx';
import FarmProgressIndicator from './FarmProgressIndicator.jsx';
import FarmWorldCanvas from './FarmWorldCanvas.jsx';
import FarmOverlay from './FarmOverlay.jsx';
import SocialPanel from './SocialPanel.jsx';

// ─── Zen Score Component ────────────────────────────────────────────────────────
export function ZenScore({ score, stability }) {
    const getStabilityLabel = (s) => {
        if (s >= 0.8) return 'Harmonious';
        if (s >= 0.5) return 'Calm';
        return 'Restless';
    };

    const getScoreColor = (s) => {
        if (s >= 0.8) return 'var(--positive)';
        if (s >= 0.5) return 'var(--accent)';
        return 'var(--warning)';
    };

    return (
        <div className="zen-score-puck">
            <div className="zen-score-value" style={{ color: getScoreColor(stability) }}>
                {Math.round(score)}
            </div>
            <div className="zen-score-label">{getStabilityLabel(stability)}</div>
        </div>
    );
}

// ─── Farm View ────────────────────────────────────────────────────────────────
export default function FarmView({ sessionState, driftState, sessions, currentWorkMode, onStart, onPause, onResume, onStop, onWorkModeChange }) {
    const [worldState, setWorldState] = useState(getFarmWorld());
    const [showTaskSelector, setShowTaskSelector] = useState(false);
    const isActive = sessionState.status === 'running' || sessionState.status === 'paused';

    useEffect(() => {
        const unsub = subscribeFarmWorld(setWorldState);
        return () => unsub();
    }, []);

    const handleSelectEntity = useCallback((id, type) => {
        const newState = { ...worldState, selectedEntityId: id };
        saveFarmWorld(newState);
    }, [worldState]);

    const handleDeselect = useCallback(() => {
        const newState = { ...worldState, selectedEntityId: null };
        saveFarmWorld(newState);
    }, [worldState]);

    const handleSetTarget = useCallback((targetId) => {
        const newState = { ...worldState, currentTargetId: targetId };
        saveFarmWorld(newState);
    }, [worldState]);

    return (
        <div className="farm-view-container">

            {/* Left Panel: Target Selection (hidden during active focus) */}
            {!isActive && (
                <TargetSelectionPanel
                    worldState={worldState}
                    currentWorkMode={currentWorkMode}
                    onSelectTarget={handleSetTarget}
                />
            )}

            {/* Right/Main Area: The Farm Canvas */}
            <div style={{ position: 'relative', flex: 1, minWidth: 0, minHeight: 0 }}>
                <FarmWorldCanvas
                    worldState={worldState}
                    driftState={driftState}
                    onSelectEntity={handleSelectEntity}
                    sessionStatus={sessionState.status}
                />

                <FarmOverlay
                    sessionState={sessionState}
                    driftState={driftState}
                    worldState={worldState}
                    sessions={sessions}
                    onStart={() => setShowTaskSelector(true)}
                    onPause={onPause}
                    onResume={onResume}
                    onStop={onStop}
                    onDeselect={handleDeselect}
                />

                <SocialPanel worldState={worldState} />

                {/* Floating progress indicator during focus */}
                {isActive && (
                    <>
                        <ZenScore
                            score={driftState.focusScore}
                            stability={driftState.stabilityIndex || 0}
                        />
                        <FarmProgressIndicator
                            worldState={worldState}
                            sessionState={sessionState}
                            driftState={driftState}
                        />
                    </>
                )}

                {/* Pre-Session Task Selector Modal */}
                {showTaskSelector && (
                    <div className="modal-overlay z-index-top">
                        <div className="modal-content" style={{ maxWidth: '400px' }}>
                            <h3 style={{ marginTop: 0 }}>Select Activity</h3>
                            <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>What will you focus on for this session?</p>
                            
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px' }}>
                                {WORK_MODES.map(mode => (
                                    <button
                                        key={mode.id}
                                        className="btn btn-secondary"
                                        style={{ justifyContent: 'flex-start', padding: '12px' }}
                                        onClick={() => {
                                            if (onWorkModeChange) {
                                                onWorkModeChange(mode.id);
                                            }
                                            setShowTaskSelector(false);
                                            onStart(); // Start session after mode is set
                                        }}
                                    >
                                        <span style={{ fontSize: '18px', marginRight: '8px' }}>{mode.icon}</span> 
                                        {mode.name}
                                    </button>
                                ))}
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                                <button className="btn btn-secondary" onClick={() => setShowTaskSelector(false)}>Cancel</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
