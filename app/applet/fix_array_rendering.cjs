const fs = require('fs');
let code = fs.readFileSync('src/components/SiteOperationsDashboard.tsx', 'utf8');

const regex = /\{arraySummaryData\.map\(\(arr: any, idx: number\) => \{[\s\S]*?\}\)\}/g;

const replacement = `{arraySummaryData.map((arr: any, idx: number) => {
                                 const name = arr.friendlyString || ('Array ' + (arr.arrayNumber ?? arr.arrayIndex ?? idx+1));
                                 
                                 const formatSOC = (val: any) => {
                                      if (val === null || val === undefined) return '--';
                                      const num = Number(val);
                                      if (isNaN(num)) return '--';
                                      return (num < 1 ? num * 100 : num).toFixed(1).replace(/\\.0$/, '') + ' %';
                                 };
                                 
                                 const formatVal = (val: any, suffix = '') => {
                                      if (val === null || val === undefined) return '--';
                                      return String(val) + (suffix ? ' ' + suffix : '');
                                 };

                                 const hasChargeDischarge = arr.availableACChargekW !== null && arr.availableACChargekW !== undefined && arr.availableACDischargekW !== null && arr.availableACDischargekW !== undefined;
                                 let chargeDischargeDisplay = '--';
                                 if (hasChargeDischarge) {
                                      chargeDischargeDisplay = String(arr.availableACChargekW) + ' / ' + String(arr.availableACDischargekW);
                                 }

                                 return (
                                 <tr key={idx} className="hover:bg-prizm-surface transition-colors cursor-pointer" onClick={() => navigate("arrays-strings")}>
                                     <td className="p-2 text-prizm-primary font-bold">{name}</td>
                                     <td className="p-2 text-center text-emerald-400">{arr.communicating !== false ? 'OK' : <XOctagon size={12} className="inline text-prizm-danger" />}</td>
                                     <td className="p-2 text-center text-prizm-text">{formatSOC(arr.onlineSOC)}</td>
                                     <td className="p-2 text-center text-emerald-300">{formatSOC(arr.nearlineSOC)}</td>
                                     <td className="p-2 text-center text-prizm-text-muted">{formatSOC(arr.offlineSOC)}</td>
                                     <td className="p-2 text-center text-prizm-text-muted">{formatVal(arr.nearlineAvailableKWh, 'kWh')}</td>
                                     <td className="p-2 text-center text-prizm-text">{chargeDischargeDisplay}</td>
                                     <td className="p-2 text-center text-prizm-warning">{formatVal(arr.commandedkW)}</td>
                                     <td className="p-2 text-center text-prizm-text">{formatVal(arr.measuredkW)}</td>
                                 </tr>
                             )})}
`;

code = code.replace(regex, replacement);
fs.writeFileSync('src/components/SiteOperationsDashboard.tsx', code);
console.log('Fixed array rendering logic');
