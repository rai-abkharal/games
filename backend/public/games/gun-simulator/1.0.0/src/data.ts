/**
 * data.ts — every gun and every tuning number lives here.
 * Sprite geometry (muzzle, ejection port, action travel) comes from
 * assets/guns/meta.json (generated with the sprites); this file holds the
 * gameplay side: ammo, rate of fire, sounds, recoil, flash, haptics.
 */
export const VIEW_W = 480;
export const VIEW_H = 800;

export type GunClass = 'pistol' | 'smg' | 'rifle' | 'lmg' | 'shotgun' | 'sniper';
export type FlashKind = 'pistol' | 'smg' | 'rifle' | 'lmg' | 'shotgun' | 'sniper';
export type CaseKind = 'pistol' | 'rifle' | 'big' | 'shell';

export interface ReloadTimeline {
  magOut: number;   // s — magazine drops / release
  magIn: number;    // s — fresh magazine seats
  action: number;   // s — bolt / slide / charging handle is worked
  end: number;      // s — gun ready again
}

export interface GunDef {
  id: string;
  name: string;
  caliber: string;
  cls: GunClass;
  mag: number;
  rpm: number;              // cyclic rate when held (auto)
  burst: number;            // rounds per tap in burst mode
  fire: string;             // sound key
  firePitch: number;        // base playbackRate
  reload: string;           // sound key
  reloadPitch: number;
  reloadTimeline: ReloadTimeline;
  tubeFed?: boolean;        // shotguns: shells are loaded one at a time
  shellLoadTime?: number;   // s per shell (tube fed)
  manualCycle?: number;     // s — pump / bolt cycle after each shot
  flash: FlashKind;
  flashScale: number;
  recoil: number;           // px kick backwards (virtual units)
  recoilRot: number;        // rad muzzle rise
  kick: number;             // camera kick px
  smoke: number;            // puffs per shot
  casing: CaseKind;
  casingScale: number;
  haptic: number;           // ms
  displayWidth: number;     // on-screen width of the body sprite (virtual px)
  yOffset?: number;         // vertical nudge (virtual px)
}

const RL = (magOut: number, magIn: number, action: number, end: number): ReloadTimeline => ({ magOut, magIn, action, end });

// reload sound timelines were measured from the supplied recordings (tools/gen_sounds.py)
const RL_PISTOL = RL(0.10, 0.40, 0.55, 0.95);   // 1911-reload
const RL_MAG = RL(0.06, 0.30, 0.44, 0.80);      // reload-123781
const RL_AK = RL(0.14, 1.08, 1.79, 2.25);       // AK_reload
const RL_MG = RL(0.18, 0.86, 1.48, 2.30);       // machine-gun-reload

