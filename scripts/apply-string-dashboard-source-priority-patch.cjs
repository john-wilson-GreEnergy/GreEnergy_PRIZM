#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const target = path.join(process.cwd(), 'src/server/stringsDashboard.ts');
let src = fs.readFileSync(target, 'utf8');

function replaceOnce(label, from, to) {
  if (!src.includes(from)) {
    throw new Error(`Patch anchor not found: ${label}`);
  }
  src = src.replace(from, to);
}

replaceOnce(
  'fresh detail helpers',
  `export const getCachedStringDetail = (arrayNumber: number, stringNumber: number) => {\n    return stringDetailCache.get(getStringDetailCacheKey(arrayNumber, stringNumber)) ?? null;\n};\n`,
  `export const getCachedStringDetail = (arrayNumber: number, stringNumber: number) => {\n    return stringDetailCache.get(getStringDetailCacheKey(arrayNumber, stringNumber)) ?? null;\n};\n\nfunction getFreshStringDetail(arrayNumber: number, stringNumber: number, maxAgeMs = 60_000) {\n    const detail = getCachedStringDetail(arrayNumber, stringNumber);\n    if (!detail || !detail.ok) return null;\n    const updated = new Date(detail.lastUpdated).getTime();\n    if (!Number.isFinite(updated)) return null;\n    if (Date.now() - updated > maxAgeMs) return null;\n    return detail;\n}\n\nfunction getReportTimestamp(value: any): string | null {\n    return value?.reportTimestamp ?? value?.timeStamp ?? value?.timestamp ?? value?.timestampUtc ?? value?.DateTime ?? value?.datetime ?? null;\n}\n`
);

replaceOnce(
  'fresh detail usage',
  `            // 1. Existing string detail cache/report data, if already available and fresh\n            const detail = getCachedStringDetail(a, s);\n            const detailStringData = detail?.data?.stringData ?? detail?.data ?? null;\n`,
  `            // 1. Existing string detail cache/report data, only while fresh.\n            // Stale detail rows must not override live last-call/block summary values.\n            const detail = getFreshStringDetail(a, s);\n            const detailStringData = detail?.data?.stringData ?? detail?.data ?? null;\n`
);

replaceOnce(
  'metric source priority',
  `                if (detailStringData) candidates.push(detailStringData);\n                if (blockStrBase) candidates.push(blockStrBase);\n                if (lcStrBase) candidates.push(lcStrBase);\n                if (stringsCsvRow) candidates.push(stringsCsvRow);\n                if (sIpInfo) candidates.push(sIpInfo);\n`,
  `                if (detailStringData) candidates.push(detailStringData);\n                if (lcStrBase) candidates.push(lcStrBase);\n                if (blockStrBase) candidates.push(blockStrBase);\n                if (stringsCsvRow) candidates.push(stringsCsvRow);\n                if (sIpInfo) candidates.push(sIpInfo);\n`
);

replaceOnce(
  'connection state priority',
  `            } else if (detailStringData?.stringConnectionState !== undefined && detailStringData?.stringConnectionState !== null) {\n                rawStringConnectionState = detailStringData.stringConnectionState;\n            } else if (detailStringData?.connectionState !== undefined && detailStringData?.connectionState !== null) {\n                rawStringConnectionState = detailStringData.connectionState;\n            } else {\n                rawStringConnectionState = getMetricValue(["stringconnectionstate", "connectionstate"]);\n            }\n`,
  `            } else if (detailStringData?.stringConnectionState !== undefined && detailStringData?.stringConnectionState !== null) {\n                rawStringConnectionState = detailStringData.stringConnectionState;\n            } else if (detailStringData?.connectionState !== undefined && detailStringData?.connectionState !== null) {\n                rawStringConnectionState = detailStringData.connectionState;\n            } else if (lcStrBase?.stringConnectionState !== undefined && lcStrBase?.stringConnectionState !== null) {\n                rawStringConnectionState = lcStrBase.stringConnectionState;\n            } else if (lcStrBase?.connectionState !== undefined && lcStrBase?.connectionState !== null) {\n                rawStringConnectionState = lcStrBase.connectionState;\n            } else {\n                rawStringConnectionState = getMetricValue(["stringconnectionstate", "connectionstate"]);\n            }\n`
);

replaceOnce(
  'contactor state priority',
  `            } else if (detailStringData?.stringContactorState !== undefined && detailStringData?.stringContactorState !== null) {\n                rawStringContactorState = detailStringData.stringContactorState;\n            } else {\n                rawStringContactorState = getMetricValue(["stringcontactorstate", "contactorstate", "contactorstatus"]);\n            }\n`,
  `            } else if (detailStringData?.stringContactorState !== undefined && detailStringData?.stringContactorState !== null) {\n                rawStringContactorState = detailStringData.stringContactorState;\n            } else if (lcStrBase?.stringContactorState !== undefined && lcStrBase?.stringContactorState !== null) {\n                rawStringContactorState = lcStrBase.stringContactorState;\n            } else {\n                rawStringContactorState = getMetricValue(["stringcontactorstate", "contactorstate", "contactorstatus"]);\n            }\n`
);

