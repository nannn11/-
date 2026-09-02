(function () {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  const el = {
    score: document.getElementById('score'),
    level: document.getElementById('level'),
    lives: document.getElementById('lives'),
    highScore: document.getElementById('highScore'),
    startScreen: document.getElementById('startScreen'),
    pauseScreen: document.getElementById('pauseScreen'),
    gameOverScreen: document.getElementById('gameOverScreen'),
    finalScore: document.getElementById('finalScore'),
    newHighScore: document.getElementById('newHighScore'),
    startBtn: document.getElementById('startBtn'),
    resumeBtn: document.getElementById('resumeBtn'),
    restartBtn: document.getElementById('restartBtn'),
    muteBtn: document.getElementById('muteBtn'),
    levelUpBanner: document.getElementById('levelUpBanner'),
    levelUpNum: document.getElementById('levelUpNum'),
    btnLeft: document.getElementById('btnLeft'),
    btnRight: document.getElementById('btnRight'),
    btnFire: document.getElementById('btnFire'),
  };

  // ---------------------------------------------------------------------
  // Audio (Web Audio API, no external assets)
  // ---------------------------------------------------------------------
  const Sound = (function () {
    let ctxAudio = null;
    let muted = false;

    function getCtx() {
      if (!ctxAudio) {
        const AC = window.AudioContext || window.webkitAudioContext;
        ctxAudio = new AC();
      }
      return ctxAudio;
    }

    function tone(freq, duration, type, volume, freqEnd) {
      if (muted) return;
      const ac = getCtx();
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = type || 'square';
      osc.frequency.setValueAtTime(freq, ac.currentTime);
      if (freqEnd) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), ac.currentTime + duration);
      }
      gain.gain.setValueAtTime(volume, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
      osc.connect(gain).connect(ac.destination);
      osc.start();
      osc.stop(ac.currentTime + duration);
    }

    function noise(duration, volume) {
      if (muted) return;
      const ac = getCtx();
      const bufferSize = Math.floor(ac.sampleRate * duration);
      const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
      }
      const src = ac.createBufferSource();
      src.buffer = buffer;
      const gain = ac.createGain();
      gain.gain.setValueAtTime(volume, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
      src.connect(gain).connect(ac.destination);
      src.start();
    }

    return {
      shoot() { tone(880, 0.08, 'square', 0.06, 440); },
      enemyShoot() { tone(220, 0.12, 'sawtooth', 0.04, 120); },
      explosion() { noise(0.3, 0.18); },
      hit() { tone(140, 0.35, 'sawtooth', 0.15, 40); },
      powerup() { tone(440, 0.25, 'sine', 0.1, 880); },
      levelUp() { tone(523, 0.4, 'triangle', 0.12, 1046); },
      gameover() { tone(200, 0.8, 'sawtooth', 0.15, 50); },
      toggleMute() {
        muted = !muted;
        return muted;
      },
      resume() {
        const ac = getCtx();
        if (ac.state === 'suspended') ac.resume();
      },
    };
  })();

  el.muteBtn.addEventListener('click', () => {
    const isMuted = Sound.toggleMute();
    el.muteBtn.textContent = isMuted ? '🔇' : '🔊';
  });

  // ---------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------
  const keys = {};
  const PREVENT_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyA', 'KeyD'];

  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (PREVENT_KEYS.includes(e.code)) e.preventDefault();
    if (e.code === 'KeyP') togglePause();
    if ((e.code === 'Space' || e.code === 'Enter') && state === 'start') startGame();
    if ((e.code === 'Space' || e.code === 'Enter') && state === 'gameover') startGame();
  });
  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
  });

  const touchState = { left: false, right: false, fire: false };
  function bindTouch(elm, key) {
    const on = (e) => {
      e.preventDefault();
      touchState[key] = true;
    };
    const off = (e) => {
      e.preventDefault();
      touchState[key] = false;
    };
    elm.addEventListener('pointerdown', on);
    elm.addEventListener('pointerup', off);
    elm.addEventListener('pointerleave', off);
    elm.addEventListener('pointercancel', off);
  }
  bindTouch(el.btnLeft, 'left');
  bindTouch(el.btnRight, 'right');
  bindTouch(el.btnFire, 'fire');

  function isLeft() { return keys['ArrowLeft'] || keys['KeyA'] || touchState.left; }
  function isRight() { return keys['ArrowRight'] || keys['KeyD'] || touchState.right; }
  function isFiring() { return keys['Space'] || keys['ArrowUp'] || touchState.fire; }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------
  function aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
  function rand(min, max) { return Math.random() * (max - min) + min; }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  // ---------------------------------------------------------------------
  // Starfield background
  // ---------------------------------------------------------------------
  const stars = [];
  for (let i = 0; i < 90; i++) {
    stars.push({
      x: rand(0, W),
      y: rand(0, H),
      r: rand(0.5, 2),
      speed: rand(20, 90),
    });
  }
  function updateStars(dt) {
    for (const s of stars) {
      s.y += s.speed * dt;
      if (s.y > H) {
        s.y = 0;
        s.x = rand(0, W);
      }
    }
  }
  function drawStars() {
    ctx.fillStyle = '#060818';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ffffff';
    for (const s of stars) {
      ctx.globalAlpha = 0.4 + s.r / 2.5;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------------
  // Entities
  // ---------------------------------------------------------------------
  class Player {
    constructor() {
      this.w = 34;
      this.h = 26;
      this.x = W / 2 - this.w / 2;
      this.y = H - 70;
      this.speed = 300;
      this.cooldown = 0;
      this.invulnerable = 2;
      this.shield = false;
      this.rapidTimer = 0;
      this.multiTimer = 0;
      this.alive = true;
      this.blink = 0;
    }

    get fireInterval() {
      return this.rapidTimer > 0 ? 0.12 : 0.28;
    }

    update(dt) {
      if (isLeft()) this.x -= this.speed * dt;
      if (isRight()) this.x += this.speed * dt;
      this.x = clamp(this.x, 10, W - this.w - 10);

      if (this.cooldown > 0) this.cooldown -= dt;
      if (this.invulnerable > 0) this.invulnerable -= dt;
      if (this.rapidTimer > 0) this.rapidTimer -= dt;
      if (this.multiTimer > 0) this.multiTimer -= dt;
      this.blink += dt;

      if (isFiring() && this.cooldown <= 0) {
        this.shoot();
        this.cooldown = this.fireInterval;
      }
    }

    shoot() {
      const cx = this.x + this.w / 2;
      if (this.multiTimer > 0) {
        bullets.push(new Bullet(cx - 2, this.y, -520, -60));
        bullets.push(new Bullet(cx - 2, this.y, -560, 0));
        bullets.push(new Bullet(cx - 2, this.y, -520, 60));
      } else {
        bullets.push(new Bullet(cx - 2, this.y, -560, 0));
      }
      Sound.shoot();
    }

    hit() {
      if (this.invulnerable > 0) return false;
      if (this.shield) {
        this.shield = false;
        this.invulnerable = 1;
        Sound.powerup();
        return false;
      }
      lives--;
      this.invulnerable = 2.2;
      Sound.hit();
      spawnExplosion(this.x + this.w / 2, this.y + this.h / 2, '#6ef0ff', 22);
      return lives <= 0;
    }

    draw() {
      if (this.invulnerable > 0 && Math.floor(this.blink * 10) % 2 === 0) return;
      const cx = this.x + this.w / 2;
      ctx.save();
      ctx.translate(cx, this.y + this.h / 2);

      if (this.shield) {
        ctx.beginPath();
        ctx.arc(0, 0, this.w / 2 + 8, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(110,240,255,0.7)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      ctx.fillStyle = '#3ad0ff';
      ctx.beginPath();
      ctx.moveTo(0, -this.h / 2);
      ctx.lineTo(this.w / 2, this.h / 2);
      ctx.lineTo(this.w / 4, this.h / 2 - 6);
      ctx.lineTo(-this.w / 4, this.h / 2 - 6);
      ctx.lineTo(-this.w / 2, this.h / 2);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#eafeff';
      ctx.beginPath();
      ctx.arc(0, -2, 4, 0, Math.PI * 2);
      ctx.fill();

      // engine flame
      const flameLen = 6 + Math.random() * 6;
      ctx.fillStyle = 'rgba(255,180,80,0.85)';
      ctx.beginPath();
      ctx.moveTo(-6, this.h / 2 - 6);
      ctx.lineTo(0, this.h / 2 - 6 + flameLen);
      ctx.lineTo(6, this.h / 2 - 6);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    }
  }

  class Bullet {
    constructor(x, y, vy, vx) {
      this.x = x;
      this.y = y;
      this.w = 4;
      this.h = 12;
      this.vy = vy;
      this.vx = vx || 0;
    }
    update(dt) {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
    }
    get offscreen() {
      return this.y < -20 || this.y > H + 20 || this.x < -20 || this.x > W + 20;
    }
  }

  const ENEMY_TYPES = [
    { color: '#ff5e78', points: 30 },
    { color: '#ffb84d', points: 20 },
    { color: '#ffb84d', points: 20 },
    { color: '#6ef0ff', points: 10 },
    { color: '#6ef0ff', points: 10 },
  ];

  class EnemyFormation {
    constructor(level) {
      this.rows = Math.min(5 + Math.floor((level - 1) / 3), 6);
      this.cols = 8;
      this.enemyW = 30;
      this.enemyH = 22;
      this.gapX = 14;
      this.gapY = 18;
      this.startX = (W - (this.cols * (this.enemyW + this.gapX) - this.gapX)) / 2;
      this.startY = 60;
      this.offsetX = 0;
      this.offsetY = 0;
      this.dir = 1;
      this.baseSpeed = 22 + level * 6;
      this.stepDown = 18 + Math.min(level, 10);
      this.fireTimer = 1;
      this.fireInterval = Math.max(1100 - level * 60, 350);
      this.grid = [];
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          this.grid.push({ r, c, alive: true });
        }
      }
      this.total = this.grid.length;
    }

    aliveCount() {
      let n = 0;
      for (const e of this.grid) if (e.alive) n++;
      return n;
    }

    cellPos(e) {
      return {
        x: this.startX + e.c * (this.enemyW + this.gapX) + this.offsetX,
        y: this.startY + e.r * (this.enemyH + this.gapY) + this.offsetY,
      };
    }

    update(dt) {
      const alive = this.aliveCount();
      if (alive === 0) return;
      const speedFactor = 1 + (this.total - alive) / this.total * 2.2;
      const speed = this.baseSpeed * speedFactor;
      this.offsetX += speed * this.dir * dt;

      let minX = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const e of this.grid) {
        if (!e.alive) continue;
        const p = this.cellPos(e);
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x + this.enemyW);
        maxY = Math.max(maxY, p.y + this.enemyH);
      }
      if (minX <= 12 || maxX >= W - 12) {
        this.dir *= -1;
        this.offsetX += speed * this.dir * dt * 2;
        this.offsetY += this.stepDown;
      }

      if (maxY >= H - 120) {
        triggerGameOver();
      }

      this.fireTimer -= dt * 1000 * (1 + (this.total - alive) / this.total);
      if (this.fireTimer <= 0) {
        this.fireTimer = this.fireInterval;
        this.tryShoot();
      }
    }

    tryShoot() {
      const cols = {};
      for (const e of this.grid) {
        if (!e.alive) continue;
        if (!cols[e.c] || e.r > cols[e.c].r) cols[e.c] = e;
      }
      const shooters = Object.values(cols);
      if (shooters.length === 0) return;
      const shooter = shooters[Math.floor(Math.random() * shooters.length)];
      const p = this.cellPos(shooter);
      enemyBullets.push(new Bullet(p.x + this.enemyW / 2 - 2, p.y + this.enemyH, 180 + level * 8));
      Sound.enemyShoot();
    }

    draw() {
      for (const e of this.grid) {
        if (!e.alive) continue;
        const p = this.cellPos(e);
        const type = ENEMY_TYPES[e.r % ENEMY_TYPES.length];
        ctx.save();
        ctx.translate(p.x + this.enemyW / 2, p.y + this.enemyH / 2);
        ctx.fillStyle = type.color;
        ctx.beginPath();
        ctx.moveTo(0, -this.enemyH / 2);
        ctx.lineTo(this.enemyW / 2, 0);
        ctx.lineTo(this.enemyW / 3, this.enemyH / 2);
        ctx.lineTo(-this.enemyW / 3, this.enemyH / 2);
        ctx.lineTo(-this.enemyW / 2, 0);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(5,6,15,0.6)';
        ctx.beginPath();
        ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  class Particle {
    constructor(x, y, color) {
      this.x = x;
      this.y = y;
      const a = rand(0, Math.PI * 2);
      const speed = rand(40, 220);
      this.vx = Math.cos(a) * speed;
      this.vy = Math.sin(a) * speed;
      this.life = rand(0.3, 0.7);
      this.age = 0;
      this.color = color;
      this.size = rand(1.5, 3.5);
    }
    update(dt) {
      this.age += dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.vx *= 0.94;
      this.vy *= 0.94;
    }
    get dead() { return this.age >= this.life; }
    draw() {
      ctx.globalAlpha = clamp(1 - this.age / this.life, 0, 1);
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function spawnExplosion(x, y, color, count) {
    for (let i = 0; i < (count || 12); i++) {
      particles.push(new Particle(x, y, color));
    }
  }

  const POWERUP_TYPES = [
    { key: 'rapid', color: '#ffd75e', label: 'R' },
    { key: 'shield', color: '#6ef0ff', label: 'S' },
    { key: 'multi', color: '#ff5e78', label: 'M' },
  ];

  class PowerUp {
    constructor(x, y) {
      this.type = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
      this.x = x;
      this.y = y;
      this.w = 20;
      this.h = 20;
      this.vy = 90;
    }
    update(dt) { this.y += this.vy * dt; }
    get offscreen() { return this.y > H + 20; }
    draw() {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.fillStyle = this.type.color;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(0, 0, this.w / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#05060f';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.type.label, 0, 1);
      ctx.restore();
    }
    apply(player) {
      Sound.powerup();
      if (this.type.key === 'rapid') player.rapidTimer = 8;
      if (this.type.key === 'shield') player.shield = true;
      if (this.type.key === 'multi') player.multiTimer = 8;
    }
  }

  // ---------------------------------------------------------------------
  // Game state
  // ---------------------------------------------------------------------
  let state = 'start'; // start | playing | paused | levelup | gameover
  let score = 0;
  let level = 1;
  let lives = 3;
  let highScore = Number(localStorage.getItem('starBlasterHighScore') || 0);
  el.highScore.textContent = highScore;

  let player = null;
  let bullets = [];
  let enemyBullets = [];
  let particles = [];
  let powerUps = [];
  let formation = null;
  let levelUpTimer = 0;

  function updateHUD() {
    el.score.textContent = score;
    el.level.textContent = level;
    el.lives.textContent = '▲'.repeat(Math.max(lives, 0));
    el.highScore.textContent = Math.max(score, highScore);
  }

  function newFormation() {
    formation = new EnemyFormation(level);
  }

  function resetGame() {
    score = 0;
    level = 1;
    lives = 3;
    player = new Player();
    bullets = [];
    enemyBullets = [];
    particles = [];
    powerUps = [];
    newFormation();
    updateHUD();
  }

  function startGame() {
    Sound.resume();
    resetGame();
    state = 'playing';
    el.startScreen.classList.add('hidden');
    el.gameOverScreen.classList.add('hidden');
    el.pauseScreen.classList.add('hidden');
  }

  function togglePause() {
    if (state === 'playing') {
      state = 'paused';
      el.pauseScreen.classList.remove('hidden');
    } else if (state === 'paused') {
      state = 'playing';
      el.pauseScreen.classList.add('hidden');
    }
  }

  function triggerGameOver() {
    if (state !== 'playing') return;
    state = 'gameover';
    Sound.gameover();
    const isNew = score > highScore;
    if (isNew) {
      highScore = score;
      localStorage.setItem('starBlasterHighScore', String(highScore));
    }
    el.finalScore.textContent = score;
    el.newHighScore.classList.toggle('hidden', !isNew);
    el.gameOverScreen.classList.remove('hidden');
  }

  function nextLevel() {
    level++;
    state = 'levelup';
    levelUpTimer = 1.3;
    el.levelUpNum.textContent = level;
    el.levelUpBanner.classList.remove('hidden');
    el.levelUpBanner.style.animation = 'none';
    void el.levelUpBanner.offsetWidth;
    el.levelUpBanner.style.animation = '';
    Sound.levelUp();
    bullets = [];
    enemyBullets = [];
    newFormation();
    player.invulnerable = 1.5;
  }

  el.startBtn.addEventListener('click', startGame);
  el.restartBtn.addEventListener('click', startGame);
  el.resumeBtn.addEventListener('click', togglePause);

  // ---------------------------------------------------------------------
  // Update / Draw
  // ---------------------------------------------------------------------
  function update(dt) {
    updateStars(dt);

    if (state === 'levelup') {
      levelUpTimer -= dt;
      if (levelUpTimer <= 0) {
        el.levelUpBanner.classList.add('hidden');
        state = 'playing';
      }
      return;
    }

    if (state !== 'playing') return;

    player.update(dt);

    for (const b of bullets) b.update(dt);
    for (const b of enemyBullets) b.update(dt);
    for (const p of particles) p.update(dt);
    for (const pu of powerUps) pu.update(dt);

    formation.update(dt);

    // player bullets vs enemies
    for (const b of bullets) {
      if (b.offscreen) continue;
      for (const e of formation.grid) {
        if (!e.alive) continue;
        const p = formation.cellPos(e);
        const box = { x: p.x, y: p.y, w: formation.enemyW, h: formation.enemyH };
        if (aabb({ x: b.x, y: b.y, w: b.w, h: b.h }, box)) {
          e.alive = false;
          b.y = -999;
          const type = ENEMY_TYPES[e.r % ENEMY_TYPES.length];
          score += type.points * level;
          spawnExplosion(p.x + formation.enemyW / 2, p.y + formation.enemyH / 2, type.color, 14);
          Sound.explosion();
          if (Math.random() < 0.12) {
            powerUps.push(new PowerUp(p.x + formation.enemyW / 2, p.y + formation.enemyH / 2));
          }
          break;
        }
      }
    }

    // enemy bullets vs player
    for (const b of enemyBullets) {
      if (b.offscreen) continue;
      if (player.invulnerable <= 0 && aabb({ x: b.x, y: b.y, w: b.w, h: b.h }, player)) {
        b.y = H + 999;
        const dead = player.hit();
        updateHUD();
        if (dead) triggerGameOver();
      }
    }

    // powerups vs player
    for (const pu of powerUps) {
      if (pu.offscreen) continue;
      if (aabb({ x: pu.x - pu.w / 2, y: pu.y - pu.h / 2, w: pu.w, h: pu.h }, player)) {
        pu.apply(player);
        pu.y = H + 999;
      }
    }

    bullets = bullets.filter((b) => !b.offscreen);
    enemyBullets = enemyBullets.filter((b) => !b.offscreen);
    particles = particles.filter((p) => !p.dead);
    powerUps = powerUps.filter((pu) => !pu.offscreen);

    updateHUD();

    if (formation.aliveCount() === 0 && state === 'playing') {
      nextLevel();
    }
  }

  function draw() {
    drawStars();

    if (formation) formation.draw();
    for (const b of bullets) {
      ctx.fillStyle = '#eafeff';
      ctx.fillRect(b.x, b.y, b.w, b.h);
    }
    for (const b of enemyBullets) {
      ctx.fillStyle = '#ff8a8a';
      ctx.fillRect(b.x, b.y, b.w, b.h);
    }
    for (const pu of powerUps) pu.draw();
    if (player) player.draw();
    for (const p of particles) p.draw();
  }

  // ---------------------------------------------------------------------
  // Loop
  // ---------------------------------------------------------------------
  let lastTime = 0;
  function loop(ts) {
    const dt = Math.min((ts - lastTime) / 1000 || 0, 0.05);
    lastTime = ts;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
})();
