import assert from 'node:assert/strict';
import {fleetOverride,keysService,keysTimer,tunnelService} from './remoteServiceTemplates.mjs';
assert.match(fleetOverride,/Group=prizm-remote/);assert.match(fleetOverride,/RuntimeDirectoryMode=0710/);assert.match(fleetOverride,/RuntimeDirectoryPreserve=no/);
assert(!fleetOverride.includes('NetworkNamespacePath'));assert(!fleetOverride.includes('prizm-site'));
assert.match(tunnelService,/User=prizm-tunnel/);assert.match(tunnelService,/IPAddressDeny=any/);assert.match(tunnelService,/--token-file/);assert(!tunnelService.includes('--token '));
assert.match(tunnelService,/InaccessiblePaths=\/etc\/prizm-fleet \/var\/lib\/prizm-fleet/);
assert.match(keysService,/User=prizm-keyfetch/);assert.match(keysService,/NoNewPrivileges=yes/);assert.match(keysTimer,/OnUnitActiveSec=1h/);
console.log('PASS remote service identities, fixed socket lifecycle, public-key timer and tunnel IP isolation');
