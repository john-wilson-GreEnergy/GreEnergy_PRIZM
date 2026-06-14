const fs = require('fs');
let code = fs.readFileSync('src/components/StringDashboard.tsx', 'utf-8');
const S1 = `<td className={}`;
const S2 = `<span className="text-prizm-primary font-mono font-bold">`;
const REP = `<td className={}>
<div className="flex items-center justify-center gap-1.5 w-full" onClick={e => e.stopPropagation()}>
<input type="checkbox" checked={selectedIds.has(s.id)} onChange={(e) => { const next = new Set(selectedIds); if (e.target.checked) next.add(s.id); else next.delete(s.id); setSelectedIds(next); }} className="accent-prizm-primary h-3.5 w-3.5 min-w-[14px]" />
{isArrFirst ? ( <input type="checkbox" checked={isArrAllSelected} ref={el => { if (el) el.indeterminate = isArrIndeterminate; }} onChange={(e) => { const next = new Set(selectedIds); arrStrings.forEach((st) => { if (e.target.checked) next.add(st.id); else next.delete(st.id); }); setSelectedIds(next); }} className="accent-prizm-primary h-3.5 w-3.5 min-w-[14px] opacity-60 hover:opacity-100 outline outline-1 outline-offset-1 outline-prizm-border" title="Select/Deselect Entire Array" /> ) : <div className="w-3.5 min-w-[14px]" />}</div></td>
<td className={} title={s.warningCount > 0 || s.alarmCount > 0 ?  : ""}><span className="text-prizm-primary font-mono font-bold">`;
const rx = new RegExp(S1.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&') + '.*?' + S2.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&'), 'm');
code = code.replace(rx, REP);
fs.writeFileSync('src/components/StringDashboard.tsx', code);