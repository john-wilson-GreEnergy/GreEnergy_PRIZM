export async function getLatestFirmwareSnapshot(): Promise<any | null> {
    return null;
}

export async function triggerFirmwareCapture(options?: any): Promise<void> {
    throw new Error("Firmware capture service is not implemented yet.");
}
