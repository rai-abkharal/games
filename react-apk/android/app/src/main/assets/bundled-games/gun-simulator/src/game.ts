/**
 * game.ts — GunView (sprite assembly + animation), Fx (flash/smoke/casings),
 * Hud (buttons, ammo) and Game (the firing state machine).
 */
import { Application, Container, Graphics, Rectangle, Sprite, Text, Texture, type FederatedPointerEvent } from 'pixi.js';
import { GUN_META, IMAGES, IMAGE_MIME } from './assets';
import { Sfx } from './audio';
import { AUTO_HOLD_DELAY, FIRE_ZONE, GUNS, GUN_CENTER_Y, LONG_GUN_X_SHIFT, VIEW_H, VIEW_W, clamp, damp, lerp, rand, type GunDef } from './data';

// ------------------------------------------------------------------ textures
export type TexMap = Record<string, Texture>;

export async function loadTextures(): Promise<TexMap> {
  const out: TexMap = {};
  await Promise.all(Object.keys(IMAGES).map(async (k) => {
    const img = new Image();
    img.src = `data:${IMAGE_MIME[k] ?? 'image/png'};base64,${IMAGES[k]}`;
    try { await img.decode(); } catch { await new Promise<void>((res) => { img.onload = () => res(); img.onerror = () => res(); }); }
    out[k] = Texture.from(img);
  }));
  return out;
}

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const smooth = (t: number) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------ gun view
interface PartMeta { name: string; file: string; x: number; y: number; w: number; h: number }

export class GunView extends Container {
  def!: GunDef;
  meta: any;
  scaleF = 1;
  body!: Sprite; mag: Sprite | null = null; action!: Sprite;
  muzzle = { x: 0, y: 0 };
  eject = { x: 0, y: 0 };
  actionTravel = { x: 0, y: 0 };
  magDrop = { x: 0, y: 0 };
  actionT = 0;      // 0 = closed, 1 = fully back
  magT = 0;         // 0 = seated, 1 = dropped
  private parts: Sprite[] = [];

  constructor(private tex: TexMap) { super(); }

  setGun(def: GunDef): void {
    this.removeChildren();
    this.parts = [];
    this.def = def;
    const m = GUN_META[def.id];
    this.meta = m;
    const parts: PartMeta[] = m.parts;
    const body = parts.find((p) => p.name === 'body')!;
    const s = def.displayWidth / body.w;
    this.scaleF = s;
    const cx = body.x + body.w / 2, cy = body.y + body.h / 2;
    const make = (p: PartMeta): Sprite => {
      const sp = new Sprite(this.tex[p.file.replace(/\.\w+$/, '')]);
      sp.position.set((p.x - cx) * s, (p.y - cy) * s + (def.yOffset ?? 0));
      sp.scale.set(s);
      (sp as any).__base = { x: sp.x, y: sp.y };
      return sp;
    };
    const order = m.magOnTop ? ['body', 'mag', 'action'] : ['mag', 'body', 'action'];
    for (const name of order) {
      const p = parts.find((q) => q.name === name);
      if (!p) continue;
      const sp = make(p);
      this.addChild(sp);
      this.parts.push(sp);
      if (name === 'body') this.body = sp; else if (name === 'mag') this.mag = sp; else this.action = sp;
    }
    this.muzzle = { x: (m.muzzle[0] - cx) * s, y: (m.muzzle[1] - cy) * s + (def.yOffset ?? 0) };
    this.eject = { x: (m.eject[0] - cx) * s, y: (m.eject[1] - cy) * s + (def.yOffset ?? 0) };
    this.actionTravel = { x: m.actionTravel[0] * s, y: m.actionTravel[1] * s };
    this.magDrop = { x: m.magDrop[0] * s, y: m.magDrop[1] * s };
    this.actionT = 0; this.magT = 0;
    this.apply();
  }

  get holdOpen(): boolean { return !!this.meta?.holdOpen; }

  apply(): void {
    const a = (this.action as any).__base;
    this.action.position.set(a.x + this.actionTravel.x * this.actionT, a.y + this.actionTravel.y * this.actionT);
    if (this.mag) {
      const b = (this.mag as any).__base;
      this.mag.position.set(b.x + this.magDrop.x * this.magT, b.y + this.magDrop.y * this.magT);
      this.mag.alpha = 1 - 0.9 * smooth(this.magT);
      this.mag.rotation = 0.18 * this.magT * (this.meta.magOnTop ? -1 : 1);
    }
  }

  setTint(c: number): void { for (const p of this.parts) p.tint = c; }
}

