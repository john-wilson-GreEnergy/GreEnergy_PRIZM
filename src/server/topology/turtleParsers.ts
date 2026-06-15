export function parseCsvQuotesAware(csvStr: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;
  
  for (let i = 0; i < csvStr.length; i++) {
    const char = csvStr[i];
    
    if (char === '"') {
      if (inQuotes && csvStr[i + 1] === '"') {
        currentCell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentCell.trim());
      currentCell = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && csvStr[i + 1] === '\n') {
        i++;
      }
      currentRow.push(currentCell.trim());
      if (currentRow.length > 1 || currentRow[0] !== '') {
          rows.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += char;
    }
  }
  
  if (currentCell.trim() !== '' || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.length > 1 || currentRow[0] !== '') {
        rows.push(currentRow);
    }
  }
  
  return rows;
}

export function parseTurtleJsonOrLabeledSections(raw: any): {

  kind: "json" | "labeled-sections" | "text" | "empty";
  data: any;
  sections: Array<{ label: string; data: any }>;
  flattened: any[];
  error?: string;
} {
  if (!raw) {
    return { kind: "empty", data: null, sections: [], flattened: [] };
  }

  if (Array.isArray(raw)) {
    return {
      kind: "json",
      data: raw,
      sections: [],
      flattened: raw,
    };
  }

  if (typeof raw === "object") {
    return {
      kind: "json",
      data: raw,
      sections: [],
      flattened: [raw],
    };
  }

  if (typeof raw !== "string" || !raw.trim()) {
    return { kind: "empty", data: null, sections: [], flattened: [] };
  }

  const trimmed = raw.trim();

  // 1. Try strict JSON
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      const data = JSON.parse(trimmed);
      return {
        kind: "json",
        data,
        sections: [],
        flattened: Array.isArray(data) ? data : [data],
      };
    } catch (err) {}
  }

  // 2. Try labeled sections
  const lines = trimmed.split("\n");
  const sections: Array<{ label: string; data: any }> = [];
  let currentLabel = "";
  let currentBuffer = "";
  let inSection = false;

  const flushSection = () => {
    if (inSection && currentBuffer.trim()) {
      try {
        const parsed = JSON.parse(currentBuffer.trim());
        sections.push({ label: currentLabel, data: parsed });
      } catch (err) {
        // Failed to parse this section's JSON.
        sections.push({ label: currentLabel, data: currentBuffer.trim() });
      }
    }
  };

  let hasLabels = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.endsWith(":")) {
      flushSection();
      currentLabel = line.slice(0, -1).trim();
      currentBuffer = "";
      inSection = true;
      hasLabels = true;
    } else {
      if (inSection) {
        currentBuffer += (currentBuffer ? "\n" : "") + line;
      }
    }
  }

  flushSection();

  if (hasLabels && sections.length > 0) {
    const flattened: any[] = [];
    for (const sec of sections) {
      if (Array.isArray(sec.data)) {
        flattened.push(...sec.data);
      } else if (sec.data && typeof sec.data === "object") {
        flattened.push(sec.data);
      }
    }
    return {
      kind: "labeled-sections",
      data: null,
      sections,
      flattened,
    };
  }

  // 3. Fallback text
  return {
    kind: "text",
    data: trimmed,
    sections: [],
    flattened: [],
    error: "Failed to parse JSON or labeled sections",
  };
}
