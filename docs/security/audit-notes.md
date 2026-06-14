# Audit Advisory Notes

## Advisory: `esbuild` / `vite` (GHSA-gv7w-rqvm-qjhr, GHSA-g7r4-m6w7-qqqr)

`npm audit` reports high serverity vulnerabilities in `esbuild` versions `0.17.0` - `0.28.0`. The suggested fix is to force an upgrade to `esbuild@0.28.1`. 

### Remediation Status: Postponed

The current forced upgrade to `esbuild@0.28.1` is incompatible with the current Vite build target. If applied, it breaks the current Vite production build with errors such as:

```
[vite:esbuild-transpile] Transform failed
Transforming destructuring to the configured target environment ... is not supported yet
```

**Context**:
PRIZM production uses built static assets and Node server output. We do not expose a Vite development server to external or untrusted traffic in the production runtime.

**Action**:
Do not run `npm audit fix --force`. The advisory should be revisited during a planned Vite/toolchain upgrade where the entire build and target configuration can be safely adapted.