// ------------------------------------------------------------------ effects
interface Casing { sp: Sprite; vx: number; vy: number; av: number; bounces: number; life: number }
interface Puff { sp: Sprite; vx: number; vy: number; life: number; max: number; grow: number }

export class Fx {
  smokeLayer = new Container();
  casingLayer = new Container();
  private casings: Casing[] = [];
  private puffs: Puff[] = [];
  private lastShell = -1;
  constructor(private tex: TexMap, private sfx: Sfx) { }

  spawnSmoke(x: number, y: number, n: number, power: number): void {
    for (let i = 0; i < n; i++) {
      const sp = new Sprite(this.tex[`smoke_${i & 1}`]);
      sp.anchor.set(0.5);
      sp.position.set(x + rand(-6, 6), y + rand(-6, 6));
      sp.rotation = rand(0, Math.PI * 2);
      sp.scale.set(0.12 * power);
      sp.alpha = 0;
      sp.tint = 0xd8d8e0;
      this.smokeLayer.addChild(sp);
      const max = rand(0.9, 1.6) * (0.7 + power * 0.4);
      this.puffs.push({ sp, vx: -rand(35, 110) * power, vy: -rand(10, 45), life: max, max, grow: rand(0.35, 0.7) * power });
    }
  }

  spawnCasing(x: number, y: number, dirX: number, dirY: number, def: GunDef): void {
    const sp = new Sprite(this.tex[`case_${def.casing}`]);
    sp.anchor.set(0.5);
    sp.position.set(x, y);
    sp.scale.set(0.28 * def.casingScale);
    sp.rotation = rand(0, Math.PI);
    this.casingLayer.addChild(sp);
    const sp2 = rand(260, 380) * (def.casing === 'shell' ? 0.8 : 1);
    const len = Math.hypot(dirX, dirY) || 1;
    this.casings.push({ sp, vx: (dirX / len) * sp2 + rand(-40, 40), vy: (dirY / len) * sp2 + rand(-60, 30), av: rand(-14, 14), bounces: 0, life: 3 });
  }

  update(dt: number, now: number, floorY: number): void {
    for (let i = this.casings.length - 1; i >= 0; i--) {
      const c = this.casings[i];
      c.vy += 1500 * dt;
      c.sp.x += c.vx * dt; c.sp.y += c.vy * dt; c.sp.rotation += c.av * dt;
      if (c.sp.y > floorY && c.vy > 0) {
        c.sp.y = floorY;
        c.vy = -c.vy * (c.bounces === 0 ? 0.32 : 0.15); c.vx *= 0.55; c.av *= 0.4;
        if (c.bounces === 0 && now - this.lastShell > 0.06) {
          this.lastShell = now;
          this.sfx.play('shell', { gain: 0.42, rate: rand(0.88, 1.18) });
        }
        c.bounces++;
      }
      if (c.bounces >= 2) { c.life -= dt * 3; c.sp.alpha = clamp(c.life / 1, 0, 1); }
      if (c.life <= 0 || c.sp.x > VIEW_W + 60 || c.sp.x < -60) { c.sp.destroy(); this.casings.splice(i, 1); }
    }
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.life -= dt;
      const t = 1 - p.life / p.max;
      p.sp.x += p.vx * dt; p.sp.y += p.vy * dt;
      p.vx *= Math.exp(-2.4 * dt); p.vy -= 12 * dt;
      p.sp.rotation += 0.35 * dt;
      p.sp.scale.set(0.12 + p.grow * t);
      p.sp.alpha = 0.6 * Math.sin(Math.PI * Math.min(1, t * 1.3 > 1 ? 1 : t)) * (1 - t) ** 0.5;
      if (p.life <= 0) { p.sp.destroy(); this.puffs.splice(i, 1); }
    }
  }
}

// ------------------------------------------------------------------ hud widgets
function button(w: number, h: number, draw: (g: Graphics, on: boolean, down: boolean) => void): Container & { setOn(v: boolean): void; press(): void } {
  const c = new Container() as any;
  const g = new Graphics();
  c.addChild(g);
  let on = false, down = false;
  const redraw = () => { g.clear(); draw(g, on, down); };
  c.setOn = (v: boolean) => { on = v; redraw(); };
  c.press = () => { down = true; redraw(); setTimeout(() => { down = false; redraw(); }, 90); };
  c.eventMode = 'static'; c.cursor = 'pointer';
  c.hitArea = new Rectangle(-w / 2, -h / 2, w, h);
  c.on('pointerdown', () => { down = true; redraw(); });
  const up = () => { down = false; redraw(); };
  c.on('pointerup', up); c.on('pointerupoutside', up); c.on('pointercancel', up);
  redraw();
  return c;
}

