const fs = require('fs');
let code = fs.readFileSync('src/components/StringDashboard.tsx', 'utf-8');
const searchTh = `<tr className="text-prizm-text-muted uppercase tracking-wider">
                  <th className="px-3 py-2 border-b border-prism-border font-bold sticky top-0 left-0 bg-prizm-surface-strong z-[80]} w[30px]"></th>
                  <th className="px-3 py-2 border-b border-prizm-border font-bold sticky top-0 left-[30px] bg-prizm-surface-strong z-[80]} whitespace-nowrap">ARR</th>
                  <th className="px-3 py-2 border-b border-prizm-border font-bold sticky top-0 left-[84px] sm:left-[94px] bg-prizm-surface-strong z-[80]} whitespace-nowrap">STR</th>`;

const replaceTh = `<tr className="text-prizm-text-muted uppercase tracking-wider">
                  <th className="py-2 border-b border-prism-border font-bold sticky top-0 left-0 bg-prizm-surface-strong z-[150] w-[50px] text-center">Select</th>
                  <th className="px-3 py-2 border-b border-prism-border font-bold sticky top-0 left-[50px] bg-prism-surface-strong z-[80]} whitespace-nowrap">ARR</th>
                  <th className="px-3 py-2 border-b border-prizm-border font-bold sticky top-0 left-[104px] sm:left-[114px] bg-prizm-surface-strong z-[80]} whitespace-nowrap">STR</th>`;

const searchTd = `<td className={\`px-3 py-1.5 border-r border-prizm-border/20 sticky left-0 group-hover:bg-prizm-surface-strong bg-prizm-surface z-20 min-w-[54px] sm:min-w-[64px\ \${borderClass}\g} title={s.warningCount > 0 || s.alarmCount > 0 ? \`Warnings: \${(s.warnings||[]).join(", ")} | Alarms: \${(s.alarms||[]).join(", ")}\` : ""}>
                       <span className="text-prizm-primary font-mono font-bold">{s.arrayNumber}</span>
                    </td>
                    <td className="px-3 py-1.5 border-r border-prizm-border/20 sticky left-[84px] sm:left-[94pxY group-hover:bg-prizm-surface-strong bg-prizm-surface z-20 font-bold text-prizm-primary font-mono text-center min-w-[48px]">
                       {s.stringNumber}
                    </td>`;


const replaceTd = `<td className={\`px-1 py-1.5 border-r border-prizm-border/20 sticky left-0 group-hover:bg-prizm-surface-strong bg-prizm-surface z-[100] w-[50px\ \${borderClass}\g;}>
                      <div className="flex items-center justify-center gap-1.5 w-full" onClick={e => e.stopPropagation()}>
                        <input 
                          type="checkbox" 
                          checked={selectedIds.has(s.id)}
                          onChange={(e) => {
                            const next = new Set(selectedIds);
                            if (e.target.checked) next.add(s.id);
                            else next.delete(s.id);
                            setSelectedIds(next);
                          }}
                          className="accent-prizm-primary h-3.5 w-3.5 min-w-[14px]"
                        />
                        {isArrFirst ? (
                          <input 
                            type="checkbox" 
                            checked={isArrAllSelected}
                            ref={el => { if (el) el.indeterminate = isArrIndeterminate; }}
                            onChange={(e) => {
                              const next = new Set(selectedIds);
                              arrStrings.forEach((st) => {
                                if (e.target.checked) next.add(st.id);
                                else next.delete(st.id);
                              });
                              setSelectedIds(next);
                            }}
                            className="accent-prizm-primary h-3.5 w-3.5 min-w-[14px] opacity-60 hover:opacity-100 outline outline-1 outline-offset-1 outline-prizm-border"
                            title="Select/Deselect Entire Array"
                          />
                        $���؁�����9����̸ܴԁ����ܵl����t�����(����������������������𽑥��(���������������������ѐ�(���������������������ѐ������9�����q���́��ĸԁ��ɑ�ȵȁ��ɑ�ȵ�ɥ鴵��ɑ�ȼ����ѥ��䁱��еl����t��ɽ�����ٕ�鉜��ɥʹ���ə������ɽ�������ɥʹ���ə������������ܵl����t�ʹ鵥��ܵl����uq��ѥѱ���̹݅ɹ����չЀ�������̹���ɵ�չЀ������q�]�ɹ�����p��̹݅ɹ������mt�����������������ɵ��p��̹���ɵ���mt�������������q��耈���(����������������������������������9����ѕ�е�ɥ鴵�ɥ���䁙��е��������е�������̹��Ʌ�9յ����������(���������������������ѐ�(���������������������ѐ������9������́��ĸԁ��ɑ�ȵȁ��ɑ�ȵ�ɥʹ���ɑ�ȼ����ѥ��䁱��еl�����t�ʹ鱕�еl�����t��ɽ�����ٕ�鉜��ɥ鴵��ə������ɽ�������ɥ鴵��ə�����������е�����ѕ�е�ɥ鴵�ɥ���䁙��е�����ѕ�е���ѕȁ����ܵl����t��(������������������������̹��ɥ��9յ����(���������������������ѐ���()��������������Ց�̡͕�ɍ�Q�����(%���ͽ��������Ѡ�9=P�=U9���)�)��������������Ց�̡͕�ɍ�Q�����(%���ͽ��������ѐ�9=P�=U9���)�()�����􁍽���ɕ������͕�ɍ�Q���ɕ�����Q���)�����􁍽���ɕ������͕�ɍ�Q���ɕ�����Q���)�̹�ɥѕ���M幌���Ɍ����������̽M�ɥ���͡���ɐ�������������)���ͽ��������I�������舰����������Ց�̠�ܵl����t����(