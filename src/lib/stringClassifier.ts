export type StringOperationalState = "online" | "nearline" | "offline" | "notCommunicating";

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

export function getOutRotation(row: any): boolean {
  if (!row) return false;
  if (row.OutRotation !== undefined) return parseBool(row.OutRotation);
  if (row.outRotation !== undefined) return parseBool(row.outRotation);
  if (row.outOfRotation !== undefined) return parseBool(row.outOfRotation);
  if (row.OutOfRotation !== undefined) return parseBool(row.OutOfRotation);
  if (row.out_rotation !== undefined) return parseBool(row.out_rotation);
  if (row.outrotation !== undefined) return parseBool(row.outrotation);
  if (typeof row.rotation === 'string') {
    const rot = row.rotation.toUpperCase();
    return rot.includes('OUT');
  }
  return false;
}

export function getContactorsClosed(row: any): boolean {
  if (!row) return false;
  if (row.ContactorsClosed !== undefined) return parseBool(row.ContactorsClosed);
  if (row.contactorsClosed !== undefined) return parseBool(row.contactorsClosed);
  
  const posClosed = parseBool(row.PositiveContactorClosed ?? row.positiveContactorClosed ?? row.positive_contactor_closed ?? row.positivecontactorclosed);
  const negClosed = parseBool(row.NegativeContactorClosed ?? row.negativeContactorClosed ?? row.negative_contactor_closed ?? row.negativecontactorclosed);
  if (
    row.PositiveContactorClosed !== undefined || 
    row.positiveContactorClosed !== undefined || 
    row.positive_contactor_closed !== undefined || 
    row.positivecontactorclosed !== undefined
  ) {
    return posClosed && negClosed;
  }
  if (row.contactorClosed !== undefined) return parseBool(row.contactorClosed);
  if (typeof row.contactorStatus === 'string') {
    return row.contactorStatus.toUpperCase() === 'CLOSED';
  }
  if (typeof row.contactor_closed === 'boolean') {
    return row.contactor_closed;
  }
  return false;
}

export function getCommunicating(row: any): boolean {
  if (!row) return true;
  if (row.communicating !== undefined) {
    if (row.communicating === false || row.communicating === "false") return false;
  }
  if (row.lossComms !== undefined && parseBool(row.lossComms)) return false;
  if (row.LossComms !== undefined && parseBool(row.LossComms)) return false;
  if (row.loss_comms !== undefined && parseBool(row.loss_comms)) return false;

  const connectionState = String(row.StringConnectionState ?? row.stringConnectionState ?? row.connectionState ?? '').toUpperCase();
  if (connectionState.includes('LOSS') || connectionState.includes('NO_COMM') || connectionState.includes('NOT_COMM')) {
    return false;
  }

  if (row.communicating !== undefined) {
    return parseBool(row.communicating);
  }
  return true;
}

export function classifyStringOperationalState(rawString: any): {
  state: "online" | "nearline" | "offline" | "notCommunicating";
  bucket: "online" | "nearline" | "offline" | "notCommunicating";
  reason:
    | "communicating_in_rotation_contactors_closed"
    | "communicating_in_rotation_contactors_open"
    | "not_communicating"
    | "out_of_rotation"
    | "unknown_safe_offline";
  communicating: boolean;
  inRotation: boolean;
  contactorsClosed: boolean;
} {
  const communicating = getCommunicating(rawString);
  const inRotation = !getOutRotation(rawString);
  const contactorsClosed = getContactorsClosed(rawString);

  if (!communicating) {
    return {
      state: "notCommunicating",
      bucket: "offline",
      reason: "not_communicating",
      communicating,
      inRotation,
      contactorsClosed
    };
  }

  if (!inRotation) {
    return {
      state: "offline",
      bucket: "offline",
      reason: "out_of_rotation",
      communicating,
      inRotation,
      contactorsClosed
    };
  }

  if (contactorsClosed) {
    return {
      state: "online",
      bucket: "online",
      reason: "communicating_in_rotation_contactors_closed",
      communicating,
      inRotation,
      contactorsClosed
    };
  } else {
    return {
      state: "nearline",
      bucket: "nearline",
      reason: "communicating_in_rotation_contactors_open",
      communicating,
      inRotation,
      contactorsClosed
    };
  }
}
