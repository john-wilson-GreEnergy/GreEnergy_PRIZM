# Remote Access Security Architecture

## Required architecture

```text
Approved managed device
  -> customer identity provider + phishing-resistant MFA
  -> private VPN / zero-trust access service
  -> site access enforcement point / jump tier
  -> HTTPS reverse proxy
  -> PRIZM bound to 127.0.0.1:3000
  -> allowlisted EMS/Feather endpoints
```

Do not port-forward TCP 3000, expose the CL250 directly, or provide remote users a general route to the control subnet.

## Required controls

### Identity and authorization

- Named individual accounts; no shared remote account.
- Customer-controlled identity lifecycle and MFA.
- Approved managed devices and revocable sessions.
- Server-side roles for read, diagnostic, operator-control, and administration permissions.
- Default deny on every mutation endpoint.
- Step-up authorization for contactor, rotation, balancing, EMS app, safety-clear, and privileged Feather operations.
- Emergency remote-access disable mechanism independent of PRIZM.

### Network

- PRIZM bound to localhost behind an HTTPS reverse proxy.
- Private address space and outbound-established remote tunnel where possible.
- Firewall allowlist for PRIZM-to-EMS/Feather flows.
- No arbitrary remote SSH or subnet routing for portal users.
- Separate administrative access from portal use.
- Record remote source identity, approved device, session and connection time.

### Application

- Secure, HTTP-only, same-site session cookies; session rotation and inactivity timeout.
- CSRF defense for state-changing requests.
- Request body limits substantially below the current global 50 MB default except on specifically justified upload routes.
- Rate limits for authentication and commands.
- Strict origin/host validation and security headers.
- Secrets held outside the repository and never returned to the browser after submission.
- Production feature flag that disables all command endpoints until site acceptance is signed.

### Logging and monitoring

- Time synchronized to the customer-approved source.
- Tamper-evident command and authentication records exported off the CL250.
- Alerts for failed login, privilege changes, remote session start/end, command failure/mismatch, configuration changes, audit interruption and clock drift.
- Customer-defined retention and review cadence.
- Ability to rapidly terminate vendor/user remote sessions.

## Availability and recovery

- Run PRIZM and the reverse proxy as supervised services with bounded restart behavior.
- Health and readiness probes must distinguish application health from EMS reachability.
- Encrypted configuration backup and tested restoration.
- Signed versioned release, checksum validation and documented rollback.
- Local operations must continue if remote access is unavailable.

## Deployment sequence

1. Establish customer ownership, site classification and data-flow diagram.
2. Harden the CL250 and apply customer endpoint-management requirements.
3. Install private remote access; approve only test identities/devices.
4. Deploy HTTPS proxy and keep PRIZM on localhost.
5. Enable server-side authentication and read-only authorization.
6. Run penetration, dependency, configuration and recovery testing.
7. Complete remote read-only site acceptance.
8. Complete each hardware control acceptance test locally.
9. Repeat approved tests through the remote path with on-site supervision.
10. Enable only the control permissions signed by the customer.

## Authoritative guidance

- CISA, *Primary Mitigations to Reduce Cyber Threats to Operational Technology*: https://www.cisa.gov/sites/default/files/2025-05/fact-sheet-primary-mitigations-to-reduce-cyber-threats-to-operational-technology-508c.pdf
- NERC current Reliability Standards index: https://www.nerc.com/standards/reliability-standards
- NERC CIP standards family and enforcement status: https://www.nerc.com/standards/reliability-standards/cip
- FERC Order No. 829 discusses monitoring/logging and rapid termination of vendor remote access: https://www.ferc.gov/sites/default/files/2020-05/E-8_28.pdf

