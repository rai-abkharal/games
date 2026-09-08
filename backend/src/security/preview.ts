import express from "express";
import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
import { SecurityConfig } from "./config";
import { SecurityStore, digest } from "./store";
// Runs only on the unprivileged preview origin. The adapter is not deployed into games.
const adapter = `(function(){
const parentOrigin=ADMIN_ORIGIN;
function send(type,payload){parent.postMessage({v:1,type,payload:payload||{}},parentOrigin);}
window.AndroidNative={postScore:score=>send('SCORE_UPDATED',{score}),onLevelCompleted:(level,score)=>send('LEVEL_COMPLETED',{level,score}),onGameOver:score=>send('GAME_OVER',{score}),requestHint:()=>send('HINT_REQUESTED',{})};
addEventListener('message',function(e){if(e.source!==parent || e.origin!==parentOrigin)return;
let d=e.data;try{if(typeof d==='string')d=JSON.parse(d);}catch(_){return;}if(!d||d.v!==1)return;
const b=window.GameBridge;
switch(d.type){case 'PAUSE_GAME':b?.pause?.();dispatchEvent(new Event('blur'));break;case 'RESUME_GAME':b?.resume?.();dispatchEvent(new Event('focus'));break;case 'MUTE_AUDIO':b?.setSoundEnabled?.(false);break;case 'UNMUTE_AUDIO':b?.setSoundEnabled?.(true);break;case 'RESTART_GAME':b?.restart?.();break;case 'TRIGGER_HINT':b?.triggerHint?.();break;case 'RESET_PROGRESS':localStorage.clear();sessionStorage.clear();location.reload();break;}
});})();`;
export function previewApp(
  publicDir: string,
  store: SecurityStore,
  config: SecurityConfig,
) {
  const app = express();
  app.use((_req, res, next) => {
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader(
      "Content-Security-Policy",
      `frame-ancestors ${config.origin}; object-src 'none'; base-uri 'self'; form-action 'none'`,
    );
    next();
  });
  app.get("/preview-adapter.js", (_req, res) =>
    res
      .type("js")
      .send(adapter.replace("ADMIN_ORIGIN", JSON.stringify(config.origin))),
  );
  const decorate = (html: string) =>
    html.replace(
      /<head([^>]*)>/i,
      `<head$1><script src="/preview-adapter.js"></script>`,
    );
  app.get("/staged/:token/*", (req, res) => {
    const grant = store.get(
      "SELECT * FROM preview_grants WHERE token=? AND expires>?",
      digest(req.params.token),
      Date.now(),
    );
    const item =
      grant && store.get("SELECT * FROM uploads WHERE id=?", grant.upload);
    if (!item) return res.sendStatus(404);
    const requested = (req.params as Record<string, string>)[0] || "index.html";
    if (requested.split("/").includes("..") || requested.includes("\\"))
      return res.sendStatus(404);
    try {
      const zip = new AdmZip(fs.readFileSync(item.filename));
      const entries = zip.getEntries();
      const htmls = entries.filter(
        (e) =>
          /(^|\/)index\.html$/.test(e.entryName) &&
          !/\/@vite\/client|src\/[^"']+\.tsx?/.test(e.getData().toString()),
      );
      htmls.sort(
        (a, b) =>
          Number(!/(dist|build)\/index.html$/.test(a.entryName)) -
            Number(!/(dist|build)\/index.html$/.test(b.entryName)) ||
          a.entryName.length - b.entryName.length,
      );
      const prefix = htmls[0]?.entryName.replace(/index\.html$/, "");
      const entry = prefix !== undefined && zip.getEntry(prefix + requested);
      if (!entry || entry.isDirectory) return res.sendStatus(404);
      res.setHeader("Cache-Control", "no-store");
      res.type(path.extname(requested));
      return res.send(
        requested.endsWith(".html")
          ? decorate(entry.getData().toString())
          : entry.getData(),
      );
    } catch {
      return res.sendStatus(404);
    }
  });
  app.get("/games/:id/:version/*.html", (req, res) => {
    if (
      !/^[a-z0-9-]+$/.test(req.params.id) ||
      !/^\d+\.\d+\.\d+$/.test(req.params.version)
    )
      return res.sendStatus(404);
    const root = path.resolve(
      publicDir,
      "games",
      req.params.id,
      req.params.version,
    );
    const filename = path.resolve(
      root,
      (req.params as Record<string, string>)[0] + ".html",
    );
    if (!filename.startsWith(root + path.sep) || !fs.existsSync(filename))
      return res.sendStatus(404);
    res.type("html").send(decorate(fs.readFileSync(filename, "utf8")));
  });
  for (const folder of ["games", "shared", "thumbnails"])
    app.use(
      `/${folder}`,
      express.static(path.join(publicDir, folder), { dotfiles: "deny" }),
    );
  app.use((_req, res) => res.sendStatus(404));
  return app;
}
