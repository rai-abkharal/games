/**
 * entities.ts — every drawable / updatable object in the arena.
 * Each has update(dt, world) and draw(ctx). No DOM, no input, no FSM.
 */

import {
  Rect, Hsl, TAU, MAP_W, MAP_H, FIGHT_R, MAX_HP, REGEN_DELAY, REGEN_RATE,
  RESPAWN_TIME, BOT_ENGAGE, BOT_PREFER, BOT_TOOCLOSE, BOT_REACT,
  BOT_BURST_ON, BOT_BURST_OFF, MEDKIT_RESPAWN, PICK_R,
  BLUE, RED, BLOOD, FIRE_TOL, TURN_RATE, BLOOM_GAIN, BLOOM_MAX, BLOOM_DECAY,
  clamp, lerp, damp, rand, randInt, css, roundRect, glow,
  resolveCircleRect, dist2, approachAngle, angleDelta, chance, easeOutCubic,
} from './utils';

/* ------------------------------------------------------------------ */

export interface World {
  time: number;
  walls: Rect[];
  fighters: Fighter[];
  medkits: Medkit[];
  losClear(ax: number, ay: number, bx: number, by: number): boolean;
  fire(owner: Fighter, angle: number): void;
  shotFx(owner: Fighter, angle: number): void;
  puff(x: number, y: number, n: number, color: string, speed: number, size: number): void;
  spray(x: number, y: number, angle: number, spread: number, n: number,
        color: string, speed: number, size: number, life: number, drag?: number): void;
}

const OUTLINE = '#20242e';
const SKIN = '#e2ab74';
const SKIN_DARK = '#b3814f';

/* ------------------------------------------------------------------ */