export const GUNS: GunDef[] = [
  { id: 'm1911', name: 'Colt M1911', caliber: '.45 ACP', cls: 'pistol', mag: 7, rpm: 420, burst: 3,
    fire: 'fire_m1911', firePitch: 1, reload: 'reload_pistol', reloadPitch: 1, reloadTimeline: RL_PISTOL,
    flash: 'pistol', flashScale: 0.62, recoil: 14, recoilRot: 0.075, kick: 3, smoke: 2, casing: 'pistol', casingScale: 1.05, haptic: 18, displayWidth: 330 },
  { id: 'glock17', name: 'Glock 17', caliber: '9×19mm Parabellum', cls: 'pistol', mag: 17, rpm: 500, burst: 3,
    fire: 'fire_glock', firePitch: 1, reload: 'reload_mag', reloadPitch: 1, reloadTimeline: RL_MAG,
    flash: 'pistol', flashScale: 0.55, recoil: 12, recoilRot: 0.065, kick: 2.5, smoke: 2, casing: 'pistol', casingScale: 0.95, haptic: 14, displayWidth: 325 },
  { id: 'deagle', name: 'Desert Eagle .50', caliber: '.50 Action Express', cls: 'pistol', mag: 7, rpm: 300, burst: 3,
    fire: 'fire_deagle', firePitch: 1, reload: 'reload_pistol', reloadPitch: 0.92, reloadTimeline: RL_PISTOL,
    flash: 'pistol', flashScale: 0.95, recoil: 24, recoilRot: 0.13, kick: 6, smoke: 4, casing: 'pistol', casingScale: 1.35, haptic: 40, displayWidth: 360 },
  { id: 'm9', name: 'Beretta M9', caliber: '9×19mm Parabellum', cls: 'pistol', mag: 15, rpm: 500, burst: 3,
    fire: 'fire_m9', firePitch: 1, reload: 'reload_mag', reloadPitch: 1.04, reloadTimeline: RL_MAG,
    flash: 'pistol', flashScale: 0.58, recoil: 12, recoilRot: 0.065, kick: 2.5, smoke: 2, casing: 'pistol', casingScale: 0.95, haptic: 14, displayWidth: 335 },

  { id: 'mp5', name: 'H&K MP5A3', caliber: '9×19mm Parabellum', cls: 'smg', mag: 30, rpm: 800, burst: 3,
    fire: 'fire_mp5', firePitch: 1, reload: 'reload_mag', reloadPitch: 1, reloadTimeline: RL_MAG,
    flash: 'smg', flashScale: 0.55, recoil: 8, recoilRot: 0.03, kick: 1.8, smoke: 1, casing: 'pistol', casingScale: 0.8, haptic: 10, displayWidth: 405 },
  { id: 'ak47', name: 'AK-47', caliber: '7.62×39mm', cls: 'rifle', mag: 30, rpm: 600, burst: 3,
    fire: 'fire_ak47', firePitch: 1, reload: 'reload_ak', reloadPitch: 1, reloadTimeline: RL_AK,
    flash: 'rifle', flashScale: 0.62, recoil: 12, recoilRot: 0.045, kick: 3, smoke: 2, casing: 'rifle', casingScale: 0.85, haptic: 18, displayWidth: 412 },
  { id: 'uzi', name: 'IMI Uzi', caliber: '9×19mm Parabellum', cls: 'smg', mag: 32, rpm: 600, burst: 3,
    fire: 'fire_mp5', firePitch: 1.07, reload: 'reload_mag', reloadPitch: 0.96, reloadTimeline: RL_MAG,
    flash: 'smg', flashScale: 0.6, recoil: 9, recoilRot: 0.035, kick: 2, smoke: 1, casing: 'pistol', casingScale: 0.8, haptic: 10, displayWidth: 358 },
  { id: 'akm', name: 'AKM', caliber: '7.62×39mm', cls: 'rifle', mag: 30, rpm: 600, burst: 3,
    fire: 'fire_akm', firePitch: 1, reload: 'reload_ak', reloadPitch: 0.97, reloadTimeline: RL_AK,
    flash: 'rifle', flashScale: 0.62, recoil: 12, recoilRot: 0.045, kick: 3, smoke: 2, casing: 'rifle', casingScale: 0.85, haptic: 18, displayWidth: 412 },
  { id: 'ak74', name: 'AK-74', caliber: '5.45×39mm', cls: 'rifle', mag: 30, rpm: 650, burst: 3,
    fire: 'fire_ak74', firePitch: 1, reload: 'reload_ak', reloadPitch: 1.03, reloadTimeline: RL_AK,
    flash: 'rifle', flashScale: 0.58, recoil: 9, recoilRot: 0.035, kick: 2.5, smoke: 2, casing: 'rifle', casingScale: 0.8, haptic: 16, displayWidth: 412 },
  { id: 'm4a1', name: 'Colt M4A1', caliber: '5.56×45mm NATO', cls: 'rifle', mag: 30, rpm: 800, burst: 3,
    fire: 'fire_m4a1', firePitch: 1, reload: 'reload_mg', reloadPitch: 1, reloadTimeline: RL_MG,
    flash: 'rifle', flashScale: 0.58, recoil: 9, recoilRot: 0.03, kick: 2.5, smoke: 2, casing: 'rifle', casingScale: 0.8, haptic: 16, displayWidth: 412 },
  { id: 'scarh', name: 'FN SCAR-H', caliber: '7.62×51mm NATO', cls: 'rifle', mag: 20, rpm: 600, burst: 3,
    fire: 'fire_scarh', firePitch: 1, reload: 'reload_mg', reloadPitch: 0.95, reloadTimeline: RL_MG,
    flash: 'rifle', flashScale: 0.68, recoil: 14, recoilRot: 0.05, kick: 3.5, smoke: 3, casing: 'rifle', casingScale: 0.95, haptic: 20, displayWidth: 412 },
  { id: 'm249', name: 'M249 SAW', caliber: '5.56×45mm NATO (belt)', cls: 'lmg', mag: 100, rpm: 850, burst: 5,
    fire: 'fire_m249', firePitch: 1, reload: 'reload_mg', reloadPitch: 0.9, reloadTimeline: RL(0.18, 0.86, 1.48, 2.5),
    flash: 'lmg', flashScale: 0.64, recoil: 8, recoilRot: 0.025, kick: 2.2, smoke: 2, casing: 'rifle', casingScale: 0.8, haptic: 12, displayWidth: 416 },

  { id: 'r870', name: 'Remington 870', caliber: '12 gauge', cls: 'shotgun', mag: 6, rpm: 75, burst: 2,
    fire: 'fire_r870', firePitch: 1, reload: 'reload_mag', reloadPitch: 0.9, reloadTimeline: RL_MAG, tubeFed: true, shellLoadTime: 0.5, manualCycle: 0.62,
    flash: 'shotgun', flashScale: 0.78, recoil: 26, recoilRot: 0.11, kick: 7, smoke: 5, casing: 'shell', casingScale: 1, haptic: 55, displayWidth: 412 },
  { id: 'benelli', name: 'Benelli M4', caliber: '12 gauge', cls: 'shotgun', mag: 7, rpm: 240, burst: 2,
    fire: 'fire_benelli', firePitch: 1, reload: 'reload_mag', reloadPitch: 0.94, reloadTimeline: RL_MAG, tubeFed: true, shellLoadTime: 0.45,
    flash: 'shotgun', flashScale: 0.78, recoil: 24, recoilRot: 0.1, kick: 6.5, smoke: 5, casing: 'shell', casingScale: 1, haptic: 50, displayWidth: 412 },

  { id: 'awm', name: 'AWM .338', caliber: '.338 Lapua Magnum', cls: 'sniper', mag: 5, rpm: 50, burst: 2,
    fire: 'fire_awm', firePitch: 1, reload: 'reload_mag', reloadPitch: 0.85, reloadTimeline: RL(0.06, 0.34, 0.9, 1.5), manualCycle: 1.1,
    flash: 'sniper', flashScale: 0.8, recoil: 30, recoilRot: 0.09, kick: 8, smoke: 5, casing: 'big', casingScale: 0.9, haptic: 70, displayWidth: 416 },
  { id: 'm82', name: 'Barrett M82A1', caliber: '.50 BMG', cls: 'sniper', mag: 10, rpm: 200, burst: 2,
    fire: 'fire_m82', firePitch: 1, reload: 'reload_mg', reloadPitch: 0.85, reloadTimeline: RL_MG,
    flash: 'sniper', flashScale: 0.95, recoil: 38, recoilRot: 0.1, kick: 10, smoke: 6, casing: 'big', casingScale: 1.1, haptic: 80, displayWidth: 420 },
];

export const AUTO_HOLD_DELAY = 0.22;   // s of holding before the gun goes full-auto
export const GUN_CENTER_Y = 300;       // virtual px — where the gun sits
export const LONG_GUN_X_SHIFT = 26;    // long guns sit a little right so the muzzle flash stays on screen
export const FIRE_ZONE = { x: 0, y: 96, w: VIEW_W, h: 360 };

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const damp = (a: number, b: number, lambda: number, dt: number) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const rand = (a: number, b: number) => a + Math.random() * (b - a);
