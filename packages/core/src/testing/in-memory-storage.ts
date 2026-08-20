import type { Destination, StorageCapabilities } from "../domain/destination.js";
import type { Memory } from "../domain/memory.js";
import { NuttyError } from "../errors/nutty-error.js";
import type {
  CreateMemoryOptions,
  MemorySearchQuery,
  SearchPage,
  StorageHealth,
  StoragePort,
  StorageScope,
  StoredMemory,
} from "../ports/storage.js";

export class InMemoryStorage implements StoragePort {
  private readonly memories = new Map<string, StoredMemory>();

  constructor(private readonly configuredDestination: Destination) {}

  async destination(scope: StorageScope): Promise<Destination> {
    this.assertDestination(scope);
    return this.configuredDestination;
  }

  async capabilities(scope: StorageScope): Promise<StorageCapabilities> {
    return (await this.destination(scope)).capabilities;
  }

  async findByHash(scope: StorageScope, contentHash: string): Promise<StoredMemory | null> {
    this.assertDestination(scope);
    return (
      [...this.memories.entries()].find(
        ([key, stored]) =>
          key.startsWith(`${scope.principal.id}:${scope.destinationId}:`) &&
          stored.memory.contentHash === contentHash &&
          stored.memory.externalRefs.some(
            (reference) => reference.destinationId === scope.destinationId,
          ),
      )?.[1] ?? null
    );
  }

  async create(
    scope: StorageScope,
    memory: Memory,
    _options: CreateMemoryOptions,
  ): Promise<StoredMemory> {
    this.assertDestination(scope);
    const stored = this.withReference(scope, memory, "1");
    this.memories.set(this.key(scope, memory.id), stored);
    return stored;
  }

  async get(scope: StorageScope, id: string): Promise<StoredMemory | null> {
    this.assertDestination(scope);
    return this.memories.get(this.key(scope, id)) ?? null;
  }

  async search(scope: StorageScope, query: MemorySearchQuery): Promise<SearchPage> {
    this.assertDestination(scope);
    const offset = query.cursor === undefined ? 0 : Number(query.cursor);
    const text = query.text?.toLocaleLowerCase();
    const matches = [...this.memories.entries()]
      .filter(([key]) => key.startsWith(`${scope.principal.id}:${scope.destinationId}:`))
      .map(([, value]) => value)
      .filter(({ memory }) => {
        if (text !== undefined) {
          const searchable = [memory.title, memory.summary, memory.content, memory.project, ...memory.tags]
            .filter((item): item is string => item !== undefined)
            .join("\n")
            .toLocaleLowerCase();
          if (!searchable.includes(text)) return false;
        }
        if (query.types !== undefined && !query.types.includes(memory.type)) return false;
        if (query.project !== undefined && memory.project !== query.project) return false;
        if (query.tags !== undefined && !query.tags.every((tag) => memory.tags.includes(tag))) {
          return false;
        }
        if (query.surfaces !== undefined && !query.surfaces.includes(memory.source.surface)) {
          return false;
        }
        if (query.createdFrom !== undefined && memory.createdAt < query.createdFrom) return false;
        if (query.createdTo !== undefined && memory.createdAt > query.createdTo) return false;
        return true;
      });
    const items = matches.slice(offset, offset + query.limit);
    const nextOffset = offset + items.length;
    return {
      items,
      ...(nextOffset < matches.length ? { nextCursor: String(nextOffset) } : {}),
    };
  }

  async update(
    scope: StorageScope,
    id: string,
    memory: Memory,
    expectedVersion?: string,
  ): Promise<StoredMemory> {
    const current = await this.get(scope, id);
    if (current === null) throw new NuttyError("NOT_FOUND", "Memory not found.");
    if (expectedVersion !== undefined && current.providerVersion !== expectedVersion) {
      throw new NuttyError("CONFLICT", "Memory version changed.");
    }
    const nextVersion = String(Number(current.providerVersion ?? "0") + 1);
    const stored = this.withReference(scope, memory, nextVersion);
    this.memories.set(this.key(scope, id), stored);
    return stored;
  }

  async delete(scope: StorageScope, id: string): Promise<void> {
    this.memories.delete(this.key(scope, id));
  }

  async health(scope: StorageScope): Promise<StorageHealth> {
    this.assertDestination(scope);
    return { provider: "local", status: "healthy", checkedAt: new Date().toISOString() };
  }

  private assertDestination(scope: StorageScope): void {
    if (scope.destinationId !== this.configuredDestination.id) {
      throw new NuttyError("DESTINATION_NOT_FOUND", "Destination not found.");
    }
  }

  private key(scope: StorageScope, id: string): string {
    return `${scope.principal.id}:${scope.destinationId}:${id}`;
  }

  private withReference(scope: StorageScope, memory: Memory, version: string): StoredMemory {
    const reference = {
      destinationId: scope.destinationId,
      provider: "local" as const,
      externalId: memory.id,
      providerVersion: version,
      syncedAt: new Date().toISOString(),
    };
    return {
      memory: {
        ...memory,
        externalRefs: [
          ...memory.externalRefs.filter(
            (existing) => existing.destinationId !== scope.destinationId,
          ),
          reference,
        ],
      },
      providerVersion: version,
    };
  }
}
