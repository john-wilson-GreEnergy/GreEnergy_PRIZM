/** Read only the installed frontend's static import graph. Dynamic history and
 * equipment-detail modules stay lazy. No telemetry, identities or tokens here. */
export function stringStartupHtml(html:string,assets:Pick<ReadonlyMap<string,string>,'get'>):string|null {
  if(!html.includes('</head>'))return null;
  const scripts=[...html.matchAll(/<script\b[^>]*\bsrc="\/assets\/([A-Za-z0-9_.-]+\.js)"/g)].map(m=>m[1]);
  const candidates=new Set(scripts.flatMap(file=>[...(assets.get(file)??'').matchAll(/\bStringDashboard-[A-Za-z0-9_.-]+\.js\b/g)].map(m=>m[0])));
  if(candidates.size!==1)return null; // Older/ambiguous releases retain normal loading.
  const seen=new Set<string>();
  const visit=(file:string):boolean=>{
    if(seen.has(file))return true;
    const source=assets.get(file);
    if(source===undefined||seen.size>=128)return false;
    seen.add(file);
    for(const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*)["']\.\/([A-Za-z0-9_.-]+\.js)["']/g))if(!visit(match[1]))return false;
    return true;
  };
  if(!visit([...candidates][0]))return null;
  const existing=new Set([...html.matchAll(/(?:src|href)="\/assets\/([A-Za-z0-9_.-]+\.js)"/g)].map(m=>m[1]));
  const links=[...seen].filter(file=>!existing.has(file)).map(file=>`<link rel="modulepreload" crossorigin href="/assets/${file}">`);
  return links.length?html.replace('</head>',links.join('\n')+'\n</head>'):null;
}

export function isStringStartupRequest(url:string):boolean {
  const query=new URL(url,'https://workspace.invalid').searchParams;
  return query.getAll('tab').length===1&&query.get('tab')==='arrays-strings';
}
