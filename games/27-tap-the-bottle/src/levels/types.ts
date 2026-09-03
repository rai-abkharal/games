export type ThemeType = 'blue' | 'pink';

export interface StarConfig {
  x: number;
  y: number;
  id?: string;
}

export interface LauncherConfig {
  id: string;
  type: 'bottle' | 'can';
  color: 'orange' | 'yellow' | 'green' | 'red';
  x: number;
  y: number;
  rotation: number; // in degrees
  scale?: number;
  launchAngle: number; // in degrees (-90 = straight UP, 0 = RIGHT, 180 = LEFT, 90 = DOWN)
  launchSpeed?: number;
  projectileType?: 'crownCap' | 'canTab';
  projectileAngularVelocity?: number;
  recoilStrength?: number;
  isStatic?: boolean;
}

export interface PlatformConfig {
  id?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number; // in degrees
  type?: 'wood' | 'blue';
}

export interface PortalConfig {
  id: string;
  pairId: string;
  x: number;
  y: number;
  rotation?: number; // in degrees
  exitOffsetX?: number;
  exitOffsetY?: number;
}

export interface LevelDefinition {
  id: number;
  theme: ThemeType;
  tutorial?: boolean;
  stars: StarConfig[];
  launchers: LauncherConfig[];
  platforms: PlatformConfig[];
  portals?: PortalConfig[];
}
