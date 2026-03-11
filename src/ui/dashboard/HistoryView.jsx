import React, { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts';
import { analyzeSession } from '../../engine/session/stabilityAnalyzer.js';
import { formatDuration, formatDate, formatTime, getWorkModeIcon, getTimerTypeIcon, MOOD_OPTIONS } from '../../utils/formatters.js';

// ─── Timeline Chart ─────────────────────────────────────────────────────────────
export function FocusTimelineChart({ session }) {
    const timeline = useMemo(() => {
        if (session?.focusTimeline && session.focusTimeline.length > 0) {
            return session.focusTimeline;
        }
        // Fallback for old sessions missing graph data
        if (!session || !session.focusSegments || session.focusSegments.length === 0) return null;

        const reconstructed = [];
        const sessionStart = new Date(session.startTime).getTime();
        const durationSecs = Math.floor((session.totalDurationMs || 0) / 1000);

        // Generate a data point every 60 seconds
        for (let t = 0; t <= durationSecs; t += 60) {
            const absoluteTime = sessionStart + (t * 1000);
            const isFocused = session.focusSegments.some(seg => absoluteTime >= seg.start && absoluteTime <= seg.end);
            reconstructed.push({
                t,
                score: isFocused ? 90 : 25,
                label: isFocused ? 'Focused (Legacy)' : 'Drift (Legacy)'
            });
        }
        return reconstructed;
    }, [session]);

    if (!timeline || timeline.length === 0) return null;

    return (
        <div className="card" style={{ marginBottom: '20px', padding: '16px' }}>
            <div className="card-header" style={{ marginBottom: '16px' }}>
                <span className="card-title">Focus Timeline</span>
            </div>
            <div className="chart-container" style={{ height: '180px', marginTop: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={timeline}>
                        <defs>
                            <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.4} />
                                <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} />
                        <XAxis dataKey="t" tickFormatter={(t) => `${Math.floor(t / 60)}m`} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} minTickGap={20} />
                        <YAxis domain={[0, 100]} ticks={[0, 50, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} width={30} />
                        <Tooltip
                            contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px' }}
                            labelFormatter={(t) => `${Math.floor(t / 60)}m ${t % 60}s`}
                            formatter={(val, name, props) => [`${val} (${props.payload?.label || 'N/A'})`, 'Score']}
                        />
                        <Area type="monotone" dataKey="score" stroke="var(--accent)" strokeWidth={2} fillOpacity={1} fill="url(#colorScore)" name="Focus Score" isAnimationActive={false} />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}

export default function HistoryView({ sessions, onDeleteSessions }) {
    const [selectedSession, setSelectedSession] = React.useState(null);
    const [selectedIds, setSelectedIds] = React.useState([]);
    const [confirmClearAll, setConfirmClearAll] = React.useState(false);
    const sorted = useMemo(() =>
        [...sessions].filter(s => s.endTime).sort((a, b) => new Date(b.startTime) - new Date(a.startTime)),
        [sessions]
    );

    if (selectedSession) {
        const analysis = analyzeSession(selectedSession);
        let stl = 'Low';
        if (analysis.stabilityIndex >= 0.8) stl = 'High';
        else if (analysis.stabilityIndex >= 0.5) stl = 'Medium';

        return (
            <div className="fade-in">
                <div className="page-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => setSelectedSession(null)}>← Back</button>
                        <div>
                            <h2 className="page-title">Session Details</h2>
                            <p className="page-subtitle">
                                {getWorkModeIcon(selectedSession.workMode)} {formatDate(selectedSession.startTime)} · {formatTime(selectedSession.startTime)}
                            </p>
                        </div>
                    </div>
                </div>
                <div className="summary-grid">
                    <div className="summary-item">
                        <div className="summary-item-label">Total Focus Time</div>
                        <div className="summary-item-value">{formatDuration(analysis.activeFocusDurationMs)}</div>
                    </div>
                    <div className="summary-item">
                        <div className="summary-item-label">Interruptions</div>
                        <div className="summary-item-value">{analysis.driftCount}</div>
                    </div>
                    <div className="summary-item">
                        <div className="summary-item-label">Longest Stretch</div>
                        <div className="summary-item-value">{formatDuration(analysis.longestContinuousSegmentMs)}</div>
                    </div>
                    <div className="summary-item">
                        <div className="summary-item-label">Stability Label</div>
                        <div className="summary-item-value" style={{
                            color: stl === 'High' ? 'var(--positive)' : stl === 'Low' ? 'var(--warning)' : 'var(--accent)'
                        }}>
                            {stl}
                        </div>
                    </div>
                </div>

                {selectedSession.mood && (
                    <div className="card" style={{ marginBottom: '20px' }}>
                        <div className="card-title" style={{ marginBottom: '8px' }}>Reflection</div>
                        <div className="session-note-puck">
                            {MOOD_OPTIONS.find(m => m.id === selectedSession.mood)?.icon} {selectedSession.reflection || 'No notes provided.'}
                        </div>
                    </div>
                )}

                <FocusTimelineChart session={selectedSession} />

                <div className="card">
                    <div className="card-title" style={{ marginBottom: '12px' }}>Insights</div>
                    <div className="insights-list">
                        {analysis.insights.map((insight, i) => (
                            <div key={i} className={`insight ${insight.type}`}>
                                <span className="insight-icon">
                                    {insight.type === 'positive' ? '✅' : insight.type === 'observation' ? '👁️' : insight.type === 'neutral' ? '💡' : 'ℹ️'}
                                </span>
                                <span>{insight.text}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fade-in">
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h2 className="page-title">Session History</h2>
                    <p className="page-subtitle">Review your past focus sessions. Click any session for details.</p>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer', marginRight: '16px' }}>
                        <input
                            type="checkbox"
                            checked={sorted.length > 0 && selectedIds.length === sorted.length}
                            onChange={(e) => {
                                if (e.target.checked) {
                                    setSelectedIds(sorted.map(s => s.id));
                                } else {
                                    setSelectedIds([]);
                                }
                            }}
                            style={{ width: '16px', height: '16px', accentColor: 'var(--accent)' }}
                        />
                        Select All
                    </label>
                    {selectedIds.length > 0 && (
                        <button className="btn btn-secondary btn-sm" onClick={() => {
                            onDeleteSessions(selectedIds);
                            setSelectedIds([]);
                        }}>
                            🗑 Delete {selectedIds.length} Selected
                        </button>
                    )}
                    {sorted.length > 0 && selectedIds.length === 0 && (
                        <button className="btn btn-danger btn-sm" onClick={() => {
                            if (confirmClearAll) {
                                onDeleteSessions(sorted.map(s => s.id));
                                setConfirmClearAll(false);
                            } else {
                                setConfirmClearAll(true);
                                setTimeout(() => setConfirmClearAll(false), 3000);
                            }
                        }}>
                            {confirmClearAll ? '⚠️ Confirm Clear All' : '🗑 Clear All'}
                        </button>
                    )}
                </div>
            </div>

            {sorted.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-state-icon">📋</div>
                    <h3>No sessions yet</h3>
                    <p>Complete your first focus session to see it here.</p>
                </div>
            ) : (
                <div className="history-list">
                    {sorted.map(session => {
                        const moodInfo = session.mood ? MOOD_OPTIONS.find(m => m.id === session.mood) : null;
                        const isChecked = selectedIds.includes(session.id);
                        return (
                            <div
                                key={session.id}
                                className={`history-item slide-in ${isChecked ? 'selected-row' : ''}`}
                                onClick={() => setSelectedSession(session)}
                                onKeyDown={(e) => e.key === 'Enter' && setSelectedSession(session)}
                                tabIndex={0}
                                role="button"
                                style={{ display: 'grid', gridTemplateColumns: 'auto auto 1fr auto', alignItems: 'center', gap: '16px' }}
                            >
                                <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(e) => {
                                        e.stopPropagation();
                                        if (isChecked) setSelectedIds(selectedIds.filter(id => id !== session.id));
                                        else setSelectedIds([...selectedIds, session.id]);
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--accent)' }}
                                />
                                <span className="history-item-icon">{getWorkModeIcon(session.workMode)}</span>
                                <div className="history-item-info">
                                    <div className="history-item-date">{formatDate(session.startTime)} · {formatTime(session.startTime)}</div>
                                    <div className="history-item-meta">
                                        {session.driftCount} drift{session.driftCount !== 1 ? 's' : ''} · {getTimerTypeIcon(session.timerType)} Timer
                                        {moodInfo && <span style={{ marginLeft: '8px', opacity: 0.7 }}>· {moodInfo.icon} {moodInfo.label}</span>}
                                    </div>
                                </div>
                                <span className="history-item-duration">{formatDuration(session.totalDurationMs)}</span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
