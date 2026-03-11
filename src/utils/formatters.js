import { WORK_MODES, TIMER_TYPES } from '../themes/themes.js';

export const COLORS = ['#48a868', '#4287f5', '#eba834', '#e66e86', '#7a8c88'];

export const MOOD_OPTIONS = [
    { id: 'flow', label: 'Flow', icon: '🔥' },
    { id: 'neutral', label: 'Neutral', icon: '⚖️' },
    { id: 'tiring', label: 'Tiring', icon: '😫' },
    { id: 'distracted', label: 'Distracted', icon: '📱' },
];

export function formatDuration(ms) {
    if (!ms || ms <= 0) return '0s';
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

export function formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function formatTime(iso) {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

export function getWorkModeIcon(modeId) {
    const m = WORK_MODES.find(m => m.id === modeId);
    return m ? m.icon : '💼';
}

export function getTimerTypeIcon(typeId) {
    const t = TIMER_TYPES.find(t => t.id === typeId);
    return t ? t.icon : '⏱️';
}
