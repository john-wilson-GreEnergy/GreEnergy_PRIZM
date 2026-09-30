import type {Metadata} from "./Metadata";
export interface PrizmObject {
  id: string;
  type: string;
  version: string;
  createdAt: string;
  updatedAt: string;
  sourceIds: string[];
  tags: string[];
  metadata: Metadata;
}
