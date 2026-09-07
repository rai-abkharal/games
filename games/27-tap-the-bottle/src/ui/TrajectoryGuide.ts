import Phaser from 'phaser';
import { DESIGN_WIDTH, DESIGN_HEIGHT, BASE_LAUNCH_SPEED, DESIGN_GRAVITY, RENDER_SCALE } from '../config/Constants';
import { LauncherConfig, PlatformConfig, PortalConfig } from '../levels/types';

interface TrajectoryDot {
  outer: Phaser.GameObjects.Arc;
  inner: Phaser.GameObjects.Arc;
}

export class TrajectoryGuide {
  private scene: Phaser.Scene;
  private dotsByLauncher: Map<string, TrajectoryDot[]> = new Map();
  private tweens: Phaser.Tweens.Tween[] = [];

  constructor(
    scene: Phaser.Scene,
    launchers: LauncherConfig[],
    platforms: PlatformConfig[],
    portals?: PortalConfig[]
  ) {
    this.scene = scene;
    this.buildAllGuides(launchers, platforms, portals || []);
  }

  private buildAllGuides(
    launchers: LauncherConfig[],
    platforms: PlatformConfig[],
    portals: PortalConfig[]
  ): void {
    launchers.forEach((launcher, index) => {
      const points = this.calculateTrajectory(launcher, platforms, portals);
      const dots: TrajectoryDot[] = [];

      // Sample dots with spacing ~24px apart
      let lastPlottedX = launcher.x;
      let lastPlottedY = launcher.y;
      let isFirst = true;

      for (let i = 0; i < points.length; i++) {
        const pt = points[i];
        const dist = Phaser.Math.Distance.Between(lastPlottedX, lastPlottedY, pt.x, pt.y);

        if (isFirst || dist >= 22) {
          isFirst = false;
          lastPlottedX = pt.x;
          lastPlottedY = pt.y;

          // Don't render dots off-screen
          if (pt.x < 10 || pt.x > DESIGN_WIDTH - 10 || pt.y < 15 || pt.y > DESIGN_HEIGHT - 30) {
            continue;
          }

          // Glowing cyan/blue arcade trajectory dot
          const outer = this.scene.add.circle(
            pt.x,
            pt.y,
            4 / RENDER_SCALE,
            0x12B9D6,
            0.62
          ).setDepth(8);

          const inner = this.scene.add.circle(
            pt.x,
            pt.y,
            2 / RENDER_SCALE,
            0xFFFFFF,
            0.92
          ).setDepth(8);

          dots.push({ outer, inner });

          // Gentle breathing pulse with slight phase offset along the trail
          const tween = this.scene.tweens.add({
            targets: [outer, inner],
            scaleX: 1.25,
            scaleY: 1.25,
            alpha: { from: 0.85, to: 0.45 },
            duration: 900,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
            delay: (index * 150 + dots.length * 35) % 600
          });
          this.tweens.push(tween);

          // Limit dots per launcher to maintain clean aesthetics
          if (dots.length >= 24) break;
        }
      }

      this.dotsByLauncher.set(launcher.id, dots);
    });
  }

