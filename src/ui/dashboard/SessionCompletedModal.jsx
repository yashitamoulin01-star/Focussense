import React, { useState, useMemo } from 'react';
import { analyzeSession } from '../../engine/session/stabilityAnalyzer.js';
import { generateCoachReview } from '../../engine/ai/coach.js';
import { generateReflectionQuestions, formatReflectionFeedback } from '../../engine/ai/reflectionLearningEngine.js';
import { formatDuration, formatDate, formatTime, getWorkModeIcon, MOOD_OPTIONS } from '../../utils/formatters.js';
import { FocusTimelineChart } from './HistoryView.jsx';

// ─── Session Completed Modal ────────────────────────────────────────────────────
export default function SessionCompletedModal({ session, onDismiss, onNewSession, onSaveReflection }) {
    const analysis = useMemo(() => analyzeSession(session), [session]);
    const dynamicQuestions = useMemo(() => generateReflectionQuestions(session, analysis.driftEvents || []), [session, analysis]);

    const [mood, setMood] = useState(null);
    const [reflection, setReflection] = useState('');

    // Store answers to dynamic questions
    const [answers, setAnswers] = useState({});

    const handleAnswerChange = (id, value) => setAnswers(prev => ({ ...prev, [id]: value }));

    const handleSave = () => {
        const structuredFeedback = formatReflectionFeedback(answers);
        onSaveReflection(session.id, mood, reflection, structuredFeedback);
    };

    const insightIcons = {
        positive: '✅',
        negative: '❌',
        observation: '👁️',
        neutral: '💡',
        info: 'ℹ️',
    };

    const stabilityLabel = analysis.stabilityLabel;

    return (
        <div className="completed-overlay" onClick={onDismiss}>
            <div className="completed-modal" onClick={e => e.stopPropagation()}>
                <div className="completed-modal-header">
                    <h2>Session Complete</h2>
                    <p>{getWorkModeIcon(session.workMode)} {formatDate(session.startTime)} · {formatTime(session.startTime)}</p>
                </div>

                <div className="summary-grid">
                    <div className="summary-item">
                        <div className="summary-item-label">Status</div>
                        <div className="summary-item-value" style={{
                            color: stabilityLabel === 'High' ? 'var(--positive)' : stabilityLabel === 'Low' || stabilityLabel === 'Too short to judge' ? 'var(--warning)' : 'var(--accent)'
                        }}>
                            {stabilityLabel === 'Too short to judge' ? stabilityLabel : `${stabilityLabel} Stability`}
                        </div>
                    </div>
                    <div className="summary-item">
                        <div className="summary-item-label">Longest Stretch</div>
                        <div className="summary-item-value">{formatDuration(analysis.longestContinuousSegmentMs)}</div>
                    </div>
                    <div className="summary-item">
                        <div className="summary-item-label">Total Focus Time</div>
                        <div className="summary-item-value">{formatDuration(analysis.activeFocusDurationMs)}</div>
                    </div>
                    <div className="summary-item">
                        <div className="summary-item-label">Drift Events</div>
                        <div className="summary-item-value">{analysis.driftCount}</div>
                    </div>
                </div>

                <FocusTimelineChart session={session} />

                <div className="reflection-section">
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px', marginBottom: '20px' }}>
                        {dynamicQuestions.map(q => (
                            <div key={q.id}>
                                <label className="setup-label">{q.label}</label>
                                <select
                                    style={{ width: '100%', marginTop: '4px', padding: '8px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)' }}
                                    value={answers[q.id] || ''}
                                    onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                                >
                                    <option value="" disabled>Select an option...</option>
                                    {q.options.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.text}</option>
                                    ))}
                                </select>
                            </div>
                        ))}
                    </div>

                    <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Notes & Reflections
                    </div>
                    <div className="mood-selector">
                        {MOOD_OPTIONS.map(m => (
                            <button
                                key={m.id}
                                className={`mood-btn ${mood === m.id ? 'selected' : ''}`}
                                onClick={() => setMood(m.id)}
                            >
                                <span className="mood-icon">{m.icon}</span>
                                <span>{m.label}</span>
                            </button>
                        ))}
                    </div>

                    <textarea
                        className="reflection-textarea"
                        placeholder="Any specific takeaways? (Optional)"
                        value={reflection}
                        onChange={(e) => setReflection(e.target.value)}
                    />
                </div>

                <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '16px', marginTop: '24px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    AI Focus Coach
                </div>

                {(() => {
                    const coach = generateCoachReview(session, analysis);
                    return (
                        <div className="coach-section fade-in">
                            <div className="coach-summary">
                                <span style={{ fontSize: '20px' }}>🤖</span>
                                {coach.summary}
                            </div>

                            <div className="coach-highlights" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', margin: '16px 0' }}>
                                {coach.highlights.map((h, i) => (
                                    <div key={i} className="stat-card" style={{ padding: '12px', border: '1px solid var(--border-light)' }}>
                                        <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '4px' }}>{h.title}</div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{h.text}</div>
                                    </div>
                                ))}
                            </div>

                            <div className="coach-advice" style={{ background: 'hsla(180, 80%, 45%, 0.1)', border: '1px solid var(--accent)', padding: '12px', borderRadius: '8px', fontSize: '13px' }}>
                                <strong>Coach Tip:</strong> {coach.advice}
                            </div>
                        </div>
                    );
                })()}

                <div className="completed-actions">
                    <button className="btn btn-secondary" onClick={handleSave}>Save & Close</button>
                    <button className="btn btn-primary" onClick={() => {
                        handleSave();
                        onNewSession();
                    }}>Save & New Session</button>
                </div>
            </div>
        </div>
    );
}
