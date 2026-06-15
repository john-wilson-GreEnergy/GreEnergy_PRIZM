import { LightbarMode, LightbarPreviewItem, RGB, RGBW } from "./lightbarTypes";
import { ProfileStore } from "../profiles/profileStore";

export function parseRangeSelection(input: string, maxLimit: number): number[] {
  const normalized = input.trim().toLowerCase();
  if (normalized === "all") {
    const list: number[] = [];
    for (let i = 1; i <= maxLimit; i++) {
      list.push(i);
    }
    return list;
  }

  const results: number[] = [];
  const parts = normalized.split(",");
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (trimmed.includes("-")) {
      const [startStr, endStr] = trimmed.split("-");
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (!isNaN(start) && !isNaN(end)) {
        const from = Math.min(start, end);
        const to = Math.max(start, end);
        for (let i = from; i <= to; i++) {
          if (i >= 1 && i <= maxLimit) {
            results.push(i);
          }
        }
      }
    } else {
      const val = parseInt(trimmed, 10);
      if (!isNaN(val) && val >= 1 && val <= maxLimit) {
        results.push(val);
      }
    }
  }
  return Array.from(new Set(results)).sort((a, b) => a - b);
}

export function getEffectiveTopologyLimits(): { maxArray: number; maxString: number; hasTopology: boolean } {
  try {
    const profile = ProfileStore.getActiveProfile();
    if (!profile) {
      return { maxArray: 8, maxString: 40, hasTopology: false };
    }
    
    let maxArray = profile.arrayCount || 8;
    let maxString = profile.stringsPerArray || 40;
    let hasTopology = false;

    if (profile.topologyModel) {
      hasTopology = true;
      if (profile.topologyModel.arrayEnd) {
        maxArray = profile.topologyModel.arrayEnd;
      }
      // If of blocks list has custom limits
      if (Array.isArray(profile.topologyModel.blocks) && profile.topologyModel.blocks.length > 0) {
        let maxBlockArray = 0;
        let maxBlockString = 0;
        for (const block of profile.topologyModel.blocks) {
          if (block.arrayEnd && block.arrayEnd > maxBlockArray) maxBlockArray = block.arrayEnd;
          // We can allow override if strings aren't explicitly bounded, but usually strings are standard or topology model lists.
        }
        if (maxBlockArray > 0) maxArray = maxBlockArray;
      }
    }
    return { maxArray, maxString, hasTopology };
  } catch (e) {
    return { maxArray: 8, maxString: 40, hasTopology: false };
  }
}

export interface PatternGenerateOptions {
  mode: LightbarMode;
  arrays: string;
  strings: string;
  color?: RGBW;                     // For single/clear
  colors?: {                        // For alt4 or mirror
    o1?: RGB;
    o2?: RGB;
    e1?: RGB;
    e2?: RGB;
    a?: RGB;
    b?: RGB;
  };
  white?: number;                   // For alt4, mirror, usa
  durationSeconds: number;
  blockId?: string;
  blockIndex?: number;
}

export function validatePatternInput(options: PatternGenerateOptions): { valid: boolean; error?: string } {
  const { maxArray, maxString, hasTopology } = getEffectiveTopologyLimits();
  
  // Decide actual validation limits
  const arrayLimit = hasTopology ? maxArray : 61;
  const stringLimit = hasTopology ? maxString : 42;

  // 1. Arrays selection validation
  const arraysArr = parseRangeSelection(options.arrays, arrayLimit);
  if (arraysArr.length === 0) {
    return { valid: false, error: `Invalid array selection. Evaluated count is 0. Maximum configured array allowed is ${arrayLimit}.` };
  }

  // 2. Strings selection validation
  const stringsArr = parseRangeSelection(options.strings, stringLimit);
  if (stringsArr.length === 0) {
    return { valid: false, error: `Invalid string selection. Evaluated count is 0. Maximum configured string allowed is ${stringLimit}.` };
  }

  // 3. RGBW range validation
  if (options.color) {
    const { red, green, blue, white } = options.color;
    if (red < 0 || red > 255 || green < 0 || green > 255 || blue < 0 || blue > 255 || white < 0 || white > 255) {
      return { valid: false, error: "RGBW values must be within 0 to 255." };
    }
  }

  if (options.colors) {
    for (const key of Object.keys(options.colors) as Array<keyof typeof options.colors>) {
      const c = options.colors[key];
      if (c) {
        if (c.red < 0 || c.red > 255 || c.green < 0 || c.green > 255 || c.blue < 0 || c.blue > 255) {
          return { valid: false, error: `RGB colors inside ${key} must be within 0 to 255.` };
        }
      }
    }
  }

  if (options.white !== undefined) {
    if (options.white < 0 || options.white > 255) {
      return { valid: false, error: "White channel value must be within 0 to 255." };
    }
  }

  // 4. Duration validation
  if (options.durationSeconds < 1 || options.durationSeconds > 86400) {
    return { valid: false, error: "Duration must be between 1 and 86400 seconds." };
  }

  return { valid: true };
}

