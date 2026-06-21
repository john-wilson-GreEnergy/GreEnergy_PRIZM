const http = require('http');

http.get('http://localhost:3000/api/local/strings/dashboard/1/1/detail?captureHistory=true', (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      console.log(JSON.stringify({
        sourceHealth: parsed.sourceHealth,
        hasMonitorModel: (parsed.stringViewerMonitorDataModel != null),
        voltageRows: (parsed.voltageMatrix || []).length,
        firstVoltageRowLength: ((parsed.voltageMatrix && parsed.voltageMatrix[0]) || []).length,
        tempRows: (parsed.temperatureMatrix || []).length,
        firstTempRowLength: ((parsed.temperatureMatrix && parsed.temperatureMatrix[0]) || []).length,
        bpcCount: (parsed.bpcs || []).length,
        firstBpcCellGroupCount: ((parsed.bpcs && parsed.bpcs[0] && parsed.bpcs[0].cellGroups) || []).length,
        totalCellGroups: (parsed.bpcs || []).reduce((acc, bpc) => acc + ((bpc && bpc.cellGroups) ? bpc.cellGroups.length : 0), 0),
        sample: {
          bpc1cg1Voltage: parsed.bpcs && parsed.bpcs[0] && parsed.bpcs[0].cellGroups && parsed.bpcs[0].cellGroups[0] ? parsed.bpcs[0].cellGroups[0].voltage : null,
          bpc1cg1Temp: parsed.bpcs && parsed.bpcs[0] && parsed.bpcs[0].cellGroups && parsed.bpcs[0].cellGroups[0] ? parsed.bpcs[0].cellGroups[0].temperature : null,
          bpc14cg30Voltage: parsed.bpcs && parsed.bpcs[13] && parsed.bpcs[13].cellGroups && parsed.bpcs[13].cellGroups[29] ? parsed.bpcs[13].cellGroups[29].voltage : null,
          bpc14cg30Temp: parsed.bpcs && parsed.bpcs[13] && parsed.bpcs[13].cellGroups && parsed.bpcs[13].cellGroups[29] ? parsed.bpcs[13].cellGroups[29].temperature : null
        }
      }, null, 2));
    } catch (e) {
      console.log('Error parsing JSON:', e);
      console.log(data);
    }
  });
});
