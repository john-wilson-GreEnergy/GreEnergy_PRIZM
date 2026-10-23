import type {DomainPublication} from '../domainBrokers/EntityDomainBroker';
import {compactStringRow,stringTransportEpoch} from './compactStringList';
type Row = Record<string,unknown>;
/** Per-connection, versioned shallow patches. Values (including null/false/0)
 * and nested records are replaced exactly; removed fields are explicit.
 */
export class StringFieldDeltas {
  private rows = new Map<string,Row>();
  constructor(private readonly epoch = stringTransportEpoch) {}
  seed(rows: Row[]) {
    for (const row of rows) this.rows.set(`${Number(row.arrayNumber ?? row.arrayIndex)}:${Number(row.stringNumber ?? row.stringIndex)}`,compactStringRow(row));
  }
  project(publication: DomainPublication<Row>) {
    const changes = publication.changes.map(change => {
      const next = compactStringRow(change.row), before = this.rows.get(change.key);
      this.rows.set(change.key,next);
      if (!before) return {key:change.key,row:next};
      const row: Row = {arrayNumber:next.arrayNumber ?? next.arrayIndex,stringNumber:next.stringNumber ?? next.stringIndex};
      for (const [key,value] of Object.entries(next)) if (JSON.stringify(value) !== JSON.stringify(before[key])) row[key] = value;
      return {key:change.key,row,patch:true as const,removed:Object.keys(before).filter(key=>!(key in next))};
    });
    return {...publication,transportEpoch:this.epoch,changes};
  }
}
