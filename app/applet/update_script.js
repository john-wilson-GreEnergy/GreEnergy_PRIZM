const fs = require('fs');
let code = fs.readFileSync('src/components/StringDashboard.tsx', 'utf-8');

const searchStr = 'filtered.map((s:any) => {';
const replaceStr = `filtered.map((s:any, idx: number) => {
                  const isArrFirst = idx === 0 || filtered[idx-1].arrayNumber !== s.arrayNumber;
                  const arrStrings = filtered.filter((fs:any) => fs.arrayNumber === s.arrayNumber);
                  const arrSelectedCount = arrStrings.filter((fs:any) => selectedIds.has(fs.id)).length;
                  const isArrAllSelected = arrSelectedCount > 0 && arrSelectedCount === arrStrings.length;
                  const isArrIndeterminate = arrSelectedCount > 0 && arrSelectedCount < arrStrings.length;`;
code = code.replace(searchStr, replaceStr);

const trSearchStr = 'return (\n                  <tr key={s.id} onClick={() => setSelectedString(s)} className="group hover:bg-prizm-primary/5 cursor-pointer transition-colors relative">\n                    <td className={`px-3 py-1.5 border-r border-prizm-border/20 sticky left-0 group-hover:bg-prizm-surface-strong bg-prizm-surface z-20 min-w-[54px] sm:min-w-[64px] ${borderClass}`';
const trReplaceStr = `return (
                  <tr key={s.id} onClick={() => setSelectedString(s)} className="group hover:bg-prizm-primary/5 cursor-pointer transition-colors relative">\n                    <td className="px-3 py-1.5 border-r border-prizm-border/20 sticky left-0 group-hover:bg-prizm-surface-strong bg-prizm-surface z-20 w-[30px]" onClick={e => e.stopPropagation()}>
                        <div className="flex flex-col items-center gap-1">
                            {isArrFirst ? (
                                <input 
                                    type="checkbox" 
                                    className="w-3.5 h-3.5 accent-prizm-primary cursor-pointer mt-[2px]" 
                                    title="Select Array"
                                    checked={isArrAllSelected}
                                    ref={el => { if (el) el.indeterminate = isArrIndeterminate; }}
                                    onChange={(e) => {
                                        const next = new Set(selectedIds);
                                        if (e.target.checked) {
                                            arrStrings.forEach((fs:any) => next.add(fs.id));
                                        } else {
                                            arrStrings.forEach((fs:any) => next.delete(fs.id));
                                        }
                                        setSelectedIds(next);
                                    }}
                                />
                            ) : <div className="w-3.5 h-3.5"></div>}
                            <input 
                                type="checkbox" 
                                className="w-3.5 h-3.5 accent-prizm-info cursor-pointer mt-[2px] opacity-60 hover:opacity-100"
                                title="Select String"
                                checked={selectedIds.has(s.id)}
                                onChange={(e) => {
                                    const next = new Set(selectedIds);
                                    if (e.target.checked) next.add(s.id); else next.delete(s.id);
                                    setSelectedIds(next);
                                }}
                            />
                        </div>
                    </td>
                    <td className={\`px-3 py-1.5 border-r border-prizm-border/20 sticky left-[30px] group-hover:bg-prizm-surface-strong bg-prizm-surface z-20 min-w-[54px] sm:min-w-[64px] \${borderClass}\``;
code = code.replace(trSearchStr, trReplaceStr);

fs.writeFileSync('src/components/StringDashboard.tsx', code);
