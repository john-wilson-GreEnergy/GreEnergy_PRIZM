/** Named legacy-brand gate for PRIZM-authored source and documentation.
 * Exact integration identifiers and unmodified source evidence are explicit exceptions.
 * This is not a license audit or a zero-mention claim for dependencies/history/runtime data.
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const forbidden=/powin|kobold|elexity/ig;
const integrationExceptions={
  'src/server/ems/java/BuildEmsAppEnableCommand.java':['com.powin.'],
  'src/server/telemetry/modbusOperationalTelemetry.ts':['PowinPCSExtensionReport','PowinArrayExtensionReport','ID Powin'],
  'src/server/knowledge/scanners/warScanner.ts':['com/powin/'],
  'src/server/deviceProvisioning/provisioningShared.ts':['hatchery_configure_feather_powin.sh'],
  'src/server/deviceProvisioning/provisioningWorkspaceValidator.ts':['hatchery_configure_feather_powin.sh'],
  'src/server/deviceProvisioning/featherProvisioningPlanner.ts':['hatchery_configure_feather_powin.sh','/etc/powin'],
  'provisioning/templates/hatchery/hatchery_configure_feather_powin.sh':['hatchery_configure_feather_powin.sh','/etc/powin'],
  'provisioning/templates/hatchery/hatchery_configure_tomcat_service.sh':['/etc/powin'],
  'provisioning/templates/hatchery/hatchery_start_cron_scripts.sh':['/etc/powin'],
  'provisioning/templates/hatchery/script_featherUpgradeSystem.sh':['/etc/powin'],
  'manual_setup.sh':['/home/powin/','hatchery_configure_feather_powin.sh'],
  'manual_hatchery.sh':['/home/powin/','hatchery_configure_feather_powin.sh'],
  // These inventories retain the exact classes and source paths of inspected equipment WARs.
  'docs/architecture/FEATHER_ENDPOINT_INVENTORY.md':['/FileTransfer/powin/','com/powin/'],
  'docs/architecture/feather-endpoints.csv':['com.powin.'],
  'docs/architecture/feather-endpoints.json':['com.powin.'],
  'docs/architecture/turtle-endpoints.csv':['com.powin.'],
  'docs/architecture/turtle-endpoints.json':['com.powin.'],
};
function remaining(file,text){for(const token of integrationExceptions[file]??[])text=text.split(token).join('');return text.match(forbidden)??[];}
assert.equal(remaining('src/components/example.tsx','Kobold').length,1);
assert.equal(remaining('src/server/ems/java/BuildEmsAppEnableCommand.java','com.powin.Example').length,0);
assert.equal(remaining('src/server/ems/java/BuildEmsAppEnableCommand.java','Powin marketing').length,1);
const files=[];
function walk(file){
  if(!fs.existsSync(file))return;
  const stat=fs.lstatSync(file);if(stat.isDirectory()){for(const entry of fs.readdirSync(file))walk(path.join(file,entry));}
  else if(stat.isFile())files.push(file);
}
for(const root of ['src','docs','app','home','provisioning/templates','AGENTS.md','server.ts','manual_setup.sh','manual_hatchery.sh','replace.js','fix_site_monitor.ts'])walk(root);
let exemptions=0;const failures=[];
for(const file of files){
  const text=fs.readFileSync(file,'utf8');
  if(remaining(file,text).length)failures.push(file+' (content)');
  if(file.match(forbidden)&&file!=='provisioning/templates/hatchery/hatchery_configure_feather_powin.sh')failures.push(file+' (path)');
  if(text.match(forbidden)&&!remaining(file,text).length)exemptions++;
}
if(failures.length){console.error('Unreviewed legacy branding:\n'+failures.join('\n'));process.exitCode=1;}
else console.log(`PASS named-brand gate: ${files.length} files; ${exemptions} files retain explicit integration/evidence exceptions. PRIZM branding retained.`);