replaceOnce(
  'contactor explicit feedback priority',
  `            let positiveContactorClosed: boolean | null = null;\n            let negativeContactorClosed: boolean | null = null;\n            const contactorStateUpper = String(rawStringContactorState || "").toUpperCase().trim();\n            if (contactorStateUpper === "CLOSED") {\n                positiveContactorClosed = true;\n                negativeContactorClosed = true;\n            } else if (contactorStateUpper === "OPEN") {\n                positiveContactorClosed = false;\n                negativeContactorClosed = false;\n            } else {\n                // fallback\n                positiveContactorClosed = parseNullableBool(getMetricValue(["positivecontactorclosed", "positive_contactor_closed"]));\n                negativeContactorClosed = parseNullableBool(getMetricValue(["negativecontactorclosed", "negative_contactor_closed"]));\n            }\n            const contactorClosed = positiveContactorClosed === true && negativeContactorClosed === true;\n            const contactorStatus = contactorClosed ? "CLOSED" : "OPEN";\n`,
  `            let positiveContactorClosed: boolean | null = null;\n            let negativeContactorClosed: boolean | null = null;\n            let contactorResolutionSource = "unresolved";\n\n            const readExplicitContactors = (obj: any) => {\n                if (!obj) return null;\n                const p = parseNullableBool(obj.positiveContactorClosed ?? obj.positive_contactor_closed ?? obj.PositiveContactorClosed);\n                const n = parseNullableBool(obj.negativeContactorClosed ?? obj.negative_contactor_closed ?? obj.NegativeContactorClosed);\n                if (p === null && n === null) return null;\n                return { p, n };\n            };\n\n            const arrayStringData = arrayRep?.stringReport?.[s]?.stringData ?? arrayRep?.stringReport?.[\`string\${s}\`]?.stringData ?? null;\n            const explicitCandidates = [\n                { source: "array-report", value: readExplicitContactors(arrayStringData) },\n                { source: "fresh-string-detail", value: readExplicitContactors(detailStringData) },\n                { source: "last-call", value: readExplicitContactors(lcStrBase) },\n                { source: "block-summary-fallback", value: readExplicitContactors(blockStrBase) },\n                { source: "strings-csv-fallback", value: readExplicitContactors(stringsCsvRow) },\n            ];\n            const explicitWinner = explicitCandidates.find(c => c.value !== null);\n\n            if (explicitWinner?.value) {\n                positiveContactorClosed = explicitWinner.value.p;\n                negativeContactorClosed = explicitWinner.value.n;\n                contactorResolutionSource = explicitWinner.source;\n            } else {\n                const contactorStateUpper = String(rawStringContactorState || "").toUpperCase().trim();\n                if (contactorStateUpper === "CLOSED") {\n                    positiveContactorClosed = true;\n                    negativeContactorClosed = true;\n                    contactorResolutionSource = "contactor-state-fallback";\n                } else if (contactorStateUpper === "OPEN") {\n                    positiveContactorClosed = false;\n                    negativeContactorClosed = false;\n                    contactorResolutionSource = "contactor-state-fallback";\n                }\n            }\n\n            const contactorClosed = positiveContactorClosed === true && negativeContactorClosed === true;\n            const contactorStatus = positiveContactorClosed === null && negativeContactorClosed === null ? "UNKNOWN" : (contactorClosed ? "CLOSED" : "OPEN");\n`
);

replaceOnce(
  'source debug in pushed row',
  `                sourceCoverage: {\n                    stringsCsv: !!stringsCsvRow,\n                    lastCall: !!lcStrBase,\n                    stringIpMap: !!sIpInfo,\n                    ipMap: !!ipMapWrapper.data,\n                    blockviewer: !!blockStrBase,\n                    controllerStatistics: false,\n                    bessStatusCodes: false,\n                },\n                raw: rawSources\n`,
  `                sourceCoverage: {\n                    stringsCsv: !!stringsCsvRow,\n                    lastCall: !!lcStrBase,\n                    stringIpMap: !!sIpInfo,\n                    ipMap: !!ipMapWrapper.data,\n                    blockviewer: !!blockStrBase,\n                    controllerStatistics: false,\n                    bessStatusCodes: false,\n                },\n                sourceDebug: {\n                    contactorResolution: {\n                        finalSource: contactorResolutionSource,\n                        candidates: [\n                            { source: "array-report", present: !!arrayStringData },\n                            { source: "fresh-string-detail", present: !!detailStringData, lastUpdated: detail?.lastUpdated ?? null },\n                            { source: "last-call", present: !!lcStrBase },\n                            { source: "block-summary-fallback", present: !!blockStrBase },\n                            { source: "strings-csv-fallback", present: !!stringsCsvRow }\n                        ],\n                        final: { positiveContactorClosed, negativeContactorClosed, contactorsCloseExpected }\n                    },\n                    sourceTimestamps: {\n                        detailLastUpdated: detail?.lastUpdated ?? null,\n                        lastCallTimestamp: getReportTimestamp(lcStrBase),\n                        blockTimestamp: getReportTimestamp(blockStrBase),\n                        rowTimestamp: timestampUtc\n                    }\n                },\n                raw: rawSources\n`
);

replaceOnce(
  'preserve sourceDebug through canonical merge',
  `            conflicts: []\n        }\n    };\n`,
  `            conflicts: [],\n            contactorResolution: s.sourceDebug?.contactorResolution ?? null,\n            sourceTimestamps: s.sourceDebug?.sourceTimestamps ?? null\n        }\n    };\n`
);

fs.writeFileSync(target, src);
console.log('Patched src/server/stringsDashboard.ts');
