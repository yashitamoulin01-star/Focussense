import React, { useRef, useEffect } from 'react';
import * as PIXI from 'pixi.js';

/**
 * FarmWorldCanvas — PixiJS renderer (performance-optimized)
 *
 * Architecture:
 * - Effect 1 (deps: []): Creates the PixiJS Application once. Never torn down
 *   unless the component is unmounted. Sets up the ticker, particles, static
 *   background, and a ResizeObserver for responsive sizing.
 * - Effect 2 (deps: [worldState]): Imperatively updates existing display
 *   objects based on new state. No app.destroy(), no new containers.
 */
export default function FarmWorldCanvas({ worldState, driftState, onSelectEntity, sessionStatus }) {
    const containerRef = useRef(null);  // wrapper div for ResizeObserver
    const canvasRef = useRef(null);

    // Persistent PixiJS references — never recreated
    const appRef = useRef(null);
    const worldContRef = useRef(null);
    const overlayRef = useRef(null);
    const pixiRefsRef = useRef({});
    const swayGroupRef = useRef([]);
    const breatheGroupRef = useRef([]);
    const sizeRef = useRef({ w: 800, h: 600 });

    // Keep callback fresh without re-init
    const onSelectEntityRef = useRef(onSelectEntity);
    useEffect(() => { onSelectEntityRef.current = onSelectEntity; }, [onSelectEntity]);

    // ─── Effect 1: One-time PixiJS Initialization ────────────────────────────
    useEffect(() => {
        if (!canvasRef.current || appRef.current) return;

        const w = containerRef.current?.clientWidth || 800;
        const h = containerRef.current?.clientHeight || 600;
        sizeRef.current = { w, h };

        const app = new PIXI.Application({
            view: canvasRef.current,
            width: w,
            height: h,
            backgroundColor: 0x87CEEB, // Default sky blue (overridden by time-of-day)
            resolution: window.devicePixelRatio || 1,
            autoDensity: true,
            antialias: true,
        });
        appRef.current = app;

        // World container (camera-transformed)
        const world = new PIXI.Container();
        worldContRef.current = world;
        app.stage.addChild(world);
        world.x = w / 2;
        world.y = h / 2;

        // Particle container
        const particleContainer = new PIXI.Container();
        world.addChild(particleContainer);
        pixiRefsRef.current.particleContainer = particleContainer;

        // Clouds container (parallax layer)
        const cloudLayer = new PIXI.Container();
        app.stage.addChildAt(cloudLayer, 0); // Behind the world
        pixiRefsRef.current.cloudLayer = cloudLayer;

        // Day/Night overlay (screen-space)
        const overlay = new PIXI.Graphics();
        overlayRef.current = overlay;
        app.stage.addChild(overlay);

        // ── Static background (Sky and Grass with vibrant #00ff00 palette) ──
        const bg = new PIXI.Graphics();
        // Main grass — vibrant green from the provided palette
        bg.beginFill(0x32ff32); // Tint: #32ff32 (bright fresh green)
        bg.drawRect(-1000, -250, 2000, 1500);
        
        // Alternating strips using shades & tints for depth
        const grassStrips = [
            { color: 0x00e500, alpha: 0.35 },  // Shade: slightly deeper
            { color: 0x4cff4c, alpha: 0.25 },  // Tint: lighter highlight
            { color: 0x00cc00, alpha: 0.20 },  // Shade: earthy depth
            { color: 0x66ff66, alpha: 0.15 },  // Tint: pastel highlight
        ];
        for (let i = -1000; i < 1000; i += 100) {
            const strip = grassStrips[(Math.abs(i) / 100) % grassStrips.length | 0];
            bg.beginFill(strip.color, strip.alpha);
            bg.drawRect(i, -250, 50, 1500);
        }
        // Add darker green patches for organic texture
        bg.beginFill(0x009900, 0.12);
        bg.drawCircle(-400, 50, 120);
        bg.drawCircle(200, -100, 90);
        bg.drawCircle(350, 200, 110);
        bg.drawCircle(-150, 300, 80);
        bg.endFill();
        world.addChild(bg);
        
        // ── Dynamic Celestial Body (Sun or Moon) ─────────────────────────────
        const celestialContainer = new PIXI.Container();
        cloudLayer.addChild(celestialContainer);
        pixiRefsRef.current.celestialContainer = celestialContainer;

        const drawCelestial = (cw, ch) => {
            celestialContainer.removeChildren();
            const hour = new Date().getHours();
            const isNight = hour >= 19 || hour < 6;
            const isDusk = hour >= 17 && hour < 19;
            const isDawn = hour >= 6 && hour < 8;

            if (isNight) {
                // 🌙 Moon
                const moon = new PIXI.Graphics();
                moon.beginFill(0xF0E68C); // Pale golden
                moon.drawCircle(0, 0, 50);
                moon.endFill();
                // Crescent shadow
                moon.beginFill(0x87CEEB, 0); // Will be overridden by night bg
                // Use night sky color for the crescent cutout
                moon.beginFill(0x0a0e2a);
                moon.drawCircle(18, -12, 42);
                moon.endFill();
                // Moon glow
                const glow = new PIXI.Graphics();
                glow.beginFill(0xF0E68C, 0.08);
                glow.drawCircle(0, 0, 100);
                glow.endFill();
                celestialContainer.addChild(glow);
                celestialContainer.addChild(moon);

                // Stars
                const starPositions = [
                    { x: -300, y: -200, r: 2 }, { x: -180, y: -280, r: 1.5 },
                    { x: -50, y: -240, r: 2.5 }, { x: 100, y: -300, r: 1.8 },
                    { x: 250, y: -220, r: 2 }, { x: 350, y: -280, r: 1.5 },
                    { x: -250, y: -320, r: 1.2 }, { x: 50, y: -350, r: 2 },
                    { x: 400, y: -340, r: 1.8 }, { x: -400, y: -260, r: 1.5 },
                    { x: 180, y: -380, r: 2.2 }, { x: -320, y: -380, r: 1.3 },
                ];
                starPositions.forEach(s => {
                    const star = new PIXI.Graphics();
                    star.beginFill(0xFFFFFF, 0.7 + Math.random() * 0.3);
                    star.drawCircle(0, 0, s.r);
                    star.endFill();
                    star.x = s.x; star.y = s.y;
                    celestialContainer.addChild(star);
                });

                celestialContainer.x = cw * 0.78;
                celestialContainer.y = cw * 0.08; // keep in sky even on wide/short windows

                // Night sky color
                app.renderer.backgroundColor = 0x0a0e2a;
            } else {
                // ☀️ Sun
                const sun = new PIXI.Graphics();
                let sunColor = 0xFFDF00; // Bright golden
                let glowColor = 0xFFDF00;
                if (isDusk) { sunColor = 0xFF8C42; glowColor = 0xFF6B35; }
                else if (isDawn) { sunColor = 0xFFA94D; glowColor = 0xFFBF69; }

                // Outer glow
                sun.beginFill(glowColor, 0.12);
                sun.drawCircle(0, 0, 140);
                sun.beginFill(glowColor, 0.2);
                sun.drawCircle(0, 0, 110);
                // Main sun
                sun.beginFill(sunColor);
                sun.drawCircle(0, 0, 70);
                // Inner highlight
                sun.beginFill(0xFFF8DC, 0.5);
                sun.drawCircle(-10, -10, 35);
                sun.endFill();
                celestialContainer.addChild(sun);

                // Sun rays — 8 evenly-spaced triangular rays
                for (let r = 0; r < 8; r++) {
                    const ray = new PIXI.Graphics();
                    ray.beginFill(sunColor, 0.18);
                    const angle = (r / 8) * Math.PI * 2;
                    const perpAngle = angle + Math.PI / 2;
                    const rx = Math.cos(angle);
                    const ry = Math.sin(angle);
                    const px = Math.cos(perpAngle);
                    const py = Math.sin(perpAngle);
                    ray.drawPolygon([
                        rx * 78, ry * 78,
                        rx * 135 + px * 14, ry * 135 + py * 14,
                        rx * 135 - px * 14, ry * 135 - py * 14,
                    ]);
                    ray.endFill();
                    celestialContainer.addChild(ray);
                }

                celestialContainer.x = cw * 0.78;
                celestialContainer.y = cw * 0.08; // match moon position logic

                // Daytime sky colors
                if (isDusk) app.renderer.backgroundColor = 0x2c3e72;
                else if (isDawn) app.renderer.backgroundColor = 0x7ec8e3;
                else app.renderer.backgroundColor = 0x5bb3e0; // Vivid day blue
            }
        };
        drawCelestial(w, h);
        pixiRefsRef.current.drawCelestial = drawCelestial;

        const path = new PIXI.Graphics();
        path.beginFill(0x73604f, 0.4);
        // Vertical path flowing from house to main path
        path.drawRoundedRect(-320, -180, 40, 330, 15);
        // Horizontal main path connecting across the plots to the pond
        path.drawRoundedRect(-320, 150, 680, 40, 15);
        path.endFill();
        world.addChild(path);

        // ── Clutter (static backdrop) ──────────────────────────────────────
        const clutterCoords = [
            { x: -450, y: -350, type: 'rock' }, { x: 400, y: -300, type: 'rock' },
            { x: -420, y: 350, type: 'log' }, { x: 450, y: 320, type: 'log' },
            { x: -100, y: -380, type: 'bush' }, { x: 200, y: 380, type: 'bush' }, { x: 420, y: -50, type: 'bush' },
            { x: 300, y: -150, type: 'bush' }, { x: -250, y: 220, type: 'bush' }, { x: -350, y: 100, type: 'bush' },
        ];
        const localSwayGroup = [];
        clutterCoords.forEach((c) => {
            const cg = new PIXI.Graphics();
            if (c.type === 'rock') {
                cg.beginFill(0x7a8c88); cg.drawCircle(0, 0, 12);
                cg.beginFill(0x8e9e9a); cg.drawCircle(-3, -3, 5); cg.endFill();
            } else if (c.type === 'log') {
                cg.beginFill(0x524235); cg.drawRoundedRect(-17, -7, 35, 14, 4);
                cg.beginFill(0x5c4a3d); cg.drawCircle(-17, 0, 7); cg.endFill();
            } else {
                cg.beginFill(0x3b6647); cg.drawCircle(0, 0, 16);
                cg.beginFill(0x4a7c59); cg.drawCircle(-5, -5, 10); cg.endFill();
                localSwayGroup.push(cg);
            }
            cg.x = c.x; cg.y = c.y;
            world.addChild(cg);
        });

        // ── Particles ──────────────────────────────────────────────────────
        const particles = [];
        for (let i = 0; i < 15; i++) {
            const p = new PIXI.Graphics();
            p.beginFill(Math.random() > 0.5 ? 0x82c26b : 0xe66e86, 0.6);
            p.drawEllipse(0, 0, 4, 2); p.endFill();
            p.x = (Math.random() - 0.5) * 1000;
            p.y = (Math.random() - 0.5) * 1000;
            p.vx = (Math.random() - 0.5) * 0.5 - 0.5;
            p.vy = Math.random() * 0.5 + 0.2;
            particleContainer.addChild(p);
            particles.push(p);
        }
        pixiRefsRef.current.particles = particles;

        // ── Parallax Clouds ────────────────────────────────────────────────
        const clouds = [];
        for (let i = 0; i < 5; i++) {
            const c = new PIXI.Graphics();
            c.beginFill(0xFFF8DC, 0.35); // Warmer, more opaque cream clouds
            c.drawCircle(0, 0, 60 + Math.random() * 40);
            c.drawCircle(40, 20, 50 + Math.random() * 30);
            c.drawCircle(-40, 10, 40 + Math.random() * 20);
            c.endFill();
            c.x = Math.random() * w;
            c.y = (-h / 2) + Math.random() * (h / 2.5); // Keep clouds mostly in the sky area
            c.vx = (Math.random() * 0.2) + 0.1;
            cloudLayer.addChild(c);
            clouds.push(c);
        }
        pixiRefsRef.current.clouds = clouds;

        // ── Filters & Effects ──────────────────────────────────────────────
        const colorMatrix = new PIXI.filters.ColorMatrixFilter();
        world.filters = [colorMatrix];
        pixiRefsRef.current.colorMatrix = colorMatrix;

        // ── Ticker ─────────────────────────────────────────────────────────
        let tickerTime = 0;
        app.ticker.add((delta) => {
            tickerTime += 0.05 * delta;

            // Real-time Celestial Update (every ~10s or on transition)
            const currentHour = new Date().getHours();
            if (pixiRefsRef.current.lastHour !== currentHour) {
                pixiRefsRef.current.lastHour = currentHour;
                if (pixiRefsRef.current.drawOverlay) {
                    pixiRefsRef.current.drawOverlay(sizeRef.current.w, sizeRef.current.h);
                }
            }

            // Modulate particles by focus score
            const score = pixiRefsRef.current.currentFocusScore || 100;
            const flowFactor = score / 100;

            particles.forEach(p => {
                p.x += p.vx * delta * (0.5 + flowFactor);
                p.y += p.vy * delta * (0.5 + flowFactor);
                p.alpha = 0.3 + (flowFactor * 0.5);
                if (p.x < -600) p.x = 600;
                if (p.y > 600) p.y = -600;
            });

            clouds.forEach(c => {
                c.x += c.vx * delta;
                if (c.x > (sizeRef.current.w || 800) + 200) {
                    c.x = -200;
                    c.y = Math.random() * (sizeRef.current.h / 2);
                }
            });

            // Lushness (Saturation) modulation
            // 0 -> grayscale-ish, 1 -> vibrant
            colorMatrix.desaturate(); // start fresh
            colorMatrix.saturate(flowFactor * 1.5, true);

            swayGroupRef.current.forEach((s, idx) => {
                s.skew.x = Math.sin(tickerTime + idx) * (0.02 + flowFactor * 0.03);
            });
            breatheGroupRef.current.forEach((b, idx) => {
                b.scale.set(1 + Math.sin(tickerTime * 0.5 + idx) * (0.01 + flowFactor * 0.02));
            });

            // Burst particles
            if (pixiRefsRef.current.burstParticles) {
                for (let i = pixiRefsRef.current.burstParticles.length - 1; i >= 0; i--) {
                    const p = pixiRefsRef.current.burstParticles[i];
                    p.x += p.vx * delta;
                    p.y += p.vy * delta;
                    p.alpha -= 0.02 * delta;
                    if (p.alpha <= 0) {
                        pixiRefsRef.current.particleContainer.removeChild(p);
                        pixiRefsRef.current.burstParticles.splice(i, 1);
                    }
                }
            }
        });

        // ── Burst Logic ────────────────────────────────────────────────────
        const spawnBurst = (x, y) => {
            if (!pixiRefsRef.current.particleContainer) return;
            const burstCount = 25;
            if (!pixiRefsRef.current.burstParticles) pixiRefsRef.current.burstParticles = [];

            for (let i = 0; i < burstCount; i++) {
                const p = new PIXI.Graphics();
                const colors = [0xFFD700, 0x82c26b, 0xFFFFFF, 0x00E5FF];
                p.beginFill(colors[Math.floor(Math.random() * colors.length)]);
                p.drawCircle(0, 0, 2 + Math.random() * 3);
                p.endFill();
                p.x = x;
                p.y = y;
                const angle = Math.random() * Math.PI * 2;
                const speed = 2 + Math.random() * 5;
                p.vx = Math.cos(angle) * speed;
                p.vy = Math.sin(angle) * speed;
                pixiRefsRef.current.particleContainer.addChild(p);
                pixiRefsRef.current.burstParticles.push(p);
            }
        };
        pixiRefsRef.current.spawnBurst = spawnBurst;

        swayGroupRef.current = localSwayGroup;

        // ── Day/Night overlay ──────────────────────────────────────────────
        const drawOverlay = (width, height) => {
            const hour = new Date().getHours();
            let tCol = 0xFFFFFF; let tAlpha = 0;
            if (hour >= 19 || hour < 6) {
                // Night: deep moody indigo overlay
                tCol = 0x050a1a; tAlpha = 0.55;
            } else if (hour >= 17 && hour < 19) {
                // Dusk: warm orange-purple
                tCol = 0x4a1a6b; tAlpha = 0.2;
            } else if (hour >= 6 && hour < 8) {
                // Dawn: soft peach
                tCol = 0xffccaa; tAlpha = 0.12;
            }
            overlay.clear();
            if (tAlpha > 0) {
                overlay.beginFill(tCol, tAlpha);
                overlay.drawRect(0, 0, width, height);
                overlay.endFill();
            }
            // Also update celestial body when overlay redraws
            if (pixiRefsRef.current.drawCelestial) {
                pixiRefsRef.current.drawCelestial(width, height);
            }
        };
        drawOverlay(w, h);
        pixiRefsRef.current.drawOverlay = drawOverlay;

        // ── ResizeObserver — keeps canvas filling its container ────────────
        const ro = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                if (width > 0 && height > 0) {
                    app.renderer.resize(width, height);
                    sizeRef.current = { w: width, h: height };
                    if (worldContRef.current) {
                        worldContRef.current.x = width / 2 + (worldState?.camera?.x ?? 0);
                        worldContRef.current.y = height / 2 + (worldState?.camera?.y ?? 0);
                    }
                    drawOverlay(width, height);
                }
            }
        });
        if (containerRef.current) ro.observe(containerRef.current);

        return () => {
            ro.disconnect();
            app.destroy(true, { children: true, texture: true, baseTexture: true });
            appRef.current = null;
            worldContRef.current = null;
            overlayRef.current = null;
            pixiRefsRef.current = {};
            swayGroupRef.current = [];
            breatheGroupRef.current = [];
        };
    }, []); // ← Empty deps: runs only on mount/unmount

    // ─── Effect 2: Imperative worldState Updates (no teardown) ──────────────
    useEffect(() => {
        const app = appRef.current;
        const world = worldContRef.current;
        if (!app || !world) return;

        pixiRefsRef.current.currentFocusScore = driftState?.focusScore ?? 100;

        const {
            camera, plots = [], animals = [], family = [],
            decor = [], unlocks = {}, selectedEntityId, currentTargetId, growthAccumulatedMs,
        } = worldState;

        const { w, h } = sizeRef.current;

        // Camera
        world.x = w / 2 + (camera?.x ?? 0);
        world.y = h / 2 + (camera?.y ?? 0);
        world.scale.set(camera?.zoom ?? 1);

        const refs = pixiRefsRef.current;
        const newSway = [...swayGroupRef.current.slice(0, 3)]; // keep clutter bushes
        const newBreathe = [];

        const getOrCreate = (key, factory) => {
            if (!refs[key]) {
                refs[key] = factory();
                world.addChild(refs[key]);
            }
            return refs[key];
        };

        // ── Plots ──────────────────────────────────────────────────────────
        plots.forEach((plot, i) => {
            const key = `plot_${plot.id}`;
            let cont = refs[key];
            if (!cont) {
                cont = new PIXI.Container();
                refs[key] = cont;
                world.addChild(cont);
                cont.eventMode = 'static';
                cont.cursor = 'pointer';
                cont.on('pointerdown', () => onSelectEntityRef.current(plot.id, 'plot'));
            }
            cont.removeChildren();

            const g = new PIXI.Graphics();
            g.beginFill(0x4a3a30); g.drawRect(-28, -28, 56, 56); g.endFill();
            cont.addChild(g);

            if (selectedEntityId === plot.id) {
                const sel = new PIXI.Graphics();
                sel.lineStyle(2, 0xffffff, 0.5); sel.drawRect(-30, -30, 60, 60);
                cont.addChild(sel);
            }
            if (plot.state === 'dead') {
                const dead = new PIXI.Graphics();
                dead.beginFill(0x444444); dead.drawCircle(0, 0, 12); dead.endFill();
                cont.addChild(dead);
            } else if (plot.cropId) {
                const crop = new PIXI.Graphics();
                const col = plot.state === 'wilted' ? 0xa8b066 : 0x82c26b;

                // Base crop
                crop.beginFill(col); crop.drawCircle(0, -8, 14);
                crop.beginFill(col, 0.5); crop.drawCircle(-8, 0, 9); crop.drawCircle(8, 0, 9);
                crop.endFill();

                // Streak Upgrade: Golden Glint / Denser Foliage
                if (plot.streak >= 3) {
                    const glint = new PIXI.Graphics();
                    glint.beginFill(0xFFD700, 0.4); // Golden semi-transparent
                    glint.drawCircle(-5, -15, 6);
                    glint.drawCircle(5, -12, 4);
                    glint.endFill();
                    crop.addChild(glint);

                    // Add some "sparkle" dots
                    for (let j = 0; j < 3; j++) {
                        const dot = new PIXI.Graphics();
                        dot.beginFill(0xFFFFFF, 0.8);
                        dot.drawCircle(0, 0, 2);
                        dot.endFill();
                        dot.x = (Math.random() - 0.5) * 20;
                        dot.y = -15 - Math.random() * 10;
                        crop.addChild(dot);
                    }
                }

                cont.addChild(crop);
                newSway.push(crop);
            }

            const gridSpacing = 60;
            const gridX = -100 + (i % 2) * gridSpacing;
            const gridY = 80 + Math.floor(i / 2) * gridSpacing;
            cont.x = gridX; cont.y = gridY;
        });

        // ── Progress Ring ──────────────────────────────────────────────────
        const progKey = 'progressRing';
        if (currentTargetId && growthAccumulatedMs > 0) {
            let progG = refs[progKey];
            if (!progG) {
                progG = new PIXI.Graphics();
                refs[progKey] = progG;
                world.addChild(progG);
            }
            progG.clear();
            const radius = currentTargetId === 'pond' ? 98 : (currentTargetId === 'house' ? 120 : 40);
            progG.lineStyle(4, 0x82c26b, 0.4); progG.drawCircle(0, 0, radius);
            let tx = 0, ty = 0;
            if (currentTargetId === 'house') { tx = -300; ty = -220; }
            if (currentTargetId === 'pond') { tx = 320; ty = 80; }
            progG.x = tx; progG.y = ty;
            progG.visible = true;
            newBreathe.push(progG);
        } else if (refs[progKey]) {
            refs[progKey].visible = false;
        }

        // ── Pond ───────────────────────────────────────────────────────────
        const pondKey = 'pond_cont';
        let pondCont = refs[pondKey];
        if (!pondCont) {
            pondCont = new PIXI.Container();
            refs[pondKey] = pondCont;
            world.addChild(pondCont);
            pondCont.x = 320; pondCont.y = 80;
            pondCont.eventMode = 'static'; pondCont.cursor = 'pointer';
            pondCont.on('pointerdown', () => onSelectEntityRef.current('pond', 'structure'));
        }
        pondCont.removeChildren();
        const pondG = new PIXI.Graphics();
        if (unlocks?.pond?.state === 'unlocked') {
            pondG.beginFill(0x2c4e6e); pondG.drawCircle(0, 0, 86);
            pondG.beginFill(0x3a7ca5); pondG.drawCircle(0, 0, 80);
            pondG.beginFill(0x5291b8); pondG.drawCircle(-15, -15, 40); pondG.endFill();
        } else {
            pondG.beginFill(0x4a7c59, 0.3); pondG.drawCircle(0, 0, 80); pondG.endFill();
            if (currentTargetId === 'pond') { pondG.lineStyle(2, 0x3a7ca5, 0.6); pondG.drawCircle(0, 0, 80); }
        }
        pondCont.addChild(pondG);

        // ── House ──────────────────────────────────────────────────────────
        const houseKey = 'house_cont';
        let houseCont = refs[houseKey];
        if (!houseCont) {
            houseCont = new PIXI.Container();
            refs[houseKey] = houseCont;
            world.addChild(houseCont);
            houseCont.x = -300; houseCont.y = -220;
            houseCont.eventMode = 'static'; houseCont.cursor = 'pointer';
            houseCont.on('pointerdown', () => onSelectEntityRef.current('house', 'structure'));
        }
        houseCont.removeChildren();
        const houseG = new PIXI.Graphics();
        const hour = new Date().getHours();
        if (unlocks?.house?.state === 'unlocked') {
            houseG.beginFill(0x8c3333); houseG.drawPolygon([-100, 0, 0, -80, 100, 0]);
            houseG.beginFill(0xd9c2af); houseG.drawRect(-90, 0, 180, 120);
            houseG.beginFill(0x5c4433); houseG.drawRect(-25, 50, 50, 70);
            const isNight = hour >= 18 || hour < 6;
            houseG.beginFill(isNight ? 0xffcc33 : 0xadd8e6);
            houseG.drawRect(-65, 30, 30, 30); houseG.drawRect(35, 30, 30, 30); houseG.endFill();
        } else {
            houseG.beginFill(0x4a3a30, 0.3); houseG.drawRect(-90, 0, 180, 120); houseG.endFill();
            if (currentTargetId === 'house') {
                houseG.lineStyle(2, 0xe8d5c5, 0.5); houseG.drawRect(-90, 0, 180, 120);
                houseG.moveTo(-100, 0); houseG.lineTo(0, -80); houseG.lineTo(100, 0);
            }
        }
        houseCont.addChild(houseG);

        // ── Decor ──────────────────────────────────────────────────────────
        decor.forEach((d) => {
            const key = `decor_${d.id ?? d.x}_${d.y}`;
            let dg = refs[key];
            if (!dg) {
                dg = new PIXI.Graphics();
                refs[key] = dg;
                world.addChild(dg);
                dg.x = d.x; dg.y = d.y;
            }
            dg.clear();
            if (d.state === 'dead') {
                dg.beginFill(0x555555); dg.drawCircle(0, 0, 12);
            } else if (d.type === 'flowerBed') {
                dg.beginFill(0x4a3a30); dg.drawCircle(0, 0, 22);
                dg.beginFill(d.state === 'wilted' ? 0xccb885 : 0xf06e86);
                for (let n = 0; n < 5; n++) { dg.drawCircle(Math.cos(n) * 10, Math.sin(n) * 10, 6); }
            } else {
                dg.beginFill(d.state === 'wilted' ? 0xa8b066 : 0x72c45d);
                dg.drawPolygon([-10, 10, 0, -20, 10, 10]);
                dg.drawPolygon([-18, 10, -10, -10, 0, 10]);
                dg.drawPolygon([0, 10, 10, -10, 18, 10]);
            }
            dg.endFill();
            newSway.push(dg);
        });

        // ── Family & Animals ───────────────────────────────────────────────
        [...family, ...animals].forEach(ent => {
            const key = `entity_${ent.id ?? ent.x}_${ent.y}`;
            let cont = refs[key];
            if (!cont) {
                cont = new PIXI.Container();
                refs[key] = cont;
                world.addChild(cont);
                cont.x = ent.x; cont.y = ent.y;
            }
            cont.removeChildren();
            const g = new PIXI.Graphics();
            const animalTypes = ['chicken', 'dog', 'cat', 'cow', 'duck', 'animal'];
            if (animalTypes.includes(ent.type)) {
                if (ent.type === 'duck') {
                    // PixiJS Duck (Mallard style)
                    g.beginFill(0xffffff); g.drawEllipse(0, -2, 14, 10); // Body
                    g.beginFill(0x2ca332); g.drawCircle(10, -10, 7); // Green head
                    g.beginFill(0xffa500); g.drawPolygon([14, -12, 22, -9, 14, -7]); // Orange beak
                } else if (ent.type === 'cow') {
                    // Cow
                    g.beginFill(0xffffff); g.drawRoundedRect(-15, -15, 30, 20, 5);
                    g.beginFill(0x222222); g.drawRect(-5, -15, 8, 8); g.drawRect(5, -5, 6, 8);
                } else if (ent.type === 'chicken') {
                    // Chicken
                    g.beginFill(0xffffff); g.drawCircle(0, -5, 8);
                    g.beginFill(0xff0000); g.drawCircle(4, -12, 3); // Comb
                    g.beginFill(0xffa500); g.drawPolygon([4, -5, 12, -3, 4, -1]); // Beak
                } else {
                    // Generic Dog/Cat/Animal
                    g.beginFill(0xdddddd); g.drawEllipse(0, -5, 20, 14);
                    g.beginFill(0xcccccc); g.drawCircle(16, -12, 10);
                }
            } else {
                // Human Family Member
                g.beginFill(0xeba834); g.drawCircle(0, -15, 12); // Head
                g.beginFill(0x4287f5); g.drawRoundedRect(-10, -2, 20, 26, 4); // Body
            }
            g.endFill(); cont.addChild(g);
            newBreathe.push(cont);
        });

        // ── AI Coach NPC ───────────────────────────────────────────────────
        const coachKey = 'entity_coach';
        let coachCont = refs[coachKey];
        if (!coachCont) {
            coachCont = new PIXI.Container();
            refs[coachKey] = coachCont;
            world.addChild(coachCont);
            coachCont.x = 320; coachCont.y = -120; // Near pond
            coachCont.eventMode = 'static'; coachCont.cursor = 'pointer';
            coachCont.on('pointerdown', (e) => {
                e.stopPropagation();
                onSelectEntityRef.current('coach', 'npc');
            });

            const g = new PIXI.Graphics();
            // Coach Body (Advanced/Robotic)
            g.beginFill(0x2d5bb3); g.drawRoundedRect(-14, -10, 28, 30, 8); // Body
            g.beginFill(0x8e9e9a); g.drawCircle(0, -22, 14); // Silver Head
            g.beginFill(0x3a7ca5); g.drawCircle(0, -22, 10); // Core
            g.beginFill(0x5291b8); g.drawCircle(0, -42, 4); // Floating Antenna Tip
            g.lineStyle(2, 0x5291b8, 0.6); g.moveTo(0, -36); g.lineTo(0, -38);
            g.endFill();
            coachCont.addChild(g);
        }

        // Selection highlight for coach
        if (selectedEntityId === 'coach') {
            const highlightKey = 'coach_highlight';
            let h = coachCont.getChildByName(highlightKey);
            if (!h) {
                h = new PIXI.Graphics();
                h.name = highlightKey;
                coachCont.addChildAt(h, 0);
            }
            h.clear();
            h.lineStyle(3, 0x5291b8, 0.4);
            h.drawCircle(0, -10, 35);
        } else {
            const h = coachCont.getChildByName('coach_highlight');
            if (h) h.clear();
        }

        newBreathe.push(coachCont);

        swayGroupRef.current = newSway;
        breatheGroupRef.current = newBreathe;

    }, [worldState]);

    // ─── Effect 3: Session Completion Reward ────────────────────────────────
    const lastStatus = useRef(sessionStatus);
    useEffect(() => {
        if (sessionStatus === 'idle' && lastStatus.current === 'running') {
            // Trigger burst at current target
            const target = worldState.currentTargetId;
            let tx = 0, ty = 0;
            if (target === 'house') { tx = -300; ty = -220; }
            else if (target === 'pond') { tx = 320; ty = 80; }
            else if (target && target.startsWith('plot_')) {
                const plotIdx = worldState.plots.findIndex(p => p.id === target.replace('plot_', ''));
                if (plotIdx !== -1) {
                    tx = -100 + (plotIdx % 2) * 60;
                    ty = 80 + Math.floor(plotIdx / 2) * 60;
                }
            }
            if (pixiRefsRef.current.spawnBurst) {
                pixiRefsRef.current.spawnBurst(tx, ty);
            }
        }
        lastStatus.current = sessionStatus;
    }, [sessionStatus, worldState.currentTargetId, worldState.plots]);

    return (
        <div
            ref={containerRef}
            style={{ width: '100%', height: '100%', overflow: 'hidden' }}
        >
            <canvas
                ref={canvasRef}
                style={{ display: 'block', width: '100%', height: '100%' }}
            />
        </div>
    );
}
