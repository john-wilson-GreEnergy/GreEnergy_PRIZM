# PRIZM Connection Profile Switching QA Checklist & Test Sequence (ITER-004A Validation)

This manual QA test procedure validates the deterministic target profile switching, safe telemetry cache segregation, and detailed diagnostic metadata of the PRIZM-LAN-BESS client-only stack.

---

## 1. Environment Preparation

1. Verify that the PRIZM application is successfully built and running.
2. Ensure you have at least two saved connection profiles in **Connection Settings / Profile Manager**:
   - **Profile A**: The `default-local-ems` or first substation profile.
   - **Profile B**: A second profile with distinct IP fields (e.g., `10.0.0.40`), arbitrary `stationCode` (e.g., `BHE0040`), and `blockIndex: 2`.
3. Open two browser tabs or terminal commands evaluating:
   - PRIZM Interactive GUI
   - Raw JSON Endpoint `/api/local/block`
   - Diagnostic debug sources `/api/local/debug/sources`

---

## 2. Test Sequence

### Test Case 1: Initial State & Baseline Payload Verification
- **Action**: Access the dashboard with the initial active profile (Profile A).
- **Verification**:
  - Open `/api/local/block` in browser.
  - Verify that the response includes metadata fields:
    - `"activeProfileId": "default-local-ems"`
    - `"stationCode": "BHE0020"`
    - `"blockIndex": 1`
    - `"source": "demo"` (if Demo mode toggle is enabled) or `"live"` / `"offline"` / `"cached"` with correct metadata.

### Test Case 2: Unsaved Connection Test Isolations
- **Action**: Open the **Edit / Create Profile** form. Put arbitrary invalid credentials (e.g., IP `192.168.1.199` and port `9999`). Click **Test Connectivity**.
- **Verification**:
  - The audit reports raw connectivity failure or timeout.
  - Verify that the active profile on the main dashboard has **NOT** changed or been corrupted.
  - Verify that the telemetry cache remains active under Profile A.

### Test Case 3: Transition & Isolation Audit (Cache Segregation)
- **Action**: Switch/Activate to Profile B.
- **Verification**:
  - The active profile metadata updates **instantly**.
  - Refresh `/api/local/block`. Verify that `"activeProfileId"` immediately shows Profile B's ID.
  - Check `"source"` field:
    - It **MUST NOT** display cached data from Profile A as successful `"live"` or `"cached"` data.
    - If the physical device under Profile B is unreachable, `"source"` MUST transition to `"offline"` or `"stale"`.
    - `"lastError"` must indicate `"Telemetry cache profile mismatch or missing"` or `"unreachable"`, instead of persisting Profile A's successful values.
  - The telemetry variables are cleared and show empty state markers (`null` or fallback arrays) instead of leaking Profile A’s values.

### Test Case 4: Cache Ownership Diagnostics Verification
- **Action**: Fetch `/api/local/debug/sources` or view the **EMS LAN Diagnostics** tab.
- **Verification**:
  - Validate that the response tracks `cacheProfileId` and `cacheEmsBaseUrl`.
  - Validate that when a profile switch occurs, any cached parameters are marked invalid, preventing any cross-profile data leakage.
  - Validate that `lastSuccessAt` and `lastFailureAt` are populated correctly for each endpoint.

---

## 3. Post-QA Certification Marks

- [ ] **Single Active Profile Match**: Enforced strictly at schema store level.
- [ ] **Instant Cache Flushing**: Verified that profile swap nullifies older memory blocks.
- [ ] **Zero Cloud Telemetry Leakage**: Verified that no calls traverse towards `site-monitor.EMSservices.com`.
- [ ] **Strict Offline Execution Support**: The app compiles, runs, and enforces bounds fully offline on the technician laptop LAN.
