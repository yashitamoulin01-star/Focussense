import React, { Suspense, lazy, useState, useEffect, useMemo, useCallback } from 'react';

import './App.css';

// ─── Utility Functions ────────────────────────────────────────────────────────

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

import { createSessionManager } from './engine/session/sessionManager.js';
import { createDriftDetector } from './engine/session/driftDetector.js';
import { analyzeSession, getWeeklyStats, getDeepWorkPredictors } from './engine/session/stabilityAnalyzer.js';
import { getFarmWorld, saveFarmWorld, subscribeFarmWorld } from './engine/farm/worldState.js';
import { evaluateSession, applyPatch } from './engine/farm/unlockEvaluator.js';
import { getModeProfile } from './engine/modeProfiles.js';
import { getAllSessions, getSettings, saveSettings, deleteSessions, saveSession } from './data/db.js';

// AI Intelligence Layer
import { planSession } from './engine/ai/planner.js';
import { generateCoachReview } from './engine/ai/coach.js';
import { ingestSessionOutcome } from './engine/ai/plannerMemory.js';
import { getRecoveryAction } from './engine/ai/recovery.js';

// Analytics & Portability Layer (Phases 8-10)
import {
  generateGardenSnapshot, serializeGardenSnapshot, generateGardenCaption,
  PRIVACY_MODES, SNAPSHOT_RANGES
} from './engine/analytics/gardenSnapshot.js';
import { exportGardenCardAsPNG } from './engine/analytics/gardenCardExporter.js';
import {
  exportAsJSON, exportAsCSV, validateImportFile, migrateImportData,
  mergeImportedData, estimateImportImpact, getDataSummary
} from './engine/persistence/portability.js';

import relayConfig from './engine/session/relayConfig.json';
import TargetSelectionPanel from './ui/farm/TargetSelectionPanel.jsx';
import FarmProgressIndicator from './ui/farm/FarmProgressIndicator.jsx';
import FarmWorldCanvas from './ui/farm/FarmWorldCanvas.jsx';
import FarmOverlay from './ui/farm/FarmOverlay.jsx';
import { themes, WORK_MODES, TIMER_TYPES, applyTheme } from './themes/themes.js';
const FarmView = lazy(() => import('./ui/farm/FarmView.jsx'));
const HistoryView = lazy(() => import('./ui/dashboard/HistoryView.jsx'));
const AnalyticsView = lazy(() => import('./ui/dashboard/AnalyticsView.jsx'));
const SessionCompletedModal = lazy(() => import('./ui/dashboard/SessionCompletedModal.jsx'));


// Singleton instances
const sessionManager = createSessionManager();
const driftDetector = createDriftDetector();


const MOOD_OPTIONS = [
  { id: 'flow', label: 'Flow', icon: '🔥' },
  { id: 'neutral', label: 'Neutral', icon: '⚖️' },
  { id: 'tiring', label: 'Tiring', icon: '😫' },
  { id: 'distracted', label: 'Distracted', icon: '📱' },
];






