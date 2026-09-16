import fs from "fs";
import path from "path";
import { DiscoveredSiteProfileDraft } from "./SiteProfileDiscovery";

const STORE_DIR = path.resolve(process.cwd(), ".prizm-data", "site-profile-drafts");
const safeId = (id: string) => id.replace(/[^a-z0-9._-]/gi, "-");

function ensureStore() { fs.mkdirSync(STORE_DIR, { recursive: true }); }
function fileFor(id: string) { return path.join(STORE_DIR, `${safeId(id)}.json`); }

export function listSiteProfileDrafts(): DiscoveredSiteProfileDraft[] {
  ensureStore();
  return fs.readdirSync(STORE_DIR).filter(name => name.endsWith(".json")).flatMap(name => {
    try { return [JSON.parse(fs.readFileSync(path.join(STORE_DIR, name), "utf8")) as DiscoveredSiteProfileDraft]; } catch { return []; }
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function nextSiteProfileRevision(siteKey: string): number {
  return Math.max(0, ...listSiteProfileDrafts().filter(draft => draft.siteKey === siteKey).map(draft => draft.revision)) + 1;
}

export function saveSiteProfileDraft(draft: DiscoveredSiteProfileDraft): DiscoveredSiteProfileDraft {
  ensureStore();
  const target = fileFor(draft.id);
  const temporary = `${target}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(draft, null, 2), "utf8");
  fs.renameSync(temporary, target);
  return draft;
}

export function activateSiteProfileDraft(id: string): DiscoveredSiteProfileDraft {
  const drafts = listSiteProfileDrafts();
  const target = drafts.find(draft => draft.id === id);
  if (!target) throw new Error(`Site profile draft '${id}' was not found.`);
  if (target.conflicts.length || target.unresolved.length) throw new Error("Draft cannot be activated until topology conflicts and unresolved evidence are cleared.");
  for (const draft of drafts.filter(item => item.siteKey === target.siteKey)) {
    const updated = { ...draft, status: draft.id === id ? "active" as const : (draft.status === "active" ? "superseded" as const : draft.status) };
    saveSiteProfileDraft(updated);
  }
  return { ...target, status: "active" };
}
