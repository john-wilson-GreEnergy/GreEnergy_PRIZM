import * as fs from "fs";
import * as path from "path";
import { FanControlAuditRecord } from "./fanControlTypes";

export class FanControlAudit {
  private static auditPath = path.join(process.cwd(), "data", "audit", "fan_control_hold_audit.jsonl");

  public static write(record: FanControlAuditRecord): void {
    try {
      fs.mkdirSync(path.dirname(this.auditPath), { recursive: true });
      fs.appendFileSync(this.auditPath, JSON.stringify(record) + "\n");
    } catch (err) {
      console.error("[FanControlAudit] Failed to write audit log:", err);
    }
  }
}
