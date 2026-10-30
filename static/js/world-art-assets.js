"use strict";
// 美术资源独立缓存；失败只记一次，绝不影响战斗或再次逐帧请求。
(function(root) {
  const realms = ["fire", "wood", "earth", "metal", "water"];
  const kinds = ["guard", "special", "ranged", "boss"];
  const required = ["idle", "walk", "windup", "strike", "recover", "hurt", "death",
    "dash_windup","dash_strike","dash_recover","cast_windup","cast_strike","cast_recover",
    "heavy_windup","heavy_strike","heavy_recover"];
  const local = p => typeof p === "string" && /^\/static\/sprites\/world-v1\/[a-z0-9-]+\.png$/.test(p);
  const integer = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi;
  function validManifest(m) {
    if (!m || m.schemaVersion !== 1 || !m.families || !m.realms
        || Object.keys(m.families).length !== 20 || Object.keys(m.realms).length !== 5) return false;
    if (m.maps && (Object.keys(m.maps).length !== 10 || !realms.every(r =>
      ["ridge","hollow"].every(route => {
        const scene=m.maps[r+":"+route];
        return scene && local(scene.far) && local(scene.mid);
      })))) return false;
    return realms.every(r => {
      const scene = m.realms[r];
      if (!scene || !["far","mid","tiles","props"].every(k => local(scene[k]))
          || !/^#[0-9a-f]{6}$/i.test(scene.accent)) return false;
      return kinds.every(k => {
        const f = m.families[r+"-"+k];
        if (!f || typeof f.name !== "string" || !local(f.src)
            || !Array.isArray(f.frameSize) || f.frameSize.length !== 2
            || f.frameSize[0] !== (k==="boss"?128:k==="special"?96:64)
            || f.frameSize[1] !== (k==="boss"?144:96)
            || !integer(f.bodyHeight, 10, f.frameSize[1])
            || !Array.isArray(f.foot) || f.foot.length !== 2
            || !f.foot.every((n,i) => integer(n,0,f.frameSize[i]-1))
            || !f.animations) return false;
        return Object.keys(f.animations).length===required.length
          && new Set(Object.values(f.animations).map(a=>a?.row)).size===required.length
          && required.every(a => f.animations[a]) && Object.values(f.animations).every(a =>
          a && integer(a.row,0,31) && integer(a.count,1,4)
          && Number.isFinite(a.fps) && a.fps > 0 && a.fps <= 30);
      });
    });
  }
  class Assets {
    constructor() { this.status = "idle"; this.images = new Map(); this.failed = new Set(); }
    async load(fetcher = root.fetch?.bind(root), ImageType = root.Image) {
      if (this.promise) return this.promise;
      this.promise = this.loadOnce(fetcher, ImageType);
      return this.promise;
    }
    async loadOnce(fetcher, ImageType) {
      this.status = "loading";
      try {
        if (!fetcher || !ImageType) throw new Error("No image loader");
        const response = await fetcher("/static/sprites/world-v1/manifest.json");
        if (!response.ok) throw new Error("Manifest unavailable");
        const manifest = await response.json();
        if (!validManifest(manifest)) throw new Error("Invalid art manifest");
        this.manifest = manifest;
        const specs = new Map();
        for (const f of Object.values(manifest.families)) {
          const rows = Math.max(...Object.values(f.animations).map(a=>a.row))+1;
          specs.set(f.src, [f.frameSize[0]*4, f.frameSize[1]*rows]);
        }
        for (const s of Object.values(manifest.realms)) {
          specs.set(s.far, [768,144]); specs.set(s.mid,[768,96]);
          specs.set(s.tiles,[128,32]); specs.set(s.props,[256,96]);
        }
        for (const s of Object.values(manifest.maps||{})) {
          specs.set(s.far,[768,144]); specs.set(s.mid,[768,96]);
        }
        await Promise.all([...specs].map(([src,size]) => new Promise(resolve => {
          const img = new ImageType();
          let settled = false;
          const finish = okay => {
            if (settled) return;
            settled = true; clearTimeout(timer);
            if (okay && img.naturalWidth === size[0] && img.naturalHeight === size[1]) this.images.set(src,img);
            else this.failed.add(src);
            resolve();
          };
          const timer = setTimeout(()=>finish(false),8000);
          img.onload = () => finish(true); img.onerror = () => finish(false); img.src=src;
        })));
        this.status = "ready";
      } catch (_) { this.status = "failed"; }
      return this.status === "ready";
    }
    get(src) { return this.failed.has(src) ? null : this.images.get(src) || null; }
    reject(src) { this.failed.add(src); this.images.delete(src); }
  }
  const api = { Assets, validManifest, shared: new Assets() };
  root.DaoBladeWorldAssets = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