// ─── App ────────────────────────────────────────────────────────────────────────
export default function App() {
  const [currentView, setCurrentView] = useState('dashboard'); // dashboard | history | analytics | garden
  const [currentTheme, setCurrentTheme] = useState('deep');
  const [currentWorkMode, setCurrentWorkMode] = useState('coding');
  const [currentTimerType, setCurrentTimerType] = useState('standard');
  const [targetDurationMin, setTargetDurationMin] = useState(25);
  const [showExtensionPairing, setShowExtensionPairing] = useState(false);

  const [sessionState, setSessionState] = useState(sessionManager.getSnapshot());
  const [driftState, setDriftState] = useState(driftDetector.getSnapshot());
  const [completedSession, setCompletedSession] = useState(null);
  const [sessions, setSessions] = useState([]);

  // AI Planner State
  const [showAiPlanner, setShowAiPlanner] = useState(false);
  const [aiInput, setAiInput] = useState({
    task: '',
    difficulty: 'medium',
    goalType: 'study',
    urgency: 'normal',
    materialSize: 1,
    materialUnit: 'pages',
    timeAvailableValue: 60,
    timeAvailableUnit: 'minutes'
  });
  const [activeAiPlan, setActiveAiPlan] = useState(null);

  // Recovery Agent State
  const [recoveryAction, setRecoveryAction] = useState(null);

  // Phase 8: Share Garden state
  const [showShareGarden, setShowShareGarden] = useState(false);

  // Phase 10: Import preview state
  const [importPreview, setImportPreview] = useState(null);

  // Load settings
  useEffect(() => {
    const settings = getSettings();

    // Migrate old theme if it was saved (e.g., 'lightPlay')
    const savedTheme = settings.theme;
    const safeTheme = (savedTheme && themes[savedTheme]) ? savedTheme : 'deep';

    if (savedTheme && !themes[savedTheme]) {
      saveSettings({ ...settings, theme: safeTheme });
    }

    setCurrentTheme(safeTheme);
    applyTheme(safeTheme);
    setSessions(getAllSessions());

    // Attempt to hydrate active session
    const wasHydrated = sessionManager.hydrateSession();
    if (wasHydrated) {
      const snap = sessionManager.getSnapshot();
      if (snap.session?.timerType === 'garden') {
        setCurrentView('farm');
      } else {
        setCurrentView('dashboard');
      }
      // Also update local state immediately
      setSessionState(snap);
    }
  }, []);

  // Subscribe to session and drift updates
  useEffect(() => {
    const unsub1 = sessionManager.subscribe(setSessionState);
    const unsub2 = driftDetector.subscribe(setDriftState);
    return () => { unsub1(); unsub2(); };
  }, []);

  // Record focus timeline ticks + Check for Recovery Actions
  useEffect(() => {
    // driftDetector emits a new snapshot object every 5s tick
    sessionManager.recordFocusTick(driftState.focusScore, driftState.focusLabel);

    // AI Recovery Check
    if (sessionState.status === 'running') {
      const action = getRecoveryAction(driftState, {
        modeId: currentWorkMode,
        elapsedMs: sessionState.elapsedMs,
        targetDurationMs: sessionState.targetDurationMs
      });

      if (action && (!recoveryAction || recoveryAction.message !== action.message)) {
        setRecoveryAction(action);
      } else if (!action && recoveryAction) {
        // Auto-clear if instability is resolved (optional, or wait for user)
      }
    }
  }, [driftState]);

  const handleStopSession = useCallback(() => {
    const driftEvents = driftDetector.stopTracking();
    const session = sessionManager.stopSession(driftEvents);
    if (session) {
      // Calculate Average Focus Score for growth modulation
      const scores = session.focusTimeline.map(t => t.score);
      const avg = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
      session.focusScoreAvg = Math.round(avg);

      // 3. Update Farm World state tracking (Unlock Evaluator patch logic)
      const patch = evaluateSession(session, getFarmWorld());
      const updatedWorld = applyPatch(getFarmWorld(), patch);
      saveFarmWorld(updatedWorld);

      // 4. Update Weekly UI Stats
      setCompletedSession(session);
      setSessions(getAllSessions());
    }
  }, []);

  // Auto-stop countdown timer with chime
  useEffect(() => {
    if (sessionState.isCompletedCountdown && sessionState.status === 'running') {
      try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.5);
        gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 0.1);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 1.5);
        osc.start(audioCtx.currentTime);
        osc.stop(audioCtx.currentTime + 1.5);
      } catch (e) {
        // Audio context might be blocked if no user interaction, gracefully ignore
      }

      handleStopSession();
    }
  }, [sessionState.isCompletedCountdown, sessionState.status, handleStopSession]);

  const handleThemeChange = useCallback((themeId) => {
    setCurrentTheme(themeId);
    applyTheme(themeId);
    saveSettings({ ...getSettings(), theme: themeId });
  }, []);

  const handleStartSession = useCallback(() => {
    const profile = getModeProfile(currentWorkMode);

    const targetMs = currentTimerType === 'standard' ? targetDurationMin * 60000 : null;
    sessionManager.startSession(currentWorkMode, currentTimerType, targetMs);
    driftDetector.startTracking(currentWorkMode, profile);
    setCompletedSession(null);
  }, [currentWorkMode, currentTimerType, targetDurationMin]);

  const handlePauseSession = useCallback(() => {
    sessionManager.pauseSession();
    driftDetector.pauseTracking();
  }, []);

  const handleResumeSession = useCallback(() => {
    sessionManager.resumeSession();
    driftDetector.resumeTracking();
  }, []);

  const handleAiPlan = useCallback(() => {
    const plan = planSession(aiInput);
    setActiveAiPlan(plan);
    // Don't auto-apply yet, show it to user first
  }, [aiInput]);

  const applyAiPlan = useCallback(() => {
    if (!activeAiPlan) return;
    setCurrentWorkMode(activeAiPlan.suggestedMode);
    setTargetDurationMin(activeAiPlan.duration);
    // We can also toast or notify about the strategy/audio
    setActiveAiPlan(null);
    setShowAiPlanner(false);
  }, [activeAiPlan]);

  const handleSaveReflection = useCallback((sessionId, mood, reflection, structuredFeedback = {}) => {
    const all = getAllSessions();
    const idx = all.findIndex(s => s.id === sessionId);
    if (idx >= 0) {
      all[idx].mood = mood;
      all[idx].reflection = reflection;
      all[idx].postSessionFeedback = structuredFeedback;

      saveSession(all[idx]);
      setSessions(getAllSessions());

      // Learn from outcome using actual planner memory
      ingestSessionOutcome(all[idx], structuredFeedback);
    }
    setCompletedSession(null);
    sessionManager.resetSession();
    driftDetector.reset();
  }, []);

  const handleDeleteSessions = useCallback((ids) => {
    deleteSessions(ids);
    setSessions(getAllSessions());
  }, []);

  const handleExportData = useCallback((format = 'json') => {
    if (format === 'csv') {
      const csv = exportAsCSV();
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `focussense_analysis_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } else {
      const json = exportAsJSON();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `focussense_backup_${new Date().toISOString().split('T')[0]}.json`;
      link.click();
      URL.revokeObjectURL(url);
    }
  }, []);

  const handleImportData = useCallback((e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const { valid, errors, warnings, data, schemaVersion } = validateImportFile(event.target.result);
      if (!valid) {
        alert(`Import failed:\n${errors.join('\n')}`);
        return;
      }
      const migrated = migrateImportData(data, schemaVersion);
      const impact = estimateImportImpact(migrated);
      setImportPreview({ data: migrated, impact, warnings });
    };
    reader.readAsText(file);
    // Reset file input
    e.target.value = '';
  }, []);

  const handleConfirmImport = useCallback((strategy) => {
    if (!importPreview) return;
    const result = mergeImportedData(importPreview.data, strategy);
    if (result.success) {
      setSessions(getAllSessions());
      setImportPreview(null);
      alert(result.message);
    } else {
      alert(`Import failed: ${result.message}`);
    }
  }, [importPreview]);

  const handleDismissSummary = useCallback(() => {
    setCompletedSession(null);
    sessionManager.resetSession();
    driftDetector.reset(); // Crucial to prevent old interval from running again
  }, []);

  const handleNewSession = useCallback(() => {
    setCompletedSession(null);
    sessionManager.resetSession();
    driftDetector.reset();
  }, []);

  return (
    <div className={`app-shell ${currentView === 'farm' ? 'farm-route-active' : ''}`}>
      <Sidebar
        currentView={currentView}
        onViewChange={setCurrentView}
        onPairingClick={() => setShowExtensionPairing(true)}
        driftState={driftState}
      />
      <main className="main-content">
        {/* Session Setup Bar — shown on Dashboard only; Farm has its own overlay controls */}
        {currentView === 'farm' ? (
          <Suspense fallback={<div className="loading-spinner">Loading Farm...</div>}><FarmView
            sessionState={sessionState}
            driftState={driftState}
            sessions={sessions}
            currentWorkMode={currentWorkMode}
            onStart={handleStartSession}
            onPause={handlePauseSession}
            onResume={handleResumeSession}
            onStop={handleStopSession}
            onWorkModeChange={setCurrentWorkMode}
          /></Suspense>
        ) : (
          <div className="content-scroll">
            {currentView === 'dashboard' && (
              <>
                {sessionState.status === 'idle' && (
                  <div className="setup-bar slide-in" style={{
                    flexDirection: 'column',
                    alignItems: 'stretch',
                    gap: '24px',
                    marginBottom: '24px',
                    background: 'var(--bg-secondary)',
                    padding: '24px',
                    borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--border)'
                  }}>

                    {/* AI Planner Toggle */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-light)', paddingBottom: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ fontSize: '24px' }}>🤖</div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '15px' }}>Smart Session Planner</div>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Let AI agent configure your next focus sprint.</div>
                        </div>
                      </div>
                      <button
                        className={`btn ${showAiPlanner ? 'btn-secondary' : 'btn-primary'}`}
                        onClick={() => setShowAiPlanner(!showAiPlanner)}
                        style={{ borderRadius: '20px', padding: '6px 16px', fontSize: '13px' }}
                      >
                        {showAiPlanner ? '✕ Close Planner' : (activeAiPlan ? '⚡ View AI Plan' : '⚡ Plan with AI')}
                      </button>
                    </div>

                    {showAiPlanner && (
                      <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        {activeAiPlan ? (
                          /* AI Recommendation Card */
                          <div style={{
                            background: 'var(--bg-primary)',
                            padding: '24px',
                            borderRadius: '12px',
                            border: `1px solid ${activeAiPlan.plannerMode === 'exam_rescue' ? '#ef4444' : activeAiPlan.plannerMode === 'mega_load' ? '#f59e0b' : 'var(--accent)'}`,
                            boxShadow: '0 8px 32px rgba(var(--accent-rgb), 0.15)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '16px',
                            position: 'relative'
                          }}>
                            <button
                              onClick={() => setActiveAiPlan(null)}
                              title="Back to Inputs"
                              style={{ position: 'absolute', top: '12px', right: '12px', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '18px' }}
                            >✕</button>

                            {/* Header */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingRight: '32px' }}>
                              <span style={{ fontSize: '20px' }}>
                                {activeAiPlan.plannerMode === 'exam_rescue' ? '🚨' : activeAiPlan.plannerMode === 'mega_load' ? '📚' : '🤖'}
                              </span>
                              <div>
                                <div style={{ fontWeight: 700, color: 'var(--accent)', fontSize: '13px', textTransform: 'uppercase' }}>
                                  {activeAiPlan.plannerMode === 'exam_rescue' ? 'Exam Rescue Mode' :
                                   activeAiPlan.plannerMode === 'mega_load' ? 'Mega Load Mode' :
                                   activeAiPlan.plannerMode === 'revision_sprint' ? 'Revision Sprint' :
                                   activeAiPlan.plannerMode === 'deep_work' ? 'Deep Work Mode' :
                                   'Recommended Next Block'}
                                </div>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                  {activeAiPlan.basisText || 'Recommended based on workload and urgency analysis.'}
                                </div>
                              </div>
                            </div>

                            {/* Warning Banner — shown for rescue/mega modes */}
                            {activeAiPlan.warning && (
                              <div style={{
                                background: activeAiPlan.plannerMode === 'exam_rescue' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
                                border: `1px solid ${activeAiPlan.plannerMode === 'exam_rescue' ? '#ef4444' : '#f59e0b'}`,
                                borderRadius: '8px',
                                padding: '10px 14px',
                                fontSize: '13px',
                                color: activeAiPlan.plannerMode === 'exam_rescue' ? '#ef4444' : '#f59e0b',
                                fontWeight: 600,
                              }}>
                                {activeAiPlan.warning}
                              </div>
                            )}

                            {/* Stats row */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px' }}>
                              <div className="stat-card" style={{ padding: '12px' }}>
                                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>MODE</div>
                                <div style={{ fontSize: '14px', fontWeight: 600 }}>{activeAiPlan.modeLabel}</div>
                              </div>
                              <div className="stat-card" style={{ padding: '12px' }}>
                                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>FIRST BLOCK</div>
                                <div style={{ fontSize: '14px', fontWeight: 600 }}>{activeAiPlan.duration}m</div>
                              </div>
                              <div className="stat-card" style={{ padding: '12px' }}>
                                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>BREAK</div>
                                <div style={{ fontSize: '14px', fontWeight: 600 }}>{activeAiPlan.breakPlan}</div>
                              </div>
                            </div>

                            {/* Objective */}
                            <div style={{ background: 'var(--bg-secondary)', padding: '12px', borderRadius: '6px', borderLeft: '4px solid var(--accent)' }}>
                              <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--accent)', marginBottom: '6px', textTransform: 'uppercase' }}>Objective</div>
                              <div style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: 600 }}>{activeAiPlan.sessionObjective}</div>
                            </div>

                            {/* Strategy */}
                            <div style={{ background: 'var(--bg-secondary)', padding: '12px', borderRadius: '6px', borderLeft: '4px solid var(--border)' }}>
                              <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>Strategy</div>
                              <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{activeAiPlan.strategy}</div>
                            </div>

                            {/* Plan Outline — shown for exam_rescue / mega_load modes */}
                            {activeAiPlan.outline && activeAiPlan.outline.length > 0 && (
                              <div style={{ background: 'var(--bg-secondary)', padding: '14px', borderRadius: '8px' }}>
                                <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '10px', textTransform: 'uppercase' }}>
                                  📋 Full Session Plan ({activeAiPlan.outline.length} stages)
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                  {activeAiPlan.outline.map((block, i) => (
                                    <div key={i} style={{
                                      display: 'flex',
                                      gap: '12px',
                                      alignItems: 'flex-start',
                                      padding: '8px 10px',
                                      background: block.method === 'break' ? 'rgba(100,100,100,0.08)' : 'var(--bg-primary)',
                                      borderRadius: '6px',
                                      opacity: block.method === 'break' ? 0.7 : 1,
                                    }}>
                                      <div style={{
                                        minWidth: '42px',
                                        fontSize: '11px',
                                        fontWeight: 700,
                                        color: 'var(--text-muted)',
                                        paddingTop: '1px'
                                      }}>{block.durationMin}m</div>
                                      <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '2px' }}>{block.label}</div>
                                        {block.instruction && (
                                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>{block.instruction}</div>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Action buttons */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                              <button
                                className="btn btn-secondary"
                                onClick={() => setActiveAiPlan(null)}
                                style={{ fontSize: '12px', padding: '8px 16px' }}
                              >
                                ✎ Adjust Settings
                              </button>
                              <button className="btn btn-primary" onClick={applyAiPlan} style={{ padding: '10px 24px', fontWeight: 700 }}>Apply AI Plan</button>
                            </div>
                          </div>
                        ) : (
                          /* AI Input Form */
                          <div style={{ background: 'var(--bg-secondary)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
                              <div style={{ gridColumn: '1 / -1' }}>
                                <label className="setup-label">What are you working on?</label>
                                <input
                                  type="text"
                                  placeholder="e.g. Studying DBMS PDF, Coding React Auth..."
                                  style={{ width: '100%', padding: '12px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', fontFamily: 'inherit' }}
                                  value={aiInput.task}
                                  onChange={(e) => setAiInput({ ...aiInput, task: e.target.value })}
                                />
                              </div>

                              <div>
                                <label className="setup-label">Goal Type</label>
                                <select
                                  style={{ width: '100%', padding: '12px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '8px' }}
                                  value={aiInput.goalType}
                                  onChange={(e) => setAiInput({ ...aiInput, goalType: e.target.value })}
                                >
                                  <option value="study">📖 Study / Learning</option>
                                  <option value="coding">💻 Coding / Dev</option>
                                  <option value="writing">✍️ Writing / Creating</option>
                                  <option value="revision">🔄 Revision / Exam Prep</option>
                                  <option value="working">💼 Generic Admin/Work</option>
                                </select>
                              </div>

                              <div>
                                <label className="setup-label">Urgency</label>
                                <select
                                  style={{ width: '100%', padding: '12px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '8px' }}
                                  value={aiInput.urgency}
                                  onChange={(e) => setAiInput({ ...aiInput, urgency: e.target.value })}
                                >
                                  <option value="normal">🟢 Normal (Sustainable)</option>
                                  <option value="medium">🟡 Soon (This week)</option>
                                  <option value="high">🔴 Urgent (Exam tomorrow / Tonight)</option>
                                </select>
                              </div>

                              <div>
                                <label className="setup-label">Material Load</label>
                                <div style={{ display: 'flex', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', height: '48px' }}>
                                  <button
                                    className="btn-stepper"
                                    onClick={() => setAiInput(prev => ({ ...prev, materialSize: Math.max(1, (parseInt(prev.materialSize) || 1) - (prev.materialUnit === 'pages' ? 5 : 1)) }))}
                                    style={{ width: '40px', borderRight: '1px solid var(--border)' }}
                                  >-</button>
                                  <input
                                    type="number"
                                    style={{ flex: 1, border: 'none', background: 'transparent', textAlign: 'center', minWidth: '40px', padding: '0 4px', color: 'var(--text-primary)', fontFamily: 'inherit' }}
                                    value={aiInput.materialSize}
                                    onKeyDown={(e) => { if (e.key === '-' || e.key === 'e') e.preventDefault(); }}
                                    onChange={(e) => {
                                      let val = parseInt(e.target.value);
                                      if (isNaN(val)) val = '';
                                      setAiInput({ ...aiInput, materialSize: val });
                                    }}
                                    onBlur={(e) => {
                                      let val = parseInt(e.target.value) || 1;
                                      setAiInput({ ...aiInput, materialSize: Math.max(1, Math.abs(val)) });
                                    }}
                                  />
                                  <button
                                    className="btn-stepper"
                                    onClick={() => setAiInput(prev => ({ ...prev, materialSize: (parseInt(prev.materialSize) || 1) + (prev.materialUnit === 'pages' ? 5 : 1) }))}
                                    style={{ width: '40px', borderLeft: '1px solid var(--border)' }}
                                  >+</button>
                                  <select
                                    style={{ border: 'none', background: 'var(--bg-primary)', borderLeft: '1px solid var(--border)', padding: '0 8px', fontSize: '13px', cursor: 'pointer' }}
                                    value={aiInput.materialUnit}
                                    onChange={(e) => setAiInput({ ...aiInput, materialUnit: e.target.value })}
                                  >
                                    <option value="pages">Pages</option>
                                    <option value="chapters">Chapters</option>
                                    <option value="topics">Topics</option>
                                    <option value="tasks">Tasks</option>
                                  </select>
                                </div>
                              </div>

                              <div>
                                <label className="setup-label">Time Available</label>
                                <div style={{ display: 'flex', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', height: '48px' }}>
                                  <button
                                    className="btn-stepper"
                                    onClick={() => {
                                      const step = aiInput.timeAvailableUnit === 'minutes' ? 5 : 1;
                                      setAiInput(prev => ({ ...prev, timeAvailableValue: Math.max(1, (parseInt(prev.timeAvailableValue) || 1) - step) }));
                                    }}
                                    style={{ width: '40px', borderRight: '1px solid var(--border)' }}
                                  >-</button>
                                  <input
                                    type="number"
                                    style={{ flex: 1, border: 'none', background: 'transparent', textAlign: 'center', minWidth: '40px', padding: '0 4px', color: 'var(--text-primary)', fontFamily: 'inherit' }}
                                    value={aiInput.timeAvailableValue}
                                    onKeyDown={(e) => { if (e.key === '-' || e.key === 'e') e.preventDefault(); }}
                                    onChange={(e) => {
                                      let val = parseInt(e.target.value);
                                      if (isNaN(val)) val = '';
                                      setAiInput({ ...aiInput, timeAvailableValue: val });
                                    }}
                                    onBlur={(e) => {
                                      let val = parseInt(e.target.value) || 1;
                                      setAiInput({ ...aiInput, timeAvailableValue: Math.max(1, Math.abs(val)) });
                                    }}
                                  />
                                  <button
                                    className="btn-stepper"
                                    onClick={() => {
                                      const step = aiInput.timeAvailableUnit === 'minutes' ? 5 : 1;
                                      setAiInput(prev => ({ ...prev, timeAvailableValue: (parseInt(prev.timeAvailableValue) || 1) + step }));
                                    }}
                                    style={{ width: '40px', borderLeft: '1px solid var(--border)' }}
                                  >+</button>
                                  <select
                                    style={{ border: 'none', background: 'var(--bg-primary)', borderLeft: '1px solid var(--border)', padding: '0 8px', fontSize: '13px', cursor: 'pointer' }}
                                    value={aiInput.timeAvailableUnit}
                                    onChange={(e) => setAiInput({ ...aiInput, timeAvailableUnit: e.target.value })}
                                  >
                                    <option value="minutes">Min</option>
                                    <option value="hours">Hours</option>
                                    <option value="days">Days</option>
                                  </select>
                                </div>
                              </div>
                            </div>

                            <div style={{ textAlign: 'right' }}>
                              <button className="btn btn-primary" onClick={handleAiPlan} style={{ height: '48px', padding: '0 32px' }}>Generate Plan</button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}


                    <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                      <div className="setup-group">
                        <span className="setup-label">Work Mode</span>
                        <select value={currentWorkMode} onChange={(e) => setCurrentWorkMode(e.target.value)}>
                          {WORK_MODES.map(m => {
                            const isDisabled = currentTimerType === 'garden' && m.id === 'custom';
                            return (
                              <option key={m.id} value={m.id} disabled={isDisabled}>
                                {m.icon} {m.name} {isDisabled ? '(Not allowed in Garden)' : ''}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                      <div className="setup-group">
                        <span className="setup-label">Timer Type</span>
                        <select value={currentTimerType} onChange={(e) => {
                          const newType = e.target.value;
                          setCurrentTimerType(newType);
                          if (newType === 'garden') {
                            setCurrentView('farm');
                            if (currentWorkMode === 'custom') {
                              setCurrentWorkMode('coding');
                            }
                          } else {
                            setCurrentView('dashboard');
                          }
                        }}>
                          {TIMER_TYPES.map(m => (
                            <option key={m.id} value={m.id}>{m.icon} {m.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="setup-group">
                        <span className="setup-label">Theme</span>
                        <select value={currentTheme} onChange={(e) => handleThemeChange(e.target.value)}>
                          {Object.entries(themes).map(([id, t]) => (
                            <option key={id} value={id}>{t.icon} {t.name}</option>
                          ))}
                        </select>
                      </div>

                    </div>

                    {currentTimerType === 'standard' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <span className="setup-label">Session Duration</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <button className="btn btn-secondary" onClick={() => setTargetDurationMin(Math.max(5, targetDurationMin - 5))}>-</button>
                          <span style={{ fontSize: '18px', fontWeight: 600, width: '60px', textAlign: 'center' }}>{targetDurationMin} min</span>
                          <button className="btn btn-secondary" onClick={() => setTargetDurationMin(Math.min(240, targetDurationMin + 5))}>+</button>
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                          {targetDurationMin <= 30 ? 'No breaks planned. Good for quick focus.' :
                            targetDurationMin <= 60 ? 'This session includes 1 short recovery break.' :
                              targetDurationMin <= 90 ? 'This session includes 2 short recovery breaks.' :
                                targetDurationMin <= 150 ? 'This session includes 3 short recovery breaks.' :
                                  'This session includes 4+ recovery breaks.'}
                        </div>
                      </div>
                    )}

                  </div>
                )}
                <DashboardView
                  sessionState={sessionState}
                  driftState={driftState}
                  sessions={sessions}
                  currentWorkMode={currentWorkMode}
                  currentTimerType={currentTimerType}
                  onStart={handleStartSession}
                  onPause={handlePauseSession}
                  onResume={handleResumeSession}
                  onStop={handleStopSession}
                />
              </>
            )}
            {currentView === 'history' && (
              <Suspense fallback={<div className="loading-spinner">Loading History...</div>}><HistoryView sessions={sessions} onDeleteSessions={handleDeleteSessions} /></Suspense>
            )}
            {currentView === 'analytics' && (
              <Suspense fallback={<div className="loading-spinner">Loading Analytics...</div>}><AnalyticsView sessions={sessions} /></Suspense>
            )}
            {currentView === 'settings' && (
              <SettingsView
                onExport={handleExportData}
                onImport={handleImportData}
                importPreview={importPreview}
                onConfirmImport={handleConfirmImport}
                onCancelImport={() => setImportPreview(null)}
                currentTheme={currentTheme}
                onThemeChange={handleThemeChange}
                driftState={driftState}
              />
            )}
          </div>
        )}

      </main>

      {/* Analytics Modal */}
      {
        completedSession && (
          <Suspense fallback={<div className="loading-spinner">Loading Summary...</div>}><SessionCompletedModal
            session={completedSession}
            onDismiss={handleDismissSummary}
            onNewSession={handleNewSession}
            onSaveReflection={handleSaveReflection}
          /></Suspense>
        )
      }

      {/* Recovery Agent HUD */}
      {recoveryAction && (
        <div className="recovery-hud slide-in">
          <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
            <div style={{ fontSize: '28px' }}>🆘</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--negative)', marginBottom: '4px' }}>AI Recovery Agent</div>
              <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.4, color: 'var(--text-primary)' }}>{recoveryAction.message}</p>
              <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                <button
                  className="btn btn-primary"
                  style={{ padding: '6px 16px', fontSize: '13px' }}
                  onClick={() => {
                    if (recoveryAction.type === 'pause') handlePauseSession();
                    if (recoveryAction.type === 'reset') {
                      handleStopSession();
                      // Auto-configure for the sprint
                      setCurrentWorkMode(recoveryAction.meta.newMode);
                      setTargetDurationMin(recoveryAction.meta.newDuration);
                    }
                    if (recoveryAction.type === 'switch') {
                      setCurrentWorkMode(recoveryAction.meta.newModeId);
                    }
                    setRecoveryAction(null);
                  }}
                >
                  {recoveryAction.label}
                </button>
                <button
                  className="btn btn-secondary"
                  style={{ padding: '6px 16px', fontSize: '13px' }}
                  onClick={() => setRecoveryAction(null)}
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Desktop Agent Pairing Modal */}
      {showExtensionPairing && (
        <div className="modal-overlay" onClick={() => setShowExtensionPairing(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '440px' }}>
            <button className="btn-icon" style={{ position: 'absolute', top: 16, right: 16 }} onClick={() => setShowExtensionPairing(false)}>✕</button>
            <h2 style={{ marginTop: 0, fontSize: '20px' }}>Connect Desktop Agent</h2>
            
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.6 }}>
              Pair FocusSense with the local agent to track system-wide activity (VS Code, Chrome, etc.) with zero data leaving your machine.
            </p>

            {/* Connection State UI */}
            <div style={{ background: 'var(--bg-secondary)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border)', margin: '20px 0', textAlign: 'center' }}>
              {(() => {
                const status = driftState.relayStatus;
                
                if (status === 'connected') {
                  return (
                    <div className="fade-in">
                      <div style={{ fontSize: '32px', marginBottom: '8px' }}>✅</div>
                      <div style={{ fontWeight: 700, color: 'var(--positive)', fontSize: '16px' }}>Agent Connected</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Secure Local Handshake Verified</div>
                      <button className="btn btn-secondary" style={{ marginTop: '16px', fontSize: '11px' }} onClick={() => import('./engine/session/relay.js').then(m => m.relayClient.disconnect())}>Disconnect Agent</button>
                    </div>
                  );
                }
                
                if (status === 'detecting' || status === 'handshaking') {
                  return (
                    <div className="fade-in">
                      <div className="spinner" style={{ margin: '0 auto 16px' }}></div>
                      <div style={{ fontWeight: 600, fontSize: '14px' }}>
                        {status === 'detecting' ? 'Looking for Local Agent...' : 'Securing Connection...'}
                      </div>
                    </div>
                  );
                }

                if (status === 'version_mismatch') {
                  return (
                    <div className="fade-in">
                      <div style={{ fontSize: '32px', marginBottom: '8px' }}>⚠️</div>
                      <div style={{ fontWeight: 700, color: 'var(--warning)', fontSize: '16px' }}>Update Required</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Version Mismatch Detected</div>
                      <button className="btn btn-primary" style={{ marginTop: '16px' }} onClick={() => window.open('https://focussense.app/download', '_blank')}>Get Latest Version</button>
                    </div>
                  );
                }

                // Default: agent_unavailable, timeout, idle, etc.
                return (
                  <div className="fade-in">
                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔌</div>
                    <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '12px' }}>Agent Not Detected</div>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 16px' }}> Ensure the FocusSense Desktop Agent is installed and running on this computer.</p>
                    <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => import('./engine/session/relay.js').then(m => m.relayClient.connect())}>
                      Retry Connection
                    </button>
                  </div>
                );
              })()}
            </div>

            {/* Privacy Section (Modern Card) */}
            <div style={{ display: 'flex', gap: '12px', background: 'hsla(150, 100%, 25%, 0.05)', border: '1px solid hsla(150, 100%, 25%, 0.1)', padding: '14px', borderRadius: '10px' }}>
              <span style={{ fontSize: '18px' }}>🛡️</span>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                <strong>Privacy-First Monitoring:</strong> FocusSense only reads application names and window titles. It never captures your screen, keystrokes, or private data.
              </div>
            </div>

            {/* Advanced Toggle (Hidden by default) */}
            <details style={{ marginTop: '20px' }}>
              <summary style={{ fontSize: '11px', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 600, userSelect: 'none' }}>
                Advanced Setup
              </summary>
              <div style={{ marginTop: '12px', background: 'var(--bg-secondary)', padding: '12px', borderRadius: '8px', border: '1px dashed var(--border)' }}>
                 <div style={{ marginBottom: '8px' }}>
                   <label style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', display: 'block' }}>Pairing Token</label>
                   <code style={{ fontSize: '12px', display: 'block', padding: '4px', background: 'var(--bg-primary)', borderRadius: '4px', marginTop: '4px', wordBreak: 'break-all' }}>{relayConfig.token}</code>
                 </div>
                 <div>
                   <label style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', display: 'block' }}>Endpoint</label>
                   <code style={{ fontSize: '12px', display: 'block', padding: '4px', background: 'var(--bg-primary)', borderRadius: '4px', marginTop: '4px' }}>ws://127.0.0.1:8765</code>
                 </div>
              </div>
            </details>
          </div>
        </div>
      )}
      {/* Share Garden Modal (Phase 8) */}
      {showShareGarden && (
        <ShareGardenModal onClose={() => setShowShareGarden(false)} />
      )}
    </div >
  );
}

// ─── Live Metrics Panel (Right Sidebar) ─────────────────────────────────────────
function LiveMetricsPanel({ isActive, elapsedMs, driftState }) {
  // Determine color based on score
  const getScoreColor = (score) => {
    if (score >= 80) return 'var(--positive)';
    if (score >= 60) return 'var(--accent)';
    if (score >= 35) return 'var(--warning)';
    return 'var(--negative)';
  };

  const scoreColor = isActive ? getScoreColor(driftState.focusScore) : 'var(--text-muted)';

  return (
    <div className="dashboard-sidebar">
      {/* Session Monitor Status */}
      <div className="card">
        <div className="card-header" style={{ marginBottom: '12px' }}>
          <span className="card-title">Session Monitor</span>
          {isActive && <span className="card-badge" style={{ backgroundColor: scoreColor, color: '#fff' }}>LIVE</span>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Work Mode</div>
            <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>{driftState.modeLabel || 'Inactive'}</div>
          </div>

          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Signal Source</div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{driftState.monitoringSource || '--'}</div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px', fontStyle: 'italic' }}>
              Accuracy: Limited without browser extension
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', marginTop: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '8px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Focus State</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: scoreColor }}>
                {isActive ? driftState.focusScore : '--'} <span style={{ fontSize: '12px', fontWeight: 500 }}>/ 100</span>
              </div>
            </div>

            {/* Mini Progress Bar */}
            <div style={{ height: '6px', background: 'var(--bg-secondary)', borderRadius: '3px', overflow: 'hidden', marginBottom: '8px' }}>
              <div style={{
                height: '100%',
                width: isActive ? `${driftState.focusScore}%` : '0%',
                backgroundColor: scoreColor,
                transition: 'width 1s ease-out, background-color 0.5s'
              }} />
            </div>

            <div style={{ fontSize: '14px', fontWeight: 600, color: scoreColor, textAlign: 'center' }}>
              {isActive ? driftState.focusLabel : 'Waiting for session...'}
            </div>
            {isActive && <div style={{ fontSize: '10px', color: 'var(--text-muted)', textAlign: 'center', marginTop: '4px' }}>Updates every 5s</div>}
          </div>
        </div>
      </div>

      {/* Legacy Metrics (Optional to keep for continuity) */}
      <div className="card fade-in">
        <div className="card-header">
          <span className="card-title">Live Metrics</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="live-metric-row">
            <span className="live-metric-label">⚡ Interruptions</span>
            <span className="live-metric-value">{isActive ? driftState.driftCount : '--'}</span>
          </div>
          <div className="live-metric-row">
            <span className="live-metric-label">⏱️ Active Focus</span>
            <span className="live-metric-value">
              {isActive ? formatDuration(Math.max(0, elapsedMs - driftState.totalDriftMs)) : '--'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar({ currentView, onViewChange, onPairingClick, driftState }) {
  const menuItems = [
    { id: 'dashboard', icon: '🏠', label: 'Dashboard' },
    { id: 'history', icon: '☰', label: 'Session History' },
    { id: 'analytics', icon: '◧', label: 'Weekly Analytics' },
    { id: 'farm', icon: '🌾', label: 'Farm World' },
    { id: 'settings', icon: '⚙️', label: 'Settings' },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">
            <img src="/logo.png" alt="FS" style={{ width: '100%', height: '100%', borderRadius: 'inherit' }} />
          </div>
          <div>
            <h1>FocusSense</h1>
            <span>Mindful Focus</span>
          </div>
        </div>
      </div>
      <nav className="sidebar-nav">
        {menuItems.map(item => (
          <button
            key={item.id}
            className={`nav-item ${currentView === item.id ? 'active' : ''}`}
            onClick={() => onViewChange(item.id)}
          >
            <span className="nav-item-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-footer" style={{ padding: '16px 20px', borderTop: '1px solid var(--border-light)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <span className="setup-label" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>TRACKING ACCURACY</span>
        <button
          className={`btn btn-sm ${driftState.agentConnected ? 'btn-secondary' : 'btn-primary'}`}
          style={{ 
            alignSelf: 'flex-start', 
            color: driftState.agentConnected ? 'var(--positive)' : '',
            background: driftState.relayStatus === 'handshaking' || driftState.relayStatus === 'detecting' ? 'var(--bg-secondary)' : ''
          }}
          onClick={onPairingClick}
        >
          {driftState.agentConnected ? '✅ Agent Connected' : 
           (driftState.relayStatus === 'handshaking' || driftState.relayStatus === 'detecting') ? '⏳ Connecting...' : 
           '🔌 Connect Agent'}
        </button>
        <div style={{ fontSize: '11px', lineHeight: 1.4 }}>
          {driftState.agentConnected ? (
             <span style={{ color: 'var(--positive)' }}>Secure Local Monitoring</span>
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>
              {driftState.relayStatus === 'version_mismatch' ? '⚠️ Update Required' : 
               driftState.relayStatus === 'agent_unavailable' ? 'Agent Not Detected' :
               'Degraded Fallback Mode'}
            </span>
          )}
        </div>

        <div className="version-tag" style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '8px' }}>v1.0.0-phase12</div>
      </div>
    </aside>
  );
}

// ─── Dashboard View ─────────────────────────────────────────────────────────────
function DashboardView({ sessionState, driftState, sessions, currentWorkMode, currentTimerType, onStart, onPause, onResume, onStop }) {
  const { status, formattedTime, elapsedMs } = sessionState;
  const isActive = status === 'running' || status === 'paused';

  const modeInfo = WORK_MODES.find(m => m.id === currentWorkMode);
  const typeInfo = TIMER_TYPES.find(t => t.id === currentTimerType);

  return (
    <div className="fade-in">
      <div className="page-header">
        <h2 className="page-title">Dashboard</h2>
        <p className="page-subtitle">Track your focus transparently. No inflated productivity percentages.</p>
      </div>

      <FocusRecommendation sessions={sessions} />

      <div className="dashboard-grid">
        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div className="timer-section">
            {isActive && (
              <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                {modeInfo?.icon} {modeInfo?.name} · {typeInfo?.icon} {typeInfo?.name}
              </div>
            )}

            {currentTimerType === 'open' ? (
              <div className={`timer-display ${status}`}>
                {isActive ? formatDuration(elapsedMs) : '0s'}
              </div>
            ) : (
              <div className={`timer-display ${status}`}>
                {formattedTime || '00:00:00'}
              </div>
            )}

            <div className="timer-controls">
              {status === 'idle' || status === 'completed' ? (
                <button className="btn btn-primary" onClick={onStart}>
                  ▶ Start Session
                </button>
              ) : (
                <>
                  {status === 'running' ? (
                    <button className="btn btn-secondary" onClick={onPause}>
                      ❚❚ Pause
                    </button>
                  ) : (
                    <button className="btn btn-primary" onClick={onResume}>
                      ▶ Resume
                    </button>
                  )}
                  <button className="btn btn-danger" onClick={onStop}>
                    ■ End Session
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        <LiveMetricsPanel isActive={isActive} elapsedMs={elapsedMs} driftState={driftState} />
      </div>

      {!isActive && <RecentStatsRow sessions={sessions} />}
    </div>
  );
}

function RecentStatsRow({ sessions }) {
  const stats = useMemo(() => getWeeklyStats(), [sessions]);
  return (
    <div className="stats-row fade-in">
      <div className="stat-card">
        <div className="stat-icon">📅</div>
        <div className="stat-value">{stats.totalSessions}</div>
        <div className="stat-label">Sessions This Week</div>
      </div>
      <div className="stat-card">
        <div className="stat-icon">⏱️</div>
        <div className="stat-value">{formatDuration(stats.totalFocusMs)}</div>
        <div className="stat-label">Total Focus Time</div>
      </div>
      <div className="stat-card">
        <div className="stat-icon">⚡</div>
        <div className="stat-value">{stats.totalDrifts}</div>
        <div className="stat-label">Total Drift Events</div>
      </div>
    </div>
  );
}







// ─── Share Garden Modal (Phase 8) ───────────────────────────────────────────────
function ShareGardenModal({ onClose }) {
  const [privacyMode, setPrivacyMode] = React.useState('standard');
  const [range, setRange] = React.useState('week');
  const snapshot = React.useMemo(() => generateGardenSnapshot(range, privacyMode), [range, privacyMode]);
  const caption = React.useMemo(() => generateGardenCaption(snapshot), [snapshot]);

  const handleDownloadJSON = () => {
    const json = serializeGardenSnapshot(snapshot);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `focussense_garden_${snapshot.range.replace(/\s/g, '_').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyCaption = () => {
    navigator.clipboard.writeText(caption).catch(() => { });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content share-garden-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
        <button className="btn-icon" style={{ position: 'absolute', top: 16, right: 16 }} onClick={onClose}>✕</button>
        <h2 style={{ marginTop: 0, marginBottom: '4px' }}>🌿 Share My Garden</h2>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 20px' }}>
          Export a privacy-safe snapshot of your focus progress. No uploads. No tracking.
        </p>

        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1 }}>
            <div className="setup-label">Privacy Mode</div>
            <select value={privacyMode} onChange={e => setPrivacyMode(e.target.value)} style={{ width: '100%' }}>
              {Object.values(PRIVACY_MODES).map(m => (
                <option key={m.id} value={m.id}>{m.label} — {m.desc}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <div className="setup-label">Date Range</div>
            <select value={range} onChange={e => setRange(e.target.value)} style={{ width: '100%' }}>
              {Object.values(SNAPSHOT_RANGES).map(r => (
                <option key={r.id} value={r.id}>{r.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="garden-card">
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>🌾</div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>{snapshot.dominantBiome}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px', fontStyle: 'italic' }}>Level {snapshot.farmLevel} Farm</div>
          <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '16px' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--accent)' }}>{Math.round(snapshot.totalFocusMinutes / 60 * 10) / 10}h</div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Focus Time</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--accent)' }}>{snapshot.completedSessions}</div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Sessions</div>
            </div>
            {snapshot.currentStreak !== undefined && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--accent)' }}>{snapshot.currentStreak}🔥</div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Day Streak</div>
              </div>
            )}
            {snapshot.avgStability !== undefined && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--accent)' }}>{snapshot.avgStability}%</div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Avg Stability</div>
              </div>
            )}
          </div>
          {snapshot.topAchievement && (
            <div style={{ fontSize: '12px', color: 'var(--accent)', marginBottom: '8px' }}>{snapshot.topAchievement}</div>
          )}
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontStyle: 'italic', padding: '10px', background: 'hsla(220,20%,30%,0.3)', borderRadius: '8px' }}>
            "{caption}"
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '12px' }}>FocusSense · Privacy Mode: {PRIVACY_MODES[privacyMode]?.label} · {snapshot.range}</div>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginTop: '20px', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={handleCopyCaption} style={{ flex: 1, fontSize: '13px' }}>📋 Copy Caption</button>
          <button className="btn btn-secondary" onClick={() => exportGardenCardAsPNG(snapshot, caption, privacyMode)} style={{ flex: 1, fontSize: '13px' }}>🖼 Download PNG</button>
          <button className="btn btn-primary" onClick={handleDownloadJSON} style={{ flex: 1, fontSize: '13px' }}>📥 Download JSON</button>
        </div>

        <div style={{ marginTop: '12px', fontSize: '11px', color: 'var(--text-muted)', borderTop: '1px solid var(--border-light)', paddingTop: '12px' }}>
          💡 JSON format only. No image upload, no cloud account required. Your data never leaves this device.
        </div>
      </div>
    </div>
  );
}

