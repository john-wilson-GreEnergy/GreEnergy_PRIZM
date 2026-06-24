/**
 * Centralized utility for mapping string numbers to energy segments (ES)
 * and formatting labels for site layout displays and corrective actions.
 */

/**
 * Derives the Energy Segment (ES) number from a string number.
 * There are 2 strings per energy segment:
 * Strings 1, 2 -> ES1
 * Strings 3, 4 -> ES2
 * Strings 5, 6 -> ES3
 * ...
 * Strings 39, 40 -> ES20
 */
export function stringNumberToEnergySegment(stringNumber: number | null | undefined): number | null {
    if (stringNumber === null || stringNumber === undefined || stringNumber <= 0 || isNaN(stringNumber)) {
        return null;
    }
    return Math.ceil(stringNumber / 2);
}

interface FormatStringEsLabelInput {
    blockIndex?: number;
    arrayNumber?: number;
    stringNumber?: number;
    energySegmentNumber?: number;
    includeBlock?: boolean;
    compact?: boolean;
}

/**
 * Formats a consistent display label for a string / energy segment target.
 * Examples:
 * - Full label: Block 1 / Array 5 / ES3 - String 5
 * - Compact label: A5 / ES3 / S5
 */
export function formatStringEsLabel(input: FormatStringEsLabelInput): string {
    const { blockIndex, arrayNumber, stringNumber, energySegmentNumber, includeBlock, compact } = input;
    
    let derivedEs: number | null = null;
    if (stringNumber !== undefined && stringNumber !== null && stringNumber > 0) {
        derivedEs = stringNumberToEnergySegment(stringNumber);
        if (energySegmentNumber !== undefined && energySegmentNumber !== null && energySegmentNumber > 0) {
            if (derivedEs !== energySegmentNumber) {
                console.warn(`[stringToEsMapper] Mismatch: Derived ES ${derivedEs} from stringNumber ${stringNumber} does not match explicit energySegmentNumber ${energySegmentNumber}`);
            }
        }
    }
    
    const finalEs = derivedEs ?? energySegmentNumber ?? null;
    
    if (compact) {
        const parts: string[] = [];
        if (arrayNumber !== undefined && arrayNumber !== null) {
            parts.push(`A${arrayNumber}`);
        }
        if (finalEs !== null) {
            parts.push(`ES${finalEs}`);
        }
        if (stringNumber !== undefined && stringNumber !== null && stringNumber > 0) {
            parts.push(`S${stringNumber}`);
        }
        return parts.join(" / ") || "Unknown Target";
    } else {
        const parts: string[] = [];
        if (includeBlock && blockIndex !== undefined && blockIndex !== null) {
            parts.push(`Block ${blockIndex}`);
        }
        if (arrayNumber !== undefined && arrayNumber !== null) {
            parts.push(`Array ${arrayNumber}`);
        }
        
        let esPart = "";
        if (finalEs !== null) {
            esPart = `ES${finalEs}`;
        }
        
        let strPart = "";
        if (stringNumber !== undefined && stringNumber !== null && stringNumber > 0) {
            strPart = `String ${stringNumber}`;
        }
        
        if (esPart && strPart) {
            parts.push(`${esPart} - ${strPart}`);
        } else if (esPart) {
            parts.push(esPart);
        } else if (strPart) {
            parts.push(strPart);
        }
        
        return parts.join(" / ") || "Unknown Target";
    }
}
