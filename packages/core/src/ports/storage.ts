import type { Destination, StorageCapabilities } from "../domain/destination.js";
import type { Memory, MemorySource, MemoryType, StorageProvider } from "../domain/memory.js";
import type { Principal } from "../domain/principal.js";

export type StorageScope = {
  principal: Principal;
  destinationId: string;
};

export type CreateMemoryOptions = {
  idempotencyKey: string;
};

export type MemorySearchQuery = {
  text?: string;
  types?: MemoryType[];
  tags?: string[];
  project?: string;
  surfaces?: MemorySource["surface"][];
  createdFrom?: string;
  createdTo?: string;
  cursor?: string;
  limit: number;
};

export type SearchPage = {
  items: StoredMemory[];
  nextCursor?: string;
};

export type StoredMemory = {
  memory: Memory;
  providerVersion?: string;
  skippedFields?: string[];
  warnings?: string[];
};

export type StorageHealth = {
  provider: StorageProvider;
  status: "healthy" | "degraded" | "unavailable";
  checkedAt: string;
  message?: string;
};

export interface StoragePort {
  destination(scope: StorageScope): Promise<Destination>;
  capabilities(scope: StorageScope): Promise<StorageCapabilities>;
  findByHash(scope: StorageScope, contentHash: string): Promise<StoredMemory | null>;
  create(
    scope: StorageScope,
    memory: Memory,
    options: CreateMemoryOptions,
  ): Promise<StoredMemory>;
  get(scope: StorageScope, id: string): Promise<StoredMemory | null>;
  search(scope: StorageScope, query: MemorySearchQuery): Promise<SearchPage>;
  update(
    scope: StorageScope,
    id: string,
    memory: Memory,
    expectedVersion?: string,
  ): Promise<StoredMemory>;
  delete(scope: StorageScope, id: string): Promise<void>;
  health(scope: StorageScope): Promise<StorageHealth>;
}
