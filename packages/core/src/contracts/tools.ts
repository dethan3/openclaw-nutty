import { z } from "zod";

import { destinationSchema } from "../domain/destination.js";
import {
  CORE_LIMITS,
  captureModeSchema,
  memoryIdSchema,
  memorySchema,
  memorySourceSchema,
  memorySummarySchema,
  memoryTypeSchema,
  sensitivitySchema,
  tagsSchema,
  timestampSchema,
} from "../domain/memory.js";

const destinationIdSchema = z.string().trim().min(1).max(128);

export const saveMemoryInputSchema = z
  .object({
    content: z.string().min(1).max(CORE_LIMITS.contentCharacters),
    captureMode: captureModeSchema,
    source: memorySourceSchema,
    destinationId: destinationIdSchema.optional(),
    userPrompt: z.string().min(1).max(CORE_LIMITS.contentCharacters).optional(),
    assistantResponse: z.string().min(1).max(CORE_LIMITS.contentCharacters).optional(),
    userNote: z.string().min(1).max(CORE_LIMITS.noteCharacters).optional(),
    title: z.string().trim().min(1).max(CORE_LIMITS.titleCharacters).optional(),
    summary: z.string().trim().min(1).max(CORE_LIMITS.summaryCharacters).optional(),
    type: memoryTypeSchema.optional(),
    tags: tagsSchema.optional(),
    project: z.string().trim().min(1).max(CORE_LIMITS.projectCharacters).optional(),
    sensitivity: sensitivitySchema.optional(),
    sensitiveConfirmationToken: z.string().min(1).max(2_048).optional(),
    saveIntentId: z.string().uuid().optional(),
  })
  .strict();

export const saveMemoryOutputSchema = z
  .object({
    outcome: z.enum(["created", "existing"]),
    memory: memorySummarySchema,
    skippedFields: z.array(z.string()),
    warnings: z.array(z.string()),
  })
  .strict();

export const searchMemoriesInputSchema = z
  .object({
    query: z.string().trim().min(1).max(2_000).optional(),
    destinationId: destinationIdSchema.optional(),
    types: z.array(memoryTypeSchema).max(8).optional(),
    tags: tagsSchema.optional(),
    project: z.string().trim().min(1).max(CORE_LIMITS.projectCharacters).optional(),
    surfaces: z.array(memorySourceSchema.shape.surface).max(5).optional(),
    createdFrom: timestampSchema.optional(),
    createdTo: timestampSchema.optional(),
    cursor: z.string().min(1).max(2_048).optional(),
    limit: z.number().int().min(1).max(100).default(20),
  })
  .strict()
  .refine(
    (input) =>
      input.createdFrom === undefined ||
      input.createdTo === undefined ||
      Date.parse(input.createdFrom) <= Date.parse(input.createdTo),
    "createdFrom must not be later than createdTo",
  );

export const searchMemoriesOutputSchema = z
  .object({
    items: z.array(memorySummarySchema),
    nextCursor: z.string().optional(),
  })
  .strict();

export const getMemoryInputSchema = z
  .object({
    id: memoryIdSchema,
    destinationId: destinationIdSchema.optional(),
  })
  .strict();

export const getMemoryOutputSchema = z
  .object({
    memory: memorySchema,
  })
  .strict();

const updateMemoryPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(CORE_LIMITS.titleCharacters).optional(),
    summary: z.string().trim().min(1).max(CORE_LIMITS.summaryCharacters).nullable().optional(),
    type: memoryTypeSchema.optional(),
    tags: tagsSchema.optional(),
    project: z.string().trim().min(1).max(CORE_LIMITS.projectCharacters).nullable().optional(),
    sensitivity: sensitivitySchema.optional(),
    content: z.string().min(1).max(CORE_LIMITS.contentCharacters).optional(),
    userPrompt: z.string().min(1).max(CORE_LIMITS.contentCharacters).nullable().optional(),
    assistantResponse: z
      .string()
      .min(1)
      .max(CORE_LIMITS.contentCharacters)
      .nullable()
      .optional(),
    userNote: z.string().min(1).max(CORE_LIMITS.noteCharacters).nullable().optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, "patch must change at least one field");

export const updateMemoryInputSchema = z
  .object({
    id: memoryIdSchema,
    destinationId: destinationIdSchema.optional(),
    patch: updateMemoryPatchSchema,
    replaceOriginal: z.boolean().default(false),
    expectedVersion: z.string().min(1).max(512).optional(),
  })
  .strict()
  .superRefine((input, context) => {
    const changesOriginal =
      input.patch.content !== undefined ||
      input.patch.userPrompt !== undefined ||
      input.patch.assistantResponse !== undefined;

    if (changesOriginal && !input.replaceOriginal) {
      context.addIssue({
        code: "custom",
        message: "replaceOriginal must be true when changing original content",
        path: ["replaceOriginal"],
      });
    }
  });

export const updateMemoryOutputSchema = getMemoryOutputSchema;

export const listDestinationsInputSchema = z.object({}).strict();

export const listDestinationsOutputSchema = z
  .object({
    destinations: z.array(destinationSchema),
  })
  .strict();

export type SaveMemoryInput = z.input<typeof saveMemoryInputSchema>;
export type SaveMemoryOutput = z.output<typeof saveMemoryOutputSchema>;
export type SearchMemoriesInput = z.input<typeof searchMemoriesInputSchema>;
export type SearchMemoriesOutput = z.output<typeof searchMemoriesOutputSchema>;
export type GetMemoryInput = z.input<typeof getMemoryInputSchema>;
export type GetMemoryOutput = z.output<typeof getMemoryOutputSchema>;
export type UpdateMemoryInput = z.input<typeof updateMemoryInputSchema>;
export type UpdateMemoryOutput = z.output<typeof updateMemoryOutputSchema>;
export type ListDestinationsOutput = z.output<typeof listDestinationsOutputSchema>;
