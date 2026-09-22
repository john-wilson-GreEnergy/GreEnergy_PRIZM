import assert from "node:assert/strict";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import ThermalResults from "./ThermalResults";
import ThermalHistoryReview from "./ThermalHistoryReview";
import type {HistoryDevice} from "../server/thermal/historyReview";

const devices:HistoryDevice[]=Array.from({length:26},(_,index)=>({
  id:`10.0.1.${10+Math.floor(index/2)*5}/hvac/${index%2+1}`,
  ip:`10.0.1.${10+Math.floor(index/2)*5}`,array:1,
  segment:`ES ${Math.floor(index/2)+1}`,unit:index%2+1,
  label:`Array 1 · ES ${Math.floor(index/2)+1} · HVAC ${index%2+1}`,
}));
const renderTargets=(open:boolean)=>renderToStaticMarkup(<ThermalResults
  devices={devices} units={[]} metric="space" selected={[devices[0].id]}
  onMetricChange={()=>{}}
  onSelection={()=>{}} onInspect={()=>{}} open={open} onOpenChange={()=>{}}
  findTarget={null}
/>);

const expanded=renderTargets(true);
assert.match(expanded,/Updating target list/,"Wait for server-ranked canonical targets before allowing selection");
assert.match(expanded,/disabled="">Add matching \(0\)/);
assert.match(expanded,/Target segment type/);
assert.match(expanded,/Collection segments only/);
assert.match(expanded,/Energy segments only/);
assert.match(expanded,/Highest 3 per array/);
assert.match(expanded,/cell temperature rate are not applicable/);

const collapsed=renderTargets(false);
assert.doesNotMatch(collapsed,/type="checkbox"|Search targets|<table/);
assert.match(collapsed,/Choose targets/);
assert.match(collapsed,/1 selected/);
assert.match(collapsed,/Targets and trends metric/,"Metric remains accessible with the target list collapsed");
assert.match(collapsed,/<option value="space" selected="">Enclosure temperature/);
assert.match(collapsed,/does not change the overhead map/);

const history=renderToStaticMarkup(<ThermalHistoryReview filters={{}} onApply={()=>{}} metric="space"/>);
assert.doesNotMatch(history,/type="checkbox"|Graph device|History device array|Select whole site/,
  "History filters must not duplicate target selection");
assert.match(history,/Advanced history filters/);
assert.doesNotMatch(history,/<details[^>]* open/);
console.log("Thermal target panel, pagination, archive fallback, and single-selector regressions passed");
