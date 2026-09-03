import Phaser from 'phaser';
import { COLORS } from '../config/Constants';

export class GeneratedTextures {
  public static generateAll(scene: Phaser.Scene): void {
    this.createBackgroundPattern(scene);
    this.createStar(scene);
    this.createCrownCap(scene);
    this.createCanTab(scene);
    this.createTutorialHand(scene);
    this.createUIButtons(scene);
    this.createWoodPlatform(scene);
    this.createBluePlatform(scene);
    this.createPortal(scene);
    this.createParticles(scene);

    // Generate bottles (Orange, Yellow, Green) - Sealed & Opened
    this.createBottle(scene, 'orange', COLORS.HEX_ORANGE);
    this.createBottle(scene, 'yellow', COLORS.HEX_YELLOW);
    this.createBottle(scene, 'green', COLORS.HEX_GREEN);

    // Generate red can - Closed & Opened
    this.createCan(scene);
  }

  // 1. Repeating Background Pattern of Faint Sunglasses Bottles
  private static createBackgroundPattern(scene: Phaser.Scene): void {
    if (scene.textures.exists('bg_pattern')) return;

    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 240;
    const ctx = canvas.getContext('2d')!;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const drawPatternBottle = (x: number, y: number, angle: number, scale: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.scale(scale, scale);

      // Bottle contour
      ctx.beginPath();
      ctx.moveTo(-10, -55);
      ctx.lineTo(10, -55);
      ctx.lineTo(10, -25);
      ctx.quadraticCurveTo(22, -15, 24, 0);
      ctx.lineTo(24, 50);
      ctx.quadraticCurveTo(24, 58, 16, 60);
      ctx.lineTo(-16, 60);
      ctx.quadraticCurveTo(-24, 58, -24, 50);
      ctx.lineTo(-24, 0);
      ctx.quadraticCurveTo(-22, -15, -10, -25);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Sunglasses
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.beginPath();
      ctx.roundRect(-18, 5, 16, 12, 3);
      ctx.roundRect(2, 5, 16, 12, 3);
      ctx.fill();
      ctx.stroke();

      // Bridge
      ctx.beginPath();
      ctx.moveTo(-2, 9);
      ctx.lineTo(2, 9);
      ctx.stroke();

      // Smile
      ctx.beginPath();
      ctx.arc(0, 26, 8, 0.2, Math.PI - 0.2);
      ctx.stroke();

      ctx.restore();
    };

    drawPatternBottle(45, 60, -0.15, 0.85);
    drawPatternBottle(125, 180, 0.18, 0.9);

    scene.textures.addCanvas('bg_pattern', canvas);
  }