function pill(g: Graphics, w: number, h: number, on: boolean, down: boolean): void {
  g.roundRect(-w / 2, -h / 2, w, h, h / 2).fill({ color: on ? 0xe8b24a : 0x1c1e24, alpha: on ? 0.95 : 0.92 })
    .stroke({ width: 1.5, color: on ? 0xffd77a : 0x4a4f5a, alpha: 0.9 });
  if (down) g.roundRect(-w / 2, -h / 2, w, h, h / 2).fill({ color: 0xffffff, alpha: 0.12 });
}

function label(text: string, size: number, color: number, weight = '800', spacing = 1): Text {
  const t = new Text({
    text,
    style: {
      fontFamily: FONT, fontSize: size, fontWeight: weight as any, fill: color, letterSpacing: spacing, align: 'center',
      dropShadow: { color: 0x000000, alpha: 0.45, blur: 3, distance: 1 }
    }
  });
  t.anchor.set(0.5);
  t.resolution = 2;
  return t;
}

// ------------------------------------------------------------------ game
type Mode = 'single' | 'burst';

export class Game {
  world = new Container();
  hud = new Container();
  gunRoot = new Container();
  gun: GunView;
  fx: Fx;
  flashLayer = new Container();
  glow: Sprite;
  flash: Sprite;

  index = 0;
  def: GunDef = GUNS[0];
  ammo = 0;
  mode: Mode = 'single';
  now = 0;
  nextShot = 0;
  burstLeft = 0;
  pressed = false;
  holdTime = 0;
  autoFiring = false;
  reloading = false;
  reloadT = 0;
  reloadFired = { magOut: false, magIn: false, action: false, release: false };
  shellsToLoad = 0; shellTimer = 0;
  cycleUntil = 0; cycleStart = 0; cycleDur = 0;
  actionAnim = 0;           // time since last auto-cycle trigger
  recoilAmt = 0; tilt = 0;
  camX = 0; camY = 0; camVX = 0; camVY = 0;
  flashLife = 0;
  flashFrames = 0;   // rendered frames since the shot (flash stays >= 2 frames)
  switching: { phase: 1 | 2; t: number; dir: number; to: number } | null = null;
  pivotX = 0;
  muted = false;

  // hud refs
  nameText!: Text; calText!: Text; counterText!: Text; ammoText!: Text; reloadHint!: Text; autoTag!: Text;
  ammoRow = new Container();
  btnSingle!: any; btnBurst!: any; btnMute!: any;
  btnLeft!: any; btnRight!: any; btnReload!: any; hintText!: Text;
  reloadIcon!: Graphics; reloadLabel!: Text;
  bg!: Sprite; bgOverlay!: Graphics;
  targetH = VIEW_H;

  constructor(private app: Application, private tex: TexMap, private sfx: Sfx) {
    this.gun = new GunView(tex);
    this.fx = new Fx(tex, sfx);
    this.bg = new Sprite(tex['bg']); this.bg.width = VIEW_W; this.bg.height = VIEW_H; this.bg.alpha = 0.4;
    this.bgOverlay = new Graphics(); this.bgOverlay.rect(0, 0, VIEW_W, VIEW_H).fill({ color: 0x828fa6, alpha: 0.65 });
    app.stage.addChild(this.bg, this.bgOverlay, this.world, this.hud);

    this.gunRoot.position.set(VIEW_W / 2, GUN_CENTER_Y);
    this.world.addChild(this.fx.smokeLayer, this.gunRoot, this.fx.casingLayer);
    this.gunRoot.addChild(this.gun, this.flashLayer);

    this.glow = new Sprite(tex['smoke_0']); this.glow.anchor.set(0.5); this.glow.blendMode = 'add'; this.glow.tint = 0xff9a3c; this.glow.visible = false;
    this.flash = new Sprite(tex['flash_rifle_0']); this.flash.anchor.set(0.984, 0.5); this.flash.blendMode = 'add'; this.flash.visible = false;
    this.flashLayer.addChild(this.glow, this.flash);

    this.buildHud();
    this.bindInput();
    app.ticker.add(() => { this.flashFrames++; });
    this.loadGun(0, true);
  }

  private drawReloadIcon(g: Graphics, color = 0xe8b24a): void {
    g.clear();
    g.arc(0, 0, 10.5, -2.1, 2.7).stroke({ width: 2.8, color, cap: 'round' });
    g.moveTo(-1.5, -11.0).lineTo(-8.5, -15.5).lineTo(-7.5, -6.0).closePath().fill({ color });
  }

