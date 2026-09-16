import { getEmsCachedModbusMap } from "../emsTurtleClient";
import { ProfileStore } from "../profiles/profileStore";
import { detectMapAddressOffset, parseModbusCSV, queryModbusReal } from "./modbusProfileManager";

export type ModbusStringContactorState = {
  arrayNumber: number;
  stringNumber: number;
  positiveContactorClosed: boolean;
  negativeContactorClosed: boolean;
  actualState: "closed" | "open" | "partial";
  rawBitfield: number;
  registerAddress: number;
  port: number;
  fetchedAt: string;
};

export function decodeStringContactorBitfield(words: number[]): Pick<ModbusStringContactorState,
  "positiveContactorClosed" | "negativeContactorClosed" | "actualState" | "rawBitfield"> {
  if (words.length < 2) throw new Error("ContactorStatus requires two Modbus registers");
  const rawBitfield = ((((words[0] & 0xffff) << 16) >>> 0) | (words[1] & 0xffff)) >>> 0;
  const positiveContactorClosed = (rawBitfield & 0x1) !== 0;
  const negativeContactorClosed = (rawBitfield & 0x2) !== 0;
  const actualState = positiveContactorClosed && negativeContactorClosed
    ? "closed"
    : !positiveContactorClosed && !negativeContactorClosed
      ? "open"
      : "partial";
  return { positiveContactorClosed, negativeContactorClosed, actualState, rawBitfield };
}

function resolveContactorRegister(csv: string, arrayNumber: number, stringNumber: number): number {
  const fieldName = `ContactorStatus[${stringNumber}]`;
  const candidates = parseModbusCSV(csv).filter((register) => register.fieldName === fieldName);
  const register = candidates[arrayNumber - 1];
  if (!register) throw new Error(`No mapped ${fieldName} register for array ${arrayNumber}`);
  if (register.size !== 2 || register.rw !== "R") throw new Error(`${fieldName} is not a two-register read-only field`);
  return register.registerAddress;
}

export async function readModbusStringContactorState(arrayNumber: number, stringNumber: number): Promise<ModbusStringContactorState> {
  if (!Number.isInteger(arrayNumber) || arrayNumber < 1 || !Number.isInteger(stringNumber) || stringNumber < 1) {
    throw new Error("Array and string numbers must be positive integers");
  }
  const csv = getEmsCachedModbusMap()?.data;
  if (typeof csv !== "string" || !csv.trim()) throw new Error("Current EMS Modbus map is not cached yet");
  const profile = ProfileStore.getActiveProfile();
  const host = profile?.modbusHost || profile?.emsHost || "10.0.0.3";
  const addressOffset = await detectMapAddressOffset(host, csv, 1);
  const registerAddress = resolveContactorRegister(csv, arrayNumber, stringNumber);
  const result = await queryModbusReal(host, registerAddress, 2, 1, addressOffset);
  return {
    arrayNumber,
    stringNumber,
    ...decodeStringContactorBitfield(result.registers),
    registerAddress,
    port: result.port,
    fetchedAt: new Date().toISOString(),
  };
}
