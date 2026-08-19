// Zero-overhead global window.Phaser shim
// Allows mini-games to compile to ~15 KB without bundling 1.5 MB Phaser into every game.
const globalPhaser = (typeof window !== 'undefined' ? (window as any).Phaser : {}) || {};

export default globalPhaser;
export const Game = globalPhaser.Game;
export const Scene = globalPhaser.Scene;
export const AUTO = globalPhaser.AUTO;
export const WEBGL = globalPhaser.WEBGL;
export const CANVAS = globalPhaser.CANVAS;
export const Scale = globalPhaser.Scale;
export const Math = globalPhaser.Math;
export const Physics = globalPhaser.Physics;
export const Input = globalPhaser.Input;
export const GameObjects = globalPhaser.GameObjects;
export const Display = globalPhaser.Display;
export const Time = globalPhaser.Time;
export const Sound = globalPhaser.Sound;
export const Tweens = globalPhaser.Tweens;
export const Animations = globalPhaser.Animations;
export const Loader = globalPhaser.Loader;
export const Geom = globalPhaser.Geom;
export const Curves = globalPhaser.Curves;
export const Cameras = globalPhaser.Cameras;
export const Structs = globalPhaser.Structs;
export const Events = globalPhaser.Events;
export const Core = globalPhaser.Core;
export const Types = globalPhaser.Types || {};