  relayout(targetH: number): void {
    this.targetH = targetH;
    this.bg.height = targetH;
    if (this.bgOverlay) {
      this.bgOverlay.clear();
      this.bgOverlay.rect(0, 0, VIEW_W, targetH).fill({ color: 0x828fa6, alpha: 0.65 });
    }
    const offsetY = targetH - VIEW_H;
    const gunY = Math.round(GUN_CENTER_Y + offsetY * 0.5);
    this.gunRoot.y = gunY;
    this.reloadHint.y = gunY + 136;

    const my = 486 + offsetY;
    if (this.btnSingle) this.btnSingle.y = my;
    if (this.btnBurst) this.btnBurst.y = my;
    if (this.autoTag) this.autoTag.y = 520 + offsetY;

    const ay = 586 + offsetY;
    if (this.btnLeft) this.btnLeft.y = ay;
    if (this.btnRight) this.btnRight.y = ay;
    if (this.btnReload) this.btnReload.y = ay;

    if (this.ammoText) this.ammoText.y = 650 + offsetY;
    if (this.ammoRow) this.ammoRow.y = 705 + offsetY;
    if (this.hintText) this.hintText.y = 782 + offsetY;

    FIRE_ZONE.y = 86;
    FIRE_ZONE.h = Math.max(360, my - 86 - 10);
    this.app.stage.hitArea = this.app.screen;
  }

  // ---------------------------------------------------------------- hud
  private buildHud(): void {
    const h = this.hud;
    this.counterText = label('01 / 16', 13, 0xffffff, '700', 2); this.counterText.position.set(54, 30); h.addChild(this.counterText);
    this.nameText = label('', 25, 0xf2f3f5, '900', 2.5); this.nameText.position.set(VIEW_W / 2, 46); h.addChild(this.nameText);
    this.calText = label('', 13, 0xb8bdc8, '600', 1.5); this.calText.position.set(VIEW_W / 2, 74); h.addChild(this.calText);

    // mute
    this.btnMute = button(44, 44, (g, on) => {
      g.circle(0, 0, 20).fill({ color: 0x1c1e24, alpha: 0.9 }).stroke({ width: 1.5, color: 0x4a4f5a });
      g.moveTo(-9, -4).lineTo(-4, -4).lineTo(3, -10).lineTo(3, 10).lineTo(-4, 4).lineTo(-9, 4).closePath().fill({ color: on ? 0x70747f : 0xe8b24a });
      if (on) g.moveTo(6, -7).lineTo(14, 7).stroke({ width: 2.5, color: 0xff6b5c });
      else { g.arc(5, 0, 6, -1.1, 1.1).stroke({ width: 2, color: 0xe8b24a }); g.arc(5, 0, 11, -1.0, 1.0).stroke({ width: 2, color: 0xe8b24a, alpha: 0.6 }); }
    });
    this.btnMute.position.set(VIEW_W - 34, 30);
    this.btnMute.on('pointertap', () => { this.muted = !this.muted; this.sfx.setMuted(this.muted); this.btnMute.setOn(this.muted); });
    h.addChild(this.btnMute);

    // fire mode row
    const my = 486;
    this.btnSingle = button(150, 44, (g, on, dn) => pill(g, 150, 44, on, dn));
    this.btnSingle.addChild(label('SINGLE SHOT', 14, 0xffffff, '800', 1.5)); this.btnSingle.position.set(VIEW_W / 2 - 82, my);
    this.btnSingle.on('pointertap', () => this.setMode('single'));
    this.btnBurst = button(150, 44, (g, on, dn) => pill(g, 150, 44, on, dn));
    this.btnBurst.addChild(label('BURST MODE', 14, 0xffffff, '800', 1.5)); this.btnBurst.position.set(VIEW_W / 2 + 82, my);
    this.btnBurst.on('pointertap', () => this.setMode('burst'));
    h.addChild(this.btnSingle, this.btnBurst);
    this.autoTag = label('HOLD THE GUN FOR FULL AUTO', 11, 0xffffff, '700', 2); this.autoTag.position.set(VIEW_W / 2, 520); h.addChild(this.autoTag);

    // arrows + reload
    const ay = 586;
    const arrow = (dir: number) => button(84, 84, (g, _on, dn) => {
      g.circle(0, 0, 34).fill({ color: dn ? 0x2d3240 : 0x212530, alpha: 0.94 }).stroke({ width: 1.8, color: 0x565e70 });
      g.moveTo(-8 * dir, -16).lineTo(9 * dir, 0).lineTo(-8 * dir, 16).stroke({ width: 5, color: 0xf2f3f5, cap: 'round', join: 'round' });
    });
    this.btnLeft = arrow(-1); this.btnLeft.position.set(62, ay); this.btnLeft.on('pointertap', () => this.switchGun(-1));
    this.btnRight = arrow(1); this.btnRight.position.set(VIEW_W - 62, ay); this.btnRight.on('pointertap', () => this.switchGun(1));
    this.btnReload = button(160, 56, (g, on, dn) => {
      g.roundRect(-80, -28, 160, 56, 28).fill({ color: dn ? 0x2d3240 : 0x212530, alpha: 0.96 }).stroke({ width: 1.8, color: on ? 0xffd06a : 0x565e70, alpha: on ? 1 : 0.85 });
    });
    this.reloadIcon = new Graphics();
    this.drawReloadIcon(this.reloadIcon);
    this.reloadIcon.position.set(-44, 0);
    this.reloadLabel = label('RELOAD', 15, 0xf2f3f5, '900', 2.5);
    this.reloadLabel.position.set(14, 0);
    this.btnReload.addChild(this.reloadIcon, this.reloadLabel);
    this.btnReload.position.set(VIEW_W / 2, ay); this.btnReload.on('pointertap', () => this.startReload());
    h.addChild(this.btnLeft, this.btnRight, this.btnReload);

    // ammo
    this.ammoText = label('', 14, 0xd8dbe2, '800', 2); this.ammoText.position.set(VIEW_W / 2, 650); h.addChild(this.ammoText);
    this.ammoRow.position.set(0, 705); h.addChild(this.ammoRow);
    this.reloadHint = label('TAP TO RELOAD', 22, 0xffd06a, '900', 3); this.reloadHint.position.set(VIEW_W / 2, 436); this.reloadHint.visible = false; h.addChild(this.reloadHint);
    this.hintText = label('TAP • FIRE      HOLD • AUTO      ◂ ▸ • CHANGE GUN', 10, 0xffffff, '700', 1.5); this.hintText.position.set(VIEW_W / 2, 782); h.addChild(this.hintText);
  }

