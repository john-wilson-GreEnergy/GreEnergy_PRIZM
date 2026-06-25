export function getSystemSocAndSource(sum: any, rollups: any) {
  let soc: number | null = null;
  let source = "";

  if (sum?.bessFleetSummary?.systemSocPct != null && !isNaN(Number(sum.bessFleetSummary.systemSocPct))) {
    soc = Number(sum.bessFleetSummary.systemSocPct);
    source = "native block";
  }

  if ((soc === null || isNaN(soc)) && sum?.arraySummary?.length > 0) {
    const validSocs = sum.arraySummary
      .map((arr: any) => arr.onlineSOC ?? arr.nearlineSOC ?? arr.socPct ?? arr.averageSoc)
      .filter((v: any) => v !== null && v !== undefined && !isNaN(Number(v)));
    if (validSocs.length > 0) {
      soc = validSocs.reduce((acc: number, val: any) => acc + Number(val), 0) / validSocs.length;
      source = "array average";
    }
  }

  if (soc === null || isNaN(soc)) {
    const stringSoc = rollups?.averageSoc ?? rollups?.socPctAvg ?? sum?.stringSummary?.rollups?.online?.socPctAvg;
    if (stringSoc != null && !isNaN(Number(stringSoc))) {
      soc = Number(stringSoc);
      source = "string average";
    }
  }

  if (soc !== null && !isNaN(soc)) {
    if (soc < 1 && soc > 0) soc = soc * 100;
    soc = Math.max(0, Math.min(100, soc));
    return { soc, source };
  }

  return { soc: null, source: "unavailable" };
}
