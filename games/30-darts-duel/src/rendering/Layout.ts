export class Layout {
  width = 420;
  height = 746;
  scale = 1;
  dpr = 1;
  boardX = 226;
  boardY = 298;
  radius = 139;
  floorY = 612;
  meterY = 470;
  resize(canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    this.scale = rect.width / this.width;
    this.height = rect.height / this.scale;
    this.dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.round(rect.width * this.dpr);
    canvas.height = Math.round(rect.height * this.dpr);
    this.boardY = Math.max(264, Math.min(this.height * 0.395, this.height * 0.81 - 260));
    // Reserve actual space for the upper dart and thinking panel on shorter screens.
    this.radius = Math.min(139, Math.max(112, (this.boardY - 150) / 1.19));
    this.floorY = this.height * 0.82;
    this.meterY = this.boardY + this.radius * 1.55;
  }
  get pixelScale() { return this.scale * this.dpr; }
}