  private setMode(m: Mode): void {
    this.mode = m;
    this.btnSingle.setOn(m === 'single');
    this.btnBurst.setOn(m === 'burst');
  }

  private refreshAmmo(): void {
    this.ammoText.text = `${this.ammo} / ${this.def.mag}${this.def.cls === 'lmg' ? '  BELT' : ''}`;
    this.ammoRow.removeChildren();
    const icon = this.tex[`round_${this.def.casing}`];
    const shown = Math.min(this.ammo, 50);
    const perRow = this.def.mag <= 10 ? this.def.mag : this.def.mag <= 30 ? Math.min(this.def.mag, 30) : 25;
    const rows = Math.max(1, Math.ceil(shown / perRow));
    const maxW = 400;
    const cell = Math.min(34, maxW / perRow);
    const sc = Math.min(cell / icon.width * 0.78, 0.62);
    for (let i = 0; i < shown; i++) {
      const sp = new Sprite(icon); sp.anchor.set(0.5, 1); sp.scale.set(sc);
      const r = Math.floor(i / perRow), c = i % perRow;
      const rowN = Math.min(perRow, shown - r * perRow);
      sp.position.set(VIEW_W / 2 + (c - (rowN - 1) / 2) * cell, 40 + r * (icon.height * sc + 4) - (rows - 1) * (icon.height * sc + 4) * 0.5);
      this.ammoRow.addChild(sp);
    }
  }

  // ---------------------------------------------------------------- guns
  private loadGun(i: number, instant = false): void {
    this.index = (i + GUNS.length) % GUNS.length;
    this.def = GUNS[this.index];
    this.gun.setGun(this.def);
    this.gunRoot.x = VIEW_W / 2 + (this.def.cls === 'pistol' ? 0 : LONG_GUN_X_SHIFT);
    this.pivotX = this.def.displayWidth * 0.28;
    this.gun.pivot.set(this.pivotX, 0); this.gun.position.set(this.pivotX, 0);
    this.flashLayer.pivot.set(this.pivotX, 0); this.flashLayer.position.set(this.pivotX, 0);
    this.ammo = this.def.mag;
    this.reloading = false; this.burstLeft = 0; this.autoFiring = false; this.cycleUntil = 0; this.cycleDur = 0; this.nextShot = 0; this.actionAnim = 0; this.recoilAmt = 0;
    this.nameText.text = this.def.name.toUpperCase();
    this.calText.text = this.def.caliber;
    this.counterText.text = `${String(this.index + 1).padStart(2, '0')} / ${GUNS.length}`;
    this.setMode(this.mode);
    this.refreshAmmo();
    this.reloadHint.visible = false;
    if (instant) { this.gun.alpha = 1; this.flashLayer.alpha = 1; }
  }

