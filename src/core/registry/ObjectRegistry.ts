import type { PrizmObject } from '../models';
import { RegistryStore } from './RegistryStore';
import type { RegistryUpdates } from './types';
import type { RegistryStatistics } from './RegistryStatistics';

export class ObjectRegistry<T extends PrizmObject = PrizmObject> {
  private readonly store = new RegistryStore<T>();

  public register(object: T): Readonly<T> | undefined {
    return this.store.set(object);
  }

  public get(id: string): Readonly<T> | undefined {
    return this.store.get(id);
  }

  public has(id: string): boolean {
    return this.store.has(id);
  }

  public update(id: string, updates: RegistryUpdates<T>): Readonly<T> | undefined {
    return this.store.update(id, updates);
  }

  public remove(id: string): Readonly<T> | undefined {
    return this.store.remove(id);
  }

  public findByType(type: string): readonly Readonly<T>[] {
    return this.store.findByType(type);
  }

  public getAll(): readonly Readonly<T>[] {
    return this.store.getAll();
  }

  public statistics(): RegistryStatistics {
    const values = this.store.getAll();
    const typeCounts = values.reduce<Record<string, number>>((accumulator, object) => {
      accumulator[object.type] = (accumulator[object.type] ?? 0) + 1;
      return accumulator;
    }, {});

    return {
      totalObjects: values.length,
      totalTypes: Object.keys(typeCounts).length,
      typeCounts: Object.freeze({ ...typeCounts }),
    };
  }

  public clear(): void {
    this.store.clear();
  }
}
