import assert from "assert";
import { compactFullArrayStringTargets } from "./controlTargetOptimizer";

const fullArray = Array.from({ length: 40 }, (_, index) => ({ array: 2, string: index + 1 }));
assert.deepStrictEqual(compactFullArrayStringTargets(fullArray, 40), [{ array: 2, allStrings: true }]);
const partial = [{ array: 2, string: 1 }, { array: 2, string: 2 }];
assert.deepStrictEqual(compactFullArrayStringTargets(partial, 40), partial);
assert.deepStrictEqual(compactFullArrayStringTargets([...fullArray, { array: 3, string: 2 }, { array: 3, string: 2 }], 40), [
  { array: 2, allStrings: true }, { array: 3, string: 2 },
]);
assert.deepStrictEqual(compactFullArrayStringTargets([{ array: 4, allStrings: true }, { array: 4, string: 1 }], 40), [{ array: 4, allStrings: true }]);
console.log("controlTargetOptimizer tests passed");
