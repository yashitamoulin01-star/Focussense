// src/engine/analytics/gardenCardExporter.js
// HTML5 Canvas-based PNG export for the Garden Card.
// Generates a self-contained 800x420 image card from snapshot data.
// No external dependencies, no cloud, fully offline.

import { PRIVACY_MODES } from './gardenSnapshot.js';

const CARD_W = 800;
const CARD_H = 420;

/**
 * Draw a rounded rectangle path on the canvas context.
 */
function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

/**
 * Export a garden snapshot as a downloadable PNG image.
 * @param {object} snapshot - A generated GardenSnapshot object
 * @param {string} caption - Narrative caption string
 * @param {string} privacyModeId - The current privacy mode key
 */
export function exportGardenCardAsPNG(snapshot, caption, privacyModeId = 'standard') {
    const canvas = document.createElement('canvas');
    canvas.width = CARD_W;
    canvas.height = CARD_H;
    const ctx = canvas.getContext('2d');

    // ── Background gradient ──────────────────────────────────────────────────
    const bg = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
    bg.addColorStop(0, 'hsl(220, 30%, 11%)');
    bg.addColorStop(1, 'hsl(260, 28%, 9%)');
    ctx.fillStyle = bg;
    roundRect(ctx, 0, 0, CARD_W, CARD_H, 24);
    ctx.fill();

    // ── Subtle noise/grain overlay (soft radial glow) ────────────────────────
    const glow = ctx.createRadialGradient(CARD_W * 0.3, CARD_H * 0.3, 0, CARD_W * 0.3, CARD_H * 0.3, 400);
    glow.addColorStop(0, 'hsla(220, 70%, 55%, 0.08)');
    glow.addColorStop(1, 'hsla(220, 70%, 55%, 0)');
    ctx.fillStyle = glow;
    roundRect(ctx, 0, 0, CARD_W, CARD_H, 24);
    ctx.fill();

    // ── Border ───────────────────────────────────────────────────────────────
    ctx.strokeStyle = 'hsla(260, 50%, 60%, 0.25)';
    ctx.lineWidth = 1.5;
    roundRect(ctx, 0, 0, CARD_W, CARD_H, 24);
    ctx.stroke();

    // ── Left: App logo + title ───────────────────────────────────────────────
    ctx.fillStyle = 'hsla(220, 70%, 55%, 0.12)';
    roundRect(ctx, 32, 32, 120, 32, 8);
    ctx.fill();

    ctx.fillStyle = 'hsl(220, 70%, 65%)';
    ctx.font = 'bold 13px Inter, -apple-system, sans-serif';
    ctx.fillText('🌱 FocusSense', 48, 53);

    // ── Farm emoji group (decorative) ────────────────────────────────────────
    const emojis = ['🌾', '🌿', '🌳', '🍀'];
    emojis.forEach((e, i) => {
        ctx.font = `${32 - i * 3}px serif`;
        ctx.fillText(e, CARD_W - 100 + i * 22, 70);
    });

    // ── Large biome label ────────────────────────────────────────────────────
    ctx.font = 'bold 36px Inter, -apple-system, sans-serif';
    ctx.fillStyle = 'hsl(220, 20%, 92%)';
    ctx.fillText(snapshot.dominantBiome || 'Growing Meadow', 40, 130);

    // Level subtitle
    ctx.font = '500 15px Inter, -apple-system, sans-serif';
    ctx.fillStyle = 'hsl(220, 10%, 50%)';
    ctx.fillText(`Level ${snapshot.farmLevel || 1} Focus Garden`, 40, 158);

    // ── Stats grid ───────────────────────────────────────────────────────────
    const stats = [
        { label: 'FOCUS TIME', value: `${Math.round((snapshot.totalFocusMinutes || 0) / 60 * 10) / 10}h` },
        { label: 'SESSIONS', value: `${snapshot.completedSessions || 0}` },
    ];

    if (snapshot.currentStreak !== undefined) stats.push({ label: 'STREAK', value: `${snapshot.currentStreak}🔥` });
    if (snapshot.avgStability !== undefined) stats.push({ label: 'STABILITY', value: `${snapshot.avgStability}%` });

    const statStartX = 40;
    const statY = 220;
    const statW = 160;

    stats.forEach((stat, i) => {
        const x = statStartX + i * (statW + 20);

        // Card bg
        ctx.fillStyle = 'hsla(220, 25%, 16%, 0.7)';
        roundRect(ctx, x, statY, statW, 80, 12);
        ctx.fill();
        ctx.strokeStyle = 'hsla(220, 20%, 30%, 0.6)';
        ctx.lineWidth = 1;
        roundRect(ctx, x, statY, statW, 80, 12);
        ctx.stroke();

        // Value
        ctx.font = 'bold 26px Inter, -apple-system, sans-serif';
        ctx.fillStyle = 'hsl(220, 70%, 65%)';
        ctx.fillText(stat.value, x + 16, statY + 42);

        // Label
        ctx.font = '600 10px Inter, -apple-system, sans-serif';
        ctx.fillStyle = 'hsl(220, 10%, 45%)';
        ctx.fillText(stat.label, x + 16, statY + 62);
    });

    // ── Achievement badge ─────────────────────────────────────────────────────
    if (snapshot.topAchievement) {
        ctx.fillStyle = 'hsla(220, 70%, 55%, 0.1)';
        roundRect(ctx, 40, 320, 380, 32, 8);
        ctx.fill();
        ctx.strokeStyle = 'hsla(220, 70%, 55%, 0.2)';
        ctx.lineWidth = 1;
        roundRect(ctx, 40, 320, 380, 32, 8);
        ctx.stroke();

        ctx.font = '500 13px Inter, -apple-system, sans-serif';
        ctx.fillStyle = 'hsl(220, 60%, 70%)';
        ctx.fillText(snapshot.topAchievement, 56, 341);
    }

    // ── Caption ───────────────────────────────────────────────────────────────
    const captionY = snapshot.topAchievement ? 380 : 350;
    ctx.font = 'italic 13px Georgia, serif';
    ctx.fillStyle = 'hsl(220, 12%, 55%)';

    // Wrap caption text at 720px
    const words = caption.split(' ');
    let line = '"';
    let y = captionY;
    for (const word of words) {
        const test = line + (line === '"' ? '' : ' ') + word;
        if (ctx.measureText(test + '"').width > 720) {
            ctx.fillText(line, 40, y);
            line = word;
            y += 20;
        } else {
            line = test === '"' ? word : line + ' ' + word;
        }
    }
    ctx.fillText(line + '"', 40, y);

    // ── Privacy watermark ─────────────────────────────────────────────────────
    ctx.font = '500 11px Inter, -apple-system, sans-serif';
    ctx.fillStyle = 'hsl(220, 10%, 30%)';
    const privacyLabel = PRIVACY_MODES[privacyModeId]?.label || 'Standard';
    ctx.fillText(`Privacy: ${privacyLabel} · ${snapshot.range} · focussense.local`, CARD_W - 380, CARD_H - 18);

    // ── Download ──────────────────────────────────────────────────────────────
    canvas.toBlob(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `focussense_garden_${(snapshot.range || 'export').replace(/\s/g, '_').toLowerCase()}.png`;
        a.click();
        URL.revokeObjectURL(url);
    }, 'image/png');
}