  switchGun(dir: number): void {
    if (this.switching) return;
    this.sfx.unlock();
    this.pressed = false; this.autoFiring = false; this.burstLeft = 0;
    this.switching = { phase: 1, t: 0, dir, to: this.index + dir };
    this.sfx.play('reload_mag', { gain: 0.3, rate: 1.25, duration: 0.3 });
  }

  // ---------------------------------------------------------------- input
  private bindInput(): void {
    // Fire zone: any press on the stage that isn't on a HUD button, inside FIRE_ZONE.
    const stage = this.app.stage;
    stage.eventMode = 'static';
    stage.hitArea = this.app.screen;
    const inZone = (p: { x: number; y: number }) => p.x >= FIRE_ZONE.x && p.x <= FIRE_ZONE.x + FIRE_ZONE.w && p.y >= FIRE_ZONE.y && p.y <= FIRE_ZONE.y + FIRE_ZONE.h;
    stage.on('pointerdown', (e: FederatedPointerEvent) => {
      this.sfx.unlock();
      if (e.target === stage && inZone(e.global)) this.press();
    });
    const rel = () => this.release();
    stage.on('pointerup', rel); stage.on('pointerupoutside', rel); stage.on('pointercancel', rel);
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.sfx.unlock();
      if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); this.press(); }
      else if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.switchGun(-1);
      else if (e.code === 'ArrowRight' || e.code === 'KeyD') this.switchGun(1);
      else if (e.code === 'KeyR') this.startReload();
      else if (e.code === 'Digit1') this.setMode('single');
      else if (e.code === 'Digit2') this.setMode('burst');
      else if (e.code === 'KeyM') { this.muted = !this.muted; this.sfx.setMuted(this.muted); this.btnMute.setOn(this.muted); }
    });
    window.addEventListener('keyup', (e) => { if (e.code === 'Space' || e.code === 'Enter') this.release(); });
    window.addEventListener('blur', () => this.release());
  }

  private press(): void {
    this.sfx.unlock();
    if (this.switching) return;
    if (this.reloading) return;
    if (this.ammo <= 0) { this.startReload(); return; }
    this.pressed = true; this.holdTime = 0; this.autoFiring = false;
    if (this.mode === 'single') this.tryFire();
    else this.burstLeft = this.def.burst;
  }

  private release(): void {
    this.pressed = false; this.autoFiring = false; this.holdTime = 0;
  }

  // ---------------------------------------------------------------- firing
  private tryFire(): boolean {
    if (this.reloading || this.switching || this.ammo <= 0) return false;
    if (this.now < this.nextShot || this.now < this.cycleUntil) return false;
    this.shoot();
    return true;
  }

  private shoot(): void {
    const d = this.def;
    this.ammo--;
    this.nextShot = this.now + 60 / d.rpm;
    const pitchJitter = rand(0.965, 1.035);
    this.sfx.play(d.fire, { rate: d.firePitch * pitchJitter, gain: rand(0.88, 1) * (this.autoFiring ? 0.85 : 1) });
    try { if (navigator.vibrate) navigator.vibrate(d.haptic); } catch { /* unsupported */ }

    // muzzle flash + glow
    const k = Math.floor(Math.random() * 3);
    this.flash.texture = this.tex[`flash_${d.flash}_${k}`];
    const fs = d.flashScale * 0.42 * rand(0.86, 1.16);
    this.flash.scale.set(fs, fs * (Math.random() < 0.5 ? -1 : 1) * rand(0.85, 1.1));
    this.flash.rotation = rand(-0.09, 0.09);
    this.flash.position.set(this.gun.muzzle.x + 4, this.gun.muzzle.y);
    this.flash.visible = true; this.flash.alpha = 1;
    this.glow.position.set(this.gun.muzzle.x - 30 * d.flashScale, this.gun.muzzle.y);
    this.glow.scale.set(1.1 * d.flashScale); this.glow.alpha = 0.55; this.glow.visible = true;
    this.flashLife = 0.075; this.flashFrames = 0;
    this.gun.setTint(0xffe2c4);

    // recoil, camera kick, action cycle
    this.recoilAmt = 1;
    this.camVX += rand(0.6, 1) * d.kick * 14; this.camVY += rand(-0.7, 0.7) * d.kick * 10;
    if (d.manualCycle) {
      this.cycleStart = this.now + 0.14; this.cycleDur = d.manualCycle; this.cycleUntil = this.cycleStart + d.manualCycle;
    } else {
      this.actionAnim = 0.0001;
    }

    // ejected casing + smoke (world coords)
    const world = this.world;
    const ej = world.toLocal(this.gun.toGlobal({ x: this.gun.eject.x, y: this.gun.eject.y }));
    const dir = this.gun.meta.ejectDir as [number, number];
    if (!d.manualCycle) this.fx.spawnCasing(ej.x, ej.y, dir[0], dir[1], d);
    const mz = world.toLocal(this.gun.toGlobal({ x: this.gun.muzzle.x, y: this.gun.muzzle.y }));
    this.fx.spawnSmoke(mz.x, mz.y, d.smoke, 0.7 + d.flashScale * 0.6);

    if (this.ammo <= 0 && this.gun.holdOpen) this.gun.actionT = 1;
    this.refreshAmmo();
  }

  // ---------------------------------------------------------------- reload
  startReload(): void {
    if (this.reloading || this.switching) return;
    if (this.ammo >= this.def.mag) return;
    this.sfx.unlock();
    this.reloading = true; this.reloadT = 0; this.pressed = false; this.autoFiring = false; this.burstLeft = 0;
    this.reloadFired = { magOut: false, magIn: false, action: false, release: false };
    this.reloadHint.visible = false;
    if (this.def.tubeFed) {
      this.shellsToLoad = this.def.mag - this.ammo; this.shellTimer = 0.15;
    } else {
      this.sfx.play(this.def.reload, { rate: this.def.reloadPitch });
    }
  }

  private updateReload(dt: number): void {
    const d = this.def; const tl = d.reloadTimeline;
    this.reloadT += dt; const t = this.reloadT;
    if (d.tubeFed) {
      this.tilt = damp(this.tilt, 0.06, 8, dt);
      this.shellTimer -= dt;
      if (this.shellTimer <= 0 && this.shellsToLoad > 0) {
        this.shellsToLoad--; this.ammo++;
        this.sfx.play(d.reload, { rate: d.reloadPitch * rand(0.95, 1.06), gain: 0.9 });
        this.shellTimer = d.shellLoadTime ?? 0.5;
        this.refreshAmmo();
        // shotguns that lock open: chamber a shell after the first one goes in
        if (this.gun.actionT > 0.5 && this.gun.holdOpen) { this.actionAnim = 0.0001; this.gun.actionT = 0; }
      }
      if (this.shellsToLoad <= 0 && this.shellTimer <= 0.1) {
        if (d.manualCycle && !this.reloadFired.action) { this.reloadFired.action = true; this.cycleStart = this.now; this.cycleDur = d.manualCycle * 0.8; this.cycleUntil = this.now + this.cycleDur; this.reloadT = 0; }
        else if (!d.manualCycle || this.now >= this.cycleUntil) { this.reloading = false; this.tilt = 0; }
      }
      return;
    }
    // magazine timeline
    if (t >= tl.magOut) this.gun.magT = smooth((t - tl.magOut) / 0.28);
    if (t >= tl.magIn - 0.28) this.gun.magT = Math.min(this.gun.magT, 1 - smooth((t - (tl.magIn - 0.28)) / 0.28));
    if (t >= tl.magIn && !this.reloadFired.magIn) { this.reloadFired.magIn = true; this.gun.magT = 0; }
    this.tilt = damp(this.tilt, t < tl.magIn ? 0.07 : 0.02, 8, dt);
    // action: pull back at tl.action, release 0.2 s later (held-open guns just release)
    if (t >= tl.action && !this.reloadFired.action) {
      this.reloadFired.action = true;
      if (this.gun.holdOpen && this.gun.actionT > 0.5) { this.reloadFired.release = true; this.actionAnim = 0.06; }
      else { this.cycleStart = this.now; this.cycleDur = 0.32; this.cycleUntil = this.now + 0.32; }
    }
    if (t >= tl.end) { this.reloading = false; this.ammo = d.mag; this.gun.magT = 0; this.gun.actionT = 0; this.refreshAmmo(); }
  }

  // ---------------------------------------------------------------- loop
  update(dt: number): void {
    this.now += dt;
    const d = this.def;

    // gun switching animation
    if (this.switching) {
      const s = this.switching; s.t += dt;
      if (s.phase === 1) {
        const k = smooth(s.t / 0.16);
        this.gun.x = this.pivotX - s.dir * 620 * k; this.gun.alpha = 1 - k; this.flashLayer.alpha = 0;
        if (s.t >= 0.16) { this.loadGun(s.to); s.phase = 2; s.t = 0; this.gun.x = this.pivotX + s.dir * 620; this.gun.alpha = 0; }
      } else {
        const k = smooth(s.t / 0.22);
        this.gun.x = this.pivotX + s.dir * 620 * (1 - k); this.gun.alpha = k;
        if (s.t >= 0.22) { this.switching = null; this.gun.x = this.pivotX; this.gun.alpha = 1; this.flashLayer.alpha = 1; }
      }
    }

    // input -> fire
    if (this.pressed && !this.switching && !this.reloading) {
      this.holdTime += dt;
      if (this.burstLeft > 0) { if (this.tryFire()) this.burstLeft--; }
      else if (this.holdTime >= AUTO_HOLD_DELAY) { this.autoFiring = true; this.tryFire(); }
    } else if (this.burstLeft > 0 && !this.reloading && !this.switching) {
      if (this.tryFire()) this.burstLeft--;                       // finish the burst after a quick tap
    }
    if (this.ammo <= 0 && !this.reloading) { this.pressed = false; this.autoFiring = false; this.burstLeft = 0; }
    this.autoTag.style.fill = this.autoFiring ? 0xffd06a : 0xffffff;

    if (this.reloading) this.updateReload(dt);

    // action (slide / bolt / pump) animation
    if (this.actionAnim > 0) {
      this.actionAnim += dt;
      const a = this.actionAnim;
      const backT = 0.045, fwdT = 0.09;
      let v = a < backT ? a / backT : a < backT + fwdT ? 1 - (a - backT) / fwdT : 0;
      if (this.ammo <= 0 && this.gun.holdOpen && !this.reloading) v = Math.max(v, 1);
      this.gun.actionT = clamp(v, 0, 1);
      if (a >= backT + fwdT) this.actionAnim = 0;
    } else if (this.now >= this.cycleStart && this.now < this.cycleUntil && this.cycleDur > 0) {
      const p = (this.now - this.cycleStart) / this.cycleDur;
      this.gun.actionT = p < 0.4 ? smooth(p / 0.4) : p < 0.55 ? 1 : 1 - smooth((p - 0.55) / 0.45);
      this.tilt = damp(this.tilt, 0.03, 10, dt);
    } else if (!this.reloading && !(this.ammo <= 0 && this.gun.holdOpen)) {
      if (this.cycleDur > 0 && this.now >= this.cycleUntil) { this.gun.actionT = 0; this.cycleDur = 0; }
    }
    if (!this.reloading && !(this.now < this.cycleUntil)) this.tilt = damp(this.tilt, 0, 8, dt);

    // recoil / tilt
    this.recoilAmt = damp(this.recoilAmt, 0, this.autoFiring ? 22 : 16, dt);
    this.gun.rotation = -d.recoilRot * this.recoilAmt + this.tilt;
    this.flashLayer.rotation = this.gun.rotation;
    if (!this.switching) { this.gun.x = this.pivotX + d.recoil * this.recoilAmt; }
    this.flashLayer.x = this.gun.x;
    this.gun.y = 6 * this.recoilAmt * this.recoilAmt; this.flashLayer.y = this.gun.y;
    this.gun.apply();

    // camera kick (spring)
    this.camVX += -this.camX * 900 * dt; this.camVY += -this.camY * 900 * dt;
    this.camVX *= Math.exp(-14 * dt); this.camVY *= Math.exp(-14 * dt);
    this.camX += this.camVX * dt; this.camY += this.camVY * dt;
    this.world.position.set(this.camX, this.camY);

    // muzzle flash lifetime
    if (this.flash.visible) {
      this.flashLife -= dt;
      this.flash.alpha = clamp(this.flashLife / 0.05, 0.3, 1);
      this.glow.alpha = clamp(this.flashLife / 0.075, 0.2, 1) * 0.55;
      if (this.flashLife <= 0 && this.flashFrames >= 2) { this.flash.visible = false; this.glow.visible = false; this.gun.setTint(0xffffff); }
    }

    this.fx.update(dt, this.now, FIRE_ZONE.y + FIRE_ZONE.h - 8);

    // hint & reload button state
    const empty = this.ammo <= 0 && !this.reloading && !this.switching;
    this.reloadHint.visible = empty;
    if (empty) {
      this.reloadHint.alpha = 0.6 + 0.4 * Math.sin(this.now * 6);
      this.reloadHint.scale.set(1 + 0.03 * Math.sin(this.now * 6));
    }
    if (this.reloading) {
      if (this.reloadIcon) this.reloadIcon.rotation += dt * 9;
      if (this.reloadLabel) { this.reloadLabel.text = 'RELOAD'; this.reloadLabel.style.fill = 0xe8b24a; }
      if (this.btnReload) this.btnReload.setOn(true);
    } else {
      if (this.reloadIcon) this.reloadIcon.rotation = 0;
      if (this.reloadLabel) { this.reloadLabel.text = 'RELOAD'; this.reloadLabel.style.fill = empty ? 0xffd06a : 0xf2f3f5; }
      if (this.btnReload) this.btnReload.setOn(empty);
    }
  }
}

export { lerp };