export function generatePatternPreview(options: PatternGenerateOptions): LightbarPreviewItem[] {
  const { maxArray, maxString, hasTopology } = getEffectiveTopologyLimits();
  const arrayLimit = hasTopology ? maxArray : 61;
  const stringLimit = hasTopology ? maxString : 42;

  const arraysArr = parseRangeSelection(options.arrays, arrayLimit);
  const stringsArr = parseRangeSelection(options.strings, stringLimit);

  const previewItems: LightbarPreviewItem[] = [];

  for (const arrayNum of arraysArr) {
    for (const stringNum of stringsArr) {
      let r = 0;
      let g = 0;
      let b = 0;
      let w = options.color?.white ?? options.white ?? 0;
      let group = "SINGLE";

      if (options.mode === "single" || options.mode === "clear") {
        r = options.color?.red ?? 0;
        g = options.color?.green ?? 0;
        b = options.color?.blue ?? 0;
        w = options.color?.white ?? 0;
        group = options.mode === "single" ? "SINGLE" : "CLEAR";
      } else if (options.mode === "alt4") {
        const sRem = stringNum % 4;
        const colorSet = options.colors || {};
        if (sRem === 1) {
          r = colorSet.o1?.red ?? 0;
          g = colorSet.o1?.green ?? 0;
          b = colorSet.o1?.blue ?? 0;
          group = "ALT4_O1";
        } else if (sRem === 3) {
          r = colorSet.o2?.red ?? 0;
          g = colorSet.o2?.green ?? 0;
          b = colorSet.o2?.blue ?? 0;
          group = "ALT4_O2";
        } else if (sRem === 2) {
          r = colorSet.e1?.red ?? 0;
          g = colorSet.e1?.green ?? 0;
          b = colorSet.e1?.blue ?? 0;
          group = "ALT4_E1";
        } else { // sRem === 0
          r = colorSet.e2?.red ?? 0;
          g = colorSet.e2?.green ?? 0;
          b = colorSet.e2?.blue ?? 0;
          group = "ALT4_E2";
        }
      } else if (options.mode === "mirror") {
        const sRem = stringNum % 4;
        const colorSet = options.colors || {};
        if (sRem === 1 || sRem === 2) {
          r = colorSet.a?.red ?? 0;
          g = colorSet.a?.green ?? 0;
          b = colorSet.a?.blue ?? 0;
          group = "MIRROR_A";
        } else { // sRem === 3 || sRem === 0
          r = colorSet.b?.red ?? 0;
          g = colorSet.b?.green ?? 0;
          b = colorSet.b?.blue ?? 0;
          group = "MIRROR_B";
        }
      } else if (options.mode === "usa") {
        let idx = 0;
        if (stringNum % 2 === 1) {
          idx = Math.floor((stringNum - 1) / 2) % 3;
        } else {
          idx = Math.floor((stringNum - 2) / 2) % 3;
        }

        if (idx === 0) {
          r = 255; g = 0; b = 0;
          group = "USA_RED";
        } else if (idx === 1) {
          r = 255; g = 255; b = 255;
          group = "USA_WHITE";
        } else {
          r = 0; g = 0; b = 255;
          group = "USA_BLUE";
        }
      }

      previewItems.push({
        array: arrayNum,
        string: stringNum,
        red: r,
        green: g,
        blue: b,
        white: w,
        duration: options.durationSeconds,
        group,
        blockId: options.blockId,
        blockIndex: options.blockIndex
      });
    }
  }

  return previewItems;
}
