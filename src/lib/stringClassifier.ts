export type StringOperationalState = "online" | "nearline" | "offline" | "notCommunicating" | "unknown";

export interface StringClassificationInput {
  communicating: boolean | null | undefined;
  inRotation: boolean | null | undefined;
  contactorsClosed: boolean | null | undefined;
}

function parseBool(v: any): boolean {
  if (v === true || v === false) return v;
  if (typeof v === 'string') {
    const s = v.toLowerCase().trim();
    return s === 'true' || s === '1' || s === 'yes' || s === 'on' || s === 'closed';
  }
  if (typeof v === 'number') return v === 1;
  return false;
}

export function getNullableCommunicating(row: any): boolean | null {
  if (!row) return null;
  
  let rawComm: any = undefined;
  if (row.communicating !== undefined) rawComm = row.communicating;
  else if (row.isCommunicating !== undefined) rawComm = row.isCommunicating;
  else if (row.communicationStatus !== undefined) rawComm = row.communicationStatus;
  else if (row.online !== undefined) rawComm = row.online;
  else if (row.reachable !== undefined) rawComm = row.reachable;
  else if (row.StringConnectionState !== undefined) rawComm = row.StringConnectionState;
  else if (row.stringConnectionState !== undefined) rawComm = row.stringConnectionState;
  else if (row.connectionState !== undefined) rawComm = row.connectionState;

  if (rawComm === undefined || rawComm === null || rawComm === "") return null;

  if (typeof rawComm === "boolean") return rawComm;
  const s = String(rawComm).toUpperCase().trim();
  if (s === "TRUE" || s === "1" || s === "COMMUNICATING" || s === "ONLINE" || s === "CONNECTED" || s === "OK") {
    return true;
  }
  if (s === "FALSE" || s === "0" || s === "NOT COMMUNICATING" || s === "NOT_COMMUNICATING" || s === "NOT_COMM" || s === "OFFLINE" || s === "DISCONNECTED" || s === "LOST COMMS" || s === "LOST_COMMS" || s === "LOSTCOMMS" || s === "LOSS_COMMS") {
    return false;
  }
  return null;
}

export function getNullableInRotation(row: any): boolean | null {
  if (!row) return null;

  let rawRot: any = undefined;
  if (row.inRotation !== undefined) rawRot = row.inRotation;
  else if (row.outRotation !== undefined) rawRot = row.outRotation !== null ? !parseBool(row.outRotation) : null;
  else if (row.outOfRotation !== undefined) rawRot = row.outOfRotation !== null ? !parseBool(row.outOfRotation) : null;
  else if (row.OutOfRotation !== undefined) rawRot = row.OutOfRotation !== null ? !parseBool(row.OutOfRotation) : null;
  else if (row.out_rotation !== undefined) rawRot = row.out_rotation !== null ? !parseBool(row.out_rotation) : null;
  else if (row.outrotation !== undefined) rawRot = row.outrotation !== null ? !parseBool(row.outrotation) : null;
  else if (row.rotationStatus !== undefined) rawRot = row.rotationStatus;
  else if (row.operatingStatus !== undefined) rawRot = row.operatingStatus;
  else if (row.availableForDispatch !== undefined) rawRot = row.availableForDispatch;
  else if (row.enabledInRotation !== undefined) rawRot = row.enabledInRotation;

  if (rawRot === undefined || rawRot === null || rawRot === "") {
    if (typeof row.rotation === 'string') {
      const rot = row.rotation.toUpperCase().trim();
      if (rot.includes('OUT')) return false;
      if (rot.includes('IN')) return true;
    }
    return null;
  }

  if (typeof rawRot === "boolean") return rawRot;
  const s = String(rawRot).toUpperCase().trim();
  if (s === "TRUE" || s === "1" || s === "IN ROTATION" || s === "IN_ROTATION" || s === "ENABLED" || s === "IN" || s === "AVAILABLE") {
    return true;
  }
  if (s === "FALSE" || s === "0" || s === "OUT OF ROTATION" || s === "OUT_OF_ROTATION" || s === "ROTATED OUT" || s === "ROTATED_OUT" || s === "DISABLED" || s === "OUT" || s === "UNAVAILABLE") {
    return false;
  }
  return null;
}

