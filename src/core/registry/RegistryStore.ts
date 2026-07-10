import type { PrizmObject } from '../models';

export class RegistryStore<T extends PrizmObject = PrizmObject> {
  private readonly objects = new Map<string, T>();

  public has(id: string): boolean {
    return this.objects.has(id);
  }

  public get(id: string): Readonly<T> | undefined {
    return this.objects.get(id);
  }

  public set(object: T): Readonly<T> | undefined {
    if (this.objects.has(object.id)) {
      return undefined;
    }

    this.objects.set(object.id, object);
    return object;
  }

  public update(id: string, updates: Partial<Omit<T, 'id'>>): Readonly<T> | undefined {
    const existing = this.objects.get(id);
    if (!existing) {
      return undefined;
    }

    const updated: T = {
      ...existing,
      ...updates,
    };

    this.objects.set(id, updated);
    return updated;
  }

  public remove(id: string): Readonly<T> | undefined {
    const existing = this.objects.get(id);
    if (!existing) {
      return undefined;
    }

    this.objects.delete(id);
    return existing;
  }

  public findByType(type: string): readonly Readonly<T>[] {
    return Array.from(this.objects.values()).filter((object) => object.type === type);
  }

  public getAll(): readonly Readonly<T>[] {
    return Array.from(this.objects.values());
  }

  public clear(): void {
    this.objects.clear();
  }

  public size(): number {
    return this.objects.size;
  }
}
