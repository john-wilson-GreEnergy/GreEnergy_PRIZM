import { randomUUID } from "node:crypto";
import protobuf from "protobufjs";

// Field numbers are from the protobuf classes packaged in the deployed turtle.war.
const BALANCING_COMMAND_PROTO = `syntax = "proto3";
package prizm;
message Command { string commandId = 1; Endpoint commandTarget = 4; Endpoint commandSource = 5; CommandPayload commandPayload = 6; string username = 7; }
message Endpoint { EndpointType endpointType = 1; string stationCode = 2; uint32 blockIndex = 3; uint32 arrayIndex = 4; uint32 stringIndex = 5; }
enum EndpointType { INVALID_COMMAND_TARGET_TYPE = 0; GOBLIN = 1; STATION = 2; BLOCK = 3; ARRAY = 4; STRING = 5; }
message CommandPayload { SetStringBalancingConfiguration setStringBalancingConfiguration = 30; }
message SetStringBalancingConfiguration { BatteryPackBalancingConfiguration defaultBatteryPackBalancingConfiguration = 1; }
message BatteryPackBalancingConfiguration {
  BalancingMode balancingMode = 1;
  int32 providedVoltageTarget = 2;
  bool chargeBalancingPermitted = 3;
  bool dischargeBalancingPermitted = 4;
  int32 chargeDeadband = 5;
  int32 dischargeDeadband = 6;
  enum BalancingMode { NO_BALANCE = 0; BALANCE_TO_PROVIDED = 1; BALANCE_TO_AVERAGE = 2; }
}`;

const commandType = protobuf.parse(BALANCING_COMMAND_PROTO).root.lookupType("prizm.Command");

export type BalancingCommandInput = {
  stationCode: string;
  blockIndex: number;
  array: number;
  string?: number;
  mode: "avg" | "provided";
  providedMv?: number;
  chargingDeadband: number;
  dischargingDeadband: number;
  requestedBy?: string;
  commandId?: string;
};

export function buildBalancingCommand(input: BalancingCommandInput) {
  if (!input.stationCode?.trim() || !Number.isSafeInteger(input.blockIndex) || input.blockIndex < 1) throw new Error("Valid EMS identity is required");
  if (!Number.isSafeInteger(input.array) || input.array < 1) throw new Error("Valid array target is required");
  if (input.string !== undefined && (!Number.isSafeInteger(input.string) || input.string < 1)) throw new Error("Valid string target is required");
  for (const value of [input.chargingDeadband, input.dischargingDeadband]) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error("Deadbands must be non-negative integer millivolts");
  }
  if (input.mode === "provided" && (!Number.isSafeInteger(input.providedMv) || Number(input.providedMv) < 2500 || Number(input.providedMv) > 3800)) throw new Error("Valid provided voltage target is required");

  const goblinEndpoint = { endpointType: 1 };
  const targetEndpoint = {
    endpointType: input.string === undefined ? 4 : 5,
    stationCode: input.stationCode.trim(),
    blockIndex: input.blockIndex,
    arrayIndex: input.array,
    ...(input.string === undefined ? {} : { stringIndex: input.string })
  };
  const configuration = {
    balancingMode: input.mode === "avg" ? 2 : 1,
    chargeBalancingPermitted: true,
    dischargeBalancingPermitted: true,
    chargeDeadband: input.chargingDeadband,
    dischargeDeadband: input.dischargingDeadband,
    ...(input.mode === "provided" ? { providedVoltageTarget: input.providedMv } : {})
  };
  const commandId = input.commandId ?? randomUUID();
  const payload = {
    commandId,
    commandTarget: targetEndpoint,
    commandSource: goblinEndpoint,
    commandPayload: { setStringBalancingConfiguration: { defaultBatteryPackBalancingConfiguration: configuration } },
    username: input.requestedBy?.trim() || "local-prizm"
  };
  const error = commandType.verify(payload);
  if (error) throw new Error(`Balancing protobuf validation failed: ${error}`);
  return { commandId, buffer: Buffer.from(commandType.encode(commandType.create(payload)).finish()) };
}

export function decodeBalancingCommand(buffer: Uint8Array) {
  return commandType.toObject(commandType.decode(buffer), { enums: String });
}
