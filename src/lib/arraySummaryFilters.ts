export function filterAndNormalizeArraySummary(arraySummary: any[]) {
  if (!arraySummary || !Array.isArray(arraySummary)) return [];
  
  return arraySummary
    .filter((arr: any) => {
      let arrNum = arr.arrayNumber ?? arr.arrayIndex;
      if (arrNum === undefined || arrNum === null) {
        const key = arr.key || arr.friendlyString || "";
        const match = key.match(/Array\s*(\d+)/i) || key.match(/:(\d+)(:\d+)?$/);
        if (match) {
          arrNum = parseInt(match[1], 10);
        }
      }
      if (arrNum === 0 || arrNum === "0") {
        return false; // Skip Array 0
      }
      if (arrNum === null || arrNum === undefined) {
        return false; // Skip invalid
      }
      return true;
    })
    .map((arr: any) => {
      let arrNum = arr.arrayNumber ?? arr.arrayIndex;
      if (arrNum === undefined || arrNum === null) {
        const key = arr.key || arr.friendlyString || "";
        const match = key.match(/Array\s*(\d+)/i) || key.match(/:(\d+)(:\d+)?$/);
        if (match) {
          arrNum = parseInt(match[1], 10);
        }
      }
      return {
        ...arr,
        arrayNumber: arrNum,
        arrayIndex: arrNum,
        friendlyString: arr.friendlyString && !arr.friendlyString.includes("Array 0") ? arr.friendlyString : `Array ${arrNum}`
      };
    })
    .sort((a, b) => (a.arrayNumber || 0) - (b.arrayNumber || 0));
}
