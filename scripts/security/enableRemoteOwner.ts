/** Fixed console-only opt-in; does not change passwords, grants or admin role. */
import {readPrivateJson,readAccounts} from '../../src/server/security/localAccounts';
import {manageFleetAccount} from '../../src/server/fleet/accountManagement';
import {parseCollector} from '../../src/server/fleet/CollectorPoller';
async function main(){
 const c=await readPrivateJson('/etc/prizm-fleet/fleet/fleet.json') as {accountsFile:string;collectors:unknown[]};
 const email='john.wilson@greenergyresources.com',a=(await readAccounts(c.accountsFile)).find(a=>a.email===email);
 if(!a||a.disabled||!a.fleetAdmin)throw Error('Expected active administrator not found');
 if(a.remoteAccess){console.log('Administrator read-only remote monitoring already enabled.');return;}
 await manageFleetAccount(c.accountsFile,c.collectors.map(c=>parseCollector(c,false)),{kind:'remote',email,remoteAccess:true});
 console.log('Administrator remote MOBILE monitoring enabled. Remote controls/admin remain unavailable. Sign in again; old sessions are revoked.');
}
void main().catch(()=>{console.error('Administrator remote opt-in failed; inspect configuration privately.');process.exitCode=1;});
