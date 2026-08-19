import { z } from "zod";

export const CURRENT_MEMORY_SCHEMA_VERSION = 1;

export const CORE_LIMITS = Object.freeze({
  titleCharacters: 240,
  contentCharacters: 500_000,
  summaryCharacters: 2_000,
  noteCharacters: 20_000,
  projectCharacters: 240,
  tagCharacters: 64,
  tagsPerMemory: 20,
} as const);

export const memoryTypeSchema = z.enum([
  "conversation",
  "decision",
  "insight",
  "reference",
  "task",
  "project",
  "preference",
  "inbox",
]);

export const captureModeSchema = z.enum([
  "previous_answer",
  "current_exchange",
  "selection",
  "manual",
]);

export const sourceSurfaceSchema = z.enum([
  "chatgpt",
  "codex",
  "openclaw",
  "deepseek-harness",
  "other",
]);

export const sensitivitySchema = z.enum(["normal", "private", "restricted"]);

export const storageProviderSchema = z.enum([
  "feishu",
  "notion",
  "google",
  "local",
]);

export const timestampSchema = z.string().datetime({ offset: true });

export const memoryIdSchema = z.string().uuid();

export const contentHashSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, "contentHash must be a lowercase SHA-256 digest");

export const tagSchema = z
  .string()
  .trim()
  .min(1)
  .max(CORE_LIMITS.tagCharacters)
  .refine((tag) => !tag.startsWith("#"), "tags must not include the # prefix");

export const tagsSchema = z
  .array(tagSchema)
  .max(CORE_LIMITS.tagsPerMemory)
  .refine(
    (tags) => new Set(tags.map((tag) => tag.toLowerCase())).size === tags.length,
    "tags must be unique ignoring case",
  );

const sourceIdentifierSchema = z.string().trim().min(1).max(512);

export const memorySourceSchema = z
  .object({
    surface: sourceSurfaceSchema,
    conversationId: sourceIdentifierSchema.optional(),
    userMessageId: sourceIdentifierSchema.optional(),
    assistantMessageId: sourceIdentifierSchema.optional(),
    conversationUrl: z.string().url().max(2_048).optional(),
    model: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export const externalRefSchema = z
  .object({
    destinationId: z.string().trim().min(1).max(128),
    provider: storageProviderSchema,
    externalId: z.string().trim().min(1).max(512),
    url: z.string().url().max(2_048).optional(),
    providerVersion: z.string().trim().min(1).max(512).optional(),
    syncedAt: timestampSchema,
  })
  .strict();

const memoryObjectSchema = z
  .object({
    id: memoryIdSchema,
    title: z.string().trim().min(1).max(CORE_LIMITS.titleCharacters),
    content: z.string().min(1).max(CORE_LIMITS.contentCharacters),
    userPrompt: z.string().min(1).max(CORE_LIMITS.contentCharacters).optional(),
    assistantResponse: z.string().min(1).max(CORE_LIMITS.contentCharacters).optional(),
    userNote: z.string().min(1).max(CORE_LIMITS.noteCharacters).optional(),
    summary: z.string().trim().min(1).max(CORE_LIMITS.summaryCharacters).optional(),
    type: memoryTypeSchema,
    tags: tagsSchema,
    project: z.string().trim().min(1).max(CORE_LIMITS.projectCharacters).optional(),
    captureMode: captureModeSchema,
    source: memorySourceSchema,
    sensitivity: sensitivitySchema,
    contentHash: contentHashSchema,
    schemaVersion: z.literal(CURRENT_MEMORY_SCHEMA_VERSION),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    externalRefs: z.array(externalRefSchema),
  })
  .strict();

export const memorySchema = memoryObjectSchema.refine(
  (memory) => Date.parse(memory.updatedAt) >= Date.parse(memory.createdAt),
  "updatedAt must not be earlier than createdAt",
);

export const memorySummarySchema = memoryObjectSchema.pick({
  id: true,
  title: true,
  summary: true,
  type: true,
  tags: true,
  project: true,
  captureMode: true,
  source: true,
  sensitivity: true,
  createdAt: true,
  updatedAt: true,
  externalRefs: true,
}).strip();

export type Memory = z.infer<typeof memorySchema>;
export type MemorySummary = z.infer<typeof memorySummarySchema>;
export type MemoryType = z.infer<typeof memoryTypeSchema>;
export type CaptureMode = z.infer<typeof captureModeSchema>;
export type MemorySource = z.infer<typeof memorySourceSchema>;
export type Sensitivity = z.infer<typeof sensitivitySchema>;
export type StorageProvider = z.infer<typeof storageProviderSchema>;
export type ExternalRef = z.infer<typeof externalRefSchema>;