// ─── Settings View (Phase 10 Upgrade) ────────────────────────────────────────────
function SettingsView({ onExport, onImport, importPreview, onConfirmImport, onCancelImport, currentTheme, onThemeChange, driftState }) {
  const [exportFormat, setExportFormat] = React.useState('json');
  const [mergeStrategy, setMergeStrategy] = React.useState('merge');
  const [confirmClearData, setConfirmClearData] = React.useState(false);
  const summary = React.useMemo(() => getDataSummary());

  return (
    <div className="fade-in">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '8px' }}>
          <img src="/logo.png" alt="FocusSense" style={{ width: '48px', height: '48px', borderRadius: '12px', border: '1px solid var(--border)' }} />
          <div>
            <h2 className="page-title" style={{ margin: 0 }}>Settings & Portability</h2>
            <p className="page-subtitle" style={{ margin: 0 }}>Manage your themes and take your focus data with you.</p>
          </div>
        </div>

      <div className="settings-grid">
        {/* Workspace Status */}
        <div className="card">
          <div className="card-title">Workspace Status</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', margin: '16px 0 24px' }}>
            <div className="stat-card" style={{ padding: '12px', textAlign: 'center' }}>
              <div className="stat-value" style={{ fontSize: '20px' }}>{summary.sessionCount}</div>
              <div className="stat-label" style={{ fontSize: '9px' }}>Sessions</div>
            </div>
            <div className="stat-card" style={{ padding: '12px', textAlign: 'center' }}>
              <div className="stat-value" style={{ fontSize: '20px' }}>{summary.totalFocusHours}h</div>
              <div className="stat-label" style={{ fontSize: '9px' }}>Focus</div>
            </div>
            <div className="stat-card" style={{ padding: '12px', textAlign: 'center' }}>
              <div className="stat-value" style={{ fontSize: '20px' }}>{summary.storageUsedKB}KB</div>
              <div className="stat-label" style={{ fontSize: '9px' }}>Storage</div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px', background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
            <div style={{ fontWeight: 600, fontSize: '13px' }}>Desktop Bridge</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '20px', background: driftState?.agentConnected ? 'hsla(150, 100%, 25%, 0.1)' : 'hsla(35, 100%, 40%, 0.1)', color: driftState?.agentConnected ? 'var(--positive)' : 'var(--warning)' }}>
              <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: 'currentColor' }}></span>
              {driftState?.agentConnected ? 'Connected' : 'Disconnected'}
            </div>
          </div>
        </div>

        {/* Export / Import */}
        <div className="card">
          <div className="card-title">Portability</div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginTop: '16px' }}>
            <select value={exportFormat} onChange={e => setExportFormat(e.target.value)} style={{ flex: 1 }}>
              <option value="json">📦 Export JSON</option>
              <option value="csv">📊 Export CSV</option>
            </select>
            <button className="btn btn-primary" onClick={() => onExport(exportFormat)}>📤 Run</button>
          </div>

          <div style={{ marginTop: '20px', borderTop: '1px solid var(--border-light)', paddingTop: '20px' }}>
            {!importPreview ? (
              <label className="btn btn-secondary" style={{ cursor: 'pointer', display: 'block', textAlign: 'center' }}>
                📥 Restore from Backup
                <input type="file" accept=".json" onChange={onImport} style={{ display: 'none' }} />
              </label>
            ) : (
              <div className="import-preview-panel">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px', fontSize: '13px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-muted)' }}>Sessions</span><strong>{importPreview.impact.sessionsToAdd}</strong></div>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button className="btn btn-secondary" onClick={onCancelImport} style={{ flex: 1 }}>✕</button>
                  <button className="btn btn-primary" onClick={() => onConfirmImport(mergeStrategy)} style={{ flex: 1 }}>Import</button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="card" style={{ border: '1px solid hsla(0, 70%, 50%, 0.2)' }}>
          <div className="card-title" style={{ color: 'var(--negative)' }}>Danger Zone</div>
          <button className="btn btn-danger" style={{ width: '100%', marginTop: '16px' }} onClick={() => {
            if (confirmClearData) {
              import('./data/db.js').then(db => {
                db.clearAllData();
                window.location.reload();
              });
            } else {
              setConfirmClearData(true);
              setTimeout(() => setConfirmClearData(false), 3000);
            }
          }}>{confirmClearData ? '⚠️ Confirm Delete All' : 'Wipe All Data'}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Focus Recommendation ──────────────────────────────────────────────────────
function FocusRecommendation({ sessions }) {
  const predictions = useMemo(() => getDeepWorkPredictors(), [sessions]);

  if (predictions.length === 0) return null;

  const best = predictions[0];
  const now = new Date();
  const currentHour = now.getHours();

  // Find next best window starting from now or tomorrow
  const nextBest = predictions.find(p => p.hour > currentHour) || predictions[0];
  const isNow = nextBest.hour === currentHour && nextBest.score > 0.7;

  return (
    <div className="recommendation-puck slide-in" style={{ marginBottom: '24px' }}>
      <div className="recommendation-icon">{isNow ? '🔥' : '⏳'}</div>
      <div className="recommendation-content">
        <div className="recommendation-title">
          {isNow ? "Golden Window Active!" : "Focus Forecast"}
        </div>
        <div className="recommendation-text">
          {isNow
            ? "Your historical stability is peak right now. Excellent time for Deep Work."
            : `Next optimal focus window: ${nextBest.hour > 12 ? nextBest.hour - 12 : nextBest.hour}:00 ${nextBest.hour >= 12 ? 'PM' : 'AM'}.`}
        </div>
      </div>
      <div className="recommendation-score">
        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>CONFIDENCE</div>
        <div style={{ fontWeight: 'bold', color: 'var(--accent)' }}>{Math.round(nextBest.confidence * 100)}%</div>
      </div>
    </div>
  );
}

