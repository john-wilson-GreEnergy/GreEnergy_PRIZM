const coordinator = require('./dist/src/server/prizmDataCoordinator');
console.log(coordinator.getLatestSnapshot().normalized.pcs.length);
