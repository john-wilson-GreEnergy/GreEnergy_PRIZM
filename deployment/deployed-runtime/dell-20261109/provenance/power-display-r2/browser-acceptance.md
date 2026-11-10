# Signed-in power display acceptance — 2026-11-09

Observed with test@example.com at approximately 14:43 PST after successful r2 activation. Read-only browser navigation and DOM/screenshot inspection; no equipment commands or settings changes.

All four direct site summaries passed: SS3 LAN (3444), SS4 LAN (3445), remote /desktop/solar-star-3/ and remote /desktop/solar-star-4/. Each showed SunSpec requested, PCS commanded, PCS measured and separately labeled Basic-operation target, sources, freshness and source/collection timestamps. Source and collection timestamps advanced during observation on all four views.

Example LAN observations: SS3 SunSpec 23,447.2 kW, PCS command 23,412 kW, PCS measured 23,488 kW; SS4 all three 0 kW. All three cards showed fresh evidence and both PCS cards showed 8/8 reports. Remote observations used nearby but different publication times: SS3 measured 23,494 kW while the command/request matched the example LAN values; SS4 remained zero with source/collection times advancing. Basic-operation target was 0 kW on both sites, source time explicitly Not supplied, with collection time present. SunSpec text correctly identifies app report time and states that original PPC command issue time is unavailable. No errors appeared in captured direct remote-site console logs.

LAN Fleet overview also showed both sites' new power cards. Remote Fleet landing page did not pass: it stayed at Awaiting fleet data and then showed Fleet connection unavailable. A second fresh remote Fleet page also remained awaiting its first summary during inspection. This is a remaining issue despite the successful direct remote site views; do not describe the entire remote Fleet experience as verified.

Separate SS4 context observed in the existing operating charts: Array 8 was out of rotation/Error and its older power-flow/chart coverage was 7/8 while the new source-separated EMS power cards reported 8/8 fresh readings. These are distinct displayed sources/validation paths; no change made or conclusion drawn about physical equipment health.
