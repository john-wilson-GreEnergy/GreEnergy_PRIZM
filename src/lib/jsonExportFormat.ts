// Presentation-only serialization of an already-canonical export snapshot.
export function formatJsonExport(value:unknown):string {
  const text=JSON.stringify(value,null,2);
  if(text===undefined)throw new Error("No export data available");
  return text;
}
