import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Indicator, { stringCommunicationStatus } from "./StringCommunicationIndicator";

assert.equal(stringCommunicationStatus({ communicating: false }), "lost");
assert.equal(stringCommunicationStatus({ bucket: "notCommunicating" }), "lost");
assert.equal(stringCommunicationStatus({ bucket: "offline", communicating: true }), "reported");
assert.equal(stringCommunicationStatus({}), "reported");
assert.equal(stringCommunicationStatus({ stale: true }), "stale");
assert.equal(stringCommunicationStatus({ communicating: false, sourceDebug: { canonicalStringSnapshot: { reason: "array communication count assigned this row not communicating" } } }), "unverified");
assert.match(renderToStaticMarkup(<Indicator row={{ communicating: false }}/>), /No communication/);
assert.equal(renderToStaticMarkup(<Indicator row={{ communicating: true }}/>), "");
console.log("String communication indicator tests passed");
