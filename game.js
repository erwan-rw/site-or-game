'use strict';
// ═══════════════════════════════════════════════════════════════
//  GLOBALS & CONSTANTS
// ═══════════════════════════════════════════════════════════════
const GW = 800, GH = 450, T = 32;

// Touch state (shared across scenes)
const touch = { left: false, right: false, jump: false, pause: false };

// ═══════════════════════════════════════════════════════════════
//  TOUCH CONTROLS
// ═══════════════════════════════════════════════════════════════
function initTouchControls() {
  const ui = document.getElementById('touch-ui');
  const pauseBtn = document.getElementById('btn-pause-touch');
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 700;
  if (mobile) { ui.style.display = 'block'; pauseBtn.style.display = 'flex'; }

  const bind = (id, prop) => {
    const el = document.getElementById(id);
    el.addEventListener('touchstart', e => { e.preventDefault(); touch[prop] = true; }, { passive: false });
    el.addEventListener('touchend',   e => { e.preventDefault(); touch[prop] = false; }, { passive: false });
    el.addEventListener('mousedown',  () => touch[prop] = true);
    el.addEventListener('mouseup',    () => touch[prop] = false);
    el.addEventListener('mouseleave', () => touch[prop] = false);
  };
  bind('btn-left', 'left');
  bind('btn-right', 'right');
  bind('btn-jump', 'jump');

  // Pause button (toggle)
  pauseBtn.addEventListener('touchstart', e => { e.preventDefault(); touch.pause = true; }, { passive: false });
  pauseBtn.addEventListener('touchend',   e => { e.preventDefault(); touch.pause = false; }, { passive: false });
  pauseBtn.addEventListener('mousedown',  () => touch.pause = true);
  pauseBtn.addEventListener('mouseup',    () => touch.pause = false);
}

// ═══════════════════════════════════════════════════════════════
//  WEB AUDIO MANAGER
// ═══════════════════════════════════════════════════════════════
const SFX = {
  ctx: null,
  bgTimer: null,
  muted: false,

  init() {
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
  },
  resume() { if (this.ctx?.state === 'suspended') this.ctx.resume(); },

  _tone(freq, dur, type = 'square', vol = 0.2, delay = 0) {
    if (!this.ctx || this.muted || freq <= 0) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain); gain.connect(this.ctx.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime + delay);
      gain.gain.setValueAtTime(vol, this.ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + delay + dur);
      osc.start(this.ctx.currentTime + delay);
      osc.stop(this.ctx.currentTime + delay + dur);
    } catch(e) {}
  },

  jump()      { this._tone(300, 0.05); this._tone(520, 0.12, 'square', 0.15, 0.05); },
  coin()      { this._tone(880, 0.07, 'triangle', 0.2); this._tone(1320, 0.12, 'triangle', 0.15, 0.07); },
  stomp()     { this._tone(140, 0.18, 'square', 0.35); },
  death()     { [300, 240, 190, 150, 100].forEach((f, i) => this._tone(f, 0.14, 'sawtooth', 0.25, i * 0.1)); },
  powerup()   { [523, 659, 784, 1047].forEach((f, i) => this._tone(f, 0.15, 'triangle', 0.22, i * 0.1)); },
  brick()     { this._tone(200, 0.1, 'square', 0.3); this._tone(140, 0.18, 'sawtooth', 0.2, 0.05); },
  lvlDone()   { [523, 659, 784, 1047, 1319].forEach((f, i) => this._tone(f, 0.22, 'triangle', 0.25, i * 0.12)); },
  pauseSfx()  { this._tone(440, 0.08, 'triangle', 0.15); this._tone(330, 0.12, 'triangle', 0.12, 0.08); },
  resumeSfx() { this._tone(330, 0.08, 'triangle', 0.12); this._tone(440, 0.12, 'triangle', 0.15, 0.08); },
  bossHit()   { this._tone(80, 0.25, 'sawtooth', 0.4); this._tone(160, 0.15, 'square', 0.3, 0.1); },
  bossRoar()  { [100, 80, 60, 50].forEach((f, i) => this._tone(f, 0.2, 'sawtooth', 0.35, i * 0.08)); },

  startBg(lvl = 0) {
    this.stopBg();
    const m = lvl === 0
      ? [523, 0, 659, 0, 784, 659, 523, 440, 392, 0, 440, 523, 659, 0, 784, 0]
      : lvl === 1
      ? [392, 0, 494, 0, 587, 0, 698, 587, 494, 392, 0, 587, 784, 0, 698, 0]
      : [220, 0, 196, 0, 220, 0, 175, 0, 196, 220, 246, 0, 220, 196, 175, 0]; // boss level - ominous
    let i = 0;
    this.bgTimer = setInterval(() => {
      if (!this.muted) this._tone(m[i % m.length], 0.22, 'triangle', 0.07);
      i++;
    }, 285);
  },
  stopBg() { clearInterval(this.bgTimer); this.bgTimer = null; },
};

// ═══════════════════════════════════════════════════════════════
//  WEATHER EFFECTS
// ═══════════════════════════════════════════════════════════════
const WEATHER = {
  // Types: 'none', 'rain', 'storm', 'snow', 'meteor'
  create(scene, type, worldW) {
    if (!type || type === 'none') return null;
    const particles = [];
    const count = type === 'snow' ? 80 : type === 'meteor' ? 18 : 140;
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Phaser.Math.Between(0, GW),
        y: Phaser.Math.Between(-GH, GH),
        speed: type === 'snow'   ? Phaser.Math.FloatBetween(30, 70)
             : type === 'meteor' ? Phaser.Math.FloatBetween(220, 400)
             : Phaser.Math.FloatBetween(200, 380),
        size:  type === 'snow'   ? Phaser.Math.FloatBetween(2, 5)
             : type === 'meteor' ? Phaser.Math.FloatBetween(2, 4)
             : Phaser.Math.FloatBetween(1, 2),
        alpha: Phaser.Math.FloatBetween(0.3, 0.85),
        drift: Phaser.Math.FloatBetween(-20, 20),
        tail:  type === 'meteor' ? Phaser.Math.Between(18, 38) : 0,
      });
    }
    const gfx = scene.add.graphics().setScrollFactor(0).setDepth(200);
    let flashTimer = null;
    if (type === 'storm') {
      flashTimer = scene.time.addEvent({
        delay: Phaser.Math.Between(3000, 7000),
        callback: () => {
          const flash = scene.add.graphics().setScrollFactor(0).setDepth(199);
          flash.fillStyle(0xffffff, 0.18); flash.fillRect(0, 0, GW, GH);
          scene.time.delayedCall(80, () => flash.destroy());
          if (flashTimer) flashTimer.delay = Phaser.Math.Between(2500, 8000);
        },
        loop: true,
      });
    }
    return { gfx, particles, type, flashTimer };
  },

  update(weather, dt) {
    if (!weather) return;
    const { gfx, particles, type } = weather;
    gfx.clear();
    const dtS = dt / 1000;
    particles.forEach(p => {
      if (type === 'snow') {
        p.x += p.drift * dtS;
        p.y += p.speed * dtS;
        if (p.y > GH + 10) { p.y = -10; p.x = Phaser.Math.Between(0, GW); }
        if (p.x > GW) p.x = 0; if (p.x < 0) p.x = GW;
        gfx.fillStyle(0xddeeff, p.alpha);
        gfx.fillCircle(p.x, p.y, p.size);
      } else if (type === 'meteor') {
        p.x += p.speed * dtS;
        p.y += p.speed * 0.55 * dtS;
        if (p.x > GW + 60 || p.y > GH + 60) {
          p.x = Phaser.Math.Between(-60, GW * 0.5);
          p.y = Phaser.Math.Between(-60, 0);
        }
        gfx.lineStyle(p.size, 0xffaa44, p.alpha * 0.5);
        gfx.beginPath();
        gfx.moveTo(p.x - p.tail, p.y - p.tail * 0.55);
        gfx.lineTo(p.x, p.y);
        gfx.strokePath();
        gfx.fillStyle(0xffdd88, p.alpha);
        gfx.fillCircle(p.x, p.y, p.size + 1);
      } else {
        // rain / storm
        p.x -= (type === 'storm' ? 60 : 20) * dtS;
        p.y += p.speed * dtS;
        if (p.y > GH + 10) { p.y = Phaser.Math.Between(-40, 0); p.x = Phaser.Math.Between(0, GW); }
        if (p.x < -10) p.x = GW;
        const col = type === 'storm' ? 0x99ccff : 0xaaddff;
        gfx.lineStyle(p.size, col, p.alpha);
        gfx.beginPath();
        gfx.moveTo(p.x, p.y);
        gfx.lineTo(p.x + (type === 'storm' ? -6 : -2), p.y + 12);
        gfx.strokePath();
      }
    });
  },

  destroy(weather) {
    if (!weather) return;
    if (weather.flashTimer) weather.flashTimer.remove();
    weather.gfx.destroy();
  }
};

