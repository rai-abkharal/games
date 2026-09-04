"use strict";
(() => {
  // js/config.js
  var PALETTE = {
    skyTop: "#7fdcf5",
    skyBottom: "#a4ecfb",
    cloud: "#c8f4fd",
    grass: "#7acb43",
    grassDark: "#63b234",
    fence: "#7b8394",
    fenceDark: "#69707f",
    pole: "#6e7787",
    poleDark: "#5b6472",
    court: "#363840",
    courtDark: "#2b323a",
    lineRed: "#ff6752",
    lineWhite: "#ffd8d9",
    board: "#fb6058",
    boardDark: "#e2483f",
    boardLine: "#ff8c86",
    rim: "#f5c93c",
    rimDark: "#d9a420",
    rimLight: "#ffe07a",
    net: "#ffffff",
    ball: "#f5801f",
    ballDark: "#d2490f",
    outline: "#242833",
    badge: "#2e3440",
    badgeText: "#ff6059",
    star: "#ff7a3d"
  };
  var CAM = {
    pos: { x: 0, y: 2.012, z: 5.172 },
    target: { x: 0, y: 1.503, z: -6 },
    fov: 40.56,
    // vertical FOV at the reference aspect
    refAspect: 592 / 1280,
    // Establishing shot the round opens on, matching the reference's dolly-in.
    introPos: { x: 0, y: 2.55, z: 9.3 },
    introTarget: { x: 0, y: 1.95, z: -6 }
  };
  var W = {
    gravity: 24,
    ballRadius: 0.14,
    rimRadius: 0.266,
    rimTube: 0.03,
    rimY: 3.05,
    rimZ: -6,
    boardZ: -6.34,
    boardW: 1.525,
    boardH: 1.025,
    boardY: 3.374,
    // board centre; the rim sits 20% up from its base
    badgeW: 0.6,
    badgeH: 0.3,
    netHeight: 0.6,
    netBottomScale: 0.66,
    poleRadius: 0.072,
    spawn: { x: 0, y: 0.14, z: -0.96 },
    spawnJitter: 0.45,
    // the reference re-spots the ball a little each time
    courtHalfW: 9,
    courtBackZ: -10.76,
    courtFrontZ: 4.2,
    // stops short of the camera (z=5.17); a ground quad
    // crossing behind the eye produces a mirrored
    // "hexagon" artifact in the court markings
    wallHalfW: 7.4,
    // physics side walls
    // Court markings, in world Z.
    baselineZ: -6.78,
    keyHalfW: 1.35,
    keyFrontZ: 2,
    freeThrowZ: -4.41,
    fenceZ: -10.76,
    fenceH: 3.52,
    grassFarZ: -40
  };
  var FEEL = {
    roundTime: 45,
    // the reference timer starts at 45
    // Drag length as a fraction of screen height that maps to full power.
    fullPowerDrag: 0.55,
    minPower: 0.18,
    // A shot is decomposed into an explicit vertical and forward speed. The
    // ranges are set so a drag of about half the full-power distance - roughly
    // a quarter of the screen height, a comfortable thumb swipe - is the sweet
    // spot, leaving headroom to under- and over-shoot in both directions.
    vyMin: 10.2,
    vyMax: 18.2,
    vzMin: 3.55,
    vzMax: 6.65,
    vxGain: 11,
    vxMax: 6.5,
    restitutionGround: 0.6,
    restitutionRim: 0.52,
    restitutionBoard: 0.46,
    restitutionFence: 0.3,
    friction: 0.86,
    netDrag: 4.2,
    airDrag: 6e-3,
    maxBalls: 6,
    ballLifetime: 6,
    cooldown: 0.16
  };
  var DIFFICULTY_STOPS = [
    { t: 0, key: "EASY", emoji: "\u{1F642}", amp: 0, period: 4, bob: 0 },
    { t: 0.5, key: "MEDIUM", emoji: "\u{1F60E}", amp: 0, period: 3.3, bob: 0 },
    { t: 1, key: "HARD", emoji: "\u{1F92F}", amp: 0, period: 2.05, bob: 0 }
  ];
  function difficultyAt(t) {
    t = Math.max(0, Math.min(1, t));
    const s = DIFFICULTY_STOPS;
    let a = s[0], b = s[1];
    if (t > 0.5) {
      a = s[1];
      b = s[2];
    }
    const k = (t - a.t) / (b.t - a.t);
    const lerp = (x, y) => x + (y - x) * k;
    return {
      t,
      key: k < 0.5 ? a.key : b.key,
      emoji: k < 0.5 ? a.emoji : b.emoji,
      amp: lerp(a.amp, b.amp),
      period: lerp(a.period, b.period),
      bob: lerp(a.bob, b.bob)
    };
  }

  // js/textures.js
  function make(w, h) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return { c, g: c.getContext("2d") };
  }
  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function ballTexture(size) {
    const w = size || 1024;
    const h = w / 2;
    const { c, g } = make(w, h);
    g.fillStyle = PALETTE.ball;
    g.fillRect(0, 0, w, h);
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "rgba(255,220,170,0.22)");
    grad.addColorStop(0.45, "rgba(255,255,255,0.00)");
    grad.addColorStop(1, "rgba(150,60,0,0.16)");
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(150,60,15,0.055)";
    for (let i = 0; i < 2200; i++) {
      g.beginPath();
      g.arc(Math.random() * w, Math.random() * h, 1 + Math.random() * 1.6, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = PALETTE.ballDark;
    g.lineCap = "round";
    g.lineWidth = w * 0.013;
    g.beginPath();
    g.moveTo(0, h / 2);
    g.lineTo(w, h / 2);
    g.stroke();
    const meridians = [0, 0.25, 0.5, 0.75];
    for (let i = 0; i < meridians.length; i++) {
      const x = meridians[i] * w;
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, h);
      g.stroke();
    }
    for (let s = 0; s < 2; s++) {
      g.beginPath();
      for (let i = 0; i <= 200; i++) {
        const u = i / 200;
        const x = u * w;
        const y = h / 2 + Math.sin(u * Math.PI * 2 + s * Math.PI) * h * 0.3;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }
    return c;
  }
  function backboardTexture(size) {
    const w = size || 1024;
    const h = Math.round(w * (W.boardH / W.boardW));
    const { c, g } = make(w, h);
    const pad = w * 0.018;
    const r = w * 0.055;
    g.clearRect(0, 0, w, h);
    g.fillStyle = PALETTE.outline;
    roundRect(g, 0, 0, w, h, r + pad);
    g.fill();
    g.fillStyle = PALETTE.board;
    roundRect(g, pad * 2, pad * 2, w - pad * 4, h - pad * 4, r);
    g.fill();
    const sheen = g.createLinearGradient(0, 0, w * 0.7, h);
    sheen.addColorStop(0, "rgba(255,255,255,0.16)");
    sheen.addColorStop(0.6, "rgba(255,255,255,0)");
    g.fillStyle = sheen;
    roundRect(g, pad * 2, pad * 2, w - pad * 4, h - pad * 4, r);
    g.fill();
    g.strokeStyle = PALETTE.boardLine;
    g.lineWidth = w * 0.016;
    roundRect(g, w * 0.3, h * 0.34, w * 0.4, h * 0.42, w * 0.035);
    g.stroke();
    g.strokeStyle = "rgba(255,255,255,0.30)";
    g.lineWidth = w * 0.02;
    g.beginPath();
    g.ellipse(w * 0.5, h * 0.8, w * 0.26, h * 0.075, 0, 0, Math.PI * 2);
    g.stroke();
    return c;
  }
  function backboardBurstTexture(size) {
    const base = backboardTexture(size);
    const w = base.width;
    const h = base.height;
    const { c, g } = make(w, h);
    g.drawImage(base, 0, 0);
    g.strokeStyle = "#ffe259";
    g.lineWidth = w * 0.024;
    roundRect(g, w * 0.3, h * 0.34, w * 0.4, h * 0.42, w * 0.035);
    g.stroke();
    const confettiColors = ["#ffd700", "#ff2a6d", "#05d9e8", "#00f5d4", "#9b5de5", "#ff8500", "#fee440"];
    for (let i = 0; i < 28; i++) {
      const a = i / 28 * Math.PI * 2 + 0.15;
      const d = 0.12 + i * 17 % 10 * 0.015;
      const px = w * (0.5 + Math.cos(a) * d);
      const py = h * (0.54 + Math.sin(a) * d * 0.72);
      g.fillStyle = confettiColors[i % confettiColors.length];
      g.save();
      g.translate(px, py);
      g.rotate(i * 29 % 360 * (Math.PI / 180));
      g.fillRect(-w * 9e-3, -h * 5e-3, w * 0.018, h * 0.01);
      g.restore();
    }
    return c;
  }
  function timerCanvas() {
    return make(256, 128).c;
  }
  function drawTimer(canvas2, text, urgent) {
    const g = canvas2.getContext("2d");
    const w = canvas2.width;
    const h = canvas2.height;
    g.clearRect(0, 0, w, h);
    g.fillStyle = PALETTE.badge;
    roundRect(g, 4, 4, w - 8, h - 8, 22);
    g.fill();
    g.fillStyle = "rgba(255,255,255,0.07)";
    roundRect(g, 10, 10, w - 20, h * 0.42, 16);
    g.fill();
    g.font = 'bold 74px "Baloo 2", "Trebuchet MS", system-ui, sans-serif';
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = urgent ? "#ff3b30" : PALETTE.badgeText;
    g.fillText(text, w / 2, h / 2 + 4);
    return canvas2;
  }
  function courtTexture(size) {
    const w = size || 1024;
    const h = Math.round(w * ((W.courtFrontZ - W.courtBackZ) / (W.courtHalfW * 2)));
    const { c, g } = make(w, h);
    const spanX = W.courtHalfW * 2;
    const spanZ = W.courtFrontZ - W.courtBackZ;
    const ux = (x) => (x + W.courtHalfW) / spanX * w;
    const vz = (z) => (z - W.courtBackZ) / spanZ * h;
    g.fillStyle = PALETTE.court;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2400; i++) {
      g.fillStyle = Math.random() > 0.5 ? "rgba(255,255,255,0.006)" : "rgba(0,0,0,0.014)";
      g.beginPath();
      g.arc(Math.random() * w, Math.random() * h, 2 + Math.random() * 7, 0, Math.PI * 2);
      g.fill();
    }
    const mToPx = w / spanX;
    g.lineCap = "butt";
    const hline = (z, color, metres) => {
      g.strokeStyle = color;
      g.lineWidth = metres * mToPx;
      g.beginPath();
      g.moveTo(0, vz(z));
      g.lineTo(w, vz(z));
      g.stroke();
    };
    hline(W.baselineZ, PALETTE.lineRed, 0.13);
    g.strokeStyle = PALETTE.lineRed;
    g.lineWidth = 0.13 * mToPx;
    const sides = [-W.keyHalfW, W.keyHalfW];
    for (let i = 0; i < sides.length; i++) {
      g.beginPath();
      g.moveTo(ux(sides[i]), vz(W.baselineZ));
      g.lineTo(ux(sides[i]), vz(W.keyFrontZ));
      g.stroke();
    }
    hline(W.freeThrowZ, PALETTE.lineWhite, 0.1);
    return c;
  }
  function fenceTexture(size) {
    const s = size || 256;
    const { c, g } = make(s, s);
    g.clearRect(0, 0, s, s);
    g.lineCap = "round";
    const draw = (color, width, off) => {
      g.strokeStyle = color;
      g.lineWidth = width;
      for (let i = -2; i <= 2; i++) {
        g.beginPath();
        g.moveTo(i * s / 2 + off, -off);
        g.lineTo(i * s / 2 + s + off, s + off);
        g.stroke();
        g.beginPath();
        g.moveTo(i * s / 2 + off, s + off);
        g.lineTo(i * s / 2 + s + off, -off);
        g.stroke();
      }
    };
    draw(PALETTE.fence, s * 0.055, 0);
    draw("rgba(255,255,255,0.22)", s * 0.016, -1.5);
    return c;
  }
  function skyTexture(w, h) {
    const W2 = w || 1024;
    const H2 = h || 1024;
    const { c, g } = make(W2, H2);
    const grad = g.createLinearGradient(0, 0, 0, H2);
    grad.addColorStop(0, PALETTE.skyTop);
    grad.addColorStop(0.75, PALETTE.skyBottom);
    grad.addColorStop(1, PALETTE.skyBottom);
    g.fillStyle = grad;
    g.fillRect(0, 0, W2, H2);
    function cloud(cx, cy, scale, alpha) {
      g.fillStyle = "rgba(255,255,255," + alpha + ")";
      const lobes = [
        [0, 0, 1],
        [0.72, 0.12, 0.74],
        [-0.7, 0.16, 0.68],
        [0.34, -0.36, 0.72],
        [-0.3, -0.3, 0.62],
        [1.28, 0.3, 0.46],
        [-1.24, 0.32, 0.44]
      ];
      for (let i = 0; i < lobes.length; i++) {
        g.beginPath();
        g.ellipse(
          cx + lobes[i][0] * scale,
          cy + lobes[i][1] * scale,
          lobes[i][2] * scale,
          lobes[i][2] * scale * 0.78,
          0,
          0,
          Math.PI * 2
        );
        g.fill();
      }
    }
    const rnd = mulberry(20260904);
    for (let i = 0; i < 8; i++) {
      cloud(rnd() * W2, H2 * (0.06 + rnd() * 0.38), W2 * (0.022 + rnd() * 0.03), 0.34 + rnd() * 0.24);
    }
    return c;
  }
  function grassTexture(size) {
    const s = size || 512;
    const { c, g } = make(s, Math.round(s / 4));
    const h = c.height;
    g.fillStyle = PALETTE.grass;
    g.fillRect(0, 0, s, h);
    g.globalAlpha = 0.28;
    g.fillStyle = PALETTE.grassDark;
    for (let i = 0; i < 55; i++) {
      g.beginPath();
      g.ellipse(Math.random() * s, Math.random() * h, 10 + Math.random() * 30, 4 + Math.random() * 8, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    return c;
  }
  function confettiTexture(size) {
    const s = size || 256;
    const { c, g } = make(s, s);
    const cols = 4;
    const rows = 4;
    const cellW = s / cols;
    const cellH = s / rows;
    const colors = [
      "#ffd700",
      "#ff2a6d",
      "#05d9e8",
      "#00f5d4",
      "#9b5de5",
      "#ff8500",
      "#fee440",
      "#00bbf9",
      "#ff3366",
      "#38ef7d",
      "#ff5e7e",
      "#7209b7",
      "#f72585",
      "#4cc9f0",
      "#ffb703",
      "#fb5607"
    ];
    for (let idx = 0; idx < 16; idx++) {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const cx = col * cellW + cellW / 2;
      const cy = row * cellH + cellH / 2;
      const color = colors[idx % colors.length];
      g.save();
      g.translate(cx, cy);
      const angle = idx * 37 % 360 * (Math.PI / 180);
      g.rotate(angle);
      g.fillStyle = color;
      const shapeType = idx % 4;
      if (shapeType === 0) {
        const rw = cellW * 0.62;
        const rh = cellH * 0.25;
        roundRect(g, -rw / 2, -rh / 2, rw, rh, cellW * 0.04);
        g.fill();
      } else if (shapeType === 1) {
        const rw = cellW * 0.5;
        const rh = cellH * 0.32;
        roundRect(g, -rw / 2, -rh / 2, rw, rh, cellW * 0.04);
        g.fill();
      } else if (shapeType === 2) {
        const sq = cellW * 0.38;
        roundRect(g, -sq / 2, -sq / 2, sq, sq, cellW * 0.05);
        g.fill();
      } else {
        g.beginPath();
        g.ellipse(0, 0, cellW * 0.27, cellH * 0.16, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
    }
    return c;
  }
  function shadowTexture(size) {
    const s = size || 128;
    const { c, g } = make(s, s);
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, "rgba(0,0,0,0.45)");
    grad.addColorStop(0.55, "rgba(0,0,0,0.22)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
    return c;
  }
  function mulberry(a) {
    return function() {
      a |= 0;
      a = a + 1831565813 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // js/net.js
  var RINGS = 5;
  var SEGS = 12;
  function createNet() {
    const nodes = [];
    for (let ring = 0; ring < RINGS; ring++) {
      const k = ring / (RINGS - 1);
      const radius = W.rimRadius * (0.93 - k * (0.93 - W.netBottomScale));
      const y = -0.028 - k * W.netHeight;
      for (let s = 0; s < SEGS; s++) {
        const a = s / SEGS * Math.PI * 2;
        nodes.push({
          // Position is stored in rim-local space (rim centre = origin).
          x: Math.cos(a) * radius,
          y,
          z: Math.sin(a) * radius,
          ox: Math.cos(a) * radius,
          oy: y,
          oz: Math.sin(a) * radius,
          // previous
          rx: Math.cos(a) * radius,
          ry: y,
          rz: Math.sin(a) * radius,
          // rest
          pinned: ring === 0
        });
      }
    }
    const links = [];
    const idx = (r, s) => r * SEGS + s % SEGS;
    for (let r = 0; r < RINGS; r++) {
      for (let s = 0; s < SEGS; s++) {
        if (r < RINGS - 1) links.push(mk(nodes, idx(r, s), idx(r + 1, s)));
        links.push(mk(nodes, idx(r, s), idx(r, s + 1)));
        if (r < RINGS - 1) links.push(mk(nodes, idx(r, s), idx(r + 1, s + 1)));
      }
    }
    return { nodes, links, idx };
  }
  function buildNetRibbons(net, hoop, camPos, width, out) {
    const nodes = net.nodes;
    const links = net.links;
    const half = width * 0.5;
    let p = 0;
    for (let i = 0; i < links.length; i++) {
      const l = links[i];
      const a = nodes[l.a];
      const b = nodes[l.b];
      const ax = hoop.x + a.x, ay = hoop.y + a.y, az = hoop.z + a.z;
      const bx = hoop.x + b.x, by = hoop.y + b.y, bz = hoop.z + b.z;
      let dx = bx - ax, dy = by - ay, dz = bz - az;
      const mx = (ax + bx) * 0.5, my = (ay + by) * 0.5, mz = (az + bz) * 0.5;
      let vx = camPos.x - mx, vy = camPos.y - my, vz = camPos.z - mz;
      let nx = dy * vz - dz * vy;
      let ny = dz * vx - dx * vz;
      let nz = dx * vy - dy * vx;
      const nl = Math.hypot(nx, ny, nz);
      if (nl < 1e-6) continue;
      nx = nx / nl * half;
      ny = ny / nl * half;
      nz = nz / nl * half;
      out[p++] = ax - nx;
      out[p++] = ay - ny;
      out[p++] = az - nz;
      out[p++] = ax + nx;
      out[p++] = ay + ny;
      out[p++] = az + nz;
      out[p++] = bx + nx;
      out[p++] = by + ny;
      out[p++] = bz + nz;
      out[p++] = ax - nx;
      out[p++] = ay - ny;
      out[p++] = az - nz;
      out[p++] = bx + nx;
      out[p++] = by + ny;
      out[p++] = bz + nz;
      out[p++] = bx - nx;
      out[p++] = by - ny;
      out[p++] = bz - nz;
    }
    return p / 3;
  }
  function netRibbonVertexCount() {
    return (RINGS * SEGS + (RINGS - 1) * SEGS * 2) * 6;
  }
  function mk(nodes, a, b) {
    const na = nodes[a], nb = nodes[b];
    return { a, b, len: Math.hypot(na.x - nb.x, na.y - nb.y, na.z - nb.z) };
  }
  function impulseNet(net, dirX, dirY, dirZ, mag) {
    const nodes = net.nodes;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.pinned) continue;
      const depth = Math.max(0, Math.min(1, -n.y / W.netHeight));
      const ripple = 1.1 - depth * 0.35;
      const wave = Math.sin(i * 2.39 + depth * 4.2);
      n.x += (dirX * ripple + wave * 0.04) * mag * 0.035;
      n.y -= mag * 0.03 * ripple;
      n.z += (dirZ * ripple + wave * 0.04) * mag * 0.035;
    }
  }
  function stepNet(net, dt, balls, hoop) {
    const nodes = net.nodes;
    const d = Math.min(dt, 1 / 60);
    const damping = 0.972;
    const gravity = 10.5;
    net._time = (net._time || 0) + d;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.pinned) {
        n.x = n.rx;
        n.y = n.ry;
        n.z = n.rz;
        n.ox = n.x;
        n.oy = n.y;
        n.oz = n.z;
        continue;
      }
      const vx = (n.x - n.ox) * damping;
      const vy = (n.y - n.oy) * damping;
      const vz = (n.z - n.oz) * damping;
      n.ox = n.x;
      n.oy = n.y;
      n.oz = n.z;
      n.x += vx;
      n.y += vy - gravity * d * d;
      n.z += vz;
      const shapePull = 0.025;
      n.x += (n.rx - n.x) * shapePull;
      n.y += (n.ry - n.y) * shapePull;
      n.z += (n.rz - n.z) * shapePull;
      const breeze = Math.sin(net._time * 2 + n.y * 3.2 + n.rx * 2.5) * 18e-5;
      n.x += breeze;
      n.z += breeze * 0.7;
    }
    for (let bi = 0; bi < balls.length; bi++) {
      const b = balls[bi];
      if (!b.live || b.dead) continue;
      const bx = b.x - hoop.x;
      const by = b.y - hoop.y;
      const bz = b.z - hoop.z;
      if (by > 0.55 || by < -W.netHeight - 0.5) continue;
      if (Math.hypot(bx, bz) > W.rimRadius + b.r + 0.32) continue;
      const rad = b.r * 0.95;
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        if (n.pinned) continue;
        let dx = n.x - bx, dy = n.y - by, dz = n.z - bz;
        const dist = Math.hypot(dx, dy, dz);
        if (dist < rad && dist > 1e-5) {
          const s = (rad - dist) / dist;
          n.x += dx * s;
          n.y += dy * s;
          n.z += dz * s;
          const drag = 0.35;
          n.x += b.vx * d * drag;
          n.y += b.vy * d * drag;
          n.z += b.vz * d * drag;
        }
      }
    }
    const links = net.links;
    for (let it = 0; it < 4; it++) {
      for (let i = 0; i < links.length; i++) {
        const l = links[i];
        const a = nodes[l.a], b = nodes[l.b];
        let dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
        const dist = Math.hypot(dx, dy, dz) || 1e-6;
        const diff = (dist - l.len) / dist * 0.5;
        const wa = a.pinned ? 0 : 1;
        const wb = b.pinned ? 0 : 1;
        const wsum = wa + wb;
        if (wsum === 0) continue;
        const ka = wa / wsum * diff;
        const kb = wb / wsum * diff;
        a.x += dx * ka;
        a.y += dy * ka;
        a.z += dz * ka;
        b.x -= dx * kb;
        b.y -= dy * kb;
        b.z -= dz * kb;
      }
    }
  }

  // js/view.js
  var B = window.BABYLON;
  var MAX_BALLS = 10;
  var MAX_CONFETTI = 160;
  var DEG = Math.PI / 180;
  function v3(o) {
    return new B.Vector3(o.x, o.y, o.z);
  }
  function canvasTexture(scene, canvas2, name, hasAlpha) {
    const t = new B.DynamicTexture(name, { width: canvas2.width, height: canvas2.height }, scene, true);
    const ctx2 = t.getContext();
    ctx2.clearRect(0, 0, canvas2.width, canvas2.height);
    ctx2.drawImage(canvas2, 0, 0);
    t.update(false);
    t.hasAlpha = !!hasAlpha;
    t.anisotropicFilteringLevel = 8;
    return t;
  }
  function flatMat(scene, name, texture, color, useAlpha) {
    const m = new B.StandardMaterial(name, scene);
    m.disableLighting = true;
    m.specularColor = B.Color3.Black();
    m.diffuseColor = B.Color3.Black();
    m.emissiveColor = texture ? B.Color3.White() : color ? B.Color3.FromHexString(color) : B.Color3.White();
    if (texture) {
      m.diffuseTexture = texture;
      if (useAlpha) {
        texture.hasAlpha = true;
        m.useAlphaFromDiffuseTexture = true;
      }
    }
    return m;
  }
  function flipV(texture) {
    texture.vScale = -1;
    texture.vOffset = 1;
    return texture;
  }
  function litMat(scene, name, texture, color) {
    const m = new B.StandardMaterial(name, scene);
    if (texture) m.diffuseTexture = texture;
    if (color) m.diffuseColor = B.Color3.FromHexString(color);
    m.specularColor = new B.Color3(0.05, 0.05, 0.05);
    m.specularPower = 64;
    return m;
  }
  var View = class {
    constructor(canvas2) {
      this.canvas = canvas2;
      this.engine = new B.Engine(canvas2, true, {
        preserveDrawingBuffer: false,
        stencil: false,
        antialias: true
      }, false);
      this.engine.setHardwareScalingLevel(1 / Math.min(devicePixelRatio || 1, 2));
      const scene = new B.Scene(this.engine);
      this.scene = scene;
      scene.useRightHandedSystem = true;
      scene.clearColor = B.Color4.FromHexString(PALETTE.skyBottom + "ff");
      scene.autoClear = true;
      this.skyLayer = new B.Layer("sky", null, scene, true);
      this.skyLayer.texture = canvasTexture(scene, skyTexture(1024, 1024), "skyTex");
      this.camera = new B.FreeCamera("cam", v3(CAM.pos), scene);
      this.camera.fovMode = B.Camera.FOVMODE_VERTICAL_FIXED;
      this.camera.fov = CAM.fov * DEG;
      this.camera.minZ = 0.1;
      this.camera.maxZ = 160;
      this.camera.setTarget(v3(CAM.target));
      this.basePos = v3(CAM.pos);
      this.baseTarget = v3(CAM.target);
      this.introPos = v3(CAM.introPos);
      this.introTarget = v3(CAM.introTarget);
      this._pos = new B.Vector3();
      this._tgt = new B.Vector3();
      this.shakeAmount = 0;
      this.introT = 0;
      this.burstT = 0;
      this.confettiTimer = 0;
      this.rimDip = 0;
      this.rimDipVel = 0;
      this.rimPitch = 0;
      this.rimPitchVel = 0;
      this.hoopShudderX = 0;
      this.hoopShudderY = 0;
      this.hoopShudderZ = 0;
      this._buildLights();
      this._buildGround();
      this._buildFence();
      this._buildHoop();
      this._buildBalls();
      this._buildParticles();
      this.resize();
    }
    // --- construction ---------------------------------------------------------
    _buildLights() {
      const hemi = new B.HemisphericLight("hemi", new B.Vector3(0.2, 1, 0.3), this.scene);
      hemi.intensity = 1.15;
      hemi.diffuse = B.Color3.White();
      hemi.groundColor = B.Color3.FromHexString("#8fa0b8");
      const key = new B.DirectionalLight("key", new B.Vector3(-0.4, -0.85, -0.5), this.scene);
      key.intensity = 0.75;
    }
    _buildGround() {
      const courtW = W.courtHalfW * 2;
      const courtD = W.courtFrontZ - W.courtBackZ;
      const court = B.MeshBuilder.CreateGround("court", { width: courtW, height: courtD, subdivisions: 16 }, this.scene);
      const courtTex = canvasTexture(this.scene, courtTexture(1024), "courtTex");
      court.material = flatMat(this.scene, "courtMat", courtTex);
      court.position.z = W.courtBackZ + courtD / 2;
      const grassD = W.courtBackZ - W.grassFarZ;
      const grass = B.MeshBuilder.CreateGround("grass", { width: 90, height: grassD }, this.scene);
      const grassTex = canvasTexture(this.scene, grassTexture(512), "grassTex");
      grassTex.wrapU = B.Texture.WRAP_ADDRESSMODE;
      grassTex.wrapV = B.Texture.WRAP_ADDRESSMODE;
      grassTex.uScale = 14;
      grassTex.vScale = 6;
      grass.material = flatMat(this.scene, "grassMat", grassTex);
      grass.position.set(0, -4e-3, W.courtBackZ - grassD / 2);
      const kerb = B.MeshBuilder.CreateGround("kerb", { width: courtW, height: 0.14 }, this.scene);
      kerb.material = flatMat(this.scene, "kerbMat", null, PALETTE.courtDark);
      kerb.position.set(0, 3e-3, W.courtBackZ + 0.07);
    }
    _buildFence() {
      const fenceW = 40;
      const cell = 1.05;
      const tex = canvasTexture(this.scene, fenceTexture(256), "fenceTex", true);
      tex.wrapU = B.Texture.WRAP_ADDRESSMODE;
      tex.wrapV = B.Texture.WRAP_ADDRESSMODE;
      tex.uScale = fenceW / cell;
      tex.vScale = W.fenceH / cell;
      const fence = B.MeshBuilder.CreatePlane("fence", {
        width: fenceW,
        height: W.fenceH,
        sideOrientation: B.Mesh.DOUBLESIDE
      }, this.scene);
      const mat = flatMat(this.scene, "fenceMat", tex, null, true);
      mat.backFaceCulling = false;
      fence.material = mat;
      fence.position.set(0, W.fenceH / 2, W.fenceZ);
      const barMat = litMat(this.scene, "barMat", null, PALETTE.fenceDark);
      const rail = B.MeshBuilder.CreateCylinder("rail", { diameter: 0.11, height: fenceW, tessellation: 8 }, this.scene);
      rail.material = barMat;
      rail.rotation.z = Math.PI / 2;
      rail.position.set(0, W.fenceH, W.fenceZ);
      const railB = rail.clone("railB");
      railB.position.y = 0.06;
      const post = B.MeshBuilder.CreateCylinder("post", { diameter: 0.124, height: W.fenceH, tessellation: 8 }, this.scene);
      post.material = barMat;
      post.position.set(-21, W.fenceH / 2, W.fenceZ);
      const mats = [];
      for (let i = -7; i <= 7; i++) {
        mats.push(B.Matrix.Translation(i * 3 + 21, 0, 0));
      }
      post.thinInstanceAdd(mats);
    }
    _buildHoop() {
      const scene = this.scene;
      const g = new B.TransformNode("hoop", scene);
      this.hoopNode = g;
      const poleH = W.boardY + W.boardH / 2;
      const pole = B.MeshBuilder.CreateCylinder("pole", {
        diameterTop: W.poleRadius * 2,
        diameterBottom: W.poleRadius * 2.5,
        height: poleH,
        tessellation: 14
      }, scene);
      pole.material = litMat(scene, "poleMat", null, PALETTE.pole);
      pole.position.set(0, poleH / 2, W.boardZ - 0.16);
      pole.parent = g;
      this.boardTex = flipV(canvasTexture(scene, backboardTexture(1024), "boardTex", true));
      this.boardBurstTex = flipV(canvasTexture(scene, backboardBurstTexture(1024), "boardBurstTex", true));
      this.boardMat = flatMat(scene, "boardMat", this.boardTex, null, true);
      this.boardMat.backFaceCulling = false;
      const board2 = B.MeshBuilder.CreatePlane("board", {
        width: W.boardW,
        height: W.boardH,
        sideOrientation: B.Mesh.DOUBLESIDE
      }, scene);
      board2.material = this.boardMat;
      board2.position.set(0, W.boardY, W.boardZ);
      board2.parent = g;
      const slab = B.MeshBuilder.CreateBox("slab", {
        width: W.boardW * 0.97,
        height: W.boardH * 0.95,
        depth: 0.07
      }, scene);
      slab.material = litMat(scene, "slabMat", null, PALETTE.boardDark);
      slab.position.set(0, W.boardY, W.boardZ - 0.045);
      slab.parent = g;
      this.timerCanvas = timerCanvas();
      drawTimer(this.timerCanvas, "45", false);
      this.timerTex = flipV(canvasTexture(scene, this.timerCanvas, "timerTex", true));
      const badgeMat = flatMat(scene, "badgeMat", this.timerTex, null, true);
      badgeMat.backFaceCulling = false;
      const badge = B.MeshBuilder.CreatePlane("badge", {
        width: W.badgeW,
        height: W.badgeH,
        sideOrientation: B.Mesh.DOUBLESIDE
      }, scene);
      badge.material = badgeMat;
      badge.position.set(0, W.boardY + W.boardH / 2 + W.badgeH * 0.46, W.boardZ + 0.02);
      badge.parent = g;
      const rimAnchorZ = W.boardZ + 0.05;
      const rimAssembly = new B.TransformNode("rimAssembly", scene);
      rimAssembly.parent = g;
      rimAssembly.position.set(0, W.rimY, rimAnchorZ);
      this.rimAssembly = rimAssembly;
      const rim2 = B.MeshBuilder.CreateTorus("rim", {
        diameter: W.rimRadius * 2,
        thickness: W.rimTube * 2,
        tessellation: 40
      }, scene);
      const rimMat = litMat(scene, "rimMat", null, PALETTE.rim);
      rimMat.emissiveColor = B.Color3.FromHexString("#5a4400");
      rim2.material = rimMat;
      rim2.position.set(0, 0, W.rimZ - rimAnchorZ);
      rim2.parent = rimAssembly;
      const bracket = B.MeshBuilder.CreateBox("bracket", { width: 0.16, height: 0.05, depth: 0.36 }, scene);
      bracket.material = litMat(scene, "bracketMat", null, PALETTE.rimDark);
      bracket.position.set(0, 0, (W.rimZ + W.boardZ) / 2 - 0.06 - rimAnchorZ);
      bracket.parent = rimAssembly;
      this.netVerts = new Float32Array(netRibbonVertexCount() * 3);
      const netMesh = new B.Mesh("net", scene);
      const vd = new B.VertexData();
      vd.positions = this.netVerts;
      const idx = new Uint32Array(netRibbonVertexCount());
      for (let i = 0; i < idx.length; i++) idx[i] = i;
      vd.indices = idx;
      const normals = new Float32Array(this.netVerts.length);
      for (let i = 0; i < normals.length; i += 3) normals[i + 2] = 1;
      vd.normals = normals;
      vd.applyToMesh(netMesh, true);
      const netMat = flatMat(scene, "netMat", null, "#ffffff");
      netMat.emissiveColor = B.Color3.White();
      netMat.backFaceCulling = false;
      netMesh.material = netMat;
      netMesh.alwaysSelectAsActiveMesh = true;
      this.netMesh = netMesh;
    }
    _buildBalls() {
      const scene = this.scene;
      const ballMat = litMat(scene, "ballMat", canvasTexture(scene, ballTexture(1024), "ballTex"));
      const proto = B.MeshBuilder.CreateSphere("ball", {
        diameter: W.ballRadius * 2,
        segments: 20
      }, scene);
      proto.material = ballMat;
      proto.isVisible = false;
      const shadowTex = canvasTexture(scene, shadowTexture(128), "shadowTex", true);
      const shadowMat = flatMat(scene, "shadowMat", shadowTex, null, true);
      shadowMat.disableDepthWrite = true;
      shadowMat.backFaceCulling = false;
      this.ballMeshes = [];
      this.shadows = [];
      for (let i = 0; i < MAX_BALLS; i++) {
        const m = proto.clone("ball" + i);
        m.isVisible = false;
        m.alwaysSelectAsActiveMesh = true;
        m.rotationQuaternion = null;
        this.ballMeshes.push(m);
        const s = B.MeshBuilder.CreateGround("shadow" + i, { width: 1, height: 1 }, scene);
        s.material = shadowMat;
        s.isVisible = false;
        s.alwaysSelectAsActiveMesh = true;
        this.shadows.push(s);
      }
      this.ballProto = proto;
    }
    _buildParticles() {
      const ps = new B.ParticleSystem("confetti", MAX_CONFETTI * 2, this.scene);
      ps.particleTexture = canvasTexture(this.scene, confettiTexture(256), "confettiTex", true);
      ps.isAnimationSheetEnabled = true;
      ps.spriteCellWidth = 64;
      ps.spriteCellHeight = 64;
      ps.startSpriteCellID = 0;
      ps.endSpriteCellID = 15;
      ps.spriteRandomStartCell = true;
      ps.spriteCellChangeSpeed = 0;
      ps.emitter = new B.Vector3(0, W.rimY + 0.05, W.rimZ);
      ps.minEmitBox = new B.Vector3(-0.14, 0, -0.14);
      ps.maxEmitBox = new B.Vector3(0.14, 0.05, 0.14);
      ps.color1 = new B.Color4(1, 1, 1, 1);
      ps.color2 = new B.Color4(1, 1, 1, 1);
      ps.colorDead = new B.Color4(1, 1, 1, 0);
      ps.minSize = 0.09;
      ps.maxSize = 0.16;
      ps.minLifeTime = 0.7;
      ps.maxLifeTime = 1.15;
      ps.emitRate = 0;
      ps.manualEmitCount = 0;
      ps.blendMode = B.ParticleSystem.BLENDMODE_STANDARD;
      ps.direction1 = new B.Vector3(-1.8, 5.5, -1.8);
      ps.direction2 = new B.Vector3(1.8, 8.5, 1.8);
      ps.minEmitPower = 3;
      ps.maxEmitPower = 7.2;
      ps.gravity = new B.Vector3(0, -9.8, 0);
      ps.minInitialRotation = 0;
      ps.maxInitialRotation = Math.PI * 2;
      ps.minAngularSpeed = -19.5;
      ps.maxAngularSpeed = 19.5;
      ps.updateSpeed = 1 / 60;
      ps.start();
      this.confetti = ps;
      this.stars = ps;
    }
    // --- view contract --------------------------------------------------------
    resize() {
      this.engine.resize();
      const w = this.canvas.clientWidth || window.innerWidth;
      const h = this.canvas.clientHeight || window.innerHeight;
      this._playH = h;
      const aspect = w / h;
      if (aspect > CAM.refAspect) {
        const halfH = Math.tan(CAM.fov * DEG / 2);
        const halfW = halfH * CAM.refAspect;
        this.camera.fov = 2 * Math.atan(halfW / aspect);
      } else {
        this.camera.fov = CAM.fov * DEG;
      }
    }
    playHeight() {
      return this._playH || this.canvas.clientHeight || window.innerHeight;
    }
    setHoop(hoop) {
      this.hoopNode.position.x = hoop.x + this.hoopShudderX;
      this.hoopNode.position.y = hoop.y - W.rimY + this.hoopShudderY;
      this.hoopNode.position.z = this.hoopShudderZ;
    }
    setTimer(text, urgent) {
      if (text === this._timerText && urgent === this._timerUrgent) return;
      this._timerText = text;
      this._timerUrgent = urgent;
      drawTimer(this.timerCanvas, text, urgent);
      const ctx2 = this.timerTex.getContext();
      ctx2.clearRect(0, 0, this.timerCanvas.width, this.timerCanvas.height);
      ctx2.drawImage(this.timerCanvas, 0, 0);
      this.timerTex.update(false);
    }
    syncNet(net, hoop) {
      const activeHoop = {
        x: hoop.x + this.hoopShudderX,
        y: hoop.y + this.rimDip + this.hoopShudderY,
        z: hoop.z + this.hoopShudderZ
      };
      const n = buildNetRibbons(net, activeHoop, this.camera.position, 0.016, this.netVerts);
      for (let i = n * 3; i < this.netVerts.length; i++) this.netVerts[i] = 0;
      this.netMesh.updateVerticesData(B.VertexBuffer.PositionKind, this.netVerts);
    }
    syncBalls(balls, readyBall) {
      const list = readyBall ? balls.concat([readyBall]) : balls;
      for (let i = 0; i < MAX_BALLS; i++) {
        const m = this.ballMeshes[i];
        const sh = this.shadows[i];
        const b = list[i];
        if (!b) {
          m.isVisible = false;
          sh.isVisible = false;
          continue;
        }
        m.isVisible = true;
        m.position.set(b.x, b.y, b.z);
        m.rotation.set(b.rotX, b.rotY, b.rotZ);
        const q = b.squash * 0.42;
        m.scaling.set(1 + q * 0.5, 1 - q, 1 + q * 0.5);
        const hgt = Math.max(0, b.y - b.r);
        const k = Math.max(0, 1 - hgt / 4.2);
        sh.isVisible = k > 0.02;
        const s = W.ballRadius * (5.6 * (0.45 + k * 0.55));
        sh.scaling.set(s, 1, s);
        sh.position.set(b.x, 6e-3, b.z);
        sh.visibility = 0.55 * k;
      }
    }
    setIntro(t) {
      this.introT = t;
    }
    setAim(points) {
    }
    basketHit(type, mag) {
      mag = Math.min(2.5, mag || 1);
      if (type === "rim") {
        this.rimDipVel -= mag * 0.46;
        this.rimPitchVel += mag * 1.7;
        this.hoopShudderX += (Math.random() - 0.5) * mag * 0.028;
        this.hoopShudderY += (Math.random() - 0.5) * mag * 0.02;
        this.shake(mag * 0.22);
      } else if (type === "board") {
        this.hoopShudderZ -= mag * 0.035;
        this.hoopShudderX += (Math.random() - 0.5) * mag * 0.035;
        this.rimDipVel -= mag * 0.2;
        this.shake(mag * 0.16);
      } else if (type === "score") {
        this.rimDipVel -= 0.36;
        this.rimPitchVel += 0.82;
        this.shake(0.24);
      }
    }
    burst(x, y, z) {
      this.burstT = 1;
      this.boardMat.diffuseTexture = this.boardBurstTex;
      this.confetti.emitter.set(x, y + 0.05, z);
      this.confetti.manualEmitCount = 18;
      this.confetti.emitRate = 110;
      this.confettiTimer = 1;
    }
    shake(amount) {
      this.shakeAmount = Math.max(this.shakeAmount, amount);
    }
    render(dt, elapsed) {
      if (this.burstT > 0) {
        this.burstT -= dt;
        if (this.burstT <= 0 && this.boardMat.diffuseTexture !== this.boardTex) {
          this.boardMat.diffuseTexture = this.boardTex;
        }
      }
      if (this.confettiTimer > 0) {
        this.confettiTimer -= dt;
        if (this.confettiTimer <= 0) {
          this.confettiTimer = 0;
          this.confetti.emitRate = 0;
        }
      }
      const subSteps = 2;
      const sdt = dt / subSteps;
      for (let i = 0; i < subSteps; i++) {
        this.rimDipVel += (-380 * this.rimDip - 26 * this.rimDipVel) * sdt;
        this.rimDip += this.rimDipVel * sdt;
        this.rimPitchVel += (-340 * this.rimPitch - 22 * this.rimPitchVel) * sdt;
        this.rimPitch += this.rimPitchVel * sdt;
      }
      this.hoopShudderX *= Math.exp(-24 * dt);
      this.hoopShudderY *= Math.exp(-24 * dt);
      this.hoopShudderZ *= Math.exp(-24 * dt);
      if (this.rimAssembly) {
        this.rimAssembly.position.y = W.rimY + this.rimDip;
        this.rimAssembly.rotation.x = this.rimPitch;
      }
      const e = 1 - Math.pow(1 - this.introT, 3);
      B.Vector3.LerpToRef(this.introPos, this.basePos, e, this._pos);
      B.Vector3.LerpToRef(this.introTarget, this.baseTarget, e, this._tgt);
      this._pos.x += Math.sin(elapsed * 0.42) * 0.045;
      this._pos.y += Math.sin(elapsed * 0.31 + 1.2) * 0.028;
      if (this.shakeAmount > 1e-3) {
        const k = this.shakeAmount;
        this._pos.x += (Math.random() - 0.5) * 0.12 * k;
        this._pos.y += (Math.random() - 0.5) * 0.12 * k;
        this.shakeAmount *= Math.pow(16e-4, dt);
      }
      this.camera.position.copyFrom(this._pos);
      this.camera.setTarget(this._tgt);
      this.scene.render();
    }
  };

  // js/physics.js
  var FIXED_DT = 1 / 180;
  var MAX_STEPS = 8;
  var EVENT = {
    GROUND: "ground",
    RIM: "rim",
    BOARD: "board",
    NET: "net",
    POLE: "pole",
    FENCE: "fence",
    SCORE: "score",
    EXPIRE: "expire"
  };
  var nextId = 1;
  function createBall(x, y, z) {
    return {
      id: nextId++,
      x,
      y,
      z,
      px: x,
      py: y,
      pz: z,
      // previous position, used for score sweep tests
      vx: 0,
      vy: 0,
      vz: 0,
      spinX: 0,
      spinY: 0,
      spinZ: 0,
      // angular velocity (rad/s) about each axis
      rotX: 0,
      rotY: 0,
      rotZ: 0,
      // accumulated orientation for the renderer
      squash: 0,
      // 0..1, drives squash-and-stretch on impact
      squashDirY: 1,
      r: W.ballRadius,
      live: false,
      // launched and still in play
      scored: false,
      touchedRim: false,
      touchedBoard: false,
      inNet: false,
      age: 0,
      dead: false
    };
  }
  function launchVelocityJoystick(dx, dy, power, maxR) {
    const r = Math.max(1, maxR || 60);
    const nx = Math.max(-1, Math.min(1, dx / r));
    const ny = Math.max(-1, Math.min(1, dy / r));
    let vy, vz;
    if (ny <= 0) {
      const forward = Math.min(1, -ny * 1.15);
      if (forward >= 0.45) {
        const t = (forward - 0.45) / 0.55;
        const p = 0.56 + 0.1 * t;
        vy = 10.2 + 8 * p;
        vz = -(3.55 + 3.1 * p);
      } else {
        const t = forward / 0.45;
        vy = 5 + (14.68 - 5) * Math.pow(t, 1.2);
        vz = -(1.5 + (5.28 - 1.5) * Math.pow(t, 1.2));
      }
    } else {
      const near = Math.min(1, ny * 1.15);
      const k = 1 - near * 0.7;
      vy = 4.8 * Math.max(0.3, k);
      vz = -(1.2 * Math.max(0.2, k));
    }
    const aimSign = nx < 0 ? -1 : 1;
    let vx = aimSign * Math.pow(Math.abs(nx), 1.6) * 3.5;
    vx = Math.max(-FEEL.vxMax, Math.min(FEEL.vxMax, vx));
    return {
      vx,
      vy,
      vz,
      power: Math.max(0.05, power),
      spin: -nx * 3.5
    };
  }
  function reflect(ball, nx, ny, nz, restitution, friction) {
    const vn = ball.vx * nx + ball.vy * ny + ball.vz * nz;
    if (vn >= 0) return 0;
    const tx = ball.vx - vn * nx;
    const ty = ball.vy - vn * ny;
    const tz = ball.vz - vn * nz;
    ball.vx = tx * friction - vn * restitution * nx;
    ball.vy = ty * friction - vn * restitution * ny;
    ball.vz = tz * friction - vn * restitution * nz;
    ball.spinX += (ty * nz - tz * ny) * 0.9;
    ball.spinZ += (tx * ny - ty * nx) * 0.9;
    ball.spinY += tx * 0.25;
    const impact = -vn;
    ball.squash = Math.min(1, impact / 7);
    ball.squashDirY = Math.abs(ny) > 0.5 ? 1 : 0;
    return impact;
  }
  function step(ball, hoop, dt, emit) {
    const r = ball.r;
    ball.vy -= W.gravity * dt;
    const sp = Math.hypot(ball.vx, ball.vy, ball.vz);
    if (sp > 1e-3) {
      const d = Math.min(1, FEEL.airDrag * sp * dt);
      ball.vx -= ball.vx * d;
      ball.vy -= ball.vy * d;
      ball.vz -= ball.vz * d;
    }
    ball.vx += ball.spinY * 6e-3 * dt * sp;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    ball.z += ball.vz * dt;
    const netTop = hoop.y;
    const netBot = hoop.y - W.netHeight;
    ball.inNet = false;
    if (ball.y < netTop && ball.y > netBot - r) {
      const k = (netTop - ball.y) / W.netHeight;
      const ringR = W.rimRadius * (1 - k * (1 - W.netBottomScale));
      const dxn = ball.x - hoop.x;
      const dzn = ball.z - hoop.z;
      if (Math.hypot(dxn, dzn) < ringR + r) {
        ball.inNet = true;
        const damp = Math.min(1, FEEL.netDrag * dt);
        ball.vx -= ball.vx * damp;
        ball.vz -= ball.vz * damp;
        ball.vy -= ball.vy * damp * 0.55;
      }
    }
    {
      const dx = ball.x - hoop.x;
      const dz = ball.z - hoop.z;
      const horiz = Math.hypot(dx, dz);
      if (horiz > 1e-5) {
        const cx = hoop.x + dx / horiz * W.rimRadius;
        const cz = hoop.z + dz / horiz * W.rimRadius;
        let nx = ball.x - cx;
        let ny = ball.y - hoop.y;
        let nz = ball.z - cz;
        const dist = Math.hypot(nx, ny, nz);
        const minDist = r + W.rimTube;
        if (dist < minDist && dist > 1e-6) {
          nx /= dist;
          ny /= dist;
          nz /= dist;
          const push = minDist - dist;
          ball.x += nx * push;
          ball.y += ny * push;
          ball.z += nz * push;
          const mag = reflect(ball, nx, ny, nz, FEEL.restitutionRim, 0.72);
          if (mag > 0.35) {
            ball.touchedRim = true;
            emit(EVENT.RIM, ball, mag);
          }
        }
      }
    }
    const boardCY = hoop.y + (W.boardY - W.rimY);
    {
      const halfW = W.boardW / 2;
      const halfH = W.boardH / 2;
      const lx = ball.x - hoop.x;
      const inX = lx > -halfW && lx < halfW;
      const inY = ball.y > boardCY - halfH && ball.y < boardCY + halfH;
      if (inX && inY && ball.z - r < W.boardZ + 0.04 && ball.z > W.boardZ - 0.5) {
        ball.z = W.boardZ + 0.04 + r;
        const mag = reflect(ball, 0, 0, 1, FEEL.restitutionBoard, 0.8);
        if (mag > 0.3) {
          ball.touchedBoard = true;
          emit(EVENT.BOARD, ball, mag);
        }
      }
    }
    {
      const dx = ball.x - hoop.x;
      const dz = ball.z - (W.boardZ - 0.16);
      const d = Math.hypot(dx, dz);
      const minD = r + W.poleRadius;
      if (d < minD && d > 1e-6 && ball.y < boardCY - W.boardH / 2) {
        const nx = dx / d, nz = dz / d;
        const push = minD - d;
        ball.x += nx * push;
        ball.z += nz * push;
        const mag = reflect(ball, nx, 0, nz, 0.42, 0.8);
        if (mag > 0.4) emit(EVENT.POLE, ball, mag);
      }
    }
    if (ball.y - r < 0) {
      ball.y = r;
      const mag = reflect(ball, 0, 1, 0, FEEL.restitutionGround, FEEL.friction);
      if (mag > 0.45) emit(EVENT.GROUND, ball, mag);
      ball.vx *= 0.985;
      ball.vz *= 0.985;
      if (Math.abs(ball.vy) < 0.35) ball.vy = 0;
    }
    if (ball.z - r < W.fenceZ) {
      ball.z = W.fenceZ + r;
      const mag = reflect(ball, 0, 0, 1, FEEL.restitutionFence, 0.7);
      if (mag > 0.6) emit(EVENT.FENCE, ball, mag);
    }
    if (ball.x - r < -W.wallHalfW) {
      ball.x = -W.wallHalfW + r;
      reflect(ball, 1, 0, 0, FEEL.restitutionFence, 0.7);
    } else if (ball.x + r > W.wallHalfW) {
      ball.x = W.wallHalfW - r;
      reflect(ball, -1, 0, 0, FEEL.restitutionFence, 0.7);
    }
    if (!ball.scored && ball.py > hoop.y && ball.y <= hoop.y && ball.vy < 0) {
      const t = (ball.py - hoop.y) / Math.max(1e-6, ball.py - ball.y);
      const cx = ball.px + (ball.x - ball.px) * t;
      const cz = ball.pz + (ball.z - ball.pz) * t;
      if (Math.hypot(cx - hoop.x, cz - hoop.z) < W.rimRadius - r * 0.35) {
        ball.scored = true;
        emit(EVENT.SCORE, ball, ball.touchedRim || ball.touchedBoard ? 0 : 1);
      }
    }
    const decay = Math.exp(-0.8 * dt);
    ball.spinX *= decay;
    ball.spinY *= decay;
    ball.spinZ *= decay;
    ball.rotX += ball.spinX * dt;
    ball.rotY += ball.spinY * dt;
    ball.rotZ += ball.spinZ * dt;
    ball.squash *= Math.exp(-9 * dt);
  }
  function simulate(balls, hoop, frameDt, emit) {
    let remaining = Math.min(frameDt, FIXED_DT * MAX_STEPS * 4);
    let guard = 0;
    while (remaining > 1e-6 && guard++ < 400) {
      const dt = Math.min(FIXED_DT, remaining);
      remaining -= dt;
      for (let i = 0; i < balls.length; i++) {
        const b = balls[i];
        if (!b.live || b.dead) continue;
        b.px = b.x;
        b.py = b.y;
        b.pz = b.z;
        step(b, hoop, dt, emit);
        b.age += dt;
        const quiet = b.y < b.r + 0.02 && Math.hypot(b.vx, b.vy, b.vz) < 0.6;
        if (b.age > FEEL.ballLifetime || b.z > W.courtFrontZ + 3 || quiet && b.age > 1.6) {
          b.dead = true;
          emit(EVENT.EXPIRE, b, 0);
        }
      }
    }
  }
  function hoopAt(time, diff) {
    return { x: 0, y: W.rimY, z: W.rimZ };
  }

  // js/audio.js
  var ctx = null;
  var master = null;
  var musicGain = null;
  var sfxGain = null;
  var noiseBuf = null;
  var muted = false;
  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 22;
    comp.ratio.value = 6;
    comp.attack.value = 4e-3;
    comp.release.value = 0.16;
    comp.connect(master);
    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.95;
    sfxGain.connect(comp);
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.22;
    musicGain.connect(comp);
    const n = ctx.sampleRate * 2;
    noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }
  function unlock() {
    ensure();
    if (ctx && ctx.state === "suspended") ctx.resume();
  }
  function setMuted(m) {
    muted = m;
    if (master) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.02);
  }
  function isMuted() {
    return muted;
  }
  var now = () => ctx.currentTime;
  function noise(dur, opts) {
    const o = opts || {};
    const gain = o.gain === void 0 ? 0.4 : o.gain;
    const type = o.type || "bandpass";
    const freq = o.freq === void 0 ? 1200 : o.freq;
    const q = o.q === void 0 ? 1 : o.q;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    if (o.sweep) {
      f.frequency.setValueAtTime(o.sweep[0], now());
      f.frequency.exponentialRampToValueAtTime(Math.max(40, o.sweep[1]), now() + dur);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(1e-4, now());
    g.gain.linearRampToValueAtTime(gain, now() + Math.min(0.012, dur * 0.25));
    g.gain.exponentialRampToValueAtTime(1e-4, now() + dur);
    src.connect(f);
    f.connect(g);
    g.connect(o.dest || sfxGain);
    src.start();
    src.stop(now() + dur + 0.02);
    return g;
  }
  function tone(freq, dur, opts) {
    const o = opts || {};
    const gain = o.gain === void 0 ? 0.3 : o.gain;
    const attack = o.attack === void 0 ? 5e-3 : o.attack;
    const at = o.at || 0;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type || "sine";
    const t = now() + at;
    osc.frequency.setValueAtTime(freq, t);
    if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slideTo), t + dur);
    g.gain.setValueAtTime(1e-4, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(1e-4, t + dur);
    osc.connect(g);
    g.connect(o.dest || sfxGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
    return osc;
  }
  function bounce(v) {
    if (!ensure() || muted) return;
    const k = Math.min(1, (v === void 0 ? 6 : v) / 9);
    if (k < 0.06) return;
    tone(96 + k * 40, 0.16, { type: "sine", gain: 0.34 * k, slideTo: 52 });
    tone(180 + k * 60, 0.09, { type: "triangle", gain: 0.1 * k, slideTo: 90 });
    noise(0.05 + 0.03 * k, { gain: 0.16 * k, type: "bandpass", freq: 900, q: 0.8 });
  }
  function rim(v) {
    if (!ensure() || muted) return;
    const k = Math.min(1, (v === void 0 ? 4 : v) / 7);
    if (k < 0.05) return;
    const base = 620 + Math.random() * 90;
    const partials = [1, 2.41, 3.86, 5.12];
    for (let i = 0; i < partials.length; i++) {
      tone(base * partials[i], 0.34 - i * 0.055, {
        type: "sine",
        gain: 0.16 / (i + 1) * k,
        slideTo: base * partials[i] * 0.97
      });
    }
    noise(0.06, { gain: 0.1 * k, type: "highpass", freq: 2600 });
  }
  function board(v) {
    if (!ensure() || muted) return;
    const k = Math.min(1, (v === void 0 ? 4 : v) / 8);
    if (k < 0.05) return;
    tone(220, 0.13, { type: "triangle", gain: 0.24 * k, slideTo: 130 });
    noise(0.07, { gain: 0.16 * k, type: "bandpass", freq: 500, q: 0.7 });
  }
  function swish() {
    if (!ensure() || muted) return;
    noise(0.3, { gain: 0.3, type: "bandpass", freq: 3e3, q: 0.55, sweep: [4200, 900] });
    noise(0.16, { gain: 0.12, type: "highpass", freq: 5200 });
  }
  function whoosh(power) {
    if (!ensure() || muted) return;
    const p = power === void 0 ? 1 : power;
    noise(0.2, { gain: 0.16 * (0.5 + p * 0.5), type: "bandpass", freq: 800, q: 0.7, sweep: [420, 2e3] });
  }
  function score(streak) {
    if (!ensure() || muted) return;
    swish();
    const semis = Math.min(streak || 0, 7);
    const f0 = 523.25 * Math.pow(2, semis / 12);
    const steps = [0, 4, 7, 12];
    for (let i = 0; i < steps.length; i++) {
      tone(f0 * Math.pow(2, steps[i] / 12), 0.3 - i * 0.03, {
        type: "triangle",
        gain: 0.2,
        at: i * 0.045,
        attack: 4e-3
      });
    }
    tone(f0 / 2, 0.34, { type: "sine", gain: 0.14, at: 0.02 });
  }
  function perfect() {
    if (!ensure() || muted) return;
    const steps = [0, 7, 12, 16, 19];
    for (let i = 0; i < steps.length; i++) {
      tone(659.25 * Math.pow(2, steps[i] / 12), 0.26, { type: "sine", gain: 0.14, at: i * 0.05 });
    }
  }
  function click() {
    if (!ensure() || muted) return;
    tone(880, 0.06, { type: "square", gain: 0.1, slideTo: 1320 });
    noise(0.03, { gain: 0.05, type: "highpass", freq: 3e3 });
  }
  function whistle() {
    if (!ensure() || muted) return;
    const o1 = tone(2050, 0.42, { type: "sine", gain: 0.13 });
    tone(2680, 0.42, { type: "sine", gain: 0.07 });
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.value = 28;
    lg.gain.value = 55;
    lfo.connect(lg);
    lg.connect(o1.frequency);
    lfo.start();
    lfo.stop(now() + 0.44);
    noise(0.42, { gain: 0.05, type: "bandpass", freq: 2300, q: 4 });
  }
  function tick(urgent) {
    if (!ensure() || muted) return;
    tone(urgent ? 1400 : 1e3, 0.07, { type: "square", gain: urgent ? 0.13 : 0.07 });
  }
  function gameOver() {
    if (!ensure() || muted) return;
    whistle();
    const notes = [523.25, 466.16, 392, 311.13];
    for (let i = 0; i < notes.length; i++) {
      tone(notes[i], 0.5, { type: "triangle", gain: 0.17, at: 0.3 + i * 0.14 });
    }
  }
  function crowd(level) {
    if (!ensure() || muted) return;
    const lv = level === void 0 ? 1 : level;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 700;
    f.Q.value = 0.6;
    const g = ctx.createGain();
    const d = 1.1 * lv;
    g.gain.setValueAtTime(1e-4, now());
    g.gain.linearRampToValueAtTime(0.13 * lv, now() + 0.12);
    g.gain.exponentialRampToValueAtTime(1e-4, now() + d);
    src.connect(f);
    f.connect(g);
    g.connect(sfxGain);
    src.start();
    src.stop(now() + d + 0.05);
  }
  var ambience = null;
  function startAmbience() {
    if (!ensure() || ambience) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 420;
    const g = ctx.createGain();
    g.gain.value = 1e-4;
    g.gain.setTargetAtTime(0.05, now(), 0.8);
    src.connect(f);
    f.connect(g);
    g.connect(musicGain);
    src.start();
    ambience = { src, g };
  }
  function stopAmbience() {
    if (!ambience) return;
    const a = ambience;
    ambience = null;
    a.g.gain.setTargetAtTime(0, now(), 0.25);
    setTimeout(function() {
      try {
        a.src.stop();
      } catch (e) {
      }
    }, 700);
  }

  // js/storage.js
  var KEY = "basketball-hoops.scores.v1";
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { runs: [], allTime: 0 };
      const p = JSON.parse(raw);
      return { runs: Array.isArray(p.runs) ? p.runs : [], allTime: p.allTime || 0 };
    } catch (e) {
      return { runs: [], allTime: 0 };
    }
  }
  function save(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {
    }
  }
  var DAY = 864e5;
  function record(score2) {
    const data = load();
    data.runs.push({ t: Date.now(), s: score2 });
    const cutoff = Date.now() - DAY * 8;
    data.runs = data.runs.filter(function(r) {
      return r.t >= cutoff;
    });
    if (score2 > data.allTime) data.allTime = score2;
    save(data);
    return bests();
  }
  function bests() {
    const data = load();
    const now2 = Date.now();
    const startOfDay = /* @__PURE__ */ new Date();
    startOfDay.setHours(0, 0, 0, 0);
    let today = 0;
    let week = 0;
    for (let i = 0; i < data.runs.length; i++) {
      const r = data.runs[i];
      if (r.t >= startOfDay.getTime() && r.s > today) today = r.s;
      if (r.t >= now2 - DAY * 7 && r.s > week) week = r.s;
    }
    return { today, week, allTime: data.allTime };
  }

  // js/game.js
  var STATE = { MENU: "menu", INTRO: "intro", PLAYING: "playing", OVER: "over" };
  var Game = class {
    constructor(view2, ui2) {
      this.view = view2;
      this.ui = ui2;
      this.state = STATE.MENU;
      this.balls = [];
      this.net = createNet();
      this.difficultyT = 0.5;
      this.diff = difficultyAt(this.difficultyT);
      this.score = 0;
      this.streak = 0;
      this.timeLeft = FEEL.roundTime;
      this.elapsed = 0;
      this.introT = 0;
      this.cooldown = 0;
      this.lastTick = -1;
      this.hoop = { x: 0, y: W.rimY, z: W.rimZ };
      this.readyBall = createBall(W.spawn.x, W.spawn.y, W.spawn.z);
      this.readyBall.live = false;
      this.drag = null;
      this.lastFrame = 0;
      this._raf = null;
      this._onEvent = this._onEvent.bind(this);
      this._loop = this._loop.bind(this);
    }
    // --- lifecycle ------------------------------------------------------------
    start() {
      this.lastFrame = performance.now();
      this._raf = requestAnimationFrame(this._loop);
    }
    setDifficulty(t) {
      this.difficultyT = t;
      this.diff = difficultyAt(t);
    }
    beginRound() {
      unlock();
      this.balls.length = 0;
      this.score = 0;
      this.streak = 0;
      this.timeLeft = FEEL.roundTime;
      this.elapsed = 0;
      this.introT = 0;
      this.cooldown = 0;
      this.lastTick = -1;
      this.diff = difficultyAt(this.difficultyT);
      this._resetReadyBall();
      this.state = STATE.INTRO;
      this.ui.onRoundStart(this);
      startAmbience();
      whistle();
    }
    endRound() {
      if (this.state === STATE.OVER) return;
      this.state = STATE.OVER;
      stopAmbience();
      gameOver();
      const bests2 = record(this.score);
      this.ui.onRoundEnd(this, bests2);
    }
    toMenu() {
      this.state = STATE.MENU;
      this.balls.length = 0;
      this.introT = 0;
      stopAmbience();
      this.ui.onMenu(this);
    }
    // --- input ----------------------------------------------------------------
    // --- joystick input -------------------------------------------------------
    shootFromJoystick(dx, dy, power) {
      unlock();
      if (this.state !== STATE.PLAYING) return;
      if (this.cooldown > 0) return;
      const v = launchVelocityJoystick(dx, dy, power, 60);
      const b = this.readyBall;
      b.x = b.baseX;
      b.y = W.spawn.y;
      b.z = W.spawn.z;
      b.vx = v.vx;
      b.vy = v.vy;
      b.vz = v.vz;
      b.spinX = -v.vy * 1.6;
      b.spinY = v.spin;
      b.spinZ = 0;
      b.live = true;
      b.age = 0;
      this.balls.push(b);
      if (this.balls.length > FEEL.maxBalls) {
        this.balls.splice(0, this.balls.length - FEEL.maxBalls);
      }
      whoosh(v.power);
      this.cooldown = FEEL.cooldown;
      this._resetReadyBall();
      this.ui.onShoot(this);
    }
    _resetReadyBall() {
      const jx = (Math.random() * 2 - 1) * W.spawnJitter;
      this.readyBall = createBall(W.spawn.x + jx, W.spawn.y, W.spawn.z);
      this.readyBall.live = false;
      this.readyBall.spawnAnim = 0;
      this.readyBall.baseX = W.spawn.x + jx;
    }
    // --- physics events -------------------------------------------------------
    _onEvent(type, ball, mag) {
      switch (type) {
        case EVENT.GROUND:
          bounce(mag);
          break;
        case EVENT.RIM: {
          rim(mag);
          this.view.basketHit("rim", mag);
          impulseNet(this.net, ball.x - this.hoop.x, -0.5, ball.z - this.hoop.z, mag);
          break;
        }
        case EVENT.BOARD: {
          board(mag);
          this.view.basketHit("board", mag);
          impulseNet(this.net, 0, -0.2, 0.7, mag);
          break;
        }
        case EVENT.POLE: {
          board(mag * 0.6);
          this.view.basketHit("board", mag * 0.5);
          break;
        }
        case EVENT.FENCE:
          bounce(mag * 0.5);
          break;
        case EVENT.SCORE: {
          this.score += 1;
          this.streak += 1;
          const clean = mag === 1;
          score(this.streak - 1);
          if (clean) perfect();
          if (this.streak >= 3) crowd(Math.min(1.4, 0.6 + this.streak * 0.16));
          this.view.burst(this.hoop.x, this.hoop.y, this.hoop.z);
          this.view.basketHit("score", 1);
          this.ui.onScore(this, clean);
          break;
        }
        case EVENT.EXPIRE:
          if (!ball.scored) this.streak = 0;
          break;
      }
    }
    // --- main loop ------------------------------------------------------------
    _loop(now2) {
      this._raf = requestAnimationFrame(this._loop);
      let dt = (now2 - this.lastFrame) / 1e3;
      this.lastFrame = now2;
      if (!(dt > 0)) dt = 1 / 60;
      dt = Math.min(dt, 0.05);
      if (this.state === STATE.INTRO) {
        this.introT = Math.min(1, this.introT + dt / 1.05);
        this.elapsed += dt;
        if (this.introT >= 1) {
          this.state = STATE.PLAYING;
          this.ui.onPlayable(this);
        }
      } else if (this.state === STATE.PLAYING) {
        this.elapsed += dt;
        this.cooldown = Math.max(0, this.cooldown - dt);
        this.timeLeft = Math.max(0, this.timeLeft - dt);
        const whole = Math.ceil(this.timeLeft);
        if (whole !== this.lastTick) {
          this.lastTick = whole;
          if (whole <= 5 && whole > 0) tick(true);
        }
        if (this.timeLeft <= 0) this.endRound();
      } else if (this.state === STATE.MENU) {
        this.elapsed += dt * 0.35;
      } else if (this.state === STATE.OVER) {
        this.elapsed += dt;
      }
      const motionTime = this.state === STATE.PLAYING || this.state === STATE.INTRO ? this.elapsed : this.elapsed * 0.4;
      this.hoop = hoopAt(motionTime, this.diff);
      simulate(this.balls, this.hoop, dt, this._onEvent);
      for (let i = this.balls.length - 1; i >= 0; i--) {
        if (this.balls[i].dead) this.balls.splice(i, 1);
      }
      const rb = this.readyBall;
      rb.spawnAnim = Math.min(1, (rb.spawnAnim || 0) + dt * 4.2);
      const e = rb.spawnAnim;
      const settle = e < 1 ? 1 - Math.pow(1 - e, 3) - Math.sin(e * Math.PI * 2) * 0.12 * (1 - e) : 1;
      rb.y = W.spawn.y + (1 - settle) * 1.5 + Math.sin(this.elapsed * 2.1) * 0.01 * settle;
      rb.x = rb.baseX;
      rb.rotY = this.elapsed * 0.35;
      rb.squash = e < 1 ? 0 : rb.squash;
      stepNet(this.net, dt, this.balls, this.hoop);
      this.view.setHoop(this.hoop);
      this.view.syncNet(this.net, this.hoop);
      this.view.syncBalls(this.balls, this.state === STATE.MENU ? null : rb);
      this.view.setIntro(this.introT);
      const secs = Math.ceil(this.timeLeft);
      this.view.setTimer(
        this.state === STATE.MENU ? "45" : String(Math.max(0, secs)).padStart(2, "0"),
        secs <= 5 && this.state === STATE.PLAYING
      );
      this.view.render(dt, this.elapsed);
      this.ui.onFrame(this, dt);
    }
  };

  // js/ui.js
  var $ = (sel) => document.querySelector(sel);
  var UI = class {
    constructor(engineLabel) {
      this.engineLabel = engineLabel;
      this.game = null;
      this.el = {
        menu: $("#menu"),
        help: $("#help"),
        hud: $("#hud"),
        over: $("#gameover"),
        score: $("#score"),
        turn: $("#turn"),
        slider: $("#difficulty"),
        diffLabel: $("#diffLabel"),
        diffEmoji: $("#diffEmoji"),
        overScore: $("#overScore"),
        overMode: $("#overMode"),
        overEmoji: $("#overEmoji"),
        bestToday: $("#bestToday"),
        bestWeek: $("#bestWeek"),
        bestAll: $("#bestAll"),
        streak: $("#streak"),
        mute: $("#mute"),
        engine: $("#engineTag"),
        fps: $("#fps")
      };
      if (this.el.engine) this.el.engine.textContent = engineLabel;
      this._fpsAcc = 0;
      this._fpsFrames = 0;
      this._popTimer = 0;
    }
    bind(game2) {
      this.game = game2;
      const el = this.el;
      el.slider.addEventListener("input", () => {
        const t = Number(el.slider.value) / 100;
        game2.setDifficulty(t);
        this._paintDifficulty();
      });
      el.slider.addEventListener("change", () => click());
      $("#play").addEventListener("click", () => {
        unlock();
        click();
        game2.beginRound();
      });
      $("#again").addEventListener("click", () => {
        click();
        game2.beginRound();
      });
      $("#home").addEventListener("click", () => {
        click();
        game2.toMenu();
      });
      $("#helpBtn").addEventListener("click", () => {
        click();
        el.help.classList.add("show");
      });
      $("#helpClose").addEventListener("click", () => {
        click();
        el.help.classList.remove("show");
      });
      el.mute.addEventListener("click", () => {
        const m = !isMuted();
        setMuted(m);
        el.mute.textContent = m ? "\u{1F507}" : "\u{1F50A}";
        el.mute.classList.toggle("off", m);
        if (!m) click();
      });
      el.slider.value = String(Math.round(game2.difficultyT * 100));
      this._paintDifficulty();
      this._paintBests(bests());
      this.onMenu(game2);
    }
    _paintDifficulty() {
      const d = difficultyAt(this.game.difficultyT);
      this.el.diffLabel.textContent = d.key;
      this.el.diffEmoji.textContent = d.emoji;
    }
    _paintBests(b) {
      this.el.bestToday.textContent = b.today;
      this.el.bestWeek.textContent = b.week;
      this.el.bestAll.textContent = b.allTime;
    }
    // --- state transitions ----------------------------------------------------
    onMenu() {
      this.el.menu.classList.add("show");
      this.el.hud.classList.remove("show");
      this.el.over.classList.remove("show");
      this.el.turn.classList.remove("show");
      this._paintBests(bests());
    }
    onRoundStart(game2) {
      this.el.menu.classList.remove("show");
      this.el.over.classList.remove("show");
      this.el.help.classList.remove("show");
      this.el.hud.classList.add("show");
      this.el.score.textContent = "0";
      this.el.streak.classList.remove("show");
    }
    onPlayable() {
      this.el.turn.classList.add("show");
      setTimeout(() => this.el.turn.classList.remove("show"), 1400);
    }
    onShoot() {
      this.el.turn.classList.remove("show");
    }
    onScore(game2, clean) {
      this.el.score.textContent = String(game2.score);
      this.el.score.classList.remove("pop");
      void this.el.score.offsetWidth;
      this.el.score.classList.add("pop");
      if (game2.streak >= 2) {
        this.el.streak.textContent = (clean ? "SWISH! " : "") + game2.streak + " IN A ROW";
        this.el.streak.classList.add("show");
        this._popTimer = 1.3;
      } else if (clean) {
        this.el.streak.textContent = "SWISH!";
        this.el.streak.classList.add("show");
        this._popTimer = 1;
      }
    }
    onRoundEnd(game2, bests2) {
      this.el.hud.classList.remove("show");
      this.el.turn.classList.remove("show");
      this.el.streak.classList.remove("show");
      const d = difficultyAt(game2.difficultyT);
      this.el.overScore.textContent = String(game2.score);
      this.el.overMode.textContent = d.key;
      this.el.overEmoji.textContent = d.emoji;
      this._paintBests(bests2);
      setTimeout(() => this.el.over.classList.add("show"), 420);
    }
    onFrame(game2, dt) {
      if (this._popTimer > 0) {
        this._popTimer -= dt;
        if (this._popTimer <= 0) this.el.streak.classList.remove("show");
      }
      this._fpsAcc += dt;
      this._fpsFrames++;
      if (this._fpsAcc >= 0.5) {
        if (this.el.fps) this.el.fps.textContent = Math.round(this._fpsFrames / this._fpsAcc) + " fps";
        this._fpsAcc = 0;
        this._fpsFrames = 0;
      }
    }
  };

  // js/joystick.js
  var Joystick = class {
    /**
     * @param {HTMLElement} zoneEl  The outer touch container (#joystickZone)
     * @param {HTMLElement} baseEl  The circular base (#joystickBase)
     * @param {HTMLElement} knobEl  The draggable thumb knob (#joystickKnob)
     * @param {function} onShoot    Callback (dx, dy, power) => void
     */
    constructor(zoneEl, baseEl, knobEl, onShoot) {
      this.zone = zoneEl;
      this.base = baseEl;
      this.knob = knobEl;
      this.onShoot = onShoot;
      this.maxRadius = 60;
      this.active = false;
      this.pointerId = null;
      this.startX = 0;
      this.startY = 0;
      this.currentX = 0;
      this.currentY = 0;
      this.keys = { up: false, down: false, left: false, right: false };
      this._keyInterval = null;
      this._bindEvents();
    }
    _bindEvents() {
      const zone = this.zone;
      const onPointerDown = (e) => {
        if (this.active) return;
        this.active = true;
        this.pointerId = e.pointerId;
        try {
          zone.setPointerCapture(e.pointerId);
        } catch (_) {
        }
        this.startX = e.clientX;
        this.startY = e.clientY;
        this.currentX = 0;
        this.currentY = 0;
        this._applyKnobTransform(0, 0);
        this.base.classList.add("active");
      };
      const onPointerMove = (e) => {
        if (!this.active || e.pointerId !== this.pointerId) return;
        this._updatePointer(e.clientX, e.clientY);
      };
      const onPointerUp = (e) => {
        if (!this.active || this.pointerId !== null && e.pointerId !== this.pointerId) return;
        this._release();
      };
      const onPointerCancel = (e) => {
        if (!this.active || this.pointerId !== null && e.pointerId !== this.pointerId) return;
        this._resetKnob();
        this.active = false;
        this.pointerId = null;
        this.base.classList.remove("active");
      };
      zone.addEventListener("pointerdown", onPointerDown);
      zone.addEventListener("pointermove", onPointerMove);
      zone.addEventListener("pointerup", onPointerUp);
      zone.addEventListener("pointercancel", onPointerCancel);
      window.addEventListener("keydown", (e) => {
        if (e.repeat) return;
        let handled = false;
        if (e.code === "ArrowUp" || e.code === "KeyW") {
          this.keys.up = true;
          handled = true;
        } else if (e.code === "ArrowDown" || e.code === "KeyS") {
          this.keys.down = true;
          handled = true;
        } else if (e.code === "ArrowLeft" || e.code === "KeyA") {
          this.keys.left = true;
          handled = true;
        } else if (e.code === "ArrowRight" || e.code === "KeyD") {
          this.keys.right = true;
          handled = true;
        } else if (e.code === "Space") {
          handled = true;
          if (this.active) {
            this._release();
          } else {
            this._shootDirect(0, -this.maxRadius * 0.82, 0.82);
          }
        }
        if (handled) {
          e.preventDefault();
          this._handleKeyChange();
        }
      });
      window.addEventListener("keyup", (e) => {
        let handled = false;
        if (e.code === "ArrowUp" || e.code === "KeyW") {
          this.keys.up = false;
          handled = true;
        } else if (e.code === "ArrowDown" || e.code === "KeyS") {
          this.keys.down = false;
          handled = true;
        } else if (e.code === "ArrowLeft" || e.code === "KeyA") {
          this.keys.left = false;
          handled = true;
        } else if (e.code === "ArrowRight" || e.code === "KeyD") {
          this.keys.right = false;
          handled = true;
        }
        if (handled) {
          e.preventDefault();
          this._handleKeyChange();
        }
      });
    }
    _handleKeyChange() {
      let kx = 0;
      let ky = 0;
      if (this.keys.up) ky -= 1;
      if (this.keys.down) ky += 1;
      if (this.keys.left) kx -= 1;
      if (this.keys.right) kx += 1;
      const len = Math.hypot(kx, ky);
      if (len > 0) {
        const mag = this.maxRadius * 0.85;
        this.currentX = kx / len * mag;
        this.currentY = ky / len * mag;
        this._applyKnobTransform(this.currentX, this.currentY);
        this.base.classList.add("active");
        this.active = true;
      } else if (this.active && this.pointerId === null) {
        this._release();
      }
    }
    _updatePointer(clientX, clientY) {
      let dx = clientX - this.startX;
      let dy = clientY - this.startY;
      const dist = Math.hypot(dx, dy);
      if (dist > this.maxRadius) {
        dx = dx / dist * this.maxRadius;
        dy = dy / dist * this.maxRadius;
      }
      this.currentX = dx;
      this.currentY = dy;
      this._applyKnobTransform(dx, dy);
    }
    _applyKnobTransform(x, y) {
      this.knob.style.transform = `translate(${x}px, ${y}px)`;
    }
    _resetKnob() {
      this.currentX = 0;
      this.currentY = 0;
      this.knob.style.transition = "transform 0.18s cubic-bezier(0.18, 1.4, 0.4, 1)";
      this.knob.style.transform = "translate(0px, 0px)";
      setTimeout(() => {
        this.knob.style.transition = "";
      }, 180);
    }
    _release() {
      const dx = this.currentX;
      const dy = this.currentY;
      const dist = Math.hypot(dx, dy);
      const minThreshold = 8;
      this.active = false;
      this.pointerId = null;
      this.base.classList.remove("active");
      this._resetKnob();
      if (dist >= minThreshold) {
        const effDist = (dist - minThreshold) / (this.maxRadius - minThreshold);
        const rawDistRatio = dist / this.maxRadius;
        const ratio = rawDistRatio > 1e-4 ? effDist / rawDistRatio : 1;
        const effDx = dx * ratio;
        const effDy = dy * ratio;
        const power = Math.max(0.05, Math.min(1, effDist));
        this._shootDirect(effDx, effDy, power);
      }
    }
    _shootDirect(dx, dy, power) {
      if (this.onShoot) {
        this.onShoot(dx, dy, power);
      }
    }
    cancel() {
      this.active = false;
      this.pointerId = null;
      this.base.classList.remove("active");
      this._resetKnob();
    }
  };

  // js/main.js
  var canvas = document.getElementById("view");
  function fitCanvas() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let w = vw;
    const h = vh;
    if (vw / vh > CAM.refAspect) w = Math.min(vw, Math.round(vh * CAM.refAspect));
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    document.getElementById("stage").style.setProperty("--play-w", w + "px");
  }
  fitCanvas();
  var view = new View(canvas);
  var ui = new UI("Babylon.js " + (window.BABYLON && window.BABYLON.Engine.Version));
  var game = new Game(view, ui);
  ui.bind(game);
  window.addEventListener("resize", () => {
    fitCanvas();
    view.resize();
  });
  window.addEventListener("orientationchange", () => setTimeout(() => {
    fitCanvas();
    view.resize();
  }, 120));
  var joystickZone = document.getElementById("joystickZone");
  var joystickBase = document.getElementById("joystickBase");
  var joystickKnob = document.getElementById("joystickKnob");
  var joystick = new Joystick(
    joystickZone,
    joystickBase,
    joystickKnob,
    (dx, dy, power) => game.shootFromJoystick(dx, dy, power)
  );
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) joystick.cancel();
  });
  game.start();
  window.__game = game;
  window.__view = view;
  window.__joystick = joystick;
})();
