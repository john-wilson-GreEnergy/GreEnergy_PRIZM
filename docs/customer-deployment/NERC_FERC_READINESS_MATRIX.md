# NERC/FERC Readiness and Applicability Matrix

## Legal and compliance limitation

This is an engineering readiness matrix, not a legal opinion, certification, or finding of compliance. NERC applicability depends on the customer’s registered functions, asset classification under CIP-002, BES Cyber System impact rating, connectivity, architecture, ownership, operating procedures, and implementation evidence. The customer’s NERC compliance owner and counsel must make and retain the applicability determination. FERC approves and enforces Reliability Standards through the statutory framework; it does not issue a general software-product compliance certificate.

As of 2026-09-11, NERC’s official CIP index identifies the versions currently subject to enforcement and versions subject to future enforcement: https://www.nerc.com/standards/reliability-standards/cip

## Applicability questions required before design approval

1. Is the customer a NERC-registered entity, and under which functions?
2. Is the BESS part of the Bulk Electric System or otherwise within an applicable asset category?
3. What CIP-002 categorization and impact rating applies?
4. Will PRIZM be a BES Cyber Asset, Protected Cyber Asset, Electronic Access Control or Monitoring System, Physical Access Control System, or transient/supporting Cyber Asset?
5. Does the design create External Routable Connectivity, Low Impact External Routable Connectivity, Interactive Remote Access, an Electronic Access Point, or an Intermediate System?
6. Who owns operation, patching, identity, logging, incident response, evidence retention and supply-chain risk decisions?

## Engineering readiness matrix

| Standard/topic | Relevance to PRIZM deployment | Current evidence/gap | Release requirement |
|---|---|---|---|
| CIP-002 categorization | Determines downstream scope | Customer/site classification unknown | Written applicability and architecture determination |
| CIP-003 security management | Policies, low-impact controls, electronic access | Local-first design exists; customer controls not mapped | Approved cyber policy, access controls and evidence ownership |
| CIP-004 personnel/training | Authorized users and access lifecycle | Portal labels are not authenticated identities | Named accounts, training, authorization and revocation process |
| CIP-005 electronic perimeter/remote access | Remote control creates routable access concerns | No production remote-access boundary yet | Private access path, MFA, access enforcement, session control/logging, rapid termination |
| CIP-006 physical security | CL250 and supporting equipment | Installation protections unspecified | Customer-approved physical boundary and access records |
| CIP-007 system security management | Ports, services, patching, malware/authentication/logging | Express control routes currently lack server-side auth; global JSON limit is 50 MB | Hardened baseline, minimal services/ports, patch and vulnerability process, technical controls |
| CIP-008 incident response | Detection, classification, response and reporting | No customer incident playbook | Tested response plan, contacts, evidence export and reporting decision process |
| CIP-009 recovery | Recovery of applicable systems | Rollback exists in parts; full restore not proven | Backup, restoration procedure and documented exercise |
| CIP-010 configuration/change/vulnerability assessment | PRIZM can modify equipment and its own configuration | Audit exists by feature but no unified approved baseline | Baseline, authorized change workflow, integrity checks, vulnerability assessment and rollback evidence |
| CIP-011 information protection | Topology, credentials, logs and reports may be sensitive | Data classification and disposal undefined | Classification, encryption, access, retention and secure disposal controls |
| CIP-012 control-center communications | Applicability depends on use and endpoints | Not determined | Customer compliance determination; protect applicable communications |
| CIP-013 supply-chain risk | Software/vendor remote access and updates | No customer-facing vendor risk package/SBOM/signing policy | SBOM, provenance, signed releases, vulnerability notification, vendor access and procurement controls |
| CIP-015 future internal monitoring | May affect future high/medium environments | Architecture not instrumented for INSM | Track effective dates and preserve monitoring integration points |

## Current engineering disposition

**Red — customer remote control release blocked.** Principal blockers:

- No server-enforced identity/role authorization on the reviewed control routes.
- No approved remote-access architecture or customer access lifecycle.
- Control verification is not uniformly based on a fresh post-command authoritative acquisition.
- Contactor production path contains a localhost/mock fallback.
- Unified command transaction/audit integrity and off-host retention are incomplete.
- Customer asset categorization and applicable standard versions are unknown.
- Complete SBOM, signed distribution, vulnerability-management and recovery evidence are not yet packaged.

## Required signatories

- Customer NERC compliance owner
- Customer cybersecurity owner
- Site operations authority
- Asset owner/control-system owner
- PRIZM product/release owner
- Legal counsel where required by customer governance