// ═══════════════════════════════════════════════════════════════
//  LEVEL DATA
// ═══════════════════════════════════════════════════════════════
const LEVELS = [
  {
    // ── LEVEL 1 — Plaine (pluie légère) ──────────────────────
    worldW: 4200, timeLimit: 120,
    bg1: 0x1a1a4e, bg2: 0x0d3b6e,
    groundY: GH - T,
    grounds: [[0, 2000], [2100, 2600], [2800, 3400], [3500, 4200]],
    platforms: [
      { x: 300, y: 280, w: 4 }, { x: 520, y: 220, w: 3 }, { x: 720, y: 170, w: 4 },
      { x: 950, y: 250, w: 3 }, { x: 1150, y: 190, w: 4 }, { x: 1350, y: 280, w: 3 },
      { x: 1550, y: 210, w: 5 }, { x: 1850, y: 260, w: 3 }, { x: 2200, y: 200, w: 4 },
      { x: 2480, y: 155, w: 3 }, { x: 2700, y: 210, w: 4 }, { x: 2950, y: 175, w: 3 },
      { x: 3100, y: 255, w: 4 }, { x: 3400, y: 200, w: 3 }, { x: 3700, y: 160, w: 4 },
    ],
    movingPlatforms: [
      { x: 620, y: 255, w: 3, dx: 70, type: 'h' },
      { x: 1250, y: 225, w: 3, dy: 60, type: 'v' },
      { x: 2350, y: 215, w: 3, dx: 90, type: 'h' },
      { x: 3200, y: 200, w: 3, dy: 55, type: 'v' },
    ],
    bricks: [
      { x: 360, y: 240 }, { x: 392, y: 240 }, { x: 770, y: 200 }, { x: 1140, y: 240 },
      { x: 1570, y: 165 }, { x: 2720, y: 175 }, { x: 3120, y: 215 },
    ],
    itemBlocks: [
      { x: 424, y: 240, item: 'coin' }, { x: 802, y: 200, item: 'speed' },
      { x: 1602, y: 165, item: 'jump' }, { x: 2752, y: 175, item: 'invincible' },
      { x: 3152, y: 215, item: 'coin' },
    ],
    coins: [
      [300, 255, 5, T], [700, 140, 4, T], [1100, 160, 5, T],
      [1550, 175, 5, T], [2200, 170, 4, T], [2700, 180, 4, T],
      [3100, 225, 5, T], [3700, 130, 4, T],
    ],
    spikes: [
      { x: 2050, y: GH - T - 20, n: 3 }, { x: 2650, y: GH - T - 20, n: 2 }, { x: 3450, y: GH - T - 20, n: 3 },
    ],
    enemies: [
      { t: 'g', x: 500, y: GH - 80 }, { t: 'g', x: 820, y: GH - 80 }, { t: 'g', x: 1200, y: GH - 80 },
      { t: 'g', x: 1600, y: 160 }, { t: 'g', x: 2350, y: GH - 80 }, { t: 'g', x: 2850, y: GH - 80 },
      { t: 'k', x: 1010, y: GH - 80 }, { t: 'k', x: 1900, y: GH - 80 },
      { t: 'k', x: 3250, y: GH - 80 }, { t: 'k', x: 3650, y: GH - 80 },
    ],
    flagX: 4050,
    weather: 'rain',
    hasBoss: true,
  },
  {
    // ── LEVEL 2 — Monde violet (tempête) ─────────────────────
    worldW: 5200, timeLimit: 90,
    bg1: 0x1b0030, bg2: 0x3d0060,
    groundY: GH - T,
    grounds: [[0, 1600], [1800, 2300], [2500, 3100], [3300, 3900], [4100, 5200]],
    platforms: [
      { x: 200, y: 280, w: 3 }, { x: 420, y: 220, w: 3 }, { x: 620, y: 165, w: 3 },
      { x: 830, y: 280, w: 3 }, { x: 1050, y: 205, w: 3 }, { x: 1260, y: 255, w: 4 },
      { x: 1450, y: 178, w: 3 }, { x: 1900, y: 215, w: 4 }, { x: 2100, y: 165, w: 3 },
      { x: 2310, y: 280, w: 3 }, { x: 2700, y: 195, w: 3 }, { x: 2910, y: 250, w: 4 },
      { x: 3100, y: 175, w: 3 }, { x: 3420, y: 250, w: 3 }, { x: 3620, y: 175, w: 4 },
      { x: 3830, y: 250, w: 3 }, { x: 4200, y: 200, w: 3 }, { x: 4450, y: 155, w: 4 },
      { x: 4710, y: 215, w: 3 }, { x: 4920, y: 165, w: 3 },
    ],
    movingPlatforms: [
      { x: 520, y: 235, w: 3, dx: 90, type: 'h' },
      { x: 1150, y: 205, w: 3, dy: 75, type: 'v' },
      { x: 1700, y: 245, w: 3, dx: 110, type: 'h' },
      { x: 2600, y: 225, w: 3, dy: 65, type: 'v' },
      { x: 3510, y: 205, w: 3, dx: 100, type: 'h' },
      { x: 4350, y: 190, w: 3, dy: 85, type: 'v' },
    ],
    bricks: [
      { x: 270, y: 240 }, { x: 670, y: 200 }, { x: 1100, y: 215 },
      { x: 1490, y: 195 }, { x: 2750, y: 165 }, { x: 3140, y: 195 }, { x: 4240, y: 165 },
    ],
    itemBlocks: [
      { x: 302, y: 240, item: 'coin' }, { x: 702, y: 200, item: 'invincible' },
      { x: 1132, y: 215, item: 'speed' }, { x: 1522, y: 195, item: 'jump' },
      { x: 2782, y: 165, item: 'coin' }, { x: 4272, y: 165, item: 'speed' },
    ],
    coins: [
      [200, 250, 4, T], [620, 138, 4, T], [1050, 168, 4, T],
      [1450, 148, 5, T], [1900, 185, 4, T], [2700, 165, 4, T],
      [3100, 145, 5, T], [4450, 125, 4, T], [4710, 185, 4, T],
    ],
    spikes: [
      { x: 1660, y: GH - T - 20, n: 4 }, { x: 2360, y: GH - T - 20, n: 3 },
      { x: 3160, y: GH - T - 20, n: 4 }, { x: 3960, y: GH - T - 20, n: 3 },
    ],
    enemies: [
      { t: 'g', x: 430, y: GH - 80 }, { t: 'g', x: 740, y: GH - 80 }, { t: 'g', x: 1060, y: GH - 80 },
      { t: 'g', x: 1350, y: 155 }, { t: 'g', x: 2000, y: GH - 80 }, { t: 'g', x: 2820, y: GH - 80 },
      { t: 'g', x: 3220, y: GH - 80 }, { t: 'g', x: 4570, y: GH - 80 }, { t: 'g', x: 4800, y: 155 },
      { t: 'k', x: 650, y: GH - 80 }, { t: 'k', x: 1170, y: GH - 80 }, { t: 'k', x: 1610, y: GH - 80 },
      { t: 'k', x: 2420, y: GH - 80 }, { t: 'k', x: 3040, y: GH - 80 }, { t: 'k', x: 3640, y: GH - 80 },
      { t: 'k', x: 4910, y: GH - 80 },
    ],
    flagX: 5060,
    weather: 'storm',
    hasBoss: true,
  },
  {
    // ── LEVEL 3 — Monde des étoiles (météores) + BOSS ────────
    worldW: 4800, timeLimit: 100,
    bg1: 0x0a001a, bg2: 0x1a0040,
    groundY: GH - T,
    grounds: [[0, 1200], [1400, 2000], [2200, 2800], [3000, 3600], [3800, 4800]],
    platforms: [
      { x: 200, y: 270, w: 3 }, { x: 420, y: 210, w: 3 }, { x: 650, y: 160, w: 4 },
      { x: 900, y: 240, w: 3 }, { x: 1100, y: 180, w: 3 }, { x: 1450, y: 260, w: 4 },
      { x: 1700, y: 200, w: 3 }, { x: 1950, y: 155, w: 4 }, { x: 2250, y: 210, w: 3 },
      { x: 2500, y: 170, w: 4 }, { x: 2750, y: 240, w: 3 }, { x: 3050, y: 165, w: 3 },
      { x: 3300, y: 230, w: 4 }, { x: 3550, y: 175, w: 3 }, { x: 3850, y: 150, w: 5 },
      { x: 4100, y: 230, w: 3 }, { x: 4350, y: 175, w: 3 },
    ],
    movingPlatforms: [
      { x: 530, y: 220, w: 3, dx: 100, type: 'h' },
      { x: 1300, y: 200, w: 3, dy: 70, type: 'v' },
      { x: 2100, y: 220, w: 3, dx: 90, type: 'h' },
      { x: 2850, y: 195, w: 3, dy: 80, type: 'v' },
      { x: 3650, y: 200, w: 3, dx: 95, type: 'h' },
      { x: 4200, y: 180, w: 3, dy: 65, type: 'v' },
    ],
    bricks: [
      { x: 240, y: 230 }, { x: 690, y: 195 }, { x: 1140, y: 215 },
      { x: 1740, y: 170 }, { x: 2540, y: 145 }, { x: 3090, y: 180 }, { x: 4140, y: 200 },
    ],
    itemBlocks: [
      { x: 272, y: 230, item: 'invincible' }, { x: 722, y: 195, item: 'speed' },
      { x: 1172, y: 215, item: 'jump' }, { x: 1772, y: 170, item: 'coin' },
      { x: 2572, y: 145, item: 'invincible' }, { x: 4172, y: 200, item: 'speed' },
    ],
    coins: [
      [200, 240, 5, T], [650, 130, 4, T], [1100, 150, 5, T],
      [1700, 170, 4, T], [2250, 180, 5, T], [2750, 140, 4, T],
      [3300, 200, 5, T], [3850, 120, 6, T], [4350, 145, 4, T],
    ],
    spikes: [
      { x: 1250, y: GH - T - 20, n: 4 }, { x: 2050, y: GH - T - 20, n: 3 },
      { x: 2850, y: GH - T - 20, n: 4 }, { x: 3650, y: GH - T - 20, n: 3 },
    ],
    enemies: [
      { t: 'g', x: 450, y: GH - 80 }, { t: 'g', x: 780, y: GH - 80 }, { t: 'g', x: 1150, y: GH - 80 },
      { t: 'g', x: 1500, y: 178 }, { t: 'g', x: 2300, y: GH - 80 }, { t: 'g', x: 2650, y: GH - 80 },
      { t: 'g', x: 3100, y: GH - 80 }, { t: 'g', x: 3500, y: 155 }, { t: 'g', x: 4000, y: GH - 80 },
      { t: 'k', x: 600, y: GH - 80 }, { t: 'k', x: 1050, y: GH - 80 }, { t: 'k', x: 1800, y: GH - 80 },
      { t: 'k', x: 2500, y: GH - 80 }, { t: 'k', x: 3200, y: GH - 80 }, { t: 'k', x: 3800, y: GH - 80 },
      { t: 'k', x: 4400, y: GH - 80 },
    ],
    flagX: 4650,
    weather: 'meteor',
    hasBoss: true,
    bossHp: 7,
  },
];

