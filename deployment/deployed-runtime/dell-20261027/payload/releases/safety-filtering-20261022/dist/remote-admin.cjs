module.exports = function(deps) {
  const { validateFleetOrigin, LocalSessions, AccessError, allowedFetchSite, allowedSiteIds, unavailableHvac, normalizeLocalEmail, mobileSessionToken, fleetSessionToken, manageFleetAccount, listFleetAccounts, parseAdminAction } = deps;
  const express = require("express"), { Router } = express, path = require("node:path"), { readFile } = require("node:fs/promises");
  const tokenOf = mobileSessionToken, cookieName = "prizm_mobile_session";
  function createMobileApp(broker, options) {
    const app = express(), origin = validateFleetOrigin(options.origin, options.allowLoopbackHttp);
    const remote = options.remoteListener === true || !!options.remoteIdentity;
    const administration = remote && options.experience === "fleet" && !!options.adminAccountsFile;
    const sessions = remote && options.remoteSessions ? options.remoteSessions : new LocalSessions(options.accounts, options.clock ?? Date.now, true, true);
    const identities = /* @__PURE__ */ new WeakMap();
    app.disable("x-powered-by");
    app.set("case sensitive routing", true);
    app.set("strict routing", true);
    app.set("trust proxy", false);
    const routes = /* @__PURE__ */ new Map([["/api/fleet/session", "GET"], ["/api/fleet/summary", "GET"], ["/api/fleet/login", "POST"], ["/api/fleet/logout", "POST"], ["/api/fleet/touch", "POST"], ["/", "GET"], ["/mobile.webmanifest", "GET"]]);
    if (options.setup) routes.set("/api/fleet/setup", "POST");
    app.use((req, res, next) => {
      if (options.workspaceUi) res.set("X-Prizm-UI-Release", options.workspaceUi.releaseId);
      res.set({
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; connect-src 'self'; manifest-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"
      });
      const loopback = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress ?? "");
      if (req.headers.host !== origin.host || req.headers.origin && req.headers.origin !== origin.origin || !allowedFetchSite(req, req.path === "/") || !req.secure && !(remote && !req.socket.remoteAddress) && !(options.allowLoopbackHttp && origin.protocol === "http:" && loopback) || req.url !== req.path || !(routes.get(req.path) === req.method || administration && req.path === "/api/fleet/admin/users" && ["GET", "POST"].includes(req.method)) || req.method === "POST" && req.headers.origin !== origin.origin)
        return res.status(403).json({ error: "Read-only mobile route disabled" });
      next();
    });
    app.use(express.json({ limit: "4kb", strict: true }));
    app.use((req, res, next) => {
      if (!options.remoteIdentity) return next();
      void options.remoteIdentity(req).then(async (email) => {
        const account = (await options.accounts()).find((a) => a.email === email);
        if (!account || account.disabled || account.remoteAccess !== true) throw new AccessError(403, "Remote access is not assigned to this identity");
        identities.set(req, email);
        next();
      }).catch(() => res.status(403).json({ error: "Verified remote identity and assigned access required" }));
    });
    if (administration) app.use("/api/fleet/admin", (req, res, next) => {
      void sessions.authenticate(tokenOf(req), false).then((auth) => {
        if (options.remoteIdentity && auth.email !== identities.get(req)) throw new AccessError(403, "Sign in with your verified remote email");
        next();
      }).catch((e) => res.status(e instanceof AccessError ? e.status : 503).json({ error: "Administrator session required" }));
    }, fleetAdminRouter({ sessions, accountsFile: options.adminAccountsFile, sites: broker.enrollments(), workspaceSites: new Set(options.desktopSites ?? []), origin: origin.origin, audit: options.audit, tokenOf }));
    const cookie = { path: remote ? "/" : "/mobile", secure: origin.protocol === "https:", httpOnly: true, sameSite: "strict", maxAge: 864e5 };
    const guarded = (fn) => (req, res) => {
      void (async () => {
        const token = tokenOf(req), auth = await sessions.authenticate(token, false);
        if (options.remoteIdentity && auth.email !== identities.get(req)) throw new AccessError(403, "Sign in with your verified remote email");
        const data = await fn(req, token, auth);
        await sessions.authenticate(token, false);
        res.json(data);
      })().catch((e) => res.status(e instanceof AccessError ? e.status : 503).json({ error: e instanceof AccessError ? e.message : "Mobile readings unavailable" }));
    };
    app.post("/api/fleet/login", (req, res) => {
      void (async () => {
        if (!req.body || Object.keys(req.body).sort().join(",") !== "email,password") throw new AccessError(400, "Email and password required");
        if (options.remoteIdentity && normalizeLocalEmail(req.body.email) !== identities.get(req)) throw new AccessError(403, "Sign in with your verified remote email");
        const login = await sessions.login(req.body.email, req.body.password, req.socket.remoteAddress ?? "unknown");
        try {
          await options.audit({ action: "mobile.login", outcome: "accepted" });
        } catch (e) {
          sessions.logout(login.token);
          throw e;
        }
        const previous = tokenOf(req);
        if (previous) sessions.logout(previous);
        if (remote) res.clearCookie(cookieName, { path: "/mobile", secure: true, httpOnly: true, sameSite: "strict" });
        res.cookie(cookieName, login.token, cookie).json({ authenticated: true });
      })().catch(async (e) => {
        await options.audit({ action: "mobile.login", outcome: "rejected" }).catch(() => {
        });
        res.status(e instanceof AccessError ? e.status : 503).json({ error: e instanceof AccessError ? e.message : "Sign-in unavailable" });
      });
    });
    app.get("/api/fleet/session", guarded(async (_req, _token, auth) => ({ email: auth.email, csrf: auth.csrf, idleExpiresAt: auth.idleExpiresAt, readOnly: true, remoteReadOnly: remote, administrator: administration && auth.administrator, workspaces: (options.desktopSites ?? []).filter((id) => allowedSiteIds(broker, auth.principal).has(id)).map((siteId) => ({ siteId, origin: "/desktop/" + encodeURIComponent(siteId) + "/" })), simulated: false, refreshIntervalMs: 5e3 })));
    app.get("/api/fleet/summary", guarded(async (_req, _token, auth) => {
      const view = broker.view(allowedSiteIds(broker, auth.principal));
      return { ...view, sites: view.sites.map((site) => {
        let mobileHvac = unavailableHvac();
        if (site.status === "current") mobileHvac = options.hvac(site.siteId);
        return { ...site, mobileHvac };
      }) };
    }));
    app.post("/api/fleet/touch", guarded(async (req, token, auth) => {
      sessions.checkCsrf(auth.csrf, req.headers["x-prizm-csrf"]);
      await sessions.authenticate(token, true);
      return { active: true };
    }));
    if (options.setup) app.post("/api/fleet/setup", (req, res) => {
      void options.setup(req.body, identities.get(req)).then((result) => res.json(result)).catch((e) => res.status(e instanceof AccessError ? e.status : 503).json({ error: e instanceof AccessError ? e.message : "Password setup unavailable" }));
    });
    app.post("/api/fleet/logout", (req, res) => {
      void (async () => {
        const token = tokenOf(req), auth = await sessions.authenticate(token, false);
        if (options.remoteIdentity && auth.email !== identities.get(req)) throw new AccessError(403, "Sign in with your verified remote email");
        sessions.checkCsrf(auth.csrf, req.headers["x-prizm-csrf"]);
        sessions.logout(token);
        await options.audit({ action: "mobile.logout", subject: auth.principal.subject, outcome: "accepted" });
        const { maxAge: _, ...clear } = cookie;
        res.clearCookie(cookieName, clear).json({ authenticated: false });
      })().catch((e) => res.status(e instanceof AccessError ? e.status : 503).json({ error: "Session ended or unavailable" }));
    });
    app.get("/", (_req, res) => {
      void readFile(path.resolve(options.publicDirectory, options.experience === "fleet" ? "fleet.html" : "mobile.html"), "utf8").then((html) => res.type("html").send(options.adaptiveExperience ? html.replace("<html", '<html data-prizm-adaptive="true"') : html)).catch(() => res.status(503).send("Workspace unavailable"));
    });
    app.get("/mobile.webmanifest", (_req, res) => res.type("application/manifest+json").json({ name: "GreEnergy PRIZM Mobile", short_name: "PRIZM", start_url: "/mobile/", scope: "/mobile/", display: "standalone", background_color: "#f5f7f5", theme_color: "#123c32", icons: [{ src: "/logo-transparent.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }] }));
    app.use((_req, res) => res.status(403).json({ error: "Read-only mobile route disabled" }));
    const errors = (_e, _req, res, _next) => {
      res.status(400).json({ error: "Invalid mobile request" });
    };
    app.use(errors);
    return app;
  }
  function fleetAdminRouter(options) {
    const router = Router({ caseSensitive: true, strict: true });
    const tokenOf2 = options.tokenOf ?? fleetSessionToken;
    router.use((req, res, next) => {
      void options.sessions.requireControl(tokenOf2(req)).then((auth) => {
        if (!auth.administrator) throw new AccessError(403, "Administrator access required");
        next();
      }).catch((e) => res.status(e instanceof AccessError ? e.status : 503).json({ error: e instanceof AccessError ? e.message : "Administration unavailable" }));
    });
    router.get("/users", (req, res) => {
      void listFleetAccounts(options.accountsFile).then(async (users) => {
        const auth = await options.sessions.requireControl(tokenOf2(req));
        if (!auth.administrator) throw new AccessError(403, "Administrator access required");
        res.json({ users, sites: options.sites.map((s) => ({ siteId: s.siteId, name: s.name, workspaceEnabled: options.workspaceSites.has(s.siteId) })) });
      }).catch((e) => res.status(e instanceof AccessError ? e.status : 503).json({ error: "Account listing unavailable" }));
    });
    router.post("/users", (req, res) => {
      void (async () => {
        if (req.headers.origin !== options.origin) throw new AccessError(403, "Same-origin request required");
        const token = tokenOf2(req), auth = await options.sessions.authenticate(token, false);
        options.sessions.checkCsrf(auth.csrf, req.headers["x-prizm-csrf"]);
        const { action, confirmationPassword } = parseAdminAction(req.body, options.workspaceSites);
        const confirmed = await options.sessions.confirmPassword(token, confirmationPassword);
        if (!confirmed.administrator) throw new AccessError(403, "Administrator access required");
        const event = {
          action: "fleet.account." + action.kind,
          subject: confirmed.principal.subject,
          targetEmail: action.email,
          ..."siteIds" in action ? { siteIds: action.siteIds } : {},
          ..."workspaceIds" in action ? { workspaceIds: action.workspaceIds } : {}
        };
        await options.audit({ ...event, outcome: "authorized" });
        const current = await options.sessions.requireControl(token);
        if (!current.administrator) throw new AccessError(403, "Administrator access required");
        let result;
        try {
          result = await manageFleetAccount(options.accountsFile, options.sites, action, { id: confirmed.principal.subject, version: confirmed.accountVersion });
        } catch (e) {
          if (e.code === "EEXIST") throw new AccessError(409, "Another account update is in progress");
          if (e.code) throw new AccessError(503, "Account storage unavailable");
          throw new AccessError(400, e instanceof Error ? e.message : "Account update rejected");
        }
        let auditRecorded = true;
        try {
          await options.audit({ ...event, outcome: "saved" });
        } catch {
          auditRecorded = false;
        }
        res.json({ saved: true, ...result, auditRecorded });
      })().catch((e) => res.status(e instanceof AccessError ? e.status : 503).json({ error: e instanceof AccessError ? e.message : "Administration unavailable" }));
    });
    return router;
  }
  return { createMobileApp, fleetAdminRouter };
};
