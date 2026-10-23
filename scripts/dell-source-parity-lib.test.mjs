import assert from 'node:assert/strict';
import {canonicalFunction as c,definitions,compareFunction} from './dell-source-parity-lib.mjs';
assert.equal(c('function a(row) { const n=row.value; return {value:n}; }'),c('function b(row3) { const n5=row3.value; return {value:n5}; }'));
assert.equal(c('function a(value) { return {value}; }'),c('function b(value2) { return {value:value2}; }'));
assert.equal(c('function a(x) {return oldMapper(x)}',{oldMapper:'mapper'}),c('function b(y) {return mapper(y)}'));
for(const changed of ['return 16','return "15"','return datum.value','return other(value)','return {value2:value}','return value?.field']) {
  assert.notEqual(c('function f(value) {return value.field}'),c(`function f(value) {${changed}}`));
}
assert.notEqual(c('function f(x){return x>15}'),c('function f(x){return x>=15}'));
assert.notEqual(c('function f(x){return global1(x)}'),c('function f(x){return global2(x)}'));
assert.throws(()=>compareFunction(definitions('function f(){} function f(){}'),definitions('function f(){}'),'f'),/Exactly one/);
assert.throws(()=>compareFunction(definitions('function f(){return true}'),definitions('function f(){return false}'),'f'),/differs/);
console.log('PASS scoped AST comparison: lexical renames only; constants, free references, keys, guards and duplicate definitions remain significant');