// ═══════════════════════════════════════════════════════════════
//  TEXTURE FACTORY
// ═══════════════════════════════════════════════════════════════
function makeTex(scene, key, w, h, fn) {
  if (scene.textures.exists(key)) return;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  fn(cv.getContext('2d'));
  scene.textures.addCanvas(key, cv);
}

function buildAllTextures(scene) {
  // ── Player ─────────────────────────────────────────────────
  makeTex(scene, 'p_idle', 28, 52, c => {
    c.fillStyle = '#FFB300'; c.fillRect(0, 26, 28, 22); c.fillRect(2, 4, 24, 22);
    c.fillStyle = '#c62828'; c.fillRect(0, 0, 28, 7); c.fillRect(5, -6, 18, 8);
    c.fillStyle = '#000';    c.fillRect(16, 9, 6, 6);
    c.fillStyle = '#e65100'; c.fillRect(11, 18, 7, 4);
    c.fillStyle = '#1565c0'; c.fillRect(0, 26, 28, 12);
    c.fillStyle = '#FFB300'; c.fillRect(2, 38, 10, 10); c.fillRect(16, 38, 10, 10);
    c.fillStyle = '#4a2500'; c.fillRect(0, 46, 13, 6); c.fillRect(15, 46, 13, 6);
  });
  makeTex(scene, 'p_run', 28, 52, c => {
    c.fillStyle = '#FFB300'; c.fillRect(0, 26, 28, 22); c.fillRect(2, 4, 24, 22);
    c.fillStyle = '#c62828'; c.fillRect(0, 0, 28, 7); c.fillRect(5, -6, 18, 8);
    c.fillStyle = '#000';    c.fillRect(16, 9, 6, 6);
    c.fillStyle = '#e65100'; c.fillRect(11, 18, 7, 4);
    c.fillStyle = '#1565c0'; c.fillRect(0, 26, 28, 12);
    c.fillStyle = '#FFB300'; c.fillRect(2, 38, 10, 14); c.fillRect(16, 38, 10, 6); c.fillRect(20, 44, 8, 8);
    c.fillStyle = '#4a2500'; c.fillRect(0, 48, 13, 4); c.fillRect(17, 48, 13, 4);
  });
  makeTex(scene, 'p_jump', 28, 52, c => {
    c.fillStyle = '#FFB300'; c.fillRect(0, 26, 28, 18); c.fillRect(2, 4, 24, 22);
    c.fillStyle = '#c62828'; c.fillRect(0, 0, 28, 7); c.fillRect(5, -6, 18, 8);
    c.fillStyle = '#000';    c.fillRect(16, 9, 6, 6);
    c.fillStyle = '#e65100'; c.fillRect(11, 18, 7, 4);
    c.fillStyle = '#1565c0'; c.fillRect(0, 26, 28, 12);
    c.fillStyle = '#FFB300'; c.fillRect(-4, 28, 6, 14); c.fillRect(26, 28, 6, 14);
    c.fillRect(2, 38, 10, 8); c.fillRect(10, 44, 6, 8); c.fillRect(16, 38, 10, 8); c.fillRect(16, 44, 8, 8);
    c.fillStyle = '#4a2500'; c.fillRect(8, 48, 14, 4); c.fillRect(14, 48, 14, 4);
  });
  makeTex(scene, 'p_star', 28, 52, c => {
    c.fillStyle = '#FFD700'; c.fillRect(0, 0, 28, 52);
    c.fillStyle = '#fff176'; c.fillRect(4, 4, 20, 44);
    c.fillStyle = '#fff'; c.fillRect(8, 8, 12, 12); c.fillRect(4, 30, 6, 6); c.fillRect(18, 20, 6, 6);
  });

  // ── Enemies ────────────────────────────────────────────────
  const goomba = (c, legL) => {
    c.fillStyle = '#795548';
    c.beginPath(); c.arc(16, 18, 13, 0, Math.PI * 2); c.fill();
    c.fillRect(3, 18, 26, 14);
    c.fillStyle = '#ffccbc'; c.fillRect(6, 9, 20, 13);
    c.fillStyle = '#fff'; c.fillRect(7, 10, 8, 7); c.fillRect(17, 10, 8, 7);
    c.fillStyle = '#000'; c.fillRect(9, 12, 4, 4); c.fillRect(19, 12, 4, 4);
    c.fillStyle = '#3e2723'; c.fillRect(7, 8, 9, 3); c.fillRect(17, 8, 9, 3);
    c.fillStyle = '#4a2500';
    if (legL) { c.fillRect(1, 28, 13, 6); c.fillRect(19, 32, 11, 2); }
    else       { c.fillRect(3, 30, 12, 4); c.fillRect(17, 30, 12, 4); }
  };
  makeTex(scene, 'goomba',   32, 34, c => goomba(c, false));
  makeTex(scene, 'goomba_w', 32, 34, c => goomba(c, true));

  const koopa = (c, legL) => {
    c.fillStyle = '#388e3c';
    c.beginPath(); c.arc(15, 22, 13, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#1b5e20'; c.fillRect(8, 15, 14, 15);
    c.fillStyle = '#66bb6a'; c.fillRect(10, 17, 10, 3); c.fillRect(10, 22, 10, 3);
    c.fillStyle = '#f9a825'; c.fillRect(6, 3, 18, 16);
    c.beginPath(); c.arc(15, 3, 9, Math.PI, 0); c.fill();
    c.fillStyle = '#fff'; c.fillRect(8, 5, 7, 6); c.fillRect(15, 5, 7, 6);
    c.fillStyle = '#f00'; c.fillRect(10, 7, 3, 3); c.fillRect(17, 7, 3, 3);
    c.fillStyle = '#f9a825';
    if (legL) { c.fillRect(1, 32, 12, 8); c.fillRect(19, 34, 10, 6); }
    else       { c.fillRect(3, 32, 10, 8); c.fillRect(17, 32, 10, 8); }
  };
  makeTex(scene, 'koopa',   30, 40, c => koopa(c, false));
  makeTex(scene, 'koopa_w', 30, 40, c => koopa(c, true));

  // ── Tiles ──────────────────────────────────────────────────
  makeTex(scene, 'ground', T, T, c => {
    c.fillStyle = '#4caf50'; c.fillRect(0, 0, T, 8);
    c.fillStyle = '#3b2a1a'; c.fillRect(0, 8, T, T - 8);
    c.fillStyle = '#2e7d32'; for (let i = 0; i < T; i += 8) c.fillRect(i, 1, 6, 5);
    c.strokeStyle = '#5d4037'; c.lineWidth = 1; c.strokeRect(0.5, 8.5, T - 1, T - 9);
  });
  makeTex(scene, 'plat', T, 16, c => {
    c.fillStyle = '#4caf50'; c.fillRect(0, 0, T, 6);
    c.fillStyle = '#5d4037'; c.fillRect(0, 6, T, 10);
    c.fillStyle = '#2e7d32'; c.fillRect(4, 1, 4, 4); c.fillRect(18, 1, 4, 4);
  });
  makeTex(scene, 'mplat', T, 16, c => {
    c.fillStyle = '#f57c00'; c.fillRect(0, 0, T, 6);
    c.fillStyle = '#4e342e'; c.fillRect(0, 6, T, 10);
    c.fillStyle = '#ff8f00'; c.fillRect(4, 1, 4, 4); c.fillRect(18, 1, 4, 4);
  });
  makeTex(scene, 'brick', T, T, c => {
    c.fillStyle = '#8d6e63'; c.fillRect(0, 0, T, T);
    c.strokeStyle = '#6d4c41'; c.lineWidth = 2;
    c.strokeRect(1, 1, T - 2, 14); c.strokeRect(1, 17, 14, 14); c.strokeRect(17, 17, 14, 14);
    c.fillStyle = '#a1887f44'; c.fillRect(2, 2, T - 4, 4);
  });
  makeTex(scene, 'qblock', T, T, c => {
    c.fillStyle = '#F57F17'; c.fillRect(0, 0, T, T);
    c.strokeStyle = '#E65100'; c.lineWidth = 2; c.strokeRect(1, 1, T - 2, T - 2);
    c.fillStyle = '#fff'; c.fillRect(4, 4, T - 8, T - 8);
    c.fillStyle = '#F57F17'; c.font = 'bold 18px Courier New'; c.textAlign = 'center';
    c.fillText('?', T / 2, T - 5);
  });
  makeTex(scene, 'qused', T, T, c => {
    c.fillStyle = '#6d4c41'; c.fillRect(0, 0, T, T);
    c.strokeStyle = '#4e342e'; c.lineWidth = 2; c.strokeRect(1, 1, T - 2, T - 2);
    c.fillStyle = '#8d6e63'; c.fillRect(4, 4, T - 8, T - 8);
  });

  // ── Items ──────────────────────────────────────────────────
  makeTex(scene, 'coin', 20, 20, c => {
    c.fillStyle = '#FFD700'; c.beginPath(); c.arc(10, 10, 9, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#FFF59D'; c.beginPath(); c.arc(7, 7, 4, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#F57F17'; c.lineWidth = 2; c.beginPath(); c.arc(10, 10, 8, 0, Math.PI * 2); c.stroke();
  });
  makeTex(scene, 'pu_spd', 24, 24, c => {
    c.fillStyle = '#e53935'; c.beginPath(); c.arc(12, 12, 11, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fff'; c.font = 'bold 14px Arial'; c.textAlign = 'center'; c.fillText('⚡', 12, 17);
  });
  makeTex(scene, 'pu_jmp', 24, 24, c => {
    c.fillStyle = '#1e88e5'; c.beginPath(); c.arc(12, 12, 11, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fff'; c.font = 'bold 16px Arial'; c.textAlign = 'center'; c.fillText('↑', 12, 17);
  });
  makeTex(scene, 'pu_inv', 24, 24, c => {
    c.fillStyle = '#f9a825'; c.beginPath(); c.arc(12, 12, 11, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fff'; c.font = 'bold 14px Arial'; c.textAlign = 'center'; c.fillText('★', 12, 17);
  });

  // ── Environment ────────────────────────────────────────────
  makeTex(scene, 'spike', 16, 22, c => {
    c.fillStyle = '#9e9e9e'; c.beginPath(); c.moveTo(0, 22); c.lineTo(8, 0); c.lineTo(16, 22); c.fill();
    c.fillStyle = '#e0e0e0'; c.beginPath(); c.moveTo(5, 22); c.lineTo(8, 8); c.lineTo(11, 22); c.fill();
  });
  makeTex(scene, 'flagpole', 8, 160, c => {
    c.fillStyle = '#bdbdbd'; c.fillRect(2, 0, 4, 160);
    c.fillStyle = '#9e9e9e'; c.fillRect(0, 0, 8, 6);
  });
  makeTex(scene, 'flagbanner', 40, 28, c => {
    c.fillStyle = '#f44336'; c.fillRect(0, 0, 40, 28);
    c.fillStyle = '#fff'; c.fillRect(8, 6, 24, 16);
    c.fillStyle = '#f44336'; c.fillRect(16, 10, 8, 8);
  });
  makeTex(scene, 'cloud', 80, 38, c => {
    c.fillStyle = 'rgba(255,255,255,0.13)';
    c.beginPath(); c.arc(20, 28, 17, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(40, 20, 22, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(62, 28, 15, 0, Math.PI * 2); c.fill();
  });
  makeTex(scene, 'mountain', 100, 90, c => {
    c.fillStyle = 'rgba(70,50,110,0.4)';
    c.beginPath(); c.moveTo(0, 90); c.lineTo(50, 0); c.lineTo(100, 90); c.fill();
  });
  makeTex(scene, 'particle', 8, 8, c => {
    const g = c.createRadialGradient(4, 4, 0, 4, 4, 4);
    g.addColorStop(0, '#FFD700'); g.addColorStop(1, 'rgba(255,215,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, 8, 8);
  });
}

// ═══════════════════════════════════════════════════════════════
//  SCENE: MENU
// ═══════════════════════════════════════════════════════════════
class MenuScene extends Phaser.Scene {
  constructor() { super({ key: 'MenuScene' }); }

  create() {
    SFX.init(); SFX.startBg(0);
    buildAllTextures(this);

    const bg = this.add.graphics();
    bg.fillGradientStyle(0x1a1a4e, 0x1a1a4e, 0x0a0a2a, 0x0a0a2a, 1);
    bg.fillRect(0, 0, GW, GH);

    for (let i = 0; i < 90; i++) {
      this.add.circle(Phaser.Math.Between(0, GW), Phaser.Math.Between(0, GH),
        Phaser.Math.FloatBetween(0.5, 2), 0xfff9c4, Phaser.Math.FloatBetween(0.3, 1));
    }

    this.add.text(GW / 2, 88, 'MEGA BRO', {
      fontSize: '72px', fontFamily: 'Courier New', fontStyle: 'bold',
      color: '#FFD700', stroke: '#FF4500', strokeThickness: 8,
      shadow: { offsetX: 5, offsetY: 5, color: '#8B0000', blur: 0, fill: true }
    }).setOrigin(0.5);

    this.add.text(GW / 2, 168, '✦  SUPER PLATFORMER  ✦', {
      fontSize: '18px', fontFamily: 'Courier New', color: '#aaddff'
    }).setOrigin(0.5);

    const best = localStorage.getItem('megabro_best') || 0;
    this.add.text(GW / 2, 205, `🏆 Meilleur score : ${best}`, {
      fontSize: '15px', fontFamily: 'Courier New', color: '#FFD700'
    }).setOrigin(0.5);

    this._btn(GW / 2, 268, '▶  JOUER', 0x1565c0, 0x42a5f5, () => {
      SFX.stopBg();
      this.cameras.main.fadeOut(400);
      this.time.delayedCall(400, () => this.scene.start('GameScene', { level: 0, score: 0, lives: 3 }));
    });

    [
      '← → / A D : Déplacer',
      '↑ / W / ESPACE : Sauter  (double saut possible !)',
      'ÉCHAP / P : Pause',
      'Sauter sur ennemis : +200 pts',
      'Frapper les blocs ? par dessous',
      '★ Invincible  ⚡ Vitesse  ↑ Super saut',
      '☠ Niveau 3 : BOSS à vaincre avant le drapeau !',
    ].forEach((l, i) => this.add.text(GW / 2, 322 + i * 22, l, {
      fontSize: '12px', fontFamily: 'Courier New', color: i === 6 ? '#ff8888' : '#cccccc'
    }).setOrigin(0.5));

    this.cameras.main.fadeIn(600);
  }

  _btn(x, y, label, col, hov, cb) {
    const g = this.add.graphics();
    const draw = c => {
      g.clear();
      g.fillStyle(c, 1); g.fillRoundedRect(x - 115, y - 26, 230, 52, 12);
      g.lineStyle(3, 0xffffff, 0.25); g.strokeRoundedRect(x - 115, y - 26, 230, 52, 12);
    };
    draw(col);
    g.setInteractive(new Phaser.Geom.Rectangle(x - 115, y - 26, 230, 52), Phaser.Geom.Rectangle.Contains);
    g.on('pointerover', () => draw(hov)).on('pointerout', () => draw(col)).on('pointerdown', cb);
    this.add.text(x, y, label, { fontSize: '22px', fontFamily: 'Courier New', fontStyle: 'bold', color: '#fff' }).setOrigin(0.5);
  }
}

// ═══════════════════════════════════════════════════════════════
//  SCENE: LEVEL INTRO
// ═══════════════════════════════════════════════════════════════
class LevelIntroScene extends Phaser.Scene {
  constructor() { super({ key: 'LevelIntroScene' }); }
  create(data) {
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 1); bg.fillRect(0, 0, GW, GH);

    this.add.text(GW / 2, GH / 2 - 70, `NIVEAU ${data.level + 1}`, {
      fontSize: '64px', fontFamily: 'Courier New', fontStyle: 'bold',
      color: '#FFD700', stroke: '#FF4500', strokeThickness: 7
    }).setOrigin(0.5);

    const msgs = [
      'Bonne chance !',
      '⚡ Difficulté accrue !',
      '☠ Affronte le BOSS pour terminer !',
    ];
    this.add.text(GW / 2, GH / 2 + 10, msgs[data.level] || 'Bonne chance !',
      { fontSize: '26px', fontFamily: 'Courier New', color: '#fff' }).setOrigin(0.5);
    this.add.text(GW / 2, GH / 2 + 55, `Score : ${data.score}    ❤️ : ${data.lives}`, {
      fontSize: '18px', fontFamily: 'Courier New', color: '#aaddff'
    }).setOrigin(0.5);

    const weatherIcons = { none: '', rain: '🌧', storm: '⛈', snow: '❄️', meteor: '☄️' };
    const wType = LEVELS[data.level]?.weather || 'none';
    if (wType !== 'none') {
      this.add.text(GW / 2, GH / 2 + 90, `Météo : ${weatherIcons[wType]}`, {
        fontSize: '16px', fontFamily: 'Courier New', color: '#aaddff'
      }).setOrigin(0.5);
    }

    this.time.delayedCall(2600, () => {
      this.cameras.main.fadeOut(450);
      this.time.delayedCall(450, () => this.scene.start('GameScene', data));
    });
    this.cameras.main.fadeIn(400);
  }
}

// ═══════════════════════════════════════════════════════════════
//  SCENE: PAUSE
// ═══════════════════════════════════════════════════════════════
class PauseScene extends Phaser.Scene {
  constructor() { super({ key: 'PauseScene' }); }

  create(data) {
    this._parentData = data;

    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.72);
    overlay.fillRect(0, 0, GW, GH);

    const panelW = 360, panelH = 330;
    const px = GW / 2 - panelW / 2, py = GH / 2 - panelH / 2;
    const panel = this.add.graphics();
    panel.fillStyle(0x0d0d2e, 0.97);
    panel.fillRoundedRect(px, py, panelW, panelH, 18);
    panel.lineStyle(3, 0x4466ff, 0.8);
    panel.strokeRoundedRect(px, py, panelW, panelH, 18);

    this.add.text(GW / 2, py + 42, '⏸  PAUSE', {
      fontSize: '38px', fontFamily: 'Courier New', fontStyle: 'bold',
      color: '#FFD700', stroke: '#000', strokeThickness: 5
    }).setOrigin(0.5);

    const sep = this.add.graphics();
    sep.lineStyle(1.5, 0x4466ff, 0.4);
    sep.lineBetween(px + 30, py + 74, px + panelW - 30, py + 74);

    this.add.text(GW / 2, py + 98,
      `⭐ Score : ${data.score}   ❤️ Vies : ${data.lives}`,
      { fontSize: '14px', fontFamily: 'Courier New', color: '#aaddff' }
    ).setOrigin(0.5);

    const muteLabel = () => SFX.muted ? '🔇  Son : OFF' : '🔊  Son : ON';
    const { txt: muteText } = this._btn(GW / 2, py + 148, muteLabel(), 0x2d4a22, 0x4caf50, () => {
      SFX.muted = !SFX.muted;
      muteText.setText(muteLabel());
    });

    this._btn(GW / 2, py + 208, '▶  Reprendre', 0x1565c0, 0x42a5f5, () => {
      SFX.resumeSfx();
      this.scene.resume('GameScene');
      this.scene.stop();
    });

    this._btn(GW / 2, py + 270, '🏠  Menu principal', 0x6a1b00, 0xd84315, () => {
      SFX.stopBg();
      this.scene.stop('GameScene');
      this.scene.stop();
      this.scene.start('MenuScene');
    });

    this.input.keyboard.on('keydown-ESC', () => {
      SFX.resumeSfx();
      this.scene.resume('GameScene');
      this.scene.stop();
    });
    this.input.keyboard.on('keydown-P', () => {
      SFX.resumeSfx();
      this.scene.resume('GameScene');
      this.scene.stop();
    });

    this.cameras.main.fadeIn(180);
  }

  _btn(x, y, label, col, hov, cb) {
    const w = 280, h = 44;
    const g = this.add.graphics();
    const draw = c => {
      g.clear();
      g.fillStyle(c, 1); g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 10);
      g.lineStyle(2, 0xffffff, 0.2); g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 10);
    };
    draw(col);
    g.setInteractive(new Phaser.Geom.Rectangle(x - w / 2, y - h / 2, w, h), Phaser.Geom.Rectangle.Contains);
    g.on('pointerover', () => draw(hov)).on('pointerout', () => draw(col)).on('pointerdown', cb);
    const txt = this.add.text(x, y, label, {
      fontSize: '17px', fontFamily: 'Courier New', fontStyle: 'bold', color: '#fff'
    }).setOrigin(0.5);
    return { g, txt };
  }
}

// ═══════════════════════════════════════════════════════════════
//  SCENE: GAME (main)
// ═══════════════════════════════════════════════════════════════
class GameScene extends Phaser.Scene {
  constructor() { super({ key: 'GameScene' }); }

  preload() { buildAllTextures(this); }

  create(data) {
    this.li       = data.level || 0;
    this.score    = data.score || 0;
    this.lives    = data.lives !== undefined ? data.lives : 3;
    this.ld       = LEVELS[this.li];

    this.dead     = false;
    this.done     = false;
    this.invinc   = false;
    this.spdBoost = false;
    this.jmpBoost = false;
    this.ptimers  = {};
    this._pjump   = false;
    this._pPause  = false;
    this.paused   = false;

    this.BASE_SPD = 200;
    this.BASE_JMP = -520;

    SFX.resume(); SFX.startBg(this.li);

    this.physics.world.setBounds(0, 0, this.ld.worldW, GH + 200);
    this.cameras.main.setBounds(0, 0, this.ld.worldW, GH);

    this._makeBg();
    this._makeGround();
    this._makePlatforms();
    this._makeMovingPlatforms();
    this._makeBlocks();
    this._makeCoins();
    this._makeSpikes();
    this._makePowerups();
    this._makeEnemies();
    this._makeFlag();
    this._makePlayer();
    this._makeHUD();
    this._setupKeys();
    this._setupCollisions();

    this._weather = WEATHER.create(this, this.ld.weather || 'none', this.ld.worldW);

    this.cameras.main.startFollow(this.player, true, 0.09, 0.09);
    this.cameras.main.fadeIn(500);
  }

  _makeBg() {
    const ld = this.ld;
    const bg = this.add.graphics().setScrollFactor(0);
    bg.fillGradientStyle(ld.bg1, ld.bg1, ld.bg2, ld.bg2, 1);
    bg.fillRect(0, 0, GW, GH);

    const sg = this.add.graphics().setScrollFactor(0.06);
    for (let i = 0; i < 110; i++) {
      sg.fillStyle(0xfff9c4, Phaser.Math.FloatBetween(0.15, 0.9));
      sg.fillCircle(Phaser.Math.Between(0, ld.worldW), Phaser.Math.Between(0, GH * 0.7), Phaser.Math.FloatBetween(0.5, 2));
    }
    for (let i = 0; i < 22; i++)
      this.add.image(i * 240 + 70, GH - 60, 'mountain').setScrollFactor(0.2).setAlpha(0.55).setScale(Phaser.Math.FloatBetween(0.7, 1.4));
    for (let i = 0; i < 35; i++)
      this.add.image(Phaser.Math.Between(0, ld.worldW), Phaser.Math.Between(30, GH * 0.42), 'cloud')
        .setScrollFactor(Phaser.Math.FloatBetween(0.18, 0.45)).setAlpha(0.8);
  }

  _makeGround() {
    this.gGrp = this.physics.add.staticGroup();
    const gy = this.ld.groundY;
    this.ld.grounds.forEach(([s, e]) => {
      for (let x = s; x < e; x += T)
        for (let row = 0; row < 5; row++)
          this.gGrp.create(x + T / 2, gy + row * T, 'ground').setOrigin(0.5, 0.5).refreshBody();
    });
  }

  _makePlatforms() {
    this.platGrp = this.physics.add.staticGroup();
    this.ld.platforms.forEach(({ x, y, w }) => {
      for (let i = 0; i < w; i++)
        this.platGrp.create(x + i * T + T / 2, y, 'plat').setOrigin(0.5, 0.5).refreshBody();
    });
  }

  _makeMovingPlatforms() {
    this.mplatGrp = this.physics.add.group({ immovable: true, allowGravity: false });
    this.ld.movingPlatforms.forEach(({ x, y, w, dx, dy, type }) => {
      const tiles = [];
      for (let i = 0; i < w; i++) {
        const s = this.mplatGrp.create(x + i * T + T / 2, y, 'mplat').setOrigin(0.5, 0.5);
        s.body.allowGravity = false;
        tiles.push(s);
      }
      if (type === 'h') {
        this.tweens.add({ targets: tiles, x: `+=${dx || 70}`, duration: 2000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      } else {
        this.tweens.add({ targets: tiles, y: `+=${dy || 60}`, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      }
    });
  }

  _makeBlocks() {
    this.brickGrp = this.physics.add.staticGroup();
    this.ld.bricks.forEach(({ x, y }) => {
      const b = this.brickGrp.create(x + T / 2, y, 'brick').setOrigin(0.5, 0.5);
      b.refreshBody();
    });

    this.qGrp = this.physics.add.staticGroup();
    this.ld.itemBlocks.forEach(({ x, y, item }) => {
      const b = this.qGrp.create(x + T / 2, y, 'qblock').setOrigin(0.5, 0.5);
      b.item = item; b.used = false;
      b.refreshBody();
    });
  }

  _makeCoins() {
    this.coinGrp = this.physics.add.staticGroup();
    this.ld.coins.forEach(([sx, sy, n, gap]) => {
      for (let i = 0; i < n; i++) {
        const c = this.coinGrp.create(sx + i * gap + 10, sy, 'coin').setOrigin(0.5, 0.5);
        c.refreshBody();
        this.tweens.add({ targets: c, y: sy - 7, duration: 700 + i * 70, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      }
    });
  }

  _makeSpikes() {
    this.spikeGrp = this.physics.add.staticGroup();
    this.ld.spikes.forEach(({ x, y, n }) => {
      for (let i = 0; i < n; i++) {
        const s = this.spikeGrp.create(x + i * 16 + 8, y, 'spike').setOrigin(0.5, 0.5);
        s.setSize(14, 18).refreshBody();
      }
    });
  }

  _makePowerups() {
    this.puGrp = this.physics.add.staticGroup();
  }

  _spawnPU(x, y, type) {
    if (type === 'coin') {
      this._score(100); this._float(x, y - 20, '+100', '#FFD700'); SFX.coin(); return;
    }
    const key = { speed: 'pu_spd', jump: 'pu_jmp', invincible: 'pu_inv' }[type] || 'pu_spd';
    const pu = this.puGrp.create(x, y - T, 'coin').setTexture(key).setOrigin(0.5, 0.5);
    pu.puType = type; pu.refreshBody();
    this.tweens.add({ targets: pu, y: (y - T) - 10, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  _makeEnemies() {
    this.enemyGrp = this.physics.add.group();
    this.ld.enemies.forEach(({ t, x, y }) => {
      const isK = (t === 'k');
      const e = this.enemyGrp.create(x, y, isK ? 'koopa' : 'goomba');
      e.setGravityY(300);
      e.setSize(isK ? 26 : 28, isK ? 36 : 30);
      e.etype = t; e.dir = -1; e.wf = 0; e.wt = 0; e.alive = true;
      e.setVelocityX(isK ? -70 : -60);
    });

    this.boss = null;
    if (this.ld.hasBoss) {
      const bossHp = this.ld.bossHp || 5;
      this.boss = this.physics.add.sprite(this.ld.flagX - 250, this.ld.groundY - 80, 'goomba');
      this.boss.setScale(2.5);
      this.boss.setTint(0xff2200);
      this.boss.setCollideWorldBounds(true);
      this.boss.setGravityY(300);
      this.boss.setSize(28, 34);
      this.boss.hp = bossHp;
      this.boss.maxHp = bossHp;
      this.boss.dir = -1;
      this.boss.wt = 0;
      this.boss.alive = true;
      this.boss.setVelocityX(-110);
      SFX.bossRoar();

      const bx = GW / 2, by = GH - 20;
      this.bossBarBg = this.add.rectangle(bx, by, 300, 16, 0x330000).setScrollFactor(0).setDepth(21);
      this.bossBarFg = this.add.rectangle(bx - 149, by, 298, 12, 0xff2200).setScrollFactor(0).setDepth(22).setOrigin(0, 0.5);
      this.bossLabel = this.add.text(bx, by - 14, '☠ BOSS', {
        fontSize: '13px', fontFamily: 'Courier New', fontStyle: 'bold',
        color: '#ff4444', stroke: '#000', strokeThickness: 3
      }).setScrollFactor(0).setDepth(22).setOrigin(0.5);
    }
  }

  _makeFlag() {
    const fx = this.ld.flagX, gy = this.ld.groundY;
    this.flagPole = this.physics.add.staticImage(fx, gy - 80, 'flagpole').setOrigin(0.5, 1).refreshBody();
    this.flagBnr  = this.physics.add.staticImage(fx, gy - 220, 'flagbanner').setOrigin(0, 0.5).refreshBody();
    this.tweens.add({ targets: this.flagBnr, angle: { from: -2, to: 2 }, duration: 900, yoyo: true, repeat: -1 });
  }

  _makePlayer() {
    this.player = this.physics.add.sprite(80, this.ld.groundY - 60, 'p_idle');
    this.player.setCollideWorldBounds(true);
    this.player.setGravityY(400);
    this.player.setSize(22, 50);
    this.player.setBounce(0.04);
    this.player.wf = 0; this.player.wt = 0;
    this.player.canDoubleJump = true;
  }

  _makeHUD() {
    const s = { fontFamily: 'Courier New', fontSize: '15px', fontStyle: 'bold', color: '#fff', stroke: '#000', strokeThickness: 4 };
    this.hudSc = this.add.text(10, 10, `⭐ ${this.score}`, s).setScrollFactor(0).setDepth(20);
    this.hudLv = this.add.text(10, 30, `❤️  ${this.lives}`, s).setScrollFactor(0).setDepth(20);
    this.hudTm = this.add.text(GW / 2, 10, `⏱ ${this.ld.timeLimit}`, s).setScrollFactor(0).setDepth(20).setOrigin(0.5, 0);
    this.hudNm = this.add.text(GW - 10, 10, `Niveau ${this.li + 1}`, s).setScrollFactor(0).setDepth(20).setOrigin(1, 0);
    this.hudPw = this.add.text(10, 52, '', { ...s, fontSize: '12px', color: '#FFD700' }).setScrollFactor(0).setDepth(20);
    this.hudBs = this.add.text(GW - 10, 28, `Best: ${localStorage.getItem('megabro_best') || 0}`,
      { ...s, fontSize: '12px', color: '#aaddff' }).setScrollFactor(0).setDepth(20).setOrigin(1, 0);

    this.lifeBar   = this.add.rectangle(170, 22, this.lives * 30, 10, 0xff4444).setScrollFactor(0).setDepth(20).setOrigin(0, 0.5);
    this.lifeBarBg = this.add.rectangle(169, 22, 90, 10, 0x550000).setScrollFactor(0).setDepth(19).setOrigin(0, 0.5);

    this.muteBtnHud = this.add.text(GW - 55, 48, SFX.muted ? '🔇' : '🔊', {
      fontSize: '18px', fontFamily: 'Courier New'
    }).setScrollFactor(0).setDepth(20).setInteractive();
    this.muteBtnHud.on('pointerdown', () => {
      SFX.muted = !SFX.muted;
      this.muteBtnHud.setText(SFX.muted ? '🔇' : '🔊');
    });

    const pauseHud = this.add.text(GW / 2 + 120, 10, '⏸ P', {
      fontSize: '13px', fontFamily: 'Courier New', color: 'rgba(255,255,255,0.5)', stroke: '#000', strokeThickness: 3
    }).setScrollFactor(0).setDepth(20).setOrigin(0.5, 0);
    pauseHud.setInteractive();
    pauseHud.on('pointerover', () => pauseHud.setColor('#fff'));
    pauseHud.on('pointerout',  () => pauseHud.setColor('rgba(255,255,255,0.5)'));
    pauseHud.on('pointerdown', () => this._openPause());

    this.timeLeft = this.ld.timeLimit;
    this.timerEv = this.time.addEvent({
      delay: 1000, repeat: this.ld.timeLimit - 1,
      callback: () => {
        if (this.dead || this.done || this.paused) return;
        this.timeLeft--;
        this.hudTm.setText(`⏱ ${this.timeLeft}`);
        if (this.timeLeft <= 10) this.hudTm.setColor('#ff4444');
        if (this.timeLeft <= 0)  this._die();
      }
    });
  }

  _refreshHUD() {
    this.hudSc.setText(`⭐ ${this.score}`);
    this.hudLv.setText(`❤️  ${this.lives}`);
    const best = parseInt(localStorage.getItem('megabro_best') || 0);
    this.hudBs.setText(`Best: ${Math.max(this.score, best)}`);
    if (this.lifeBar) this.lifeBar.width = Math.max(0, this.lives * 30);
  }

  _setupKeys() {
    this.keys    = this.input.keyboard.createCursorKeys();
    this.wasd    = this.input.keyboard.addKeys({ left: 'A', right: 'D', up: 'W', space: Phaser.Input.Keyboard.KeyCodes.SPACE });
    this.pauseKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.pKey     = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.P);
  }

  _setupCollisions() {
    const p = this.player;

    this.physics.add.collider(p, this.gGrp);
    this.physics.add.collider(p, this.platGrp);
    this.physics.add.collider(p, this.mplatGrp);

    this.physics.add.collider(this.enemyGrp, this.gGrp,    (_, e) => this._eFlip(e));
    this.physics.add.collider(this.enemyGrp, this.platGrp, (_, e) => this._eFlip(e));

    this.physics.add.collider(p, this.brickGrp, (player, brick) => {
      if (player.body.blocked.up && player.body.velocity.y < 0) this._breakBrick(brick);
    });

    this.physics.add.collider(p, this.qGrp, (player, block) => {
      if (player.body.blocked.up && player.body.velocity.y < 0 && !block.used)
        this._activateQ(block);
    });

    this.physics.add.overlap(p, this.enemyGrp, (player, enemy) => {
      if (!enemy.alive) return;
      if (this.invinc) { this._killEnemy(enemy); return; }
      if (player.body.velocity.y > 0 && player.body.bottom < enemy.body.top + 16) {
        this._stomp(enemy);
      } else {
        this._die();
      }
    });

    this.physics.add.overlap(p, this.coinGrp, (player, coin) => {
      coin.destroy(); SFX.coin();
      this._score(100); this._float(coin.x, coin.y - 20, '+100', '#FFD700');
    });

    this.physics.add.overlap(p, this.puGrp, (player, pu) => {
      this._applyPU(pu.puType); pu.destroy();
    });

    this.physics.add.overlap(p, this.spikeGrp, () => { if (!this.invinc) this._die(); });

    if (this.boss) {
      this.physics.add.collider(this.boss, this.gGrp);
      this.physics.add.collider(this.boss, this.platGrp);
      this.physics.add.overlap(p, this.boss, (player, boss) => {
        if (!boss.alive || this.dead || this.done) return;
        if (this.invinc) { this._hitBoss(boss); return; }
        if (player.body.velocity.y > 0 && player.body.bottom < boss.body.top + 24) {
          this._hitBoss(boss);
          player.setVelocityY(-380);
        } else {
          this._die();
        }
      });
    }

    this.physics.add.overlap(p, this.flagBnr,  () => this._tryLevelDone());
    this.physics.add.overlap(p, this.flagPole, () => this._tryLevelDone());
  }

  _eFlip(e) {
    if (e.body.blocked.left || e.body.blocked.right) {
      e.dir *= -1;
      e.setVelocityX((e.etype === 'k' ? 70 : 60) * e.dir);
    }
  }

  _breakBrick(brick) {
    SFX.brick();
    this._particles(brick.x, brick.y, 0x8d6e63, 8);
    brick.destroy();
    this._score(50);
  }

  _activateQ(block) {
    block.used = true;
    block.setTexture('qused').refreshBody();
    SFX.powerup();
    this.tweens.add({ targets: block, y: block.y - 9, duration: 90, yoyo: true });
    this._spawnPU(block.x, block.y, block.item);
  }

  _stomp(e) {
    SFX.stomp();
    this._score(200);
    this._float(e.x, e.y - 20, '+200', '#FF5252');
    this._killEnemy(e);
    this.player.setVelocityY(-390);
  }

  _killEnemy(e) {
    e.alive = false; e.setActive(false);
    this.tweens.add({ targets: e, scaleY: 0.05, alpha: 0, y: e.y + 10, duration: 240, onComplete: () => e.destroy() });
    this._particles(e.x, e.y, 0x795548, 6);
  }

  _hitBoss(boss) {
    if (!boss.alive) return;
    SFX.bossHit();
    boss.hp--;
    this._float(boss.x, boss.y - 30, `❤ ${boss.hp}/${boss.maxHp}`, '#ff4444');
    this.cameras.main.shake(120, 0.012);

    boss.setTint(0xffffff);
    this.time.delayedCall(120, () => { if (boss.active) boss.setTint(0xff2200); });

    if (this.bossBarFg) {
      const ratio = Math.max(0, boss.hp / boss.maxHp);
      this.bossBarFg.width = Math.round(298 * ratio);
    }

    if (boss.hp <= 0) {
      boss.alive = false;
      this._score(2000);
      this._float(boss.x, boss.y - 50, '⭐ +2000 BOSS !', '#FFD700');
      this._particles(boss.x, boss.y, 0xff2200, 20);
      this.tweens.add({
        targets: boss, scaleY: 0.05, alpha: 0, y: boss.y + 20,
        duration: 400, onComplete: () => {
          boss.destroy();
          if (this.bossBarBg) this.bossBarBg.destroy();
          if (this.bossBarFg) this.bossBarFg.destroy();
          if (this.bossLabel) this.bossLabel.destroy();
          this._float(this.player.x, this.player.y - 60, '🏁 AU DRAPEAU !', '#FFD700');
        }
      });
    }
  }

  _applyPU(type) {
    SFX.powerup();
    this._float(this.player.x, this.player.y - 30, type.toUpperCase() + '!', '#FFD700');
    if (this.ptimers[type]) this.ptimers[type].remove();
    const dur = 8000;
    const msgMap = { speed: '⚡ VITESSE', jump: '↑ SUPER SAUT', invincible: '★ INVINCIBLE' };

    if (type === 'speed') {
      this.spdBoost = true;
      this.hudPw.setText(msgMap.speed);
      this.ptimers.speed = this.time.delayedCall(dur, () => { this.spdBoost = false; this.hudPw.setText(''); });
    } else if (type === 'jump') {
      this.jmpBoost = true;
      this.hudPw.setText(msgMap.jump);
      this.ptimers.jump = this.time.delayedCall(dur, () => { this.jmpBoost = false; this.hudPw.setText(''); });
    } else if (type === 'invincible') {
      this.invinc = true;
      this.hudPw.setText(msgMap.invincible);
      if (this._invTw) this._invTw.stop();
      this._invTw = this.tweens.add({ targets: this.player, alpha: 0.35, duration: 180, yoyo: true, repeat: -1 });
      this.ptimers.invincible = this.time.delayedCall(dur, () => {
        this.invinc = false;
        if (this._invTw) { this._invTw.stop(); }
        this.player.setAlpha(1);
        this.hudPw.setText('');
      });
    }
    this._score(500);
  }

  _openPause() {
    if (this.dead || this.done || this.paused) return;
    this.paused = true;
    SFX.pauseSfx();
    this.scene.pause();
    this.scene.launch('PauseScene', { score: this.score, lives: this.lives, level: this.li });
    this.scene.get('PauseScene').events.once('shutdown', () => { this.paused = false; });
  }

  _die() {
    if (this.dead || this.done || this.invinc) return;
    this.dead = true;
    this.lives--;
    SFX.death();
    this.timerEv.remove();
    WEATHER.destroy(this._weather); this._weather = null;
    this.cameras.main.shake(400, 0.02);
    this.cameras.main.flash(300, 180, 0, 0);
    this.player.setTint(0xff0000);
    this.player.setVelocityY(-380);
    this._saveBest();

    this.time.delayedCall(1100, () => {
      SFX.stopBg();
      this.cameras.main.fadeOut(500);
      this.time.delayedCall(500, () => {
        if (this.lives <= 0) {
          this.scene.start('GameOverScene', { score: this.score, level: this.li });
        } else {
          this.scene.start('GameScene', { level: this.li, score: this.score, lives: this.lives });
        }
      });
    });
  }

  _tryLevelDone() {
    if (this.ld.hasBoss && this.boss && this.boss.alive) {
      this._float(this.player.x, this.player.y - 40, '☠ Vaincs le BOSS !', '#ff4444');
      return;
    }
    this._levelDone();
  }

  _levelDone() {
    if (this.done || this.dead) return;
    this.done = true;
    SFX.lvlDone();
    this.timerEv.remove();
    WEATHER.destroy(this._weather); this._weather = null;

    const bonus = 1000 + this.timeLeft * 50;
    this._score(bonus);
    this._float(this.player.x, this.player.y - 50, `+${bonus}!`, '#FFD700');

    this.player.body.enable = false;
    this.tweens.add({ targets: this.player, y: this.player.y - 80, duration: 500, ease: 'Back.easeOut' });
    this._saveBest();

    this.time.delayedCall(2200, () => {
      SFX.stopBg();
      this.cameras.main.fadeOut(600);
      const next = this.li + 1;
      this.time.delayedCall(600, () => {
        if (next < LEVELS.length)
          this.scene.start('LevelIntroScene', { level: next, score: this.score, lives: this.lives });
        else
          this.scene.start('WinScene', { score: this.score });
      });
    });
  }

  _score(n) {
    this.score += n;
    this._refreshHUD();
  }

  _saveBest() {
    const b = parseInt(localStorage.getItem('megabro_best') || 0);
    if (this.score > b) localStorage.setItem('megabro_best', this.score);
  }

  _float(x, y, msg, col = '#FFD700') {
    const t = this.add.text(x, y, msg, {
      fontSize: '18px', fontFamily: 'Courier New', fontStyle: 'bold',
      color: col, stroke: '#000', strokeThickness: 3
    }).setOrigin(0.5).setDepth(15);
    this.tweens.add({ targets: t, y: y - 55, alpha: 0, duration: 950, ease: 'Power1', onComplete: () => t.destroy() });
  }

  _particles(x, y, color, n) {
    const em = this.add.particles(x, y, 'particle', {
      speed: { min: 60, max: 200 }, angle: { min: 0, max: 360 },
      scale: { start: 1, end: 0 }, alpha: { start: 1, end: 0 },
      lifespan: { min: 300, max: 600 }, gravityY: 300,
      quantity: n, tint: color
    });
    this.time.delayedCall(700, () => em.destroy());
  }

  update(_t, dt) {
    if (this.dead || this.done) return;

    const pauseNow = (Phaser.Input.Keyboard.JustDown(this.pauseKey) ||
                      Phaser.Input.Keyboard.JustDown(this.pKey));
    const pauseTouchNow = touch.pause && !this._pPause;
    this._pPause = touch.pause;

    if ((pauseNow || pauseTouchNow) && !this.paused) {
      this._openPause();
      return;
    }

    if (this.paused) return;

    if (this.player.y > GH + 80) this._die();

    this._updatePlayer(dt);
    this._updateEnemies(dt);
    this._updateBoss(dt);

    WEATHER.update(this._weather, dt);
  }

  _updatePlayer(dt) {
    const p = this.player;
    const LEFT  = this.keys.left.isDown  || this.wasd.left.isDown  || touch.left;
    const RIGHT = this.keys.right.isDown || this.wasd.right.isDown || touch.right;
    const JUMP  = this.keys.up.isDown    || this.wasd.up.isDown    ||
                  this.keys.space.isDown || this.wasd.space.isDown || touch.jump;

    const jumpNow = JUMP && !this._pjump;
    this._pjump = JUMP;

    const onGround = p.body.blocked.down;
    const spd = this.spdBoost ? this.BASE_SPD * 1.8 : this.BASE_SPD;
    const jmp = this.jmpBoost ? this.BASE_JMP * 1.42 : this.BASE_JMP;

    if (LEFT)       { p.setVelocityX(-spd); p.setFlipX(true); }
    else if (RIGHT) { p.setVelocityX(spd);  p.setFlipX(false); }
    else            { p.setVelocityX(0); }

    if (jumpNow) {
      if (onGround) {
        p.setVelocityY(jmp);
        p.canDoubleJump = true;
        SFX.jump();
      } else if (p.canDoubleJump) {
        p.setVelocityY(jmp * 0.9);
        p.canDoubleJump = false;
        SFX.jump();
      }
    }
    if (onGround) p.canDoubleJump = true;

    if (this.invinc) {
      p.setTexture('p_star');
    } else if (!onGround) {
      p.setTexture('p_jump');
    } else if (LEFT || RIGHT) {
      p.wt += dt;
      if (p.wt > 130) { p.wt = 0; p.wf = 1 - p.wf; }
      p.setTexture(p.wf ? 'p_run' : 'p_idle');
    } else {
      p.setTexture('p_idle');
    }
  }

  _updateEnemies(dt) {
    const px = this.player.x;
    this.enemyGrp.children.each(e => {
      if (!e.alive || !e.active) return;

      if (e.body.blocked.left || e.body.blocked.right) { e.dir *= -1; }

      if (e.etype === 'k') {
        const dist = Math.abs(px - e.x);
        if (dist < 240) {
          e.dir = px < e.x ? -1 : 1;
          e.setVelocityX(95 * e.dir);
        } else {
          e.setVelocityX(70 * e.dir);
        }
      } else {
        e.setVelocityX(60 * e.dir);
      }

      e.setFlipX(e.dir < 0);
      e.wt += dt;
      if (e.wt > 320) {
        e.wt = 0; e.wf = 1 - e.wf;
        e.setTexture(e.etype === 'k' ? (e.wf ? 'koopa_w' : 'koopa') : (e.wf ? 'goomba_w' : 'goomba'));
      }
      if (e.y > GH + 120) e.destroy();
    });
  }

  _updateBoss(dt) {
    if (!this.boss || !this.boss.alive || !this.boss.active) return;
    const px = this.player.x;

    this.boss.dir = px < this.boss.x ? -1 : 1;
    const dist = Math.abs(px - this.boss.x);
    const spd = dist < 350 ? 130 : 80;
    this.boss.setVelocityX(spd * this.boss.dir);

    if (this.boss.body.blocked.left || this.boss.body.blocked.right) {
      this.boss.dir *= -1;
    }
    this.boss.setFlipX(this.boss.dir < 0);

    this.boss.wt += dt;
    if (this.boss.wt > 200) {
      this.boss.wt = 0;
      this.boss.wf = 1 - (this.boss.wf || 0);
      this.boss.setTexture(this.boss.wf ? 'goomba_w' : 'goomba');
    }

    if (this.boss.y > GH + 120) this.boss.destroy();
  }
}

// ═══════════════════════════════════════════════════════════════
//  SCENE: GAME OVER
// ═══════════════════════════════════════════════════════════════
class GameOverScene extends Phaser.Scene {
  constructor() { super({ key: 'GameOverScene' }); }
  create(data) {
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x1a0000, 0x1a0000, 0x3b0000, 0x3b0000, 1);
    bg.fillRect(0, 0, GW, GH);
    for (let i = 0; i < 50; i++)
      this.add.circle(Phaser.Math.Between(0, GW), Phaser.Math.Between(0, GH),
        Phaser.Math.FloatBetween(0.5, 2), 0xfff9c4, Phaser.Math.FloatBetween(0.1, 0.5));

    this.add.text(GW / 2, 100, '💀 GAME OVER 💀', {
      fontSize: '54px', fontFamily: 'Courier New', fontStyle: 'bold',
      color: '#ff1744', stroke: '#7f0000', strokeThickness: 6
    }).setOrigin(0.5);

    this.add.text(GW / 2, 190, `Score final : ${data.score}`, {
      fontSize: '26px', fontFamily: 'Courier New', fontStyle: 'bold', color: '#FFD700', stroke: '#000', strokeThickness: 4
    }).setOrigin(0.5);

    const best = localStorage.getItem('megabro_best') || 0;
    this.add.text(GW / 2, 228, `🏆 Meilleur : ${best}`, {
      fontSize: '16px', fontFamily: 'Courier New', color: '#aaddff'
    }).setOrigin(0.5);

    const rank = data.score < 500 ? 'Débutant' : data.score < 2000 ? 'Aventurier' : data.score < 5000 ? 'Champion' : '⭐ Légende !';
    this.add.text(GW / 2, 264, `Rang : ${rank}`, {
      fontSize: '20px', fontFamily: 'Courier New', color: '#ffffff'
    }).setOrigin(0.5);

    this._btn(GW / 2 - 120, 335, '🔄  Rejouer', 0x1565c0, 0x42a5f5, () => {
      SFX.stopBg(); this.cameras.main.fadeOut(400);
      this.time.delayedCall(400, () => this.scene.start('GameScene', { level: 0, score: 0, lives: 3 }));
    });
    this._btn(GW / 2 + 120, 335, '🏠  Menu', 0x2e7d32, 0x66bb6a, () => {
      SFX.stopBg(); this.cameras.main.fadeOut(400);
      this.time.delayedCall(400, () => this.scene.start('MenuScene'));
    });
    this.cameras.main.fadeIn(600);
  }
  _btn(x, y, label, col, hov, cb) {
    const g = this.add.graphics();
    const draw = c => {
      g.clear(); g.fillStyle(c, 1); g.fillRoundedRect(x - 100, y - 24, 200, 48, 10);
      g.lineStyle(2, 0xffffff, 0.25); g.strokeRoundedRect(x - 100, y - 24, 200, 48, 10);
    };
    draw(col);
    g.setInteractive(new Phaser.Geom.Rectangle(x - 100, y - 24, 200, 48), Phaser.Geom.Rectangle.Contains);
    g.on('pointerover', () => draw(hov)).on('pointerout', () => draw(col)).on('pointerdown', cb);
    this.add.text(x, y, label, { fontSize: '18px', fontFamily: 'Courier New', fontStyle: 'bold', color: '#fff' }).setOrigin(0.5);
  }
}

// ═══════════════════════════════════════════════════════════════
//  SCENE: WIN
// ═══════════════════════════════════════════════════════════════
class WinScene extends Phaser.Scene {
  constructor() { super({ key: 'WinScene' }); }
  create(data) {
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0d3b6e, 0x0d3b6e, 0x1a1a4e, 0x1a1a4e, 1);
    bg.fillRect(0, 0, GW, GH);
    for (let i = 0; i < 80; i++)
      this.add.circle(Phaser.Math.Between(0, GW), Phaser.Math.Between(0, GH),
        Phaser.Math.FloatBetween(0.5, 3), 0xfff9c4, Phaser.Math.FloatBetween(0.3, 1));

    this.add.text(GW / 2, 88, '🏆 VICTOIRE ! 🏆', {
      fontSize: '52px', fontFamily: 'Courier New', fontStyle: 'bold',
      color: '#FFD700', stroke: '#FF6F00', strokeThickness: 6
    }).setOrigin(0.5);

    this.add.text(GW / 2, 160, 'Tu as terminé tous les niveaux !', {
      fontSize: '20px', fontFamily: 'Courier New', color: '#ffffff'
    }).setOrigin(0.5);
    this.add.text(GW / 2, 192, 'Même le BOSS du niveau 3 ! 🎉', {
      fontSize: '15px', fontFamily: 'Courier New', color: '#ffcc44'
    }).setOrigin(0.5);

    this.add.text(GW / 2, 230, `Score final : ${data.score}`, {
      fontSize: '28px', fontFamily: 'Courier New', fontStyle: 'bold', color: '#FFD700', stroke: '#000', strokeThickness: 4
    }).setOrigin(0.5);

    const best = localStorage.getItem('megabro_best') || 0;
    this.add.text(GW / 2, 268, `🏆 Record : ${best}`, {
      fontSize: '16px', fontFamily: 'Courier New', color: '#aaddff'
    }).setOrigin(0.5);

    const cols = [0xFFD700, 0xff4444, 0x44ff44, 0x4444ff, 0xff44ff, 0x00ffff];
    for (let i = 0; i < 28; i++) {
      this.time.delayedCall(i * 100, () => {
        const r = this.add.rectangle(
          Phaser.Math.Between(40, GW - 40), -12,
          Phaser.Math.Between(8, 16), Phaser.Math.Between(8, 16),
          Phaser.Math.RND.pick(cols)
        );
        this.tweens.add({ targets: r, y: GH + 20, angle: 360 * Phaser.Math.Between(2, 5),
          duration: Phaser.Math.Between(2000, 4000), ease: 'Linear' });
      });
    }

    this._btn(GW / 2 - 120, 328, '🔄  Rejouer', 0x1565c0, 0x42a5f5, () => {
      SFX.stopBg(); this.cameras.main.fadeOut(400);
      this.time.delayedCall(400, () => this.scene.start('GameScene', { level: 0, score: 0, lives: 3 }));
    });
    this._btn(GW / 2 + 120, 328, '🏠  Menu', 0x6a1b9a, 0xab47bc, () => {
      SFX.stopBg(); this.cameras.main.fadeOut(400);
      this.time.delayedCall(400, () => this.scene.start('MenuScene'));
    });

    this.cameras.main.fadeIn(600);
    SFX.startBg(0);
  }
  _btn(x, y, label, col, hov, cb) {
    const g = this.add.graphics();
    const draw = c => {
      g.clear(); g.fillStyle(c, 1); g.fillRoundedRect(x - 100, y - 24, 200, 48, 10);
      g.lineStyle(2, 0xffffff, 0.25); g.strokeRoundedRect(x - 100, y - 24, 200, 48, 10);
    };
    draw(col);
    g.setInteractive(new Phaser.Geom.Rectangle(x - 100, y - 24, 200, 48), Phaser.Geom.Rectangle.Contains);
    g.on('pointerover', () => draw(hov)).on('pointerout', () => draw(col)).on('pointerdown', cb);
    this.add.text(x, y, label, { fontSize: '18px', fontFamily: 'Courier New', fontStyle: 'bold', color: '#fff' }).setOrigin(0.5);
  }
}

// ═══════════════════════════════════════════════════════════════
//  PHASER BOOT
// ═══════════════════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {
  initTouchControls();

  new Phaser.Game({
    type: Phaser.AUTO,
    width: GW,
    height: GH,
    parent: 'game-container',
    backgroundColor: '#050510',
    physics: {
      default: 'arcade',
      arcade: { gravity: { y: 600 }, debug: false }
    },
    scene: [MenuScene, GameScene, LevelIntroScene, PauseScene, GameOverScene, WinScene],
  });
});
