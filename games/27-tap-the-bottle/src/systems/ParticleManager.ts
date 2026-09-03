import Phaser from 'phaser';

interface ActiveParticle {
  sprite: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  vr: number;
  life: number;
  maxLife: number;
  scaleStart: number;
}

export class ParticleManager {
  private scene: Phaser.Scene;
  private particles: ActiveParticle[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  public emitStarSparkles(x: number, y: number): void {
    const count = 10;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const speed = 70 + Math.random() * 110;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      const scale = 0.5 + Math.random() * 0.6;

      const p = this.scene.add.image(x, y, 'particle_sparkle')
        .setScale(scale)
        .setDepth(15);

      this.particles.push({
        sprite: p,
        vx,
        vy,
        vr: (Math.random() - 0.5) * 8,
        life: 0.35 + Math.random() * 0.15,
        maxLife: 0.5,
        scaleStart: scale
      });
    }
  }

  public emitBubble(x: number, y: number, color: string, vxOffset: number = 0, vyOffset: number = 0): void {
    const key = `bubble_${color}`;
    if (!this.scene.textures.exists(key)) return;

    const scale = 0.35 + Math.random() * 0.65;
    const p = this.scene.add.image(x + (Math.random() - 0.5) * 8, y + (Math.random() - 0.5) * 8, key)
      .setScale(scale)
      .setDepth(12);

    this.particles.push({
      sprite: p,
      vx: vxOffset + (Math.random() - 0.5) * 30,
      vy: vyOffset + Math.random() * 25,
      vr: (Math.random() - 0.5) * 3,
      life: 0.35 + Math.random() * 0.18,
      maxLife: 0.5,
      scaleStart: scale
    });
  }

  public update(delta: number): void {
    const dt = delta / 1000;

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;

      if (p.life <= 0) {
        p.sprite.destroy();
        this.particles.splice(i, 1);
        continue;
      }

      const progress = p.life / p.maxLife; // 1 -> 0
      p.sprite.x += p.vx * dt;
      p.sprite.y += p.vy * dt;
      p.sprite.rotation += p.vr * dt;
      p.sprite.setScale(p.scaleStart * Math.max(0, progress));
      p.sprite.setAlpha(progress);
    }
  }

  public clear(): void {
    for (const p of this.particles) {
      p.sprite.destroy();
    }
    this.particles = [];
  }
}
