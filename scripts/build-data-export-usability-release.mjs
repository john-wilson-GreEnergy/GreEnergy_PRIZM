import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import {createRequire} from "node:module";

const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const require = createRequire(repo + "/package.json");
const {build} = require("esbuild");
const {parse} = require("@babel/parser");
const sha = value => crypto.createHash("sha256").update(value).digest("hex");
const root = repo + "/deployment/prepared/data-export-usability-20261110";
const archived = repo + "/deployment/deployed-runtime/dell-20261109/payload/releases";
const roles = {fleet: archived + "/power-display-20261109-r2/dist"};

assert(!fs.existsSync(root), "Prepared release already exists: " + root);
const tree = directory => Object.fromEntries(fs.readdirSync(directory, {recursive: true, withFileTypes: true})
  .filter(entry => entry.isFile()).map(entry => {
    const file = path.join(entry.parentPath, entry.name);
    return [path.relative(directory, file), sha(fs.readFileSync(file))];
  }).sort(([a], [b]) => a.localeCompare(b)));

for (const [role, base] of Object.entries(roles)) {
  const dest = `${root}/payload/${role}/dist`;
  fs.cpSync(base, dest, {recursive: true});
  const assetsDir = base + "/assets";
  const all = fs.readdirSync(assetsDir);
  const htmlNames = ["index.html", "fleet.html", "mobile.html", "signin.html"];
  const active = new Set();
  const queue = htmlNames.map(name => fs.readFileSync(base + "/" + name, "utf8"));
  while (queue.length) {
    const source = queue.pop();
    for (const name of all) if (!active.has(name) && source.includes(name)) {
      active.add(name);
      if (name.endsWith(".js")) queue.push(fs.readFileSync(assetsDir + "/" + name, "utf8"));
    }
  }
  const sources = new Map([...active].filter(name => name.endsWith(".js"))
    .map(name => [name, fs.readFileSync(assetsDir + "/" + name, "utf8")]));
  const unique = predicate => {
    const matches = [...sources].filter(predicate);
    assert.equal(matches.length, 1, JSON.stringify(matches.map(([name]) => name)));
    return matches[0][0];
  };
  const workspace = unique(([, source]) => source.includes("import __DataExport"));
  const client = unique(([name]) => name.startsWith("client-"));
  const workspaceSource = sources.get(workspace);
  const oldPanel = /import __DataExport from ["']\.\/([^"']+)["']/.exec(workspaceSource)?.[1];
  assert(oldPanel && sources.has(oldPanel), "Active Data export entry not found");
  const html = htmlNames.map(name => fs.readFileSync(base + "/" + name, "utf8")).join("\n");
  const oldCss = [...new Set([...html.matchAll(/assets\/(dataexport09-[^"']+\.css)/g)].map(match => match[1]))];
  assert.equal(oldCss.length, 1, JSON.stringify(oldCss));

  const modules = {
    react: `import {r as React} from './${client}';export default React;export const {Fragment,useState,useEffect,useRef,useMemo,useCallback,forwardRef,createElement}=React;`,
    "react/jsx-runtime": `import {j as runtime} from './${client}';export const {jsx,jsxs,Fragment}=runtime;`,
    context: `export {n as useSiteDataFields} from './${workspace}';`,
  };
  const result = await build({
    absWorkingDir: repo,
    stdin: {contents: "export {default} from './src/components/DataExportWorkspace';", resolveDir: repo, loader: "tsx"},
    bundle: true, format: "esm", jsx: "transform", minify: true, write: false, outfile: "panel.js", metafile: true,
    plugins: [{name: "deployed-singletons", setup(builder) {
      builder.onResolve({filter: /^(react(?:\/jsx-runtime)?)$/}, args => ({path: args.path, namespace: "deployed"}));
      builder.onResolve({filter: /SiteDataContext$/}, () => ({path: "context", namespace: "deployed"}));
      builder.onLoad({filter: /.*/, namespace: "deployed"}, args => ({contents: modules[args.path], loader: "js"}));
      builder.onResolve({filter: /^\.\//}, args => args.namespace === "deployed" ? {path: args.path, external: true} : undefined);
    }}],
  });
  const inputs = Object.keys(result.metafile.inputs);
  assert(inputs.every(name => name === "<stdin>" || name.startsWith("deployed:") || [
    "src/components/DataExportWorkspace.tsx", "src/components/dataExportUsability.ts", "src/components/dataExport.css",
  ].includes(name)), JSON.stringify(inputs));
  const panelJs = result.outputFiles.find(file => file.path.endsWith(".js")).text;
  const panelCss = result.outputFiles.find(file => file.path.endsWith(".css")).text;
  const newPanel = `dataexport10-${sha(role + panelJs).slice(0, 12)}.js`;
  const newCss = `dataexport10-${sha(role + panelCss).slice(0, 12)}.css`;
  sources.set(newPanel, panelJs);
  sources.set(workspace, workspaceSource.replace(`./${oldPanel}`, `./${newPanel}`));

  const changed = new Set([workspace]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [name, source] of sources) if (!changed.has(name) && [...changed].some(dependency => source.includes(dependency))) {
      changed.add(name); grew = true;
    }
  }
  const rename = new Map([...changed].map(name => [name, `dataexport10-${sha(role + name + sources.get(name)).slice(0, 12)}.js`]));
  const rewrite = source => {
    for (const [before, after] of rename) source = source.replaceAll(before, after);
    return source;
  };
  fs.writeFileSync(`${dest}/assets/${newPanel}`, rewrite(panelJs));
  fs.writeFileSync(`${dest}/assets/${newCss}`, panelCss);
  for (const [before, after] of rename) {
    const source = rewrite(sources.get(before));
    parse(source, {sourceType: "module"});
    fs.writeFileSync(`${dest}/assets/${after}`, source);
  }
  for (const name of htmlNames) {
    const next = rewrite(fs.readFileSync(base + "/" + name, "utf8")).replaceAll(oldCss[0], newCss);
    assert(next.includes(newCss));
    fs.writeFileSync(`${dest}/${name}`, next);
  }
  const activeText = fs.readFileSync(`${dest}/assets/${rename.get(workspace)}`, "utf8");
  assert(activeText.includes(rename.get(newPanel) || newPanel));
  assert(panelJs.includes("Commands + movement"));
  assert(panelJs.includes("Selected arrays"));
}

const manifest = {
  schema: 1,
  release: "data-export-usability-20261110",
  sourceCommit: "dcdf90f",
  scope: "Frontend-only retained-history export usability; no acquisition, equipment communication, retention, accounts or configuration changes",
  baseline: {
    fleet: "/opt/prizm-fleet/releases/power-display-20261109-r2",
  },
  trees: Object.fromEntries(Object.keys(roles).map(role => [role, tree(`${root}/payload/${role}/dist`)])),
};
fs.writeFileSync(root + "/manifest.json", JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({root, manifest: sha(fs.readFileSync(root + "/manifest.json")), files: Object.fromEntries(Object.entries(manifest.trees).map(([role, files]) => [role, Object.keys(files).length]))}));
