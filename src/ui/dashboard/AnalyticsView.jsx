import React, { useMemo } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend, Area, AreaChart, CartesianGrid
} from 'recharts';
import { getWeeklyStats, getDeepWorkPredictors } from '../../engine/session/stabilityAnalyzer.js';
import { generateWeeklyVerdict } from '../../engine/ai/verdict.js';
import { formatDuration, COLORS } from '../../utils/formatters.js';
import {
    getGoldenWindows, getFragileWindows, getFocusStreakInfo,
    getEnduranceTrend, getDayOfWeekStats, hasEnoughPredictorData
} from '../../engine/analytics/predictor.js';

// ─── Productivity Heatmap ───────────────────────────────────────────────────────
export function ProductivityHeatmap({ sessions }) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const data = useMemo(() => {
        const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        sessions.filter(s => s.endTime && new Date(s.startTime) >= weekAgo).forEach(s => {
            const start = new Date(s.startTime);
            const day = start.getDay();
            const hour = start.getHours();
            grid[day][hour] += (s.totalDurationMs || 0) / 60000;
        });
        return grid;
    }, [sessions]);

    const maxVal = Math.max(...data.flat(), 1);

    return (
        <div className="card" style={{ padding: '20px', marginBottom: '24px' }}>
            <div className="card-header" style={{ marginBottom: '16px' }}>
                <span className="card-title">Focus Intensity Heatmap</span>
                <span className="card-badge">LAST 7 DAYS</span>
            </div>
            <div className="heatmap-container">
                <div className="heatmap-hours">
                    {['12a', '4a', '8a', '12p', '4p', '8p'].map(h => <span key={h}>{h}</span>)}
                </div>
                <div className="heatmap-grid-scroll">
                    <div className="heatmap-grid">
                        {data.map((dayRow, dIdx) => (
                            <div key={dIdx} className="heatmap-day-row">
                                <span className="heatmap-day-label">{days[dIdx]}</span>
                                <div className="heatmap-cells">
                                    {dayRow.map((val, hIdx) => {
                                        const opacity = val === 0 ? 0.05 : Math.min(1, 0.2 + (val / maxVal) * 0.8);
                                        return (
                                            <div
                                                key={hIdx}
                                                className="heatmap-cell"
                                                style={{ backgroundColor: `hsla(220, 70%, 55%, ${opacity})` }}
                                                title={`${days[dIdx]} ${hIdx}:00 - ${Math.round(val)} min focus`}
                                            />
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Focus Forecast Visualization ─────────────────────────────────────────────
export function FocusForecast({ sessions }) {
    const predictions = useMemo(() => {
        const preds = getDeepWorkPredictors();
        return Array.from({ length: 24 }, (_, i) => {
            const p = preds.find(x => x.hour === i);
            return {
                hour: i,
                score: p ? p.score * 100 : 0,
                label: i > 12 ? `${i - 12}p` : i === 12 ? '12p' : i === 0 ? '12a' : `${i}a`
            };
        });
    }, [sessions]);

    if (predictions.every(p => p.score === 0)) return null;

    return (
        <div className="card" style={{ marginBottom: '24px' }}>
            <div className="card-header">
                <span className="card-title">Deep Work Forecast</span>
                <span className="card-badge">PREDICTIVE</span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                Based on patterns from your last 14 days. Taller bars indicate historically higher focus stability.
            </p>
            <div className="chart-container" style={{ height: '120px' }}>
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={predictions}>
                        <defs>
                            <linearGradient id="forecastGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <Tooltip
                            contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px' }}
                            formatter={(val) => [`${val}% Stability`, 'Forecast']}
                            labelFormatter={(h, items) => `Time: ${items[0]?.payload?.label || 'N/A'}`}
                        />
                        <Area type="monotone" dataKey="score" stroke="var(--accent)" fill="url(#forecastGradient)" strokeWidth={2} isAnimationActive={true} />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}

// ─── Weekly Verdict Card ────────────────────────────────────────────────────────
export function WeeklyVerdictCard({ sessions }) {
    const verdict = useMemo(() => generateWeeklyVerdict(sessions), [sessions]);

    if (!verdict.ready) {
        return (
            <div className="card" style={{ padding: '24px', marginBottom: '24px', background: 'hsla(220, 20%, 50%, 0.05)', border: '1px dashed var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--text-muted)' }}>
                    <span style={{ fontSize: '20px' }}>🧠</span>
                    <span style={{ fontSize: '14px' }}>{verdict.message}</span>
                </div>
            </div>
        );
    }

    return (
        <div className="card verdict-card" style={{ padding: '24px', marginBottom: '24px', background: 'var(--bg-card)', border: '1px solid var(--accent)', boxShadow: '0 8px 32px rgba(var(--accent-rgb), 0.1)' }}>
            <div className="card-header" style={{ marginBottom: '20px' }}>
                <span className="card-title" style={{ color: 'var(--accent)', fontWeight: 800 }}>Weekly Focus Verdict</span>
                <span className="card-badge" style={{ background: 'var(--accent)', color: 'white' }}>AI ADVISOR</span>
            </div>

            <div className="verdict-content" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="verdict-summary" style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {verdict.summary}
                </div>

                <div className="verdict-insights" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {verdict.insights.map((insight, i) => (
                        <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', fontSize: '14px', lineHeight: '1.5', color: 'var(--text-secondary)' }}>
                            <span style={{ color: 'var(--accent)' }}>•</span>
                            <div dangerouslySetInnerHTML={{ __html: insight.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>') }} />
                        </div>
                    ))}
                </div>

                <div className="verdict-adjustment" style={{
                    marginTop: '8px',
                    padding: '16px',
                    background: 'hsla(180, 80%, 45%, 0.08)',
                    borderRadius: '12px',
                    borderLeft: '4px solid var(--accent)'
                }}>
                    <div style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '4px' }}>Recommended Adjustment</div>
                    <div style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: 500 }}>{verdict.adjustment}</div>
                </div>
            </div>
        </div>
    );
}

// ─── Deep Work Advisor ────────────────────────────────────────────────────────
export function DeepWorkAdvisorCard() {
    const data = useMemo(() => {
        if (!hasEnoughPredictorData()) return null;
        return {
            golden: getGoldenWindows({ minConfidence: 'low' }),
            fragile: getFragileWindows(),
            dayStats: getDayOfWeekStats(),
        };
    }, []);

    if (!data || data.golden.length === 0) {
        return (
            <div className="card" style={{ padding: '24px', marginBottom: '24px', background: 'hsla(220, 20%, 50%, 0.05)', border: '1px dashed var(--border)' }}>
                <div className="card-header" style={{ marginBottom: '12px' }}>
                    <span className="card-title">Deep Work Windows</span>
                    <span className="card-badge">PATTERN INTELLIGENCE</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--text-muted)' }}>
                    <span style={{ fontSize: '20px' }}>🔭</span>
                    <span style={{ fontSize: '13px', lineHeight: 1.6 }}>We need at least 5 sessions to detect reliable focus patterns. Keep going — the system is learning.</span>
                </div>
            </div>
        );
    }

    const confidenceColor = { 'high': 'var(--positive)', 'medium': 'var(--accent)', 'low': 'var(--warning)' };

    return (
        <div className="card" style={{ padding: '24px', marginBottom: '24px' }}>
            <div className="card-header" style={{ marginBottom: '16px' }}>
                <span className="card-title">Deep Work Windows</span>
                <span className="card-badge">PATTERN INTELLIGENCE</span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '20px' }}>
                Based on your historical sessions. Confidence ratings reflect signal strength — not guesses.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                {data.golden.slice(0, 3).map((w, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '60px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{w.hourLabel}</div>
                        <div style={{ flex: 1, height: '8px', background: 'var(--bg-surface)', borderRadius: '4px', overflow: 'hidden' }}>
                            <div style={{ width: `${w.score}%`, height: '100%', background: i === 0 ? 'var(--accent)' : 'var(--accent-dim, hsla(215, 70%, 55%, 0.5))', borderRadius: '4px', transition: 'width 0.6s ease' }} />
                        </div>
                        <div style={{ width: '40px', fontSize: '12px', color: 'var(--text-muted)' }}>{w.score}%</div>
                        <div style={{ fontSize: '10px', fontWeight: 700, color: confidenceColor[w.confidence] || 'var(--text-muted)', textTransform: 'uppercase' }}>{w.confidenceLabel}</div>
                    </div>
                ))}
            </div>

            {data.fragile.length > 0 && (
                <div style={{ padding: '12px 16px', background: 'hsla(35, 80%, 50%, 0.06)', borderRadius: '10px', borderLeft: '3px solid var(--warning)' }}>
                    <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--warning)', textTransform: 'uppercase', marginBottom: '8px' }}>High Drift Hours</div>
                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                        {data.fragile.map((f, i) => (
                            <span key={i} style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                                {f.hourLabel} <span style={{ color: 'var(--warning)' }}>({f.avgDrift} avg drifts)</span>
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Focus Streak & Endurance Card ───────────────────────────────────────────
export function FocusStreakCard() {
    const data = useMemo(() => ({
        streak: getFocusStreakInfo(),
        trend: getEnduranceTrend(),
        dayStats: getDayOfWeekStats(),
    }), []);

    const { streak, trend } = data;
    const bestDay = data.dayStats.filter(d => d.confidence.level !== 'none').sort((a, b) => b.avgStability - a.avgStability)[0];

    const trendIcon = trend.trend === 'up' ? '↑' : trend.trend === 'down' ? '↓' : '→';
    const trendColor = trend.trend === 'up' ? 'var(--positive)' : trend.trend === 'down' ? 'var(--negative)' : 'var(--text-muted)';

    if (streak.current === 0 && streak.longest === 0) {
        return (
            <div className="card" style={{ padding: '24px', marginBottom: '24px', background: 'hsla(220, 20%, 50%, 0.05)', border: '1px dashed var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--text-muted)' }}>
                    <span style={{ fontSize: '20px' }}>🔥</span>
                    <span style={{ fontSize: '13px' }}>No streak data yet. Complete sessions on consecutive days to build your first focus streak.</span>
                </div>
            </div>
        );
    }

    return (
        <div className="card" style={{ padding: '24px', marginBottom: '24px' }}>
            <div className="card-header" style={{ marginBottom: '20px' }}>
                <span className="card-title">Focus Streak & Endurance</span>
                <span className="card-badge">BEHAVIORAL TREND</span>
            </div>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '20px' }}>
                <div className="stat-card" style={{ flex: 1, minWidth: '100px' }}>
                    <div className="stat-icon">🔥</div>
                    <div className="stat-value">{streak.current}</div>
                    <div className="stat-label">Current Streak</div>
                </div>
                <div className="stat-card" style={{ flex: 1, minWidth: '100px' }}>
                    <div className="stat-icon">🏆</div>
                    <div className="stat-value">{streak.longest}</div>
                    <div className="stat-label">Longest Streak</div>
                </div>
                <div className="stat-card" style={{ flex: 1, minWidth: '100px' }}>
                    <div className="stat-icon" style={{ color: trendColor, fontSize: '18px' }}>{trendIcon}</div>
                    <div className="stat-value" style={{ color: trendColor }}>
                        {trend.trend === 'insufficient' ? 'N/A' : `${trend.deltaMin}m`}
                    </div>
                    <div className="stat-label">Endurance Trend</div>
                </div>
            </div>

            {trend.trend !== 'insufficient' && (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                    Avg session: <strong style={{ color: 'var(--text-primary)' }}>{trend.avgLastWeekMin}m</strong> this week vs <strong>{trend.avgPrevWeekMin}m</strong> last week.
                </div>
            )}

            {bestDay && (
                <div style={{ padding: '10px 14px', background: 'hsla(170, 70%, 45%, 0.07)', borderRadius: '10px', borderLeft: '3px solid var(--accent)' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        Strongest focus day: <strong style={{ color: 'var(--text-primary)' }}>{bestDay.dayName}</strong> ({bestDay.avgStability}% avg stability)
                    </span>
                </div>
            )}
        </div>
    );
}

export default function AnalyticsView({ sessions }) {
    const stats = useMemo(() => getWeeklyStats(), []);
    const chartColors = ['hsl(220, 70%, 55%)', 'hsl(340, 65%, 55%)', 'hsl(170, 55%, 40%)', 'hsl(35, 80%, 55%)', 'hsl(0, 55%, 55%)', 'hsl(280, 55%, 55%)'];

    const dailyChartData = stats.dailyBreakdown.map(d => ({
        date: new Date(d.date).toLocaleDateString('en-US', { weekday: 'short' }),
        focusMinutes: Math.round(d.totalFocusMs / 60000),
        sessions: d.sessionCount,
        drifts: d.driftCount,
    }));

    return (
        <div className="fade-in">
            <div className="page-header">
                <h2 className="page-title">Weekly Analytics</h2>
                <p className="page-subtitle">Your focus patterns over the last 7 days. All metrics are computed transparently.</p>
            </div>

            <WeeklyVerdictCard sessions={sessions} />
            <DeepWorkAdvisorCard />
            <FocusStreakCard />
            <ProductivityHeatmap sessions={sessions} />
            <FocusForecast sessions={sessions} />

            <div className="stats-row">
                <div className="stat-card">
                    <div className="stat-icon">📅</div>
                    <div className="stat-value">{stats.totalSessions}</div>
                    <div className="stat-label">Total Sessions</div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon">⏱️</div>
                    <div className="stat-value">{formatDuration(stats.totalFocusMs)}</div>
                    <div className="stat-label">Total Focus Time</div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon">📈</div>
                    <div className="stat-value">{formatDuration(stats.averageSessionMs)}</div>
                    <div className="stat-label">Avg Session</div>
                </div>
            </div>
            {stats.totalSessions === 0 ? (
                <div className="empty-state">
                    <div className="empty-state-icon">📊</div>
                    <h3>No data yet</h3>
                    <p>Complete focus sessions to see your weekly analytics.</p>
                </div>
            ) : (
                <>
                    <div className="chart-row">
                        <div className="card">
                            <div className="card-header">
                                <span className="card-title">Daily Focus Time</span>
                                <span className="card-badge">MINUTES</span>
                            </div>
                            <div className="chart-container">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={dailyChartData} barSize={32}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
                                        <XAxis dataKey="date" axisLine={false} tickLine={false} />
                                        <YAxis axisLine={false} tickLine={false} />
                                        <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px' }} />
                                        <Bar dataKey="focusMinutes" fill="var(--accent)" radius={[6, 6, 0, 0]} name="Focus (min)" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                        <div className="card">
                            <div className="card-header">
                                <span className="card-title">Work Mode Distribution</span>
                            </div>
                            <div className="chart-container">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={stats.modeDistribution} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={4} dataKey="value">
                                            {stats.modeDistribution.map((entry, i) => <Cell key={i} fill={chartColors[i % chartColors.length]} />)}
                                        </Pie>
                                        <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px' }} />
                                        <Legend />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                    <div className="card" style={{ marginBottom: '24px' }}>
                        <div className="card-header">
                            <span className="card-title">Drift Frequency Trend</span>
                            <span className="card-badge">DAILY</span>
                        </div>
                        <div className="chart-container">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={dailyChartData}>
                                    <defs>
                                        <linearGradient id="driftGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="var(--warning)" stopOpacity={0.3} />
                                            <stop offset="100%" stopColor="var(--warning)" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
                                    <XAxis dataKey="date" axisLine={false} tickLine={false} />
                                    <YAxis axisLine={false} tickLine={false} />
                                    <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px' }} />
                                    <Area type="monotone" dataKey="drifts" stroke="var(--warning)" fill="url(#driftGradient)" strokeWidth={2} name="Drift Events" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
