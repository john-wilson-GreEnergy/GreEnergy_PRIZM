module.exports = function(deps) {
  const { object, identifier, capabilities, normalizeLocalEmail, hashLocalPassword, readAccounts, parseEnrollment, FLEET_MIN_PASSWORD_LENGTH, AccessError, LocalSessions, allowedSiteIds, mobileSessionToken, remoteDesktopRead, requireFullWorkspace, workspacePath, workspaceRouteAllowed, monitoringWorkspaceRequest, passiveWorkspaceGet, remoteVerifier, allowedFetchSite, createMobileApp } = deps;
  const express = require("express"), path = require("node:path");
  const { lstat, open, rename, unlink, readFile, readdir } = require("node:fs/promises");
  const { randomUUID, randomBytes, createHash, timingSafeEqual } = require("node:crypto");
  function parseAccounts(raw) {
    if (!Array.isArray(raw) || !raw.length || raw.length > 256) throw new Error("Invalid local account store");
    const ids = /* @__PURE__ */ new Set(), names = /* @__PURE__ */ new Set();
    for (const row of raw) {
      if (object(row) && row.remoteAccess !== void 0 && typeof row.remoteAccess !== "boolean") throw Error("Invalid remote access flag");
      if (object(row) && row.remoteControlSites !== void 0 && (!Array.isArray(row.remoteControlSites) || row.remoteControlSites.length > 16 || row.remoteControlSites.some((id) => !identifier(id)) || new Set(row.remoteControlSites).size !== row.remoteControlSites.length)) throw Error("Invalid remote control sites");
      if (object(row) && row.passwordSetup !== void 0 && (!object(row.passwordSetup) || typeof row.passwordSetup.digest !== "string" || !/^[a-f0-9]{64}$/.test(row.passwordSetup.digest) || !Number.isSafeInteger(row.passwordSetup.expiresAt) || Number(row.passwordSetup.expiresAt) <= 0 || row.fleetAdmin === true)) throw Error("Invalid password setup");
      if (object(row) && row.fleetAdmin !== void 0 && typeof row.fleetAdmin !== "boolean") throw new Error("Invalid administrator flag");
      if (!object(row) || !identifier(row.id) || typeof row.email !== "string" || !normalizeLocalEmail(row.email) || normalizeLocalEmail(row.email) !== row.email || typeof row.disabled !== "boolean" || !Number.isSafeInteger(row.version) || Number(row.version) < 1 || !object(row.password) || row.password.algorithm !== "scrypt-v1" || typeof row.password.salt !== "string" || !/^[a-f0-9]{32}$/.test(row.password.salt) || typeof row.password.digest !== "string" || !/^[a-f0-9]{128}$/.test(row.password.digest) || !Array.isArray(row.grants) || row.grants.length > 100) throw new Error("Invalid local account");
      if (ids.has(row.id) || names.has(row.email)) throw new Error("Duplicate local identity");
      ids.add(row.id);
      names.add(row.email);
      for (const grant of row.grants) {
        if (!object(grant) || !capabilities.has(String(grant.capability)) || !identifier(grant.siteId) || !identifier(grant.blockId) || !object(grant.scope) || grant.scope.kind !== "block" && (grant.scope.kind !== "targets" || !Array.isArray(grant.scope.ids) || !grant.scope.ids.length || grant.scope.ids.length > 5e3 || grant.scope.ids.some((id) => !identifier(id)))) throw new Error("Invalid local grant");
      }
    }
    return structuredClone(raw);
  }
  async function manageFleetAccount(file, sites, action, actor) {
    if (!path.isAbsolute(file)) throw new Error("Absolute account path required");
    const directory = path.dirname(file), parent = await lstat(directory);
    if (!parent.isDirectory() || parent.isSymbolicLink() || (parent.mode & 63) !== 0 || parent.uid !== process.getuid?.() && parent.uid !== 0) throw new Error("Use a private account directory owned by this service user or root");
    const enrolled = sites.map(parseEnrollment);
    if (!enrolled.length || new Set(enrolled.map((s) => s.siteId)).size !== enrolled.length) throw new Error("Unique enrolled sites required");
    const email = normalizeLocalEmail(action.email);
    if (!email) throw new Error("Valid email required");
    if ("remoteAccess" in action && typeof action.remoteAccess !== "boolean") throw Error("Invalid remote access flag");
    if (actor && action.kind === "redeem") throw Error("Use the password setup endpoint");
    const selected = "siteIds" in action ? action.siteIds : [];
    const workspaceIds = "workspaceIds" in action ? action.workspaceIds ?? [] : [];
    if (new Set(workspaceIds).size !== workspaceIds.length || workspaceIds.some((id) => !selected.includes(id))) throw Error("Full workspaces must also have site visibility");
    if ("siteIds" in action && (!selected.length && action.kind !== "workspace" && action.kind !== "remote-controls" || new Set(selected).size !== selected.length || selected.some((id) => !enrolled.some((s) => s.siteId === id)))) throw new Error("Select one or more distinct enrolled site IDs");
    const lockFile = path.join(directory, "provision.lock");
    const lock = await open(lockFile, "wx", 384);
    let temporary;
    try {
      let accounts;
      try {
        accounts = await readAccounts(file);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        accounts = [];
      }
      if (actor) {
        if (action.kind === "administrator" || action.kind === "remote") throw Error("Account operation must be managed from the server console");
        const current = accounts.find((a) => a.id === actor.id);
        if (!current || current.disabled || current.fleetAdmin !== true || current.version !== actor.version) throw Error("Administrator access changed; sign in again");
        const target = accounts.find((a) => a.email === email);
        if (action.kind !== "remote-controls" && (target?.id === actor.id || target?.fleetAdmin)) throw Error("Administrator accounts must be managed from the server console");
      }
      if (accounts.some((a) => a.grants.some((g) => !["telemetry.view", "history.view", "workspace.full"].includes(g.capability)))) throw new Error("Refusing a non-Fleet account store");
      let account = accounts.find((a) => a.email === email);
      if (action.kind === "redeem") {
        const setup = account?.passwordSetup;
        const supplied = typeof action.token === "string" && /^[A-Za-z0-9_-]{43}$/.test(action.token) ? createHash("sha256").update(action.token).digest() : null;
        if (!account || account.disabled || account.fleetAdmin || !setup || setup.expiresAt <= Date.now() || !supplied || !timingSafeEqual(supplied, Buffer.from(setup.digest, "hex"))) throw Error("Setup code is invalid or expired");
      }
      let setupToken;
      if (action.kind === "add" || action.kind === "invite") {
        if (account) throw new Error("Account already exists; use password or access to change it");
        account = { id: randomUUID(), email, disabled: false, version: 1, password: await hashLocalPassword(action.kind === "add" ? action.password : randomBytes(32).toString("base64url"), FLEET_MIN_PASSWORD_LENGTH), grants: [] };
        accounts.push(account);
      } else {
        if (!account) throw new Error("Account not found");
        if (account.version >= Number.MAX_SAFE_INTEGER) throw new Error("Account version exhausted");
        account.version++;
        if (action.kind === "password") account.password = await hashLocalPassword(action.password, FLEET_MIN_PASSWORD_LENGTH);
        if (action.kind === "redeem") account.password = await hashLocalPassword(action.password, FLEET_MIN_PASSWORD_LENGTH);
        if (action.kind === "password" || action.kind === "redeem" || action.kind === "disable") delete account.passwordSetup;
        if (action.kind === "disable" || action.kind === "enable") account.disabled = action.kind === "disable";
        if (action.kind === "administrator") account.fleetAdmin = action.enabled;
      }
      if (action.kind === "invite" || action.kind === "setup") {
        if (account.disabled || account.fleetAdmin) throw Error("Cannot issue setup for a disabled or administrator account");
        setupToken = randomBytes(32).toString("base64url");
        account.passwordSetup = { digest: createHash("sha256").update(setupToken).digest("hex"), expiresAt: Date.now() + 864e5 };
      }
      if ("remoteAccess" in action) account.remoteAccess = action.remoteAccess;
      if ((action.kind === "disable" || action.kind === "administrator" && !action.enabled) && !accounts.some((a) => a.fleetAdmin && !a.disabled) && (await readAccounts(file)).some((a) => a.fleetAdmin && !a.disabled)) throw Error("Cannot remove the last active administrator");
      if (action.kind === "workspace") {
        if (selected.some((id) => !account.grants.some((g) => g.siteId === id && g.blockId === enrolled.find((s) => s.siteId === id).blockId && g.capability === "telemetry.view" && g.scope.kind === "block"))) throw Error("Workspace access requires existing site telemetry access");
        account.grants = account.grants.filter((g) => g.capability !== "workspace.full");
        for (const site of enrolled.filter((s) => selected.includes(s.siteId))) account.grants.push({ capability: "workspace.full", siteId: site.siteId, blockId: site.blockId, scope: { kind: "block" } });
      } else if ("siteIds" in action && action.kind !== "remote-controls") account.grants = enrolled.filter((s) => selected.includes(s.siteId)).map((s) => ({
        capability: "telemetry.view",
        siteId: s.siteId,
        blockId: s.blockId,
        scope: { kind: "block" }
      }));
      if (action.kind === "add" || action.kind === "invite" || action.kind === "access") for (const site of enrolled.filter((s) => workspaceIds.includes(s.siteId))) account.grants.push({ capability: "workspace.full", siteId: site.siteId, blockId: site.blockId, scope: { kind: "block" } });
      const eligible = (id) => account.remoteAccess === true && enrolled.some((site) => site.siteId === id && ["telemetry.view", "workspace.full"].every((capability) => account.grants.some((g) => g.siteId === id && g.blockId === site.blockId && g.scope.kind === "block" && g.capability === capability)));
      if (action.kind === "remote-controls") {
        if (selected.some((id) => !eligible(id))) throw Error("Remote controls require remote access and an existing full workspace for each selected site");
        account.remoteControlSites = [...selected];
      } else if (account.remoteControlSites) {
        account.remoteControlSites = account.remoteControlSites.filter(eligible);
      }
      const validated = parseAccounts(accounts);
      temporary = path.join(directory, randomUUID() + ".accounts.tmp");
      const output = await open(temporary, "wx", 384);
      try {
        await output.writeFile(JSON.stringify(validated, null, 2));
        await output.sync();
      } finally {
        await output.close();
      }
      await rename(temporary, file);
      temporary = void 0;
      return {
        action: action.kind,
        email,
        version: account.version,
        disabled: account.disabled,
        administrator: account.fleetAdmin === true,
        remoteAccess: account.remoteAccess === true,
        remoteControlSites: account.remoteControlSites ?? [],
        pendingSetup: !!account.passwordSetup,
        ...setupToken ? { setupToken, setupExpiresAt: account.passwordSetup.expiresAt } : {},
        sites: account.grants.filter((g) => g.capability === "telemetry.view").map((g) => g.siteId),
        workspaces: account.grants.filter((g) => g.capability === "workspace.full").map((g) => g.siteId)
      };
    } finally {
      if (temporary) await unlink(temporary).catch(() => {
      });
      await lock.close();
      await unlink(lockFile);
    }
  }
  async function listFleetAccounts(file) {
    const accounts = await readAccounts(file);
    return accounts.map((a) => ({
      email: a.email,
      disabled: a.disabled,
      version: a.version,
      administrator: a.fleetAdmin === true,
      remoteAccess: a.remoteAccess === true,
      remoteControlSites: a.remoteControlSites ?? [],
      pendingSetup: !!a.passwordSetup,
      sites: a.grants.filter((g) => g.capability === "telemetry.view").map((g) => g.siteId),
      workspaces: a.grants.filter((g) => g.capability === "workspace.full").map((g) => g.siteId)
    }));
  }
  function parseAdminAction(body, workspaceSites) {
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new AccessError(400, "Invalid account request");
    const b = body;
    if (!["add", "invite", "setup", "access", "enable", "disable", "password", "remote-controls"].includes(String(b.kind)) || typeof b.email !== "string" || typeof b.confirmationPassword !== "string") throw new AccessError(400, "Invalid account request");
    const email = normalizeLocalEmail(b.email);
    if (!email) throw new AccessError(400, "Valid email required");
    const fields = ["kind", "email", "confirmationPassword", ...b.kind === "remote-controls" ? ["siteIds"] : [], ...["add", "invite", "access"].includes(String(b.kind)) ? ["siteIds", "workspaceIds", ..."remoteAccess" in b ? ["remoteAccess"] : []] : [], ...["add", "password"].includes(String(b.kind)) ? ["password"] : []];
    if ("remoteAccess" in b && typeof b.remoteAccess !== "boolean") throw new AccessError(400, "Invalid remote access choice");
    if (Object.keys(b).sort().join(",") !== fields.sort().join(",")) throw new AccessError(400, "Unexpected or missing account fields");
    if (["add", "password"].includes(String(b.kind)) && (typeof b.password !== "string" || [...b.password].length < FLEET_MIN_PASSWORD_LENGTH || b.password.length > 256)) throw new AccessError(400, `New password must have at least ${FLEET_MIN_PASSWORD_LENGTH} characters`);
    if (["add", "invite", "access"].includes(String(b.kind))) {
      for (const key of ["siteIds", "workspaceIds"]) if (!Array.isArray(b[key]) || b[key].length > 16 || b[key].some((id) => typeof id !== "string")) throw new AccessError(400, "Invalid site selection");
      if (b.workspaceIds.some((id) => !workspaceSites.has(id))) throw new AccessError(400, "Full workspace is not enabled for that site");
    }
    if (b.kind === "remote-controls" && (!Array.isArray(b.siteIds) || b.siteIds.length > 16 || b.siteIds.some((id) => typeof id !== "string" || !workspaceSites.has(id)))) throw new AccessError(400, "Invalid remote control site selection");
    const { confirmationPassword, ...action } = b;
    return { action: { ...action, email }, confirmationPassword };
  }
  function createRemoteDesktop(broker, sessions, options, sites) {
    const app = express();
    app.set("case sensitive routing", true);
    app.set("strict routing", true);
    app.use((req, res) => {
      void (async () => {
        const match = /^\/([A-Za-z0-9_-]{1,80})(\/.*)$/.exec(req.url);
        if (!match) throw new AccessError(403, "Unknown site workspace");
        const site = sites.find((s) => s.collector.siteId === match[1]);
        if (!site) throw new AccessError(403, "Unknown site workspace");
        const raw = match[2], token = mobileSessionToken(req);
        let requestPath;
        try {
          requestPath = workspacePath(raw);
        } catch {
          throw new AccessError(403, "Invalid remote workspace path");
        }
        const recheck = async (control = false, fresh = false) => {
          const auth2 = await sessions.authenticate(token, false);
          const email = options.remoteIdentity ? await options.remoteIdentity(req) : auth2.email;
          const account = (await options.accounts()).find((a) => a.email === email);
          if (!account || account.disabled || !account.remoteAccess || auth2.email !== email || !allowedSiteIds(broker, auth2.principal).has(site.collector.siteId)) throw new AccessError(403, "This site is not assigned to your remote account");
          const operator = options.remoteControlsEnabled === true && account.remoteControlSites?.includes(site.collector.siteId) === true;
          if (operator) requireFullWorkspace(auth2.principal, site.collector);
          if (control) {
            if (!operator) throw new AccessError(403, "Remote controls are locked for your profile on this site. Verify any previously submitted command outcome before retrying");
            await sessions.requireControl(token);
          }
          if (fresh && broker.view(/* @__PURE__ */ new Set([site.collector.siteId])).sites[0]?.status !== "current") throw new AccessError(409, "Current site telemetry is required for remote controls. Verify any previously submitted command outcome before retrying");
          await sessions.authenticate(token, false);
          return { ...auth2, operator };
        };
        const auth = await recheck();
        if (req.method === "GET" && /^\/(?:\?[^#]*)?$/.test(raw)) {
          const query = new URL(raw, options.origin).searchParams;
          for (const [key, value] of query) if (!["tab", "ui", "healthView", "array", "targetSite", "targetarray", "targetstring", "targetbpc", "returnTo"].includes(key) || (key === "targetSite" ? value.length > 512 || /[<>\x00-\x1f]/.test(value) : !/^[-a-z0-9]{1,64}$/i.test(value)) || query.getAll(key).length !== 1) throw new AccessError(403, "Invalid view");
          await options.audit({ action: "remote.workspace.open", outcome: "authorized", subject: auth.principal.subject });
          if (options.workspaceUi?.send("/", res)) return;
          res.sendFile(path.resolve(options.publicDirectory, "index.html"));
          return;
        }
        if (raw === "/api/fleet/workspace-context" && req.method === "GET") {
          const c = site.collector;
          res.json({ siteId: c.siteId, siteName: c.name, stationCode: c.stationCode, blockIndex: c.blockIndex, fleetUrl: options.origin + (options.adaptiveExperience ? "/fleet/" : "/mobile/"), email: auth.email, csrf: auth.csrf, fullControl: auth.operator, remoteReadOnly: !auth.operator, remoteAccess: true, ...auth.operator ? await sessions.status(token) : {}, ...options.workspaceUi ? { uiRelease: options.workspaceUi.releaseId } : {} });
          return;
        }
        if (raw === "/api/fleet/workspace-touch" && req.method === "POST") {
          if (req.headers.origin !== options.origin) throw new AccessError(403, "Same-origin request required");
          sessions.checkCsrf(auth.csrf, req.headers["x-prizm-csrf"]);
          await sessions.authenticate(token, true);
          res.json({ active: true, readOnly: !auth.operator });
          return;
        }
        if (auth.operator) {
          if (req.method !== "GET" || !passiveWorkspaceGet(requestPath)) sessions.checkCsrf(auth.csrf, req.headers["x-prizm-csrf"]);
          if (req.headers.origin && req.headers.origin !== options.origin || req.method !== "GET" && req.headers.origin !== options.origin) throw new AccessError(403, "Same-origin request required");
          if (raw === "/api/fleet/workspace-monitor" && req.method === "POST") {
            res.json(await sessions.monitoring(token));
            return;
          }
          if (!workspaceRouteAllowed(req.method, requestPath)) throw new AccessError(403, "Route is not available in the enrolled workspace");
          if (req.method !== "GET" && (requestPath.toLowerCase().startsWith("/api/local/troubleshooting/overrides") || requestPath.toLowerCase() === "/api/local/corrective-guidance")) throw new AccessError(403, "Use local administration for shared guidance changes");
          if (req.method === "GET" && (Number(req.headers["content-length"] ?? 0) !== 0 || req.headers["transfer-encoding"])) throw new AccessError(400, "GET body refused");
          if (Number(req.headers["content-length"] ?? 0) > 50 * 1024 * 1024) throw new AccessError(413, "Request body too large");
          const controlRequired = !monitoringWorkspaceRequest(req.method, requestPath);
          await recheck(true, controlRequired);
          if (controlRequired || req.method !== "GET") await options.audit({ action: "remote.workspace.dispatch", outcome: "authorized", subject: auth.principal.subject, siteId: site.collector.siteId, method: req.method, path: requestPath });
          await recheck(true, controlRequired);
          req.url = raw;
          await site.forward(req, res, async () => {
            await recheck(true);
          });
          return;
        }
        const safe = remoteDesktopRead(req.method, raw);
        if (!safe || Number(req.headers["content-length"] ?? 0) !== 0 || req.headers["transfer-encoding"]) throw new AccessError(403, "Remote workspace is read-only; this request was not dispatched");
        req.url = safe;
        await recheck();
        await site.forward(req, res, async () => {
          await recheck();
        });
      })().catch((e) => {
        if (res.headersSent) {
          res.destroy();
          return;
        }
        if (e instanceof AccessError && e.status === 401 && req.method === "GET" && /^\/[^/]+\/($|\?)/.test(req.url)) {
          res.redirect(303, options.adaptiveExperience ? "/fleet/" : "/mobile/");
          return;
        }
        res.status(e instanceof AccessError ? e.status : 503).json({ error: e instanceof AccessError ? e.message : "Site workspace unavailable; verify any submitted command outcome before retrying" });
      });
    });
    return app;
  }
  async function createRemoteMobileApp(broker, options, config) {
    const origin = new URL(config.origin);
    if (origin.protocol !== "https:" || origin.origin !== config.origin || origin.port || origin.username || origin.password || !/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(origin.hostname)) throw Error("Exact HTTPS remote hostname required");
    if (config.socketPath !== "/run/prizm-remote/mobile.sock") throw Error("Fixed private remote socket required");
    if (config.authentication !== void 0 && !["cloudflare", "password"].includes(config.authentication)) throw Error("Unknown remote authentication mode");
    if (config.experience !== void 0 && !["adaptive", "mobile"].includes(config.experience)) throw Error("Unknown remote experience");
    if (config.controls !== void 0 && !["disabled", "profile"].includes(config.controls)) throw Error("Unknown remote controls policy");
    const remoteControlsEnabled = config.controls === "profile";
    const adaptive = !!options.desktop?.length && config.experience !== "mobile";
    const verifyIdentity = config.authentication === "password" ? void 0 : remoteVerifier(config);
    const identity = verifyIdentity ? (req) => verifyIdentity(req.headers["cf-access-jwt-assertion"]) : void 0;
    const accounts = async () => (await options.accounts()).filter((a) => !a.disabled && a.remoteAccess === true);
    const html = await readFile(path.join(options.publicDirectory, "mobile.html"), "utf8");
    const assets = new Set([...html.matchAll(/(?:src|href)="(\/assets\/[A-Za-z0-9_.-]+\.(?:js|css))"/g)].map((m) => m[1]));
    assets.add("/logo-transparent.svg");
    if (options.desktop?.length) {
      for (const file of await readdir(path.join(options.publicDirectory, "assets"))) if (/^[A-Za-z0-9_.-]+\.(js|css|svg|woff2?)$/.test(file)) assets.add("/assets/" + file);
    }
    const sessions = new LocalSessions(accounts, options.clock ?? Date.now, true, true);
    const app = express();
    app.disable("x-powered-by");
    app.set("trust proxy", false);
    app.set("strict routing", true);
    app.set("case sensitive routing", true);
    app.use((req, res, next) => {
      res.set({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
      const entryDocument = ["/", "/mobile", "/mobile/", ...adaptive ? ["/fleet", "/fleet/"] : []].includes(req.path) || /^\/desktop\/[A-Za-z0-9_-]{1,80}\/$/.test(req.path);
      const methods = remoteControlsEnabled && req.path.startsWith("/desktop/") ? ["GET", "POST", "PUT", "PATCH", "DELETE"] : ["GET", "POST"];
      if (req.socket.remoteAddress || req.headers.host !== origin.host || req.headers.origin && req.headers.origin !== origin.origin || !allowedFetchSite(req, entryDocument) || !req.path.startsWith("/desktop/") && req.url !== req.path || /[\\%]/.test(req.path) || !methods.includes(req.method) || req.method !== "GET" && req.headers.origin !== origin.origin) return res.sendStatus(403);
      res.set("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
      if (!identity) return next();
      void identity(req).then(async (email) => {
        const account = (await accounts()).find((a) => a.email === email);
        if (!account) throw Error("Not enrolled");
        next();
      }).catch(() => res.status(403).send("Remote access is not assigned to this verified identity. Contact your PRIZM administrator."));
    });
    app.get("/", (_req, res) => res.redirect(302, adaptive ? "/fleet/" : "/mobile/"));
    app.get("/mobile", (_req, res) => res.redirect(302, "/mobile/"));
    if (adaptive) app.get("/fleet", (_req, res) => res.redirect(302, "/fleet/"));
    for (const asset of assets) app.get(asset, (_req, res) => {
      if (options.workspaceUi?.send(asset, res)) return;
      res.sendFile(path.join(options.publicDirectory, asset));
    });
    const setup = options.setup ? async (body, verifiedEmail) => {
      const email = normalizeLocalEmail(body?.email);
      if (!(await accounts()).some((a) => a.email === email)) throw new AccessError(400, "Invalid or expired setup code");
      return options.setup(body, verifiedEmail);
    } : void 0;
    const shared = { ...options, accounts, setup, origin: config.origin, remoteControlsEnabled, remoteListener: true, remoteIdentity: identity, remoteSessions: sessions, adaptiveExperience: adaptive, desktopSites: options.desktop?.map((s) => s.collector.siteId) };
    if (options.desktop?.length) app.use("/desktop", createRemoteDesktop(broker, sessions, shared, options.desktop));
    app.use("/mobile", createMobileApp(broker, shared));
    if (adaptive) app.use("/fleet", createMobileApp(broker, { ...shared, experience: "fleet" }));
    app.use((_req, res) => res.sendStatus(403));
    return app;
  }
  return { parseAccounts, manageFleetAccount, listFleetAccounts, parseAdminAction, createRemoteDesktop, createRemoteMobileApp };
};