export function getNullableBothContactorsClosed(row: any): boolean | null {
  if (!row) return null;

  let rawPos: any = undefined;
  if (row.positiveContactorClosed !== undefined) rawPos = row.positiveContactorClosed;
  else if (row.posContactorClosed !== undefined) rawPos = row.posContactorClosed;
  else if (row.positiveClosed !== undefined) rawPos = row.positiveClosed;
  else if (row.contactorPositiveFeedback !== undefined) rawPos = row.contactorPositiveFeedback;

  let rawNeg: any = undefined;
  if (row.negativeContactorClosed !== undefined) rawNeg = row.negativeContactorClosed;
  else if (row.negContactorClosed !== undefined) rawNeg = row.negContactorClosed;
  else if (row.negativeClosed !== undefined) rawNeg = row.negativeClosed;
  else if (row.contactorNegativeFeedback !== undefined) rawNeg = row.contactorNegativeFeedback;

  let positiveContactorClosed: boolean | null = null;
  if (rawPos !== undefined && rawPos !== null && rawPos !== "") {
    if (typeof rawPos === "boolean") positiveContactorClosed = rawPos;
    else {
      const s = String(rawPos).toUpperCase().trim();
      positiveContactorClosed = (s === "TRUE" || s === "1" || s === "CLOSED" || s === "ON");
    }
  }
  let negativeContactorClosed: boolean | null = null;
  if (rawNeg !== undefined && rawNeg !== null && rawNeg !== "") {
    if (typeof rawNeg === "boolean") negativeContactorClosed = rawNeg;
    else {
      const s = String(rawNeg).toUpperCase().trim();
      negativeContactorClosed = (s === "TRUE" || s === "1" || s === "CLOSED" || s === "ON");
    }
  }

  if (positiveContactorClosed !== null && negativeContactorClosed !== null) {
    if (positiveContactorClosed === true && negativeContactorClosed === true) return true;
    return false;
  }

  let rawBoth: any = undefined;
  if (row.bothContactorsClosed !== undefined) rawBoth = row.bothContactorsClosed;
  else if (row.contactorClosed !== undefined) rawBoth = row.contactorClosed;
  else if (row.contactorsClosed !== undefined) rawBoth = row.contactorsClosed;
  else if (row.contactorStatus !== undefined) rawBoth = row.contactorStatus;

  if (rawBoth !== undefined && rawBoth !== null && rawBoth !== "") {
    if (typeof rawBoth === "boolean") return rawBoth;
    const s = String(rawBoth).toUpperCase().trim();
    if (s === "CLOSED" || s === "TRUE" || s === "1" || s === "ON") return true;
    if (s === "OPEN" || s === "FALSE" || s === "0" || s === "OFF") return false;
  }

  return null;
}

export function getOutRotation(row: any): boolean {
  const nullableRot = getNullableInRotation(row);
  return nullableRot === null ? false : !nullableRot;
}

export function getContactorsClosed(row: any): boolean {
  const nullableCont = getNullableBothContactorsClosed(row);
  return nullableCont === null ? false : nullableCont;
}

export function getCommunicating(row: any): boolean {
  const nullableComm = getNullableCommunicating(row);
  return nullableComm === null ? true : nullableComm;
}

export function classifyStringOperationalState(rawString: any): {
  state: "online" | "nearline" | "offline" | "notCommunicating" | "unknown";
  bucket: "online" | "nearline" | "offline" | "notCommunicating" | "unknown";
  reason: string;
  communicating: boolean | null;
  inRotation: boolean | null;
  contactorsClosed: boolean | null;
} {
  const communicating = getNullableCommunicating(rawString);
  const inRotation = getNullableInRotation(rawString);
  const contactorsClosed = getNullableBothContactorsClosed(rawString);

  if (communicating === false) {
    return {
      state: "notCommunicating",
      bucket: "notCommunicating",
      reason: "not_communicating",
      communicating,
      inRotation,
      contactorsClosed
    };
  }

  if (communicating === true) {
    if (inRotation === false) {
      return {
        state: "offline",
        bucket: "offline",
        reason: "out_of_rotation",
        communicating,
        inRotation,
        contactorsClosed
      };
    }
    if (inRotation === true) {
      if (contactorsClosed === true) {
        return {
          state: "online",
          bucket: "online",
          reason: "communicating_in_rotation_contactors_closed",
          communicating,
          inRotation,
          contactorsClosed
        };
      }
      if (contactorsClosed === false) {
        return {
          state: "nearline",
          bucket: "nearline",
          reason: "communicating_in_rotation_contactors_open",
          communicating,
          inRotation,
          contactorsClosed
        };
      }
      return {
        state: "unknown",
        bucket: "unknown",
        reason: "missing_contactor_feedback",
        communicating,
        inRotation,
        contactorsClosed
      };
    }
    return {
      state: "unknown",
      bucket: "unknown",
      reason: "missing_rotation_feedback",
      communicating,
      inRotation,
      contactorsClosed
    };
  }

  return {
    state: "unknown",
    bucket: "unknown",
    reason: "missing_communication_feedback",
    communicating,
    inRotation,
    contactorsClosed
  };
}
