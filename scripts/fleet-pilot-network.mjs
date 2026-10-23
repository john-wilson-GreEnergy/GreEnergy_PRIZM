/** Linux staged Fleet network. Host remains SS3; only the explicitly enrolled SS4 NIC moves. */
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile,lstat,rename,unlink,chmod,open} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {realpathSync} from 'node:fs';
const exec=promisify(execFile);
const command=async(bin,args)=> (await exec(bin,args,{timeout:15000,maxBuffer:1024*1024})).stdout;
export function parsePlan(value) {
  const p=structuredClone(value);
  if(!p || !['dell-staged-pilot','veth-lab'].includes(p.mode))throw Error('Explicit pilot plan required');
  if(p.mode==='dell-staged-pilot') {
    if(p.parent!==null||p.prefix!=='prizm'||p.port!=='eno8403'||p.mac!=='c4:5a:b1:c9:2e:04'||p.hostLink!=='prizm-hub'||p.journal!=='/run/prizm-fleet-pilot/network.json')throw Error('Dell port enrollment differs');
  } else if(!/^prizm-stage-\d+$/.test(p.prefix)||p.parent!==p.prefix+'-parent'||p.port!=='port4'||p.mac!=='02:00:00:00:00:04'||p.hostLink!=='fleet-host')throw Error('Disposable lab plan required');
  if(!path.isAbsolute(p.journal)||p.originalAddress!=='192.168.1.16/16')throw Error('Invalid journal or original address');
  return p;
}
export const productionPlan=()=>parsePlan({mode:'dell-staged-pilot',parent:null,prefix:'prizm',port:'eno8403',mac:'c4:5a:b1:c9:2e:04',hostLink:'prizm-hub',journal:'/run/prizm-fleet-pilot/network.json',originalAddress:'192.168.1.16/16'});
const names=p=>({ss4:p.prefix+'-ss4',fleet:p.prefix+'-fleet'});
const ip=(args)=>command('ip',args);
const host=(p,args)=>ip([...(p.parent?['-n',p.parent]:[]),...args]);
const inside=(name,args)=>ip(['-n',name,...args]);
const execHost=(p,bin,args)=>p.parent?command('ip',['netns','exec',p.parent,bin,...args]):command(bin,args);
const nftHost=(p,rules)=>execHost(p,'nft',[rules]);
const nftNs=(n,rules)=>command('ip',['netns','exec',n,'nft',rules]);
// On a clean boot iproute2 may return no bytes when /run/netns is absent.
export function parseNamespaceList(output) {
  const value=output.trim()?JSON.parse(output):[];
  if(!Array.isArray(value))throw Error('Invalid namespace inventory');
  return value;
}
const exists=async name=>parseNamespaceList(await ip(['-j','netns','list'])).some(n=>n.name===name);
const links=async(p,name)=>JSON.parse(await (name?inside(name,['-j','-d','addr']):host(p,['-j','-d','addr'])));
const unmanaged='/run/systemd/network/00-prizm-ss4.network';
const unmanagedText='[Match]\nMACAddress=c4:5a:b1:c9:2e:04\n\n[Link]\nUnmanaged=yes\n';
async function save(p,s) {
  const f=await open(p.journal+'.new','w',0o600);
  try{await f.writeFile(JSON.stringify(s));await f.sync();}finally{await f.close();}
  await rename(p.journal+'.new',p.journal);
}
async function state(p) {
  const s=await lstat(p.journal);
  if(!s.isFile()||s.isSymbolicLink()||s.uid!==0||(s.mode&0o077))throw Error('Unsafe network journal');
  return JSON.parse(await readFile(p.journal,'utf8'));
}
async function checkDirectory(p) {
  const d=await lstat(path.dirname(p.journal));
  if(!d.isDirectory()||d.isSymbolicLink()||d.uid!==0||(d.mode&0o077))throw Error('Root private journal directory required');
}
export async function check(input) {
  const p=parsePlan(input);if(process.platform!=='linux'||process.getuid()!==0)throw Error('Linux root required');
  await checkDirectory(p);
  const all=await links(p),port=all.find(l=>l.ifname===p.port);
  if(!port||port.address!==p.mac||port.master||port.link_type!=='ether'||!port.flags.includes('UP')||
    (p.mode==='veth-lab'?port.linkinfo?.info_kind!=='veth':!!port.linkinfo?.info_kind)||
    JSON.stringify(port.addr_info.filter(a=>a.family==='inet').map(a=>a.local+'/'+a.prefixlen))!==JSON.stringify([p.originalAddress])||
    port.addr_info.some(a=>a.family==='inet6'&&a.scope!=='link'))throw Error('Port identity, type or original address changed');
  if(all.some(l=>l.ifname===p.hostLink))throw Error('Fleet host link already exists');
  for(const name of Object.values(names(p)))if(await exists(name))throw Error('Fleet namespace already exists');
  const routes=JSON.parse(await host(p,['-j','-4','route','show','table','all']));
  if(routes.some(r=>(r.dev===p.port&&!['kernel'].includes(r.protocol))||String(r.dst).startsWith('172.31.250.')))throw Error('Unexpected routes on pilot links');
  try{await nftHost(p,'list table inet prizm_fleet_pilot');throw Error('Fleet firewall already exists');}catch(e){if(!e.code)throw e;}
  if(p.mode==='dell-staged-pilot') {
    const ss3=all.find(l=>l.ifname==='eno8303');
    if(ss3?.address!=='c4:5a:b1:c9:2e:03'||!ss3.addr_info.some(a=>a.local==='10.0.0.15'&&a.prefixlen===16))throw Error('SS3 management identity changed');
    await command('systemctl',['is-active','systemd-networkd']);
    try{await lstat(unmanaged);throw Error('Network-manager override already exists');}catch(e){if(e.code!=='ENOENT')throw e;}
  }
  const ipv6Disabled=(await execHost(p,'sysctl',['-n',`net.ipv6.conf.${p.port}.disable_ipv6`])).trim();
  return {plan:p,port,ipv6Disabled,phase:'prepared',created:[],hostLink:false,firewall:false,unmanaged:false,moved:false};
}
export function hostRules(p) { return `table inet prizm_fleet_pilot {
 chain input { type filter hook input priority -10; policy accept;
 iifname "${p.hostLink}" ct state established,related accept
 iifname "${p.hostLink}" ip saddr 172.31.250.1 ip daddr 172.31.250.2 tcp dport 9443 accept
 iifname "${p.hostLink}" counter drop
 }
 chain forward { type filter hook forward priority -10; policy accept;
 iifname "${p.hostLink}" counter drop
 oifname "${p.hostLink}" counter drop
 }
 chain output { type filter hook output priority -10; policy accept;
 oifname "${p.hostLink}" ct state established,related accept
 oifname "${p.hostLink}" ip daddr 172.31.250.1 tcp dport 3443 accept
 oifname "${p.hostLink}" counter drop
 }
}`; }
export const fleetRules=`table inet prizm_fleet_pilot {
 chain input { type filter hook input priority 0; policy drop; iifname "lo" accept; ct state established,related accept; ip saddr {172.31.250.2,172.31.250.6} tcp dport 3443 accept; }
 chain output { type filter hook output priority 0; policy drop; oifname "lo" accept; ct state established,related accept; ip daddr {172.31.250.2,172.31.250.6} tcp dport 9443 accept; }
 chain forward { type filter hook forward priority 0; policy drop; counter drop; }
}`;
export function siteRules(p){return `table inet prizm_fleet_pilot {
 chain input { type filter hook input priority 0; policy drop;
 iifname "lo" accept
 ct state established,related accept
 iifname "${p.port}" ip saddr 10.0.0.0/16 ip daddr 10.0.0.15 tcp dport 3443 accept
 iifname "fleet0" ip saddr 172.31.250.5 tcp dport 9443 accept
 }
 chain output { type filter hook output priority 0; policy drop;
 oifname "lo" accept
 ct state established,related accept
 oifname "${p.port}" ip daddr 10.0.0.0/16 accept
 oifname "fleet0" ip daddr 172.31.250.5 tcp dport 3443 accept
 }
 chain forward { type filter hook forward priority 0; policy drop; counter drop; }
}`;}
export async function start(input,crash=false) {
  const s=await check(input),p=s.plan,n=names(p);
  try{if((await state(p)).phase!=='stopped')throw Error('Outstanding recovery journal');}catch(e){if(e.code!=='ENOENT')throw e;}
  await save(p,s);
  try {
    for(const name of [n.fleet,n.ss4]) {
      s.created.push(name);await save(p,s);await ip(['netns','add',name]);
      await command('ip',['netns','exec',name,'sysctl','-q','-w','net.ipv4.ip_forward=0','net.ipv6.conf.all.forwarding=0','net.ipv6.conf.all.disable_ipv6=1','net.ipv6.conf.default.disable_ipv6=1']);
      await inside(name,['link','set','lo','up']);
    }
    await nftNs(n.fleet,fleetRules);await nftNs(n.ss4,siteRules(p));
    s.firewall=true;await save(p,s);await nftHost(p,hostRules(p));
    s.hostLink=true;await save(p,s);
    await host(p,['link','add',p.hostLink,'type','veth','peer','name','ss3','netns',n.fleet]);
    await host(p,['addr','add','172.31.250.2/30','dev',p.hostLink]);
    await inside(n.fleet,['addr','add','172.31.250.1/30','dev','ss3']);
    await host(p,['link','set',p.hostLink,'up']);await inside(n.fleet,['link','set','ss3','up']);
    await inside(n.ss4,['link','add','fleet0','type','veth','peer','name','ss4','netns',n.fleet]);
    await inside(n.ss4,['addr','add','172.31.250.6/30','dev','fleet0']);
    await inside(n.fleet,['addr','add','172.31.250.5/30','dev','ss4']);
    await inside(n.ss4,['link','set','fleet0','up']);await inside(n.fleet,['link','set','ss4','up']);
    if(p.mode==='dell-staged-pilot') {
      // networkd runs without root privileges and must be able to read this
      // non-secret interface match. Private configuration remains owner-only.
      s.unmanaged=true;await save(p,s);await writeFile(unmanaged,unmanagedText,{flag:'wx',mode:0o644});
      await chmod(unmanaged,0o644);
      await command('networkctl',['reload']);
      let unmanagedReady=false;
      for(let attempt=0;attempt<10;attempt++) {
        if((await command('networkctl',['status',p.port,'--no-pager'])).includes('(unmanaged)')){unmanagedReady=true;break;}
        await new Promise(resolve=>setTimeout(resolve,500));
      }
      if(!unmanagedReady)throw Error('Network manager did not release SS4');
    }
    s.moved=true;await save(p,s);
    await host(p,['link','set',p.port,'netns',n.ss4]);
    if(crash&&p.mode==='veth-lab')process.kill(process.pid,'SIGKILL');
    await command('ip',['netns','exec',n.ss4,'sysctl','-q','-w',`net.ipv6.conf.${p.port}.disable_ipv6=1`]);
    await inside(n.ss4,['-4','addr','flush','dev',p.port]);
    await inside(n.ss4,['addr','add','10.0.0.15/16','dev',p.port]);
    await inside(n.ss4,['link','set',p.port,'up']);
    s.phase='active';await save(p,s);
  } catch(e){await stop(p);throw e;}
}
export async function stop(input) {
  const p=parsePlan(input);await checkDirectory(p);
  let s;try{s=await state(p);}catch(e){if(e.code==='ENOENT')return;throw e;}
  if(JSON.stringify(s.plan)!==JSON.stringify(p))throw Error('Recovery enrollment mismatch');
  if(s.phase==='stopped')return;
  const n=names(p);
  for(const name of s.created) {
    if(!Object.values(n).includes(name))throw Error('Unexpected namespace in journal');
    if(await exists(name)&&(await ip(['netns','pids',name])).trim())throw Error('Stop dependent Fleet services before returning ports');
  }
  if(s.moved) {
    let port=(await links(p)).find(l=>l.ifname===p.port);
    if(!port) {
      port=(await links(p,n.ss4)).find(l=>l.ifname===p.port);
      if(port?.address!==p.mac)throw Error('SS4 port identity changed');
      await inside(n.ss4,['link','set',p.port,'netns',p.parent||'1']);
    } else if(port.address!==p.mac)throw Error('Host port identity changed');
    await host(p,['-4','addr','flush','dev',p.port]);
    await host(p,['addr','add',p.originalAddress,'dev',p.port]);
    if(!['0','1'].includes(s.ipv6Disabled))throw Error('Invalid original IPv6 setting');
    await execHost(p,'sysctl',['-q','-w',`net.ipv6.conf.${p.port}.disable_ipv6=${s.ipv6Disabled}`]);
    await host(p,['link','set',p.port,'up']);
  }
  if(s.unmanaged) {
    try {if(await readFile(unmanaged,'utf8')!==unmanagedText)throw Error('Network override changed; refusing removal');await unlink(unmanaged);}catch(e){if(e.code!=='ENOENT')throw e;}
    await command('networkctl',['reload']);await command('networkctl',['reconfigure',p.port]);
  }
  if(s.hostLink) {
    const l=(await links(p)).find(l=>l.ifname===p.hostLink);
    if(l){if(l.linkinfo?.info_kind!=='veth')throw Error('Unexpected host link type');await host(p,['link','delete',p.hostLink]);}
  }
  for(const name of [...s.created].reverse())if(await exists(name)) {
    const remaining=(await links(p,name)).filter(l=>l.ifname!=='lo');
    if(remaining.some(l=>!['fleet0','ss3','ss4'].includes(l.ifname)||l.linkinfo?.info_kind!=='veth'))throw Error('Unexpected namespace interface; refusing deletion');
    await ip(['netns','delete',name]);
  }
  if(s.firewall) {
    try{await nftHost(p,'list table inet prizm_fleet_pilot');}catch(e){if(e.code){s.firewall=false;}else throw e;}
    if(s.firewall)await nftHost(p,'delete table inet prizm_fleet_pilot');
  }
  s.phase='stopped';await save(p,s);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(realpathSync(process.argv[1])).href) {
  const [action,planFile,flag]=process.argv.slice(2);
  (async()=>{
    if(!['check','start','stop'].includes(action)||!planFile)throw Error('Use check|start|stop PLAN.json');
    const p=parsePlan(JSON.parse(await readFile(planFile,'utf8')));
    if(flag&&!(flag==='--crash'&&p.mode==='veth-lab'&&action==='start'))throw Error('Invalid test option');
    await ({check,start:()=>start(p,flag==='--crash'),stop:()=>stop(p)})[action](p);
    console.log(`Fleet staged network ${action} complete`);
  })().catch(e=>{console.error(e.message);process.exitCode=1;});
}