export class Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number; size: number; color: string; drag: number;
  spin = 0; rot = 0; square = false;

  constructor(x: number, y: number, vx: number, vy: number, life: number, size: number, color: string, drag = 3.2) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.life = life; this.max = life; this.size = size; this.color = color; this.drag = drag;
  }
  update(dt: number): void {
    this.x += this.vx * dt; this.y += this.vy * dt;
    const k = Math.exp(-this.drag * dt);
    this.vx *= k; this.vy *= k;
    this.rot += this.spin * dt;
    this.life -= dt;
  }
  get dead(): boolean { return this.life <= 0; }
  draw(ctx: CanvasRenderingContext2D): void {
    const t = clamp(this.life / this.max, 0, 1);
    ctx.globalAlpha = t;
    ctx.fillStyle = this.color;
    const s = this.size * (0.35 + t * 0.65);
    if (this.square) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rot);
      ctx.fillRect(-s, -s * 0.45, s * 2, s * 0.9);
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(this.x, this.y, s, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

export class Decal {
  blobs: { dx: number; dy: number; r: number; sq: number }[] = [];
  life: number; max: number;
  constructor(public x: number, public y: number, size: number, life = 16) {
    this.life = life; this.max = life;
    const n = randInt(5, 8);
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), d = rand(0, size * 0.9);
      this.blobs.push({ dx: Math.cos(a) * d, dy: Math.sin(a) * d, r: rand(size * 0.22, size * 0.58), sq: rand(0.5, 0.95) });
    }
  }
  update(dt: number): void { this.life -= dt; }
  get dead(): boolean { return this.life <= 0; }
  draw(ctx: CanvasRenderingContext2D): void {
    const a = clamp(this.life / 3.5, 0, 1) * 0.58;
    if (a <= 0.01) return;
    ctx.globalAlpha = a;
    ctx.fillStyle = css(BLOOD, -4);
    for (const b of this.blobs) {
      ctx.beginPath();
      ctx.ellipse(this.x + b.dx, this.y + b.dy, b.r, b.r * b.sq, 0, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

export class Popup {
  x: number; y: number; text: string; life = 1.0; color: string; size: number; vy: number;
  constructor(x: number, y: number, text: string, color: string, size = 15) {
    this.x = x + rand(-8, 8); this.y = y; this.text = text; this.color = color;
    this.size = size; this.vy = rand(-54, -40);
  }
  update(dt: number): void { this.y += this.vy * dt; this.vy *= Math.exp(-2.4 * dt); this.life -= dt * 1.35; }
  get dead(): boolean { return this.life <= 0; }
  draw(ctx: CanvasRenderingContext2D): void {
    ctx.globalAlpha = clamp(this.life, 0, 1);
    ctx.font = `900 ${this.size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(14,18,28,0.8)';
    ctx.strokeText(this.text, this.x, this.y);
    ctx.fillStyle = this.color;
    ctx.fillText(this.text, this.x, this.y);
    ctx.globalAlpha = 1;
  }
}

/* ------------------------------------------------------------------ */

export class Bullet {
  x: number; y: number; vx: number; vy: number;
  team: 0 | 1; dmg: number; pierce: number; travelled = 0; range: number;
  owner: Fighter; dead = false; hitIds: number[] = []; whizzed = false;
  angle: number;
  px: number; py: number;

  constructor(owner: Fighter, angle: number, speed: number, dmg: number, range: number, pierce: number) {
    this.owner = owner; this.team = owner.team; this.angle = angle;
    this.x = owner.x + Math.cos(angle) * (FIGHT_R + 18);
    this.y = owner.y + Math.sin(angle) * (FIGHT_R + 18);
    this.px = this.x; this.py = this.y;
    this.vx = Math.cos(angle) * speed; this.vy = Math.sin(angle) * speed;
    this.dmg = dmg; this.range = range; this.pierce = pierce;
  }

  update(dt: number): void {
    this.px = this.x; this.py = this.y;
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.travelled += Math.hypot(this.vx, this.vy) * dt;
    if (this.travelled > this.range) this.dead = true;
    if (this.x < 0 || this.x > MAP_W || this.y < 0 || this.y > MAP_H) this.dead = true;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const c = this.team === 0 ? BLUE : RED;
    const tx = this.x - Math.cos(this.angle) * 18, ty = this.y - Math.sin(this.angle) * 18;
    const g = ctx.createLinearGradient(tx, ty, this.x, this.y);
    g.addColorStop(0, css(c, 24, 0));
    g.addColorStop(1, '#fff6d8');
    ctx.strokeStyle = g;
    ctx.lineWidth = 3.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(this.x, this.y);
    ctx.stroke();
    glow(ctx, this.x, this.y, 13, css(c, 34, 0.8), 0.7);
  }
}

/* ------------------------------------------------------------------ */

export class Medkit {
  x: number; y: number; cooldown = 0; bob = rand(0, TAU);
  constructor(x: number, y: number) { this.x = x; this.y = y; }
  get active(): boolean { return this.cooldown <= 0; }
  update(dt: number): void { if (this.cooldown > 0) this.cooldown -= dt; this.bob += dt * 3; }
  take(): void { this.cooldown = MEDKIT_RESPAWN; }
  draw(ctx: CanvasRenderingContext2D): void {
    if (!this.active) {
      ctx.globalAlpha = 0.16;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 5]);
      ctx.beginPath(); ctx.arc(this.x, this.y, PICK_R, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      return;
    }
    const y = this.y + Math.sin(this.bob) * 2.6;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(this.x, this.y + 12, 14, 6.5, 0, 0, TAU); ctx.fill();
    glow(ctx, this.x, y, 32, 'rgba(255,255,255,0.35)', 0.5);
    // white case with a red cross, chunky outline
    roundRect(ctx, this.x - 13, y - 13, 26, 26, 7);
    ctx.fillStyle = '#eef2f6'; ctx.fill();
    roundRect(ctx, this.x - 13, y - 13, 26, 12, 7);
    ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.fillStyle = '#e0374d';
    roundRect(ctx, this.x - 8, y - 3, 16, 6, 2); ctx.fill();
    roundRect(ctx, this.x - 3, y - 8, 6, 16, 2); ctx.fill();
    ctx.lineWidth = 2.4; ctx.strokeStyle = OUTLINE;
    roundRect(ctx, this.x - 13, y - 13, 26, 26, 7); ctx.stroke();
  }
}

/* ================================================================== *
 * Fighter
 * ================================================================== */

let NEXT_ID = 1;

export class Fighter {
  id = NEXT_ID++;
  team: 0 | 1;
  isPlayer: boolean;
  tag: string;

  x = 0; y = 0; vx = 0; vy = 0;
  aim = -Math.PI / 2;
  alive = true;
  hp = MAX_HP; maxHp = MAX_HP;
  respawnT = 0; shieldT = 0;
  kills = 0; deaths = 0; streak = 0;

  dmg: number; rate: number; spread: number; speed: number;
  mag: number; magSize: number; reloadTime: number; reloadT = 0;
  bulletSpeed = 660; range = 470; pierce = 0; shots = 1;
  lifesteal = 0; armor = 0;
  cool = 0;

  // animation
  recoil = 0; hurt = 0; walk = 0; legAmt = 0; muzzle = 0; bloom = 0;
  turnLean = 0; breathe = rand(0, TAU); spawnPop = 0;
  lastHitAt = -99; deadT = 0; deathSpin = 0; deathAngle = 0;
  stepAcc = 0; private prevAim = 0;

  jitter: number;
  strafe = 1; strafeT = 0; reactT = 0; burstT = 0; bursting = false;
  wanderX = 0; wanderY = 0; wanderT = 0;

  constructor(
    team: 0 | 1, isPlayer: boolean, tag: string,
    stats: { dmg: number; rate: number; spread: number; speed: number; mag: number; reload: number; jitter: number },
  ) {
    this.team = team; this.isPlayer = isPlayer; this.tag = tag;
    this.dmg = stats.dmg; this.rate = stats.rate; this.spread = stats.spread;
    this.speed = stats.speed; this.magSize = stats.mag; this.mag = stats.mag;
    this.reloadTime = stats.reload; this.jitter = stats.jitter;
  }

  inMoveX = 0; inMoveY = 0; inAim: number | null = null; inFire = false;
  stepped = false;

  placeAt(x: number, y: number, facing: number): void {
    this.x = x; this.y = y; this.aim = facing; this.prevAim = facing;
    this.vx = 0; this.vy = 0;
    this.hp = this.maxHp; this.alive = true;
    this.mag = this.magSize; this.reloadT = 0; this.cool = 0;
    this.shieldT = 1.1; this.hurt = 0; this.streak = 0;
    this.wanderT = 0; this.deadT = 0; this.legAmt = 0;
    this.bloom = 0; this.turnLean = 0; this.spawnPop = 1;
  }

  takeDamage(amount: number, world: World): boolean {
    if (!this.alive || this.shieldT > 0) return false;
    this.hp -= amount * (1 - this.armor);
    this.hurt = 1;
    this.lastHitAt = world.time;
    if (this.hp <= 0) { this.hp = 0; this.alive = false; return true; }
    return false;
  }

  onDeath(fromAngle: number): void {
    this.deadT = 0;
    this.deathAngle = fromAngle;
    this.deathSpin = rand(-0.6, 0.6);
  }

  startReload(): void {
    if (this.reloadT <= 0 && this.mag < this.magSize) this.reloadT = this.reloadTime;
  }

  update(dt: number, world: World): void {
    this.recoil = damp(this.recoil, 0, 12, dt);
    this.bloom = damp(this.bloom, 0, BLOOM_DECAY, dt);
    this.hurt = damp(this.hurt, 0, 6, dt);
    this.muzzle = Math.max(0, this.muzzle - dt * 11);
    this.spawnPop = Math.max(0, this.spawnPop - dt * 3.2);
    this.breathe += dt * 2.1;
    this.stepped = false;
    if (!this.alive) { this.deadT += dt; this.respawnT -= dt; return; }

    if (this.shieldT > 0) this.shieldT -= dt;
    if (this.cool > 0) this.cool -= dt;
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) this.mag = this.magSize;
    }
    if (world.time - this.lastHitAt > REGEN_DELAY && this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + REGEN_RATE * dt);
    }

    if (this.isPlayer) this.drivePlayer(dt, world);
    else this.driveBot(dt, world);

    // body banks into a turn
    const turn = angleDelta(this.prevAim, this.aim) / Math.max(dt, 1e-4);
    this.prevAim = this.aim;
    this.turnLean = damp(this.turnLean, clamp(turn * 0.02, -1, 1), 8, dt);

    this.move(dt, world);
  }

  private drivePlayer(dt: number, world: World): void {
    const mag = Math.hypot(this.inMoveX, this.inMoveY);
    let mx = this.inMoveX, my = this.inMoveY;
    if (mag > 1) { mx /= mag; my /= mag; }
    let spd = this.speed;
    if (this.inAim !== null && mag > 0.1) {
      const dot = Math.cos(Math.atan2(my, mx) - this.aim);
      spd *= lerp(0.72, 1, (dot + 1) / 2);
    }
    this.vx = damp(this.vx, mx * spd, 14, dt);
    this.vy = damp(this.vy, my * spd, 14, dt);

    if (this.inAim !== null) this.aim = approachAngle(this.aim, this.inAim, TURN_RATE * dt);
    else if (mag > 0.15) this.aim = approachAngle(this.aim, Math.atan2(my, mx), 11 * dt);

    if (this.inFire) {
      const onTarget = this.inAim === null || Math.abs(angleDelta(this.aim, this.inAim)) < FIRE_TOL;
      if (onTarget) this.shoot(world, this.aim);
      else if (this.mag <= 0) this.startReload();
    }
  }

  private driveBot(dt: number, world: World): void {
    const foe = this.pickTarget(world);
    let mx = 0, my = 0;

    let kit: Medkit | null = null;
    if (this.hp < this.maxHp * 0.42) {
      let best = 420 * 420;
      for (const m of world.medkits) {
        if (!m.active) continue;
        const d = dist2(this.x, this.y, m.x, m.y);
        if (d < best) { best = d; kit = m; }
      }
    }

    if (foe) {
      const dx = foe.x - this.x, dy = foe.y - this.y;
      const d = Math.hypot(dx, dy) || 1;
      const ux = dx / d, uy = dy / d;
      const clear = world.losClear(this.x, this.y, foe.x, foe.y);

      this.aim = approachAngle(this.aim, Math.atan2(dy, dx), 7.5 * dt);

      this.strafeT -= dt;
      if (this.strafeT <= 0) { this.strafeT = rand(0.7, 1.7); if (chance(0.45)) this.strafe *= -1; }

      if (kit) {
        const kdx = kit.x - this.x, kdy = kit.y - this.y;
        const kd = Math.hypot(kdx, kdy) || 1;
        mx = kdx / kd; my = kdy / kd;
      } else if (!clear || d > BOT_ENGAGE) {
        mx = ux - uy * this.strafe * 0.45;
        my = uy + ux * this.strafe * 0.45;
      } else if (d < BOT_TOOCLOSE) {
        mx = -ux * 0.9 - uy * this.strafe * 0.6;
        my = -uy * 0.9 + ux * this.strafe * 0.6;
      } else {
        const pull = (d - BOT_PREFER) / BOT_PREFER;
        mx = ux * pull * 0.7 - uy * this.strafe;
        my = uy * pull * 0.7 + ux * this.strafe;
      }

      if (clear && d < BOT_ENGAGE) {
        this.reactT += dt;
        if (this.reactT > BOT_REACT) {
          this.burstT -= dt;
          if (this.burstT <= 0) {
            this.bursting = !this.bursting;
            this.burstT = this.bursting ? rand(BOT_BURST_ON * 0.7, BOT_BURST_ON * 1.3)
              : rand(BOT_BURST_OFF * 0.7, BOT_BURST_OFF * 1.4);
          }
          if (this.bursting) {
            const lead = 0.16;
            this.shoot(world, Math.atan2(
              foe.y + foe.vy * lead - this.y,
              foe.x + foe.vx * lead - this.x,
            ) + rand(-this.jitter, this.jitter));
          }
        }
      } else {
        this.reactT = 0; this.bursting = false;
        if (this.mag < this.magSize * 0.5) this.startReload();
      }
    } else {
      this.wanderT -= dt;
      if (this.wanderT <= 0) {
        this.wanderT = rand(1.4, 3);
        this.wanderX = rand(80, MAP_W - 80);
        this.wanderY = rand(80, MAP_H - 80);
      }
      const dx = this.wanderX - this.x, dy = this.wanderY - this.y;
      const d = Math.hypot(dx, dy) || 1;
      mx = dx / d; my = dy / d;
      this.aim = approachAngle(this.aim, Math.atan2(dy, dx), 5 * dt);
    }

    const m = Math.hypot(mx, my) || 1;
    mx /= m; my /= m;
    const steer = this.avoid(mx, my, world);
    this.vx = damp(this.vx, steer[0] * this.speed, 10, dt);
    this.vy = damp(this.vy, steer[1] * this.speed, 10, dt);
  }

  private avoid(mx: number, my: number, world: World): [number, number] {
    const probe = 48;
    if (!this.blocked(this.x + mx * probe, this.y + my * probe, world)) return [mx, my];
    for (const a of [0.7, -0.7, 1.4, -1.4, 2.2, -2.2]) {
      const c = Math.cos(a), s = Math.sin(a);
      const nx = mx * c - my * s, ny = mx * s + my * c;
      if (!this.blocked(this.x + nx * probe, this.y + ny * probe, world)) return [nx, ny];
    }
    return [-mx, -my];
  }

  private blocked(x: number, y: number, world: World): boolean {
    for (const w of world.walls) {
      if (x > w.x - FIGHT_R && x < w.x + w.w + FIGHT_R && y > w.y - FIGHT_R && y < w.y + w.h + FIGHT_R) return true;
    }
    return false;
  }

  private pickTarget(world: World): Fighter | null {
    let best: Fighter | null = null;
    let bestScore = Infinity;
    for (const f of world.fighters) {
      if (f.team === this.team || !f.alive) continue;
      const d = Math.sqrt(dist2(this.x, this.y, f.x, f.y));
      const score = d * (world.losClear(this.x, this.y, f.x, f.y) ? 1 : 2.1);
      if (score < bestScore) { bestScore = score; best = f; }
    }
    return best;
  }

  shoot(world: World, angle: number): void {
    if (this.cool > 0 || this.reloadT > 0 || !this.alive) return;
    if (this.mag <= 0) { this.startReload(); return; }
    this.cool = 1 / this.rate;
    this.mag--;
    this.muzzle = 1;
    this.recoil = 1;
    const cone = this.spread + this.bloom * BLOOM_MAX;
    this.bloom = Math.min(1, this.bloom + BLOOM_GAIN);
    for (let i = 0; i < this.shots; i++) {
      const off = this.shots === 1 ? 0 : (i - (this.shots - 1) / 2) * 0.075;
      world.fire(this, angle + off + rand(-cone, cone));
    }
    world.shotFx(this, angle);
    if (this.mag <= 0) this.startReload();
  }

  move(dt: number, world: World): void {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    for (const w of world.walls) {
      const [dx, dy] = resolveCircleRect(this.x, this.y, FIGHT_R, w);
      if (dx !== 0 || dy !== 0) {
        this.x += dx; this.y += dy;
        if (dx !== 0) this.vx *= 0.2;
        if (dy !== 0) this.vy *= 0.2;
      }
    }
    this.x = clamp(this.x, FIGHT_R, MAP_W - FIGHT_R);
    this.y = clamp(this.y, FIGHT_R, MAP_H - FIGHT_R);

    const spd = Math.hypot(this.vx, this.vy);
    this.legAmt = damp(this.legAmt, spd > 18 ? 1 : 0, 10, dt);
    this.walk += spd * dt * 0.085;
    if (spd > 24) {
      this.stepAcc += spd * dt;
      if (this.stepAcc > 52) { this.stepAcc = 0; this.stepped = true; }
    } else this.stepAcc = 0;
  }

  /* ================= drawing ================= */

  draw(ctx: CanvasRenderingContext2D): void {
    if (!this.alive) { this.drawCorpse(ctx); return; }
    const c: Hsl = this.team === 0 ? BLUE : RED;

    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.beginPath();
    ctx.ellipse(this.x + 3, this.y + 7, FIGHT_R * 1.2, FIGHT_R * 0.66, 0, 0, TAU);
    ctx.fill();

    const pop = 1 + easeOutCubic(this.spawnPop) * 0.28;
    const breath = this.legAmt < 0.2 ? 1 + Math.sin(this.breathe) * 0.017 : 1;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.aim);
    ctx.scale(pop * breath, pop * breath * (1 - Math.abs(this.turnLean) * 0.07));
    this.drawSoldier(ctx, c, 1, false);
    ctx.restore();

    if (this.muzzle > 0.04) this.drawMuzzle(ctx);

    if (this.hurt > 0.02) {
      ctx.globalAlpha = this.hurt * 0.45;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(this.x, this.y, FIGHT_R + 2, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (this.shieldT > 0) {
      ctx.strokeStyle = css(c, 36, 0.5 + Math.sin(this.shieldT * 22) * 0.25);
      ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.arc(this.x, this.y, FIGHT_R + 8, 0, TAU); ctx.stroke();
    }
    this.drawTag(ctx, c);
  }

  /** Cartoon soldier, +X forward, heavy dark outlines so it reads at any size. */
  private drawSoldier(ctx: CanvasRenderingContext2D, c: Hsl, alpha: number, dead: boolean): void {
    ctx.globalAlpha = alpha;
    ctx.lineJoin = 'round';
    const kick = this.recoil * 4;
    const sw = dead ? 6 : Math.sin(this.walk * 6.2) * 6.4 * this.legAmt;
    const ink = OUTLINE;

    const O = (lw = 2.4) => { ctx.lineWidth = lw; ctx.strokeStyle = ink; ctx.stroke(); };

    /* legs + boots */
    ctx.fillStyle = dead ? '#2b3039' : '#3b4351';
    roundRect(ctx, -5 + sw, -11.5, 13, 7.5, 3.4); ctx.fill(); O(2.2);
    roundRect(ctx, -5 - sw, 4, 13, 7.5, 3.4); ctx.fill(); O(2.2);
    ctx.fillStyle = '#1c212a';
    roundRect(ctx, 5 + sw * 1.2, -11.2, 8.5, 6.9, 3); ctx.fill(); O(2);
    roundRect(ctx, 5 - sw * 1.2, 4.3, 8.5, 6.9, 3); ctx.fill(); O(2);

    /* backpack */
    ctx.fillStyle = css(c, -32, 1, -20);
    roundRect(ctx, -16, -9, 10, 18, 4); ctx.fill(); O(2.3);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    roundRect(ctx, -14, -6.5, 6, 13, 2.6); ctx.fill();

    /* torso */
    ctx.save();
    ctx.translate(-kick * 0.45, 0);
    const g = ctx.createLinearGradient(0, -14, 0, 14);
    g.addColorStop(0, css(c, -16));
    g.addColorStop(0.45, css(c, 12));
    g.addColorStop(1, css(c, -24));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(-1.5, 0, 12.5, 13.5, 0, 0, TAU); ctx.fill(); O(2.6);

    /* plate carrier */
    ctx.fillStyle = css(c, -28, 1, -26);
    roundRect(ctx, -7.5, -9.5, 13, 19, 4.5); ctx.fill(); O(2);
    ctx.fillStyle = 'rgba(255,255,255,0.13)';
    roundRect(ctx, -6.4, -8.4, 3.2, 16.8, 1.6); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    roundRect(ctx, -2, -8.2, 6, 5.6, 1.8); ctx.fill();
    roundRect(ctx, -2, 2.6, 6, 5.6, 1.8); ctx.fill();

    /* shoulder pads */
    ctx.fillStyle = css(c, 18);
    roundRect(ctx, -6.5, -14.6, 10.5, 6, 2.8); ctx.fill(); O(2.1);
    roundRect(ctx, -6.5, 8.6, 10.5, 6, 2.8); ctx.fill(); O(2.1);
    ctx.restore();

    /* arms out to the rifle */
    ctx.fillStyle = SKIN;
    ctx.save();
    ctx.translate(2 - kick, -8.6); ctx.rotate(0.36);
    roundRect(ctx, 0, -3, 15, 6, 3); ctx.fill(); O(2.2);
    ctx.restore();
    ctx.save();
    ctx.translate(2 - kick, 8.6); ctx.rotate(-0.52);
    roundRect(ctx, 0, -3, 18, 6, 3); ctx.fill(); O(2.2);
    ctx.restore();

    /* rifle */
    this.drawRifle(ctx, kick);

    /* gloves */
    ctx.fillStyle = '#20252f';
    ctx.beginPath(); ctx.arc(16.5 - kick, -5, 3.7, 0, TAU); ctx.fill(); O(2);
    ctx.beginPath(); ctx.arc(19.5 - kick, 4.2, 3.7, 0, TAU); ctx.fill(); O(2);

    /* head: skin disc, cap over the back, face to the front */
    ctx.save();
    ctx.translate(2 - kick * 0.5, 0);
    ctx.fillStyle = SKIN;
    ctx.beginPath(); ctx.arc(0, 0, 8, 0, TAU); ctx.fill(); O(2.5);
    // cap / helmet covering everything but the face
    ctx.fillStyle = css(c, 8, 1, -10);
    ctx.beginPath();
    ctx.arc(0, 0, 8.2, 0.78, TAU - 0.78);
    ctx.closePath(); ctx.fill(); O(2.3);
    ctx.fillStyle = 'rgba(255,255,255,0.20)';
    ctx.beginPath(); ctx.ellipse(-2.4, -2.8, 3.6, 2.4, -0.5, 0, TAU); ctx.fill();
    // brim
    ctx.fillStyle = css(c, -18, 1, -10);
    roundRect(ctx, 5.4, -4.4, 4.4, 8.8, 2.2); ctx.fill(); O(2);
    // eyes peeking under the brim
    if (!dead) {
      ctx.fillStyle = '#25292f';
      ctx.beginPath(); ctx.arc(4.4, -2.6, 1.25, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(4.4, 2.6, 1.25, 0, TAU); ctx.fill();
    }
    ctx.restore();

    ctx.globalAlpha = 1;
  }

  private drawRifle(ctx: CanvasRenderingContext2D, kick: number): void {
    const O = (lw = 2.2) => { ctx.lineWidth = lw; ctx.strokeStyle = OUTLINE; ctx.stroke(); };
    ctx.save();
    ctx.translate(-kick, 0);
    ctx.fillStyle = '#2c313b';
    roundRect(ctx, -7, -2.6, 13, 5.2, 2.2); ctx.fill(); O(2);           // stock
    ctx.fillStyle = '#39404c';
    roundRect(ctx, 4, -3.4, 15, 6.8, 2.4); ctx.fill(); O(2.2);          // receiver
    ctx.fillStyle = 'rgba(255,255,255,0.13)';
    roundRect(ctx, 5.4, -2.8, 12, 1.9, 1); ctx.fill();
    ctx.save();                                                          // magazine
    ctx.translate(10.5, 3); ctx.rotate(0.24);
    ctx.fillStyle = '#1e232c';
    roundRect(ctx, -2.8, 0, 5.6, 9.6, 2); ctx.fill(); O(2);
    ctx.restore();
    ctx.fillStyle = '#313742';
    roundRect(ctx, 18, -2.7, 9, 5.4, 2); ctx.fill(); O(2);              // handguard
    ctx.fillStyle = '#4a5364';
    roundRect(ctx, 26, -1.6, 9, 3.2, 1.4); ctx.fill(); O(1.8);          // barrel
    ctx.fillStyle = '#626c80';
    roundRect(ctx, 33, -2.3, 4, 4.6, 1.5); ctx.fill(); O(1.8);          // muzzle device
    ctx.fillStyle = '#525a68';
    roundRect(ctx, 15, -5.4, 2.4, 2.6, 0.9); ctx.fill();                // iron sight
    ctx.restore();
  }

  private drawMuzzle(ctx: CanvasRenderingContext2D): void {
    const m = this.muzzle;
    const d = 37 - this.recoil * 4;
    const mx = this.x + Math.cos(this.aim) * d;
    const my = this.y + Math.sin(this.aim) * d;
    glow(ctx, mx, my, 38 * m, 'rgba(255,214,132,0.95)', 0.95 * m);
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(this.aim);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = m;
    ctx.fillStyle = 'rgba(255,240,196,0.95)';
    const s = 1 + m;
    ctx.beginPath();
    ctx.moveTo(14 * s, 0);
    ctx.lineTo(2.6 * s, 3.6 * s);
    ctx.lineTo(0, 9.5 * s);
    ctx.lineTo(-2.6 * s, 3.6 * s);
    ctx.lineTo(-9.5 * s, 0);
    ctx.lineTo(-2.6 * s, -3.6 * s);
    ctx.lineTo(0, -9.5 * s);
    ctx.lineTo(2.6 * s, -3.6 * s);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath(); ctx.arc(0, 0, 3.4 * s, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawCorpse(ctx: CanvasRenderingContext2D): void {
    const t = this.deadT;
    if (t > RESPAWN_TIME) return;
    const c: Hsl = this.team === 0 ? BLUE : RED;
    const fade = clamp((RESPAWN_TIME - t) / 0.7, 0, 1);
    const grow = easeOutCubic(clamp(t / 0.9, 0, 1));

    ctx.globalAlpha = fade * 0.6;
    ctx.fillStyle = css(BLOOD, -6);
    ctx.beginPath();
    ctx.ellipse(this.x + Math.cos(this.deathAngle) * 5, this.y + Math.sin(this.deathAngle) * 5,
      24 * grow, 17 * grow, this.deathAngle, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;

    const slump = easeOutCubic(clamp(t / 0.35, 0, 1));
    ctx.save();
    ctx.translate(this.x + Math.cos(this.deathAngle) * 6 * slump, this.y + Math.sin(this.deathAngle) * 6 * slump);
    ctx.rotate(this.aim + this.deathSpin * slump);
    ctx.scale(1, lerp(1, 0.84, slump));
    this.drawSoldier(ctx, { h: c.h, s: c.s * 0.3, l: c.l * 0.5 }, fade * 0.9, true);
    ctx.restore();
  }

  private drawTag(ctx: CanvasRenderingContext2D, c: Hsl): void {
    if (this.isPlayer) {
      const y = this.y - FIGHT_R - 10;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(this.x - 6.5, y - 7); ctx.lineTo(this.x, y); ctx.lineTo(this.x + 6.5, y - 7);
      ctx.closePath(); ctx.fill();
      ctx.lineWidth = 2.2; ctx.lineJoin = 'round'; ctx.strokeStyle = OUTLINE; ctx.stroke();
      return;
    }
    const w = 30, hpf = clamp(this.hp / this.maxHp, 0, 1);
    const y = this.y - FIGHT_R - 14;
    roundRect(ctx, this.x - w / 2, y, w, 6, 3);
    ctx.fillStyle = 'rgba(16,20,30,0.82)'; ctx.fill();
    roundRect(ctx, this.x - w / 2 + 1.2, y + 1.2, (w - 2.4) * hpf, 3.6, 1.8);
    ctx.fillStyle = css(c, 26); ctx.fill();
  }
}

/* ------------------------------------------------------------------ */

export class KillFeed {
  items: { text: string; life: number; team: 0 | 1; big: boolean }[] = [];
  push(text: string, team: 0 | 1, big = false): void {
    this.items.unshift({ text, life: 4.2, team, big });
    if (this.items.length > 5) this.items.length = 5;
  }
  update(dt: number): void {
    for (const it of this.items) it.life -= dt;
    this.items = this.items.filter((i) => i.life > 0);
  }
}
