export function formatPrizmUtcTimestamp(value: unknown): string {
    if (!value) return "--";
    let d: Date;
    
    if (typeof value === "string") {
        // If it looks like an EMS string format e.g. "2026-Jun-11 02:37:19"
        if (value.match(/^\d{4}-[A-Z][a-z]{2}-\d{2}\s\d{2}:\d{2}:\d{2}/)) {
            return value; 
        }
        d = new Date(value);
    } else if (typeof value === "number") {
        d = new Date(value);
    } else {
        d = new Date(String(value));
    }
    
    if (isNaN(d.getTime())) return "--";
    
    // YYYY-MMM-DD HH:mm:ss UTC
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const yyyy = d.getUTCFullYear();
    const mmm = months[d.getUTCMonth()];
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const hh = String(d.getUTCHours()).padStart(2, "0");
    const mm = String(d.getUTCMinutes()).padStart(2, "0");
    const ss = String(d.getUTCSeconds()).padStart(2, "0");
    
    return `${yyyy}-${mmm}-${dd} ${hh}:${mm}:${ss} UTC`;
}
