import fs from 'fs';

let stringFile = fs.readFileSync('src/components/StringDashboard.tsx', 'utf8');

// The thead part:
stringFile = stringFile.replace(
  /<th className="px-3 py-2 border-b border-prizm-border font-bold sticky top-0 left-0 bg-prizm-surface-strong z-\[80\] w-\[30px\]"><\/th>[\s\S]*?<th className="px-3 py-2 border-b border-prizm-border sticky top-0 bg-prizm-surface-strong z-\[50\]">Contactors<\/th>/,
  `<th className="px-2 py-2 border-b border-prizm-border sticky top-0 left-0 bg-prizm-surface-strong z-[80] w-[30px]"></th>
                  <th className="px-3 py-2 border-b border-prizm-border font-bold sticky top-0 left-[30px] bg-prizm-surface-strong z-[80] whitespace-nowrap min-w-[54px] sm:min-w-[64px]">ARR</th>
                  <th className="px-2 py-2 border-b border-prizm-border sticky top-0 left-[84px] sm:left-[94px] bg-prizm-surface-strong z-[80] w-[30px]"></th>
                  <th className="px-3 py-2 border-b border-prizm-border font-bold sticky top-0 left-[114px] sm:left-[124px] bg-prizm-surface-strong z-[80] whitespace-nowrap min-w-[48px]">STR</th>
                  <th className="px-3 py-2 border-b border-prizm-border sticky top-0 bg-prizm-surface-strong z-[50]">Contactors</th>`
);

let tbodyRow = stringFile.substring(
    stringFile.indexOf('<tr key={s.id}'),
    stringFile.indexOf('<td className="px-3 py-1.5">', stringFile.indexOf('<td className="px-3 py-1.5 border-r border-prizm-border/20 sticky left-[84px]'))
);

let newTbodyRow = `
<td className={"px-2 py-1.5 border-r border-prizm-border/10 sticky left-0 group-hover:bg-prizm-surface-strong bg-prizm-surface z-20 text-center " + borderClass}>
   {isArrFirst ? (
     <input type="checkbox" className="accent-prizm-primary w-3 h-3 cursor-pointer" 
       checked={isArrAllSelected}
       ref={el => { if(el) el.indeterminate = isArrIndeterminate; }}
       onChange={() => {}}
       onClick={(e) => {
         e.stopPropagation();
         const arrStrings = filtered.filter((fs:any) => fs.arrayNumber === s.arrayNumber);
         const allSelected = arrStrings.every((fs:any) => selectedIds.has(fs.id));
         const next = new Set(selectedIds);
         if (allSelected) {
             arrStrings.forEach((fs:any) => next.delete(fs.id));
         } else {
             arrStrings.forEach((fs:any) => next.add(fs.id));
         }
         setSelectedIds(next);
       }} 
     />
   ) : null}
</td>
<td className="px-3 py-1.5 border-r border-prizm-border/20 sticky left-[30px] group-hover:bg-prizm-surface-strong bg-prizm-surface z-20 min-w-[54px] sm:min-w-[64px]" title={s.warningCount > 0 || s.alarmCount > 0 ? \`Warnings: \${(s.warnings||[]).join(", ")} | Alarms: \${(s.alarms||[]).join(", ")}\` : ""}>
   {isArrFirst ? <span className="text-prizm-primary font-mono font-bold">{s.arrayNumber}</span> : null}
</td>
<td className="px-2 py-1.5 border-r border-prizm-border/10 sticky left-[84px] sm:left-[94px] group-hover:bg-prizm-surface-strong bg-prizm-surface z-20 text-center">
   <input type="checkbox" className="accent-prizm-primary w-3 h-3 cursor-pointer" 
     checked={selectedIds.has(s.id)}
     onChange={() => {}}
     onClick={(e) => {
       e.stopPropagation();
       const next = new Set(selectedIds);
       if (next.has(s.id)) next.delete(s.id);
       else next.add(s.id);
       setSelectedIds(next);
     }} 
   />
</td>
<td className="px-3 py-1.5 border-r border-prizm-border/20 sticky left-[114px] sm:left-[124px] group-hover:bg-prizm-surface-strong bg-prizm-surface z-20 font-bold text-prizm-primary font-mono text-center min-w-[48px]">
   {s.stringNumber}
</td>
`;

stringFile = stringFile.replace(tbodyRow, '<tr key={s.id} onClick={() => setSelectedString(s)} className="group hover:bg-prizm-primary/5 cursor-pointer transition-colors relative">' + newTbodyRow);
fs.writeFileSync('src/components/StringDashboard.tsx', stringFile);
console.log("StringDashboard.tsx updated");

