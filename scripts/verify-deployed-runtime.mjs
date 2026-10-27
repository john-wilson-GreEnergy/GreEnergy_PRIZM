import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyRuntime} from './deployed-runtime-lib.mjs';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = process.argv[2] ? path.resolve(process.argv[2]) : path.join(repo, 'deployment/deployed-runtime/dell-20261027');
const result = verifyRuntime(root);
console.log(`Verified ${result.files} exact archived files across ${result.releases} Dell release folders and dependency manifests.`);
console.log(`Last read-only live comparison: ${result.verifiedAt}. No application executed; no network used.`);
console.log('This verifies archived bytes, not source-build equivalence or installed dependency trees. See the snapshot README.');
