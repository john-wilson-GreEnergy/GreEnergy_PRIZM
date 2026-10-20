import {validateStreamConfig,type SmaStreamConfig} from '../../src/server/telemetry/sma/streamConfig';

// No file/network access. Shared credentials are limited to one site and role.
export async function collectSmaPasswords(config:SmaStreamConfig,shared:boolean,ask:(label:string)=>Promise<string>):Promise<SmaStreamConfig>{
  validateStreamConfig(config);
  if(shared&&new Set(config.targets.map(t=>t.userLevel)).size!==1)throw Error('Shared enrollment requires one login role');
  const targets=config.targets.map(t=>({...t}));
  const groups=shared?[targets]:targets.map(t=>[t]);
  for(const group of groups){
    const role=group[0].userLevel===0?'User':'Installer';
    const label=shared?`${config.stationCode}/${config.blockCode} shared ${role} password for ${group.length} inverters (hidden): `:`Array ${group[0].array} SMA ${role} password (hidden): `;
    const password=await ask(label),repeated=await ask('Repeat password (hidden): ');
    if(!password||password.length>256||password!==repeated)throw Error('Password validation failed');
    for(const target of group)target.password=password;
  }
  return validateStreamConfig({...config,targets});
}
