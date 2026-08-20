import { z } from "zod";

import { storageProviderSchema } from "./memory.js";

export const destinationStatusSchema = z.enum([
  "ready",
  "degraded",
  "unavailable",
  "configuration_required",
]);

export const storageCapabilitiesSchema = z
  .object({
    fullTextSearch: z.boolean(),
    structuredFilters: z.boolean(),
    optimisticConcurrency: z.boolean(),
    softDelete: z.boolean(),
    maxContentCharacters: z.number().int().positive().optional(),
  })
  .strict();

export const destinationSchema = z
  .object({
    id: z.string().trim().min(1).max(128),
    provider: storageProviderSchema,
    displayName: z.string().trim().min(1).max(200),
    status: destinationStatusSchema,
    isDefault: z.boolean(),
    capabilities: storageCapabilitiesSchema,
  })
  .strict();

export type Destination = z.infer<typeof destinationSchema>;
export type DestinationStatus = z.infer<typeof destinationStatusSchema>;
export type StorageCapabilities = z.infer<typeof storageCapabilitiesSchema>;
