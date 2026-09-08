export class Layout {
  width = 420;
  height = 746;
  scale = 1;
  dpr = 1;
  boardX = this.width / 2;
  boardY = 298;
  radius = 146;
  floorY = 612;
  meterY = 470;
  resize(canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    this.scale = rect.width / this.width;
    this.height = rect.height / this.scale;
    this.dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.round(rect.width * this.dpr);
    canvas.height = Math.round(rect.height * this.dpr);
    this.boardX = this.width / 2;
    this.boardY = Math.max(264, Math.min(this.height * 0.405, this.height * 0.81 - 250));
    // Reserve actual space for the upper dart and thinking panel on shorter screens.
    this.radius = Math.min(146, Math.max(112, (this.boardY - 150) / 1.19));
    this.floorY = this.height * 0.82;
    this.meterY = this.boardY + this.radius * 1.42;
  }
  get pixelScale() { return this.scale * this.dpr; }
}