  // 2. Five-Pointed Cartoon Golden Star
  private static createStar(scene: Phaser.Scene): void {
    if (scene.textures.exists('star')) return;

    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const cx = size / 2, cy = size / 2;
    const outerRadius = 26, innerRadius = 11;
    const points = 5;

    ctx.save();
    ctx.translate(cx, cy);

    // Draw main star path
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? outerRadius : innerRadius;
      const a = (i * Math.PI) / points - Math.PI / 2;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();

    // Saturated Golden Gradient
    const grad = ctx.createLinearGradient(0, -outerRadius, 0, outerRadius);
    grad.addColorStop(0, COLORS.STAR_HIGHLIGHT);
    grad.addColorStop(0.5, COLORS.STAR_MAIN);
    grad.addColorStop(1, COLORS.STAR_SHADOW);

    ctx.fillStyle = grad;
    ctx.fill();

    // Dark bold cartoon stroke
    ctx.strokeStyle = COLORS.STAR_OUTLINE;
    ctx.lineWidth = 4.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Inner bright highlight glint on top point
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.ellipse(-6, -12, 4, 2.5, -0.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    scene.textures.addCanvas('star', canvas);
  }

  // 3. Crown Cap Projectile
  private static createCrownCap(scene: Phaser.Scene): void {
    if (scene.textures.exists('crown_cap')) return;

    const w = 48, h = 32;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;

    ctx.save();
    ctx.translate(w / 2, h / 2);

    // Fluted red metal crown cap
    ctx.beginPath();
    ctx.moveTo(-16, -6);
    ctx.lineTo(16, -6);
    ctx.quadraticCurveTo(18, -4, 18, 0);
    ctx.lineTo(19, 6);
    // Fluted wavy bottom rim
    for (let x = 18; x >= -18; x -= 4) {
      ctx.lineTo(x, (Math.abs(x) % 8 === 0) ? 9 : 6);
    }
    ctx.lineTo(-19, 6);
    ctx.lineTo(-18, 0);
    ctx.quadraticCurveTo(-18, -4, -16, -6);
    ctx.closePath();

    // Metallic crimson gradient
    const grad = ctx.createLinearGradient(0, -6, 0, 9);
    grad.addColorStop(0, '#FF4D4D');
    grad.addColorStop(0.5, '#D91A1A');
    grad.addColorStop(1, '#8B0000');
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.strokeStyle = '#181818';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Top gold seal ring
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.ellipse(0, -2, 10, 3, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
    scene.textures.addCanvas('crown_cap', canvas);
  }

  // 4. Metal Can Pull-Tab Projectile
  private static createCanTab(scene: Phaser.Scene): void {
    if (scene.textures.exists('can_tab')) return;

    const w = 40, h = 28;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;

    ctx.save();
    ctx.translate(w / 2, h / 2);

    // Silver metallic pull-tab oval
    ctx.beginPath();
    ctx.roundRect(-15, -9, 30, 18, 8);
    const grad = ctx.createLinearGradient(0, -9, 0, 9);
    grad.addColorStop(0, '#FFFFFF');
    grad.addColorStop(0.5, '#CBD5E1');
    grad.addColorStop(1, '#94A3B8');
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Tab finger hole
    ctx.beginPath();
    ctx.roundRect(-4, -4, 13, 8, 4);
    ctx.fillStyle = '#1E293B';
    ctx.fill();

    // Rivet hole on left
    ctx.beginPath();
    ctx.arc(-9, 0, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#64748B';
    ctx.fill();
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.restore();
    scene.textures.addCanvas('can_tab', canvas);
  }

  // 5. Bottle Generator (Orange, Yellow, Green)
  private static createBottle(scene: Phaser.Scene, colorKey: string, hexColor: string): void {
    const w = 96, h = 210;

    // A. Sealed State (Cool sunglasses, smiling, liquid filled, cap on)
    {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      const cx = w / 2;

      ctx.save();

      // Liquid body path
      const createBottlePath = () => {
        ctx.beginPath();
        ctx.moveTo(cx - 13, 28); // Cap collar
        ctx.lineTo(cx + 13, 28);
        ctx.lineTo(cx + 13, 62); // Neck base
        ctx.quadraticCurveTo(cx + 28, 76, cx + 33, 98); // Shoulder
        ctx.lineTo(cx + 33, 178); // Body side
        ctx.quadraticCurveTo(cx + 33, 192, cx + 20, 195); // Base right
        ctx.lineTo(cx - 20, 195); // Base bottom
        ctx.quadraticCurveTo(cx - 33, 192, cx - 33, 178); // Base left
        ctx.lineTo(cx - 33, 98);
        ctx.quadraticCurveTo(cx - 28, 76, cx - 13, 62);
        ctx.closePath();
      };

      // Fill with vibrant liquid gradient
      createBottlePath();
      const liquidGrad = ctx.createLinearGradient(cx - 33, 0, cx + 33, 0);
      liquidGrad.addColorStop(0, hexColor);
      liquidGrad.addColorStop(0.35, hexColor);
      liquidGrad.addColorStop(0.7, hexColor);
      liquidGrad.addColorStop(1, '#B83200'); // shadow on right edge
      ctx.fillStyle = liquidGrad;
      ctx.fill();

      // Glass highlight streak on left shoulder/body
      ctx.fillStyle = 'rgba(255, 255, 255, 0.42)';
      ctx.beginPath();
      ctx.moveTo(cx - 24, 96);
      ctx.lineTo(cx - 18, 96);
      ctx.lineTo(cx - 18, 175);
      ctx.lineTo(cx - 24, 175);
      ctx.closePath();
      ctx.fill();

      // Dark cartoon stroke
      ctx.strokeStyle = '#181818';
      ctx.lineWidth = 4.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();

      // Attached Crown Cap at top
      ctx.fillStyle = '#D91A1A';
      ctx.beginPath();
      ctx.roundRect(cx - 15, 14, 30, 14, 3);
      ctx.fill();
      ctx.strokeStyle = '#181818';
      ctx.lineWidth = 3.5;
      ctx.stroke();

      // Neck ring
      ctx.strokeStyle = '#181818';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(cx - 14, 36);
      ctx.lineTo(cx + 14, 36);
      ctx.stroke();

      // Label badge on neck
      ctx.fillStyle = '#D91A1A';
      ctx.beginPath();
      ctx.arc(cx, 52, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#FFD700';
      ctx.beginPath();
      ctx.arc(cx, 52, 4, 0, Math.PI * 2);
      ctx.fill();

      // Cool Black Sunglasses
      ctx.fillStyle = '#111827';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2.5;

      // Left lens
      ctx.beginPath();
      ctx.roundRect(cx - 26, 110, 22, 16, 4);
      ctx.fill();
      ctx.stroke();
      // Right lens
      ctx.beginPath();
      ctx.roundRect(cx + 4, 110, 22, 16, 4);
      ctx.fill();
      ctx.stroke();

      // Sunglasses Bridge & arms
      ctx.beginPath();
      ctx.moveTo(cx - 4, 116);
      ctx.lineTo(cx + 4, 116);
      ctx.moveTo(cx - 26, 114);
      ctx.lineTo(cx - 32, 110);
      ctx.moveTo(cx + 26, 114);
      ctx.lineTo(cx + 32, 110);
      ctx.stroke();

      // White diagonal shine glint on lenses
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - 22, 113);
      ctx.lineTo(cx - 10, 122);
      ctx.moveTo(cx + 8, 113);
      ctx.lineTo(cx + 20, 122);
      ctx.stroke();

      // Happy smiling mouth
      ctx.strokeStyle = '#181818';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(cx, 142, 11, 0.2, Math.PI - 0.2);
      ctx.stroke();

      ctx.restore();
      scene.textures.addCanvas(`bottle_${colorKey}_sealed`, canvas);
    }

    // B. Opened State (Cap detached, sunglasses gone, shocked white eyes, open mouth, drained liquid)
    {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      const cx = w / 2;

      ctx.save();

      // Pale glass body contour
      ctx.beginPath();
      ctx.moveTo(cx - 13, 28);
      ctx.lineTo(cx + 13, 28);
      ctx.lineTo(cx + 13, 62);
      ctx.quadraticCurveTo(cx + 28, 76, cx + 33, 98);
      ctx.lineTo(cx + 33, 178);
      ctx.quadraticCurveTo(cx + 33, 192, cx + 20, 195);
      ctx.lineTo(cx - 20, 195);
      ctx.quadraticCurveTo(cx - 33, 192, cx - 33, 178);
      ctx.lineTo(cx - 33, 98);
      ctx.quadraticCurveTo(cx - 28, 76, cx - 13, 62);
      ctx.closePath();

      // Clear pale glass tint
      ctx.fillStyle = 'rgba(235, 245, 255, 0.85)';
      ctx.fill();

      // Drained puddle of liquid remaining only at the bottom (Y 155 to 195)
      ctx.save();
      ctx.clip();
      ctx.fillStyle = hexColor;
      ctx.beginPath();
      ctx.roundRect(cx - 35, 155, 70, 45, 10);
      ctx.fill();
      ctx.restore();

      // Glass highlight streak
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.beginPath();
      ctx.moveTo(cx - 24, 96);
      ctx.lineTo(cx - 18, 96);
      ctx.lineTo(cx - 18, 175);
      ctx.lineTo(cx - 24, 175);
      ctx.closePath();
      ctx.fill();

      // Dark cartoon stroke
      ctx.strokeStyle = '#181818';
      ctx.lineWidth = 4.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();

      // Open bottle mouth lip (NO CAP!)
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.ellipse(cx, 28, 13, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#181818';
      ctx.lineWidth = 3.5;
      ctx.stroke();

      // Neck label
      ctx.fillStyle = '#D91A1A';
      ctx.beginPath();
      ctx.arc(cx, 52, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Shocked/Worried Large White Cartoon Eyes
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = '#181818';
      ctx.lineWidth = 3;

      // Left eye
      ctx.beginPath();
      ctx.arc(cx - 14, 110, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Right eye
      ctx.beginPath();
      ctx.arc(cx + 14, 110, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Black pupils looking upward in shock
      ctx.fillStyle = '#181818';
      ctx.beginPath();
      ctx.arc(cx - 13, 108, 4.5, 0, Math.PI * 2);
      ctx.arc(cx + 15, 108, 4.5, 0, Math.PI * 2);
      ctx.fill();

      // Tiny white eye glints
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(cx - 14, 106, 1.8, 0, Math.PI * 2);
      ctx.arc(cx + 14, 106, 1.8, 0, Math.PI * 2);
      ctx.fill();

      // Shocked open round mouth ('O' shape)
      ctx.fillStyle = '#181818';
      ctx.beginPath();
      ctx.ellipse(cx, 138, 7, 10, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
      scene.textures.addCanvas(`bottle_${colorKey}_opened`, canvas);
    }
  }

  // 6. Red Soda Can Generator (Closed Smiling & Opened Shocked)
  private static createCan(scene: Phaser.Scene): void {
    const w = 90, h = 140;
    const cx = w / 2;

    // A. Closed Smiling Can
    {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;

      ctx.save();

      // Silver top lid
      ctx.fillStyle = '#CBD5E1';
      ctx.beginPath();
      ctx.ellipse(cx, 26, 32, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#1E293B';
      ctx.lineWidth = 4;
      ctx.stroke();

      // Red cylindrical body
      ctx.beginPath();
      ctx.moveTo(cx - 32, 26);
      ctx.lineTo(cx + 32, 26);
      ctx.lineTo(cx + 32, 116);
      ctx.quadraticCurveTo(cx + 32, 126, cx + 22, 128);
      ctx.lineTo(cx - 22, 128);
      ctx.quadraticCurveTo(cx - 32, 126, cx - 32, 116);
      ctx.closePath();

      const grad = ctx.createLinearGradient(cx - 32, 0, cx + 32, 0);
      grad.addColorStop(0, '#FF3B30');
      grad.addColorStop(0.3, '#F1221C');
      grad.addColorStop(0.8, '#D31913');
      grad.addColorStop(1, '#990E0A');
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = '#181818';
      ctx.lineWidth = 4.5;
      ctx.stroke();

      // White shine vertical streak
      ctx.fillStyle = 'rgba(255, 255, 255, 0.40)';
      ctx.beginPath();
      ctx.roundRect(cx - 24, 34, 6, 82, 3);
      ctx.fill();

      // Attached silver pull-tab at top
      ctx.fillStyle = '#E2E8F0';
      ctx.beginPath();
      ctx.roundRect(cx - 10, 16, 20, 10, 3);
      ctx.fill();
      ctx.strokeStyle = '#1E293B';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Happy Cartoon Eyes
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = '#181818';
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.ellipse(cx - 14, 62, 7, 10, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + 14, 62, 7, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#181818';
      ctx.beginPath();
      ctx.arc(cx - 13, 62, 4, 0, Math.PI * 2);
      ctx.arc(cx + 15, 62, 4, 0, Math.PI * 2);
      ctx.fill();

      // Smiling mouth
      ctx.fillStyle = '#181818';
      ctx.beginPath();
      ctx.arc(cx, 84, 12, 0.1, Math.PI - 0.1);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // White teeth in smile
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.rect(cx - 8, 84, 16, 5);
      ctx.fill();

      ctx.restore();
      scene.textures.addCanvas('can_red_sealed', canvas);
    }

    // B. Opened Shocked Can
    {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;

      ctx.save();

      // Silver top lid
      ctx.fillStyle = '#CBD5E1';
      ctx.beginPath();
      ctx.ellipse(cx, 26, 32, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#1E293B';
      ctx.lineWidth = 4;
      ctx.stroke();

      // Opened black drink hole on top
      ctx.fillStyle = '#1E293B';
      ctx.beginPath();
      ctx.ellipse(cx, 26, 12, 5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Red cylindrical body
      ctx.beginPath();
      ctx.moveTo(cx - 32, 26);
      ctx.lineTo(cx + 32, 26);
      ctx.lineTo(cx + 32, 116);
      ctx.quadraticCurveTo(cx + 32, 126, cx + 22, 128);
      ctx.lineTo(cx - 22, 128);
      ctx.quadraticCurveTo(cx - 32, 126, cx - 32, 116);
      ctx.closePath();
      ctx.fillStyle = '#F1221C';
      ctx.fill();
      ctx.strokeStyle = '#181818';
      ctx.lineWidth = 4.5;
      ctx.stroke();

      // Shocked/Worried Large Eyes
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = '#181818';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx - 14, 62, 10, 0, Math.PI * 2);
      ctx.arc(cx + 14, 62, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#181818';
      ctx.beginPath();
      ctx.arc(cx - 13, 60, 4.5, 0, Math.PI * 2);
      ctx.arc(cx + 15, 60, 4.5, 0, Math.PI * 2);
      ctx.fill();

      // Shocked open mouth
      ctx.fillStyle = '#181818';
      ctx.beginPath();
      ctx.ellipse(cx, 88, 8, 12, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
      scene.textures.addCanvas('can_red_opened', canvas);
    }
  }

  // 7. Wood Platform Texture
  private static createWoodPlatform(scene: Phaser.Scene): void {
    if (scene.textures.exists('platform_wood')) return;

    const w = 240, h = 38;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(4, 4, w - 8, h - 8, 12);

    const grad = ctx.createLinearGradient(0, 4, 0, h - 4);
    grad.addColorStop(0, COLORS.WOOD_HIGHLIGHT);
    grad.addColorStop(0.35, COLORS.WOOD_MAIN);
    grad.addColorStop(1, '#C99342');
    ctx.fillStyle = grad;
    ctx.fill();

    // Wood grain lines
    ctx.strokeStyle = COLORS.WOOD_GRAIN;
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(25, 14);
    ctx.quadraticCurveTo(80, 11, 140, 15);
    ctx.quadraticCurveTo(185, 19, 215, 15);

    ctx.moveTo(35, 24);
    ctx.quadraticCurveTo(100, 26, 160, 22);
    ctx.stroke();

    // Wood knot
    ctx.beginPath();
    ctx.ellipse(180, 20, 8, 4, 0.1, 0, Math.PI * 2);
    ctx.stroke();

    // Outer cartoon border
    ctx.strokeStyle = COLORS.WOOD_OUTLINE;
    ctx.lineWidth = 4.5;
    ctx.stroke();

    ctx.restore();
    scene.textures.addCanvas('platform_wood', canvas);
  }

  // 8. Cyan Blue Platform Texture
  private static createBluePlatform(scene: Phaser.Scene): void {
    if (scene.textures.exists('platform_blue')) return;

    const w = 240, h = 38;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(4, 4, w - 8, h - 8, 14);

    const grad = ctx.createLinearGradient(0, 4, 0, h - 4);
    grad.addColorStop(0, COLORS.BLUE_HIGHLIGHT);
    grad.addColorStop(0.4, COLORS.BLUE_MAIN);
    grad.addColorStop(1, COLORS.BLUE_EDGE);
    ctx.fillStyle = grad;
    ctx.fill();

    // Top glossy reflection streak
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.beginPath();
    ctx.roundRect(14, 7, w - 28, 6, 3);
    ctx.fill();

    // Deep cyan border
    ctx.strokeStyle = '#056291';
    ctx.lineWidth = 4.5;
    ctx.stroke();

    ctx.restore();
    scene.textures.addCanvas('platform_blue', canvas);
  }

  // 9. Glowing Yellow Teleport Portal
  private static createPortal(scene: Phaser.Scene): void {
    if (scene.textures.exists('portal')) return;

    const w = 96, h = 48;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;

    const cx = w / 2, cy = h / 2;

    ctx.save();

    // Outer soft glow
    const glowGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, 38);
    glowGrad.addColorStop(0, 'rgba(254, 240, 138, 0.95)');
    glowGrad.addColorStop(0.6, 'rgba(250, 204, 21, 0.6)');
    glowGrad.addColorStop(1, 'rgba(234, 179, 8, 0)');
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 44, 20, 0, 0, Math.PI * 2);
    ctx.fill();

    // Golden ring border
    ctx.strokeStyle = '#CA8A04';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 32, 12, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Inner bright center
    ctx.fillStyle = '#FEF9C3';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 28, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    scene.textures.addCanvas('portal', canvas);
  }

  // 10. Tutorial White Cartoon Glove / Hand
  private static createTutorialHand(scene: Phaser.Scene): void {
    if (scene.textures.exists('tutorial_hand')) return;

    const w = 90, h = 90;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;

    ctx.save();
    ctx.translate(w / 2, h / 2);

    // White cartoon glove pointing down/right
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#181818';
    ctx.lineWidth = 4.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    // Index pointing finger
    ctx.moveTo(0, -32);
    ctx.lineTo(10, -32);
    ctx.quadraticCurveTo(14, -32, 14, -20);
    ctx.lineTo(14, 5);

    // Other fingers folded
    ctx.quadraticCurveTo(24, 6, 24, 16);
    ctx.quadraticCurveTo(24, 24, 14, 26);
    ctx.quadraticCurveTo(18, 30, 10, 36);
    ctx.quadraticCurveTo(-4, 38, -12, 30);

    // Thumb
    ctx.quadraticCurveTo(-26, 24, -24, 10);
    ctx.quadraticCurveTo(-22, -2, -10, 4);
    ctx.lineTo(-4, -15);
    ctx.quadraticCurveTo(-4, -32, 0, -32);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Finger crease lines
    ctx.beginPath();
    ctx.moveTo(8, 12);
    ctx.lineTo(16, 12);
    ctx.moveTo(4, 22);
    ctx.lineTo(14, 22);
    ctx.stroke();

    ctx.restore();
    scene.textures.addCanvas('tutorial_hand', canvas);
  }

  // 11. UI Buttons: Home, Restart, and Level Complete Next Button
  private static createUIButtons(scene: Phaser.Scene): void {
    // A. Home Button (White circle, lime green house)
    if (!scene.textures.exists('btn_home')) {
      const size = 72;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      const c = size / 2;

      // Drop shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.20)';
      ctx.beginPath();
      ctx.arc(c, c + 3, 29, 0, Math.PI * 2);
      ctx.fill();

      // White circle button
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(c, c, 29, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Lime green house icon
      ctx.fillStyle = COLORS.UI_GREEN;
      ctx.beginPath();
      ctx.moveTo(c, c - 15);
      ctx.lineTo(c + 15, c - 1);
      ctx.lineTo(c + 10, c - 1);
      ctx.lineTo(c + 10, c + 14);
      ctx.lineTo(c - 10, c + 14);
      ctx.lineTo(c - 10, c - 1);
      ctx.lineTo(c - 15, c - 1);
      ctx.closePath();
      ctx.fill();

      // House door
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.roundRect(c - 3.5, c + 4, 7, 10, [2, 2, 0, 0]);
      ctx.fill();

      scene.textures.addCanvas('btn_home', canvas);
    }

    // B. Restart Button (White circle, lime green circular refresh arrow)
    if (!scene.textures.exists('btn_restart')) {
      const size = 72;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      const c = size / 2;

      // Drop shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.20)';
      ctx.beginPath();
      ctx.arc(c, c + 3, 29, 0, Math.PI * 2);
      ctx.fill();

      // White circle button
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(c, c, 29, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Lime green refresh circular arrow
      ctx.strokeStyle = COLORS.UI_GREEN;
      ctx.lineWidth = 5.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(c, c, 13, -Math.PI * 0.7, Math.PI * 0.85);
      ctx.stroke();

      // Arrow head
      ctx.fillStyle = COLORS.UI_GREEN;
      ctx.beginPath();
      ctx.moveTo(c + 11, c - 14);
      ctx.lineTo(c + 20, c - 5);
      ctx.lineTo(c + 6, c - 5);
      ctx.closePath();
      ctx.fill();

      scene.textures.addCanvas('btn_restart', canvas);
    }

    // C. Large Complete Next Button (Diameter 160px with lime-green play triangle)
    if (!scene.textures.exists('btn_next')) {
      const size = 180;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      const c = size / 2;

      // Rich drop shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.beginPath();
      ctx.arc(c, c + 6, 75, 0, Math.PI * 2);
      ctx.fill();

      // Crisp white circular button
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(c, c, 75, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 4;
      ctx.stroke();

      // Big bright lime-green right-facing triangle
      ctx.fillStyle = COLORS.UI_GREEN;
      ctx.beginPath();
      ctx.moveTo(c - 20, c - 38);
      ctx.lineTo(c + 36, c);
      ctx.lineTo(c - 20, c + 38);
      ctx.closePath();
      ctx.fill();

      scene.textures.addCanvas('btn_next', canvas);
    }

    // D. Large Failed Retry Button (Diameter 160px with lime-green circular refresh arrow)
    if (!scene.textures.exists('btn_retry')) {
      const size = 180;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      const c = size / 2;

      // Rich drop shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.beginPath();
      ctx.arc(c, c + 6, 75, 0, Math.PI * 2);
      ctx.fill();

      // Crisp white circular button
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(c, c, 75, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 4;
      ctx.stroke();

      // Lime green circular refresh arrow
      ctx.strokeStyle = COLORS.UI_GREEN;
      ctx.lineWidth = 12;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(c, c, 34, -Math.PI * 0.7, Math.PI * 0.85);
      ctx.stroke();

      // Arrow head
      ctx.fillStyle = COLORS.UI_GREEN;
      ctx.beginPath();
      ctx.moveTo(c + 24, c - 34);
      ctx.lineTo(c + 46, c - 12);
      ctx.lineTo(c + 12, c - 12);
      ctx.closePath();
      ctx.fill();

      scene.textures.addCanvas('btn_retry', canvas);
    }
  }

  // 12. Particles: Sparkles & Bubbles
  private static createParticles(scene: Phaser.Scene): void {
    // Four-pointed golden star sparkle
    if (!scene.textures.exists('particle_sparkle')) {
      const size = 24;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      const c = size / 2;

      ctx.fillStyle = '#FFF275';
      ctx.beginPath();
      ctx.moveTo(c, 0);
      ctx.quadraticCurveTo(c, c, size, c);
      ctx.quadraticCurveTo(c, c, c, size);
      ctx.quadraticCurveTo(c, c, 0, c);
      ctx.quadraticCurveTo(c, c, c, 0);
      ctx.closePath();
      ctx.fill();

      scene.textures.addCanvas('particle_sparkle', canvas);
    }

    // Liquid bubble blob generator (Orange, Yellow, Green, Red)
    const makeBubble = (key: string, hexColor: string) => {
      if (scene.textures.exists(key)) return;
      const size = 32;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      const c = size / 2;

      ctx.fillStyle = hexColor;
      ctx.beginPath();
      ctx.arc(c, c, 13, 0, Math.PI * 2);
      ctx.fill();

      // Soft specular highlight on bubble
      ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
      ctx.beginPath();
      ctx.arc(c - 4, c - 4, 3.5, 0, Math.PI * 2);
      ctx.fill();

      scene.textures.addCanvas(key, canvas);
    };

    makeBubble('bubble_orange', COLORS.HEX_ORANGE);
    makeBubble('bubble_yellow', COLORS.HEX_YELLOW);
    makeBubble('bubble_green', COLORS.HEX_GREEN);
    makeBubble('bubble_red', COLORS.HEX_RED_CAN);
  }
}
