import React, { useState } from 'react';
import { FARM_UNLOCKS } from '../../engine/farm/farmConstants.js';
import './TargetSelectionPanel.css';

export default function TargetSelectionPanel({ worldState, currentWorkMode, onSelectTarget }) {
    const { unlocks, currentTargetId } = worldState;

    // Binding Task Agency Mappings
    const activeBindings = {
        'coding': 'house',
        'reading': 'pond',
        'assignment': 'grassPatch',
        'working': 'bush',
        'gaming': 'oak_tree',
        'custom': 'pine_tree'
    };
    const recommendedId = activeBindings[currentWorkMode] || 'grassPatch';

    const [previewId, setPreviewId] = useState(currentTargetId || recommendedId);

    const previewItem = FARM_UNLOCKS[previewId];
    const isUnlocked = unlocks[previewId]?.state === 'unlocked' && previewItem.isFragile === false;
    // Note: Fragile items (grass/crops) can be grown multiple times even if "unlocked" previously.
    // Persistent items (house/pond) are one-and-done unlocks.

    const canGrow = !previewItem.requiresHouse || unlocks['house']?.state === 'unlocked';

    return (
        <div className="target-selection-panel slide-in">
            <h2 className="panel-title">Choose Your Target</h2>
            <p className="panel-subtitle">Select what you want to grow during your next focus session.</p>

            <div className="target-grid">
                {Object.entries(FARM_UNLOCKS).map(([id, item]) => {
                    const unlocked = unlocks[id]?.state === 'unlocked';
                    const active = id === currentTargetId;
                    const previewing = id === previewId;
                    const isRecommended = id === recommendedId;

                    return (
                        <div
                            key={id}
                            className={`target-card ${active ? 'active target-pulse' : ''} ${previewing ? 'preview' : ''}`}
                            onClick={() => setPreviewId(id)}
                            style={isRecommended ? { border: '1px solid var(--accent)' } : {}}
                        >
                            <span className="target-icon">{item.icon}</span>
                            <span className="target-label">{item.label}</span>
                            {unlocked && item.isFragile === false && <span className="target-badge">Owned</span>}
                            {active && <span className="target-badge-active">Current Target</span>}
                            {isRecommended && !active && <span className="target-badge" style={{ background: 'var(--accent-glow)', color: 'var(--accent)' }}>Recommended</span>}
                        </div>
                    );
                })}
            </div>

            <div className="target-details card">
                <div className="details-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span className="details-icon">{previewItem.icon}</span>
                        <div>
                            <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>{previewItem.label}</h3>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                {previewItem.isFragile ? 'Fragile (Requires Upkeep)' : 'Persistent Structure'}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="details-stats">
                    <div className="stat-row">
                        <span>Required Focus</span>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                            {previewItem.minutes} minutes
                        </span>
                    </div>
                    <div className="stat-row">
                        <span>Healthy Lifespan</span>
                        <span style={{ color: 'var(--positive)' }}>{previewItem.healthyLifeDays} days</span>
                    </div>
                    <div className="stat-row">
                        <span>Weak Lifespan</span>
                        <span style={{ color: 'var(--warning)' }}>{previewItem.weakLifeDays} days</span>
                    </div>
                    {previewItem.requiresHouse && (
                        <div className="stat-row">
                            <span>Requirement</span>
                            <span style={{ color: unlocks['house']?.state === 'unlocked' ? 'var(--positive)' : 'var(--negative)' }}>
                                Farm House
                            </span>
                        </div>
                    )}
                </div>

                <button
                    className="btn btn-primary"
                    style={{ width: '100%', marginTop: '16px', padding: '12px', fontSize: '15px' }}
                    disabled={!canGrow || isUnlocked || currentTargetId === previewId}
                    onClick={() => onSelectTarget(previewId)}
                >
                    {currentTargetId === previewId ? 'Currently Growing' :
                        isUnlocked ? 'Already Owned' :
                            !canGrow ? 'Requires Farm House First' :
                                'Set as Grow Target'}
                </button>
            </div>
        </div>
    );
}
