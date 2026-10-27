var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/server/fleet/workspaceUi.ts
var workspaceUi_exports = {};
__export(workspaceUi_exports, {
  createWorkspaceUi: () => createWorkspaceUi
});
module.exports = __toCommonJS(workspaceUi_exports);
var import_node_crypto = require("node:crypto");
var import_node_fs = require("node:fs");
var import_node_path = __toESM(require("node:path"), 1);
function createWorkspaceUi(directory) {
  const root = (0, import_node_fs.realpathSync)(directory), assets = import_node_path.default.join(root, "assets");
  const entries = /* @__PURE__ */ new Map();
  const etags = /* @__PURE__ */ new Map();
  const revalidateAssets = process.env.PRIZM_UI_ASSET_REVALIDATION !== "false";
  const digest = (0, import_node_crypto.createHash)("sha256");
  if (!(0, import_node_fs.lstatSync)(assets).isDirectory() || (0, import_node_fs.lstatSync)(assets).isSymbolicLink()) throw Error("Workspace assets must be a real directory");
  const files = ["index.html", "fleet.html", "mobile.html", ...["logo-transparent.svg", "favicon.ico"].filter((file) => {
    try {
      (0, import_node_fs.lstatSync)(import_node_path.default.join(root, file));
      return true;
    } catch (error) {
      if (error.code === "ENOENT") return false;
      throw error;
    }
  }), ...(0, import_node_fs.readdirSync)(assets).filter((file) => /^[A-Za-z0-9_.-]+\.(js|css|woff2?|ttf|png|svg|ico)$/.test(file)).map((file) => "assets/" + file)].sort();
  for (const file of files) {
    const absolute = import_node_path.default.join(root, file), stat = (0, import_node_fs.lstatSync)(absolute);
    if (!stat.isFile() || stat.isSymbolicLink()) throw Error("Workspace release contains an unsafe asset");
    const hash = (0, import_node_crypto.createHash)("sha256").update((0, import_node_fs.readFileSync)(absolute)).digest("hex");
    digest.update(file + "\0" + hash + "\n");
    etags.set("/" + file, '"' + hash + '"');
    if (!["fleet.html", "mobile.html"].includes(file)) entries.set(file === "index.html" ? "/" : "/" + file, absolute);
  }
  const releaseId = digest.digest("hex");
  return Object.freeze({ publicDirectory: root, releaseId, send(pathname, res) {
    if (pathname !== "/" && !pathname.startsWith("/assets/") && !["/logo-transparent.svg", "/favicon.ico"].includes(pathname)) return false;
    const file = entries.get(pathname);
    res.set({ "X-Prizm-UI-Release": releaseId, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    if (!file) {
      res.sendStatus(404);
      return true;
    }
    if (revalidateAssets && pathname.startsWith("/assets/")) res.set({
      "Cache-Control": "private, no-cache",
      ETag: etags.get(pathname)
    });
    res.sendFile(file, { cacheControl: false }, (error) => {
      if (!error) return;
      if (res.headersSent) {
        res.destroy();
        return;
      }
      res.status(503).json({ error: "Workspace interface unavailable; reload after release recovery." });
    });
    return true;
  } });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createWorkspaceUi
});
