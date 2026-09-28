import fs from "node:fs";
import path from "node:path";
import { Worker } from "node:worker_threads";
import type { BundleManifest } from "./bundleService";

/** Frozen content-addressed copies live outside the mutable /games tree. */
export function offlinePackageDir(gamesDir: string, gameId: string, buildId: string): string {
  return path.join(path.dirname(gamesDir), ".offline-bundles", gameId, buildId);
}

export function readOfflinePackage(gamesDir: string, gameId: string, buildId: string): BundleManifest | null {
  if (!/^[a-z0-9-]+$/.test(gameId) || !/^[a-f0-9]{32}$/.test(buildId)) return null;
  try {
    const value: BundleManifest = JSON.parse(fs.readFileSync(path.join(offlinePackageDir(gamesDir, gameId, buildId), ".package.json"), "utf8"));
    return value.gameId === gameId && value.buildId === buildId && value.archive ? value : null;
  } catch { return null; }
}

const pending = new Map<string, Promise<BundleManifest["archive"]>>();
let tail: Promise<unknown> = Promise.resolve();

export async function waitForOfflinePackages(): Promise<void> { await tail; }

/** Single-flight and globally sequential: never compress inside an HTTP handler. */
export function ensureOfflinePackage(gamesDir: string, manifest: BundleManifest): Promise<BundleManifest["archive"]> {
  const existing = readOfflinePackage(gamesDir, manifest.gameId, manifest.buildId);
  if (existing) return Promise.resolve(existing.archive);
  const key = offlinePackageDir(gamesDir, manifest.gameId, manifest.buildId);
  const inFlight = pending.get(key);
  if (inFlight) return inFlight;
  const work = tail.catch(() => {}).then(() => new Promise<BundleManifest["archive"]>((resolve, reject) => {
    // Works in both tsx source execution and dist/src/services production.
    const sourceWorker = path.resolve(__dirname, "../../scripts/offline-archive-worker.cjs");
    const workerPath = fs.existsSync(sourceWorker) ? sourceWorker : path.resolve(__dirname, "../../../scripts/offline-archive-worker.cjs");
    const worker = new Worker(workerPath, {
      workerData: { gamesDir: path.resolve(gamesDir), packageRoot: path.join(path.dirname(path.resolve(gamesDir)), ".offline-bundles"), manifest },
    });
    let receivedResult = false;
    worker.once("message", result => {
      receivedResult = true;
      if (result.error) reject(new Error(result.error));
      else resolve(result.archive);
    });
    worker.once("error", reject);
    worker.once("exit", code => {
      if (code !== 0 || !receivedResult) reject(new Error(`Archive worker exited ${code} without a completed package`));
    });
  }));
  pending.set(key, work);
  tail = work.catch(() => {});
  void work.finally(() => pending.delete(key)).catch(() => {});
  return work;
}
