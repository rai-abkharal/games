import { W, VIEW } from './config';
import { sfx } from './sfx';

export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

/** The game canvas is 2x the logical size; each scene looks at a 480x800 world through a 2x camera. */
export function setupCamera(scene: Phaser.Scene): void {
  applyViewport(scene);
}

/** Fit the logical world [0..W] x [0..VIEW.h] to the whole canvas with no bars. */
export function applyViewport(scene: Phaser.Scene): void {
  const cam = scene.cameras.main;
  const cw = scene.scale.width, ch = scene.scale.height;   // real device px
  const zoom = cw / W;                                      // world width always fills screen width
  cam.setZoom(zoom);
  cam.centerOn(W / 2, VIEW.h / 2);
}

export function hex(n: number): string { return '#' + n.toString(16).padStart(6, '0'); }

export function drawBackground(scene: Phaser.Scene, top: number, bottom: number): Phaser.GameObjects.Graphics {
  const H = VIEW.h;
  const g = scene.add.graphics();
  g.fillGradientStyle(top, top, bottom, bottom, 1);
  g.fillRect(-W, -H, W * 3, H * 3);
  // soft glow behind the play area
  const vkey = 'vignette' + Math.round(H);
  if (!scene.textures.exists(vkey)) {
    const tex = scene.textures.createCanvas(vkey, W, H)!;
    const ctx = tex.getContext();
    const grad = ctx.createRadialGradient(W / 2, H * 0.40, 30, W / 2, H * 0.44, H * 0.9);
    grad.addColorStop(0, 'rgba(255,255,255,0.09)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.42)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    tex.refresh();
  }
  scene.add.image(W / 2, H / 2, vkey).setDepth(1);
  // faint floating dots for depth
  for (let i = 0; i < 26; i++) {
    const d = scene.add.image(Math.random() * W, Math.random() * H, 'dot')
      .setScale(0.25 + Math.random() * 0.6).setAlpha(0.05 + Math.random() * 0.08).setDepth(1);
    scene.tweens.add({ targets: d, y: d.y - 40 - Math.random() * 60, alpha: 0, duration: 4000 + Math.random() * 5000, repeat: -1, delay: Math.random() * 3000 });
  }
  return g;
}

export interface TextOpts {
  color?: string; stroke?: string; strokeWidth?: number; weight?: string; align?: string; shadow?: boolean;
}

export function makeText(scene: Phaser.Scene, x: number, y: number, str: string, size: number, o: TextOpts = {}): Phaser.GameObjects.Text {
  const t = scene.add.text(x, y, str, {
    fontFamily: FONT,
    fontSize: `${size}px`,
    fontStyle: o.weight ?? '900',
    color: o.color ?? '#ffffff',
    align: o.align ?? 'center',
    stroke: o.stroke ?? '#000000',
    strokeThickness: o.strokeWidth ?? Math.max(2, size * 0.12),
    resolution: 2,
  }).setOrigin(0.5);
  if (o.shadow !== false) t.setShadow(0, Math.max(2, size * 0.08), 'rgba(0,0,0,0.45)', size * 0.15, true, true);
  return t;
}

function darken(c: number, f: number): number {
  const r = ((c >> 16) & 255) * f, g = ((c >> 8) & 255) * f, b = (c & 255) * f;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

export function makeButton(
  scene: Phaser.Scene, x: number, y: number, w: number, h: number, label: string, color: number, onTap: () => void, fontSize = 22,
): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  const r = Math.min(18, h / 2);
  g.fillStyle(0x000000, 0.25);
  g.fillRoundedRect(-w / 2, -h / 2 + 8, w, h, r);
  g.fillStyle(darken(color, 0.6), 1);
  g.fillRoundedRect(-w / 2, -h / 2 + 5, w, h, r);
  g.fillStyle(color, 1);
  g.fillRoundedRect(-w / 2, -h / 2, w, h, r);
  g.fillStyle(0xffffff, 0.18);
  g.fillRoundedRect(-w / 2 + 4, -h / 2 + 3, w - 8, h * 0.42, { tl: r, tr: r, bl: 6, br: 6 });
  const t = makeText(scene, 0, -1, label, fontSize, { strokeWidth: fontSize * 0.14 });
  c.add([g, t]);
  c.setSize(w, h + 6);
  c.setInteractive({ useHandCursor: true });
  c.on('pointerdown', () => {
    sfx.unlock();
    sfx.tap();
    scene.tweens.add({ targets: c, scaleX: 0.93, scaleY: 0.93, duration: 60, yoyo: true, onComplete: onTap });
  });
  return c;
}

export function roundIconButton(scene: Phaser.Scene, x: number, y: number, size: number, icon: string, onTap: () => void): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.3);
  g.fillCircle(0, 4, size / 2);
  g.fillStyle(0xffffff, 0.12);
  g.fillCircle(0, 0, size / 2);
  g.lineStyle(2, 0xffffff, 0.25);
  g.strokeCircle(0, 0, size / 2);
  const t = makeText(scene, 0, 0, icon, size * 0.5, { strokeWidth: 2 });
  c.add([g, t]);
  c.setSize(size, size);
  c.setInteractive({ useHandCursor: true });
  c.on('pointerdown', () => {
    sfx.unlock();
    sfx.tap();
    scene.tweens.add({ targets: c, scaleX: 0.88, scaleY: 0.88, duration: 60, yoyo: true, onComplete: onTap });
  });
  return c;
}

export function pill(scene: Phaser.Scene, x: number, y: number, w: number, h: number, alpha = 0.16): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(0x000000, alpha * 1.4);
  g.fillRoundedRect(x - w / 2, y - h / 2, w, h, h / 2);
  g.lineStyle(2, 0xffffff, 0.12);
  g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, h / 2);
  return g;
}

export function panel(scene: Phaser.Scene, w: number, h: number, color = 0x1b1f2e): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.35);
  g.fillRoundedRect(-w / 2, -h / 2 + 10, w, h, 26);
  g.fillStyle(color, 1);
  g.fillRoundedRect(-w / 2, -h / 2, w, h, 26);
  g.lineStyle(3, 0xffffff, 0.12);
  g.strokeRoundedRect(-w / 2, -h / 2, w, h, 26);
  g.fillStyle(0xffffff, 0.06);
  g.fillRoundedRect(-w / 2 + 6, -h / 2 + 5, w - 12, h * 0.25, { tl: 22, tr: 22, bl: 10, br: 10 });
  return g;
}

/** Punch-scale feedback on any game object */
export function punch(scene: Phaser.Scene, obj: Phaser.GameObjects.Components.Transform, amount = 1.3, dur = 140): void {
  const sx = obj.scaleX, sy = obj.scaleY;
  scene.tweens.add({ targets: obj, scaleX: sx * amount, scaleY: sy * amount, duration: dur * 0.4, yoyo: true, ease: 'Quad.easeOut',
    onComplete: () => { obj.scaleX = sx; obj.scaleY = sy; } });
}

export function floatText(scene: Phaser.Scene, x: number, y: number, str: string, color: string, size = 26): void {
  const t = makeText(scene, x + (Math.random() - 0.5) * 20, y, str, size, { color }).setDepth(60).setScale(0.6);
  scene.tweens.add({ targets: t, y: y - 70, alpha: 0, scale: 1.1, duration: 800, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
}
