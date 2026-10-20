import React from 'react';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {StringListRow, MemoStringListRow, rowCommunicationState, type StringListRowProps} from './StringListRow';

const now=Date.parse('2026-09-25T12:00:00Z');
const row={id:'a1s2',arrayNumber:1,stringNumber:2,timestampUtc:new Date(now).toISOString(),
  communicating:true, bucket:'online',measuredVoltage:0,amps:0,kw:0,socPct:0,
  positiveContactorClosed:false,negativeContactorClosed:false,contactorsCloseExpected:false,
  balanceTelemetryAvailable:true,balanceCount:1,balanceActivity:'Charging',balanceMode:'Provided',
  balanceDetails:[{bpIndex:1,mode:'Provided (3300)',displayState:'Charging',balancingCellGroup:5,balanceTelemetryPresent:true}]};
assert.equal(rowCommunicationState(row,now+300000),'fresh');
assert.equal(rowCommunicationState(row,now+300001),'delayed');
assert.equal(rowCommunicationState({...row,communicating:false},now),'lost');
assert.equal(rowCommunicationState({...row,stale:true},now),'delayed');
assert.equal(rowCommunicationState({...row,timestampUtc:null},now),'delayed');
assert.equal(rowCommunicationState({...row,sampleAgeMs:120001},now),'delayed');
const opened:unknown[]=[]; const toggled:unknown[]=[];let stopped=0;
const props:StringListRowProps={s:row,isArrFirst:true,isArrAllSelected:false,isArrIndeterminate:true,
  selected:true,arraySelectionIds:JSON.stringify(['a1s2','a1s3']),commState:'fresh',
  onOpen:value=>opened.push(value),onToggleRow:id=>toggled.push(id),onToggleArray:ids=>toggled.push(ids)};
const markup=renderToStaticMarkup(<table><tbody><StringListRow {...props}/></tbody></table>);
assert.match(markup,/BPC 1: Provided \(3300\) \| Charging \| CG 5/);
assert.match(markup,/Request: OPEN \| Positive actual: OPEN \(matches\)/);
assert.match(markup,/0%/);assert.match(markup,/Comm: FRESH/);assert.match(markup,/checked=""/);
assert.equal(markup,renderToStaticMarkup(<table><tbody><MemoStringListRow {...props}/></tbody></table>));
assert.notEqual(markup,renderToStaticMarkup(<table><tbody><StringListRow {...props} commState="delayed"/></tbody></table>));
const element=StringListRow(props);
element.props.onClick();assert.equal(opened[0],row);
function visit(node:React.ReactNode):React.ReactElement<Record<string,unknown>>[] {
  if(!React.isValidElement<Record<string,unknown>>(node))return [];
  return [node,...React.Children.toArray(node.props.children as React.ReactNode).flatMap(visit)];
}
const checks=visit(element).filter(node=>node.type==='input');
assert.equal(checks.length,2);
for(const input of checks)(input.props.onClick as (e:{stopPropagation:()=>void})=>void)({stopPropagation:()=>{stopped++;}});
assert.deepEqual(toggled,[['a1s2','a1s3'],'a1s2']);assert.equal(stopped,2);
assert.equal(MemoStringListRow.type,StringListRow);
console.log('String row: markup, balancing, zero values, selection callbacks, communication ageing and memo parity passed');
