import type { PrizmObject } from '../models';

export type RegistryUpdates<T extends PrizmObject = PrizmObject> = Partial<Omit<T, 'id'>>;