  private calculateTrajectory(
    launcher: LauncherConfig,
    platforms: PlatformConfig[],
    portals: PortalConfig[]
  ): Array<{ x: number; y: number }> {
    const rotDeg = launcher.rotation || 0;
    const rotRad = Phaser.Math.DegToRad(rotDeg);
    const offsetDist = launcher.type === 'bottle' ? 70 : 42;
    let x = launcher.x + Math.sin(rotRad) * offsetDist;
    let y = launcher.y - Math.cos(rotRad) * offsetDist;

    const launchAngleRad = Phaser.Math.DegToRad(launcher.launchAngle);
    const speed = launcher.launchSpeed ?? BASE_LAUNCH_SPEED;
    let vx = Math.cos(launchAngleRad) * speed;
    let vy = Math.sin(launchAngleRad) * speed;

    const points: Array<{ x: number; y: number }> = [];
    let portalCooldown = 0;

    // Simulation step parameters matching Matter.js in Projectile.ts
    const dt = 16.666;
    const gravityPerStep = DESIGN_GRAVITY * 0.001 * dt * dt * 0.99; // calibrated Matter step
    const airFriction = 1 - 0.006;

    for (let step = 0; step < 180; step++) {
      if (portalCooldown > 0) portalCooldown -= dt;

      vx *= airFriction;
      vy = vy * airFriction + gravityPerStep;

      x += vx;
      y += vy;

      // Screen boundary bounces matching Projectile.ts
      if (y < 16 && vy < 0) {
        y = 16;
        vy = Math.abs(vy) * 0.65;
        vx *= 0.9;
      }
      if (x < 16 && vx < 0) {
        x = 16;
        vx = -vx * 0.75;
      } else if (x > DESIGN_WIDTH - 16 && vx > 0) {
        x = DESIGN_WIDTH - 16;
        vx = -vx * 0.75;
      }

      // Check portals
      if (portals.length > 0 && portalCooldown <= 0) {
        for (const port of portals) {
          const pDist = Phaser.Math.Distance.Between(x, y, port.x, port.y);
          if (pDist < 28) {
            const dest = portals.find(p => p.id === port.pairId);
            if (dest) {
              portalCooldown = 320;
              const curSpeed = Math.hypot(vx, vy);
              const exitSpeed = Math.max(24, curSpeed || 24);
              const destRotRad = Phaser.Math.DegToRad(dest.rotation || 0);
              const exitAngle = destRotRad - Math.PI / 2;
              x = dest.x + Math.cos(exitAngle) * 35;
              y = dest.y + Math.sin(exitAngle) * 35;
              vx = Math.cos(exitAngle) * exitSpeed;
              vy = Math.sin(exitAngle) * exitSpeed;
              break;
            }
          }
        }
      }

      // Check platform reflection (simplified for trajectory preview)
      for (const p of platforms) {
        const platRot = Phaser.Math.DegToRad(p.rotation || 0);
        const cosR = Math.cos(-platRot);
        const sinR = Math.sin(-platRot);
        const dx = x - p.x;
        const dy = y - p.y;
        const localX = cosR * dx - sinR * dy;
        const localY = sinR * dx + cosR * dy;

        const halfW = p.width / 2 + 10;
        const halfH = p.height / 2 + 8;

        if (Math.abs(localX) <= halfW && Math.abs(localY) <= halfH) {
          const normalX = -Math.sin(platRot);
          const normalY = -Math.cos(platRot);
          const dot = vx * normalX + vy * normalY;
          if (dot < 0) {
            vx = (vx - 2 * dot * normalX) * 0.65;
            vy = (vy - 2 * dot * normalY) * 0.65;
          }
        }
      }

      points.push({ x, y });

      if (y > DESIGN_HEIGHT + 30 || x < -20 || x > DESIGN_WIDTH + 20) {
        break;
      }
    }

    return points;
  }

  public hideForLauncher(launcherId: string): void {
    const dots = this.dotsByLauncher.get(launcherId);
    if (!dots || dots.length === 0) return;

    dots.forEach(dot => {
      this.scene.tweens.add({
        targets: [dot.outer, dot.inner],
        alpha: 0,
        scale: 0.3,
        duration: 180,
        onComplete: () => {
          dot.outer.destroy();
          dot.inner.destroy();
        }
      });
    });

    this.dotsByLauncher.delete(launcherId);
  }

  public destroy(): void {
    this.tweens.forEach(t => t.stop());
    this.tweens = [];

    this.dotsByLauncher.forEach(dots => {
      dots.forEach(dot => {
        dot.outer.destroy();
        dot.inner.destroy();
      });
    });
    this.dotsByLauncher.clear();
  }
}
