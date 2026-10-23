import assert from 'node:assert/strict';
import {parse} from '@babel/parser';
import traverseModule from '@babel/traverse';
import generateModule from '@babel/generator';
const traverse = traverseModule.default ?? traverseModule;
const generate = generateModule.default ?? generateModule;

// Compare selected function definitions without executing a production bundle.
// Local binding names and formatting are immaterial; literals, property keys,
// free references and control flow must match. This is not whole-program proof.
export function definitions(text) {
  const result = new Map();
  traverse(parse(text, {sourceType:'unambiguous'}), {
    FunctionDeclaration(p) {
      const name = p.node.id?.name;
      if (name) result.set(name, [...(result.get(name) ?? []), text.slice(p.node.start,p.node.end)]);
    },
  });
  return result;
}

export function canonicalFunction(text, aliases = {}) {
  const ast = parse(text);
  const bindings = new Set();
  traverse(ast, {
    enter(p) { delete p.node.extra; },
    Scopable(p) { for (const binding of Object.values(p.scope.bindings)) bindings.add(binding); },
    ReferencedIdentifier(p) {
      if (!p.scope.hasBinding(p.node.name) && Object.hasOwn(aliases,p.node.name)) p.node.name = aliases[p.node.name];
    },
  });
  const ordered = [...bindings].sort((a,b)=>a.identifier.start-b.identifier.start);
  assert(!text.includes('__parityBinding'), 'Reserved canonical binding name');
  ordered.forEach((binding,index)=>binding.scope.rename(binding.identifier.name,`__parityBinding${index}`));
  traverse(ast,{ObjectProperty(p){p.node.shorthand=false;}});
  return generate(ast,{compact:true,comments:false}).code;
}

export function compareFunction(deployed,current,name,{deployedName=name,aliases={}}={}) {
  const a=deployed.get(deployedName), b=current.get(name);
  assert.equal(a?.length,1,`Exactly one deployed definition required: ${deployedName}`);
  assert.equal(b?.length,1,`Exactly one source-build definition required: ${name}`);
  assert.equal(canonicalFunction(b[0]),canonicalFunction(a[0],aliases),`Production/source function differs: ${name}`);
  return name;
}
