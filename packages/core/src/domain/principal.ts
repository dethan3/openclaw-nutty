import { z } from "zod";

const principalIdentifierSchema = z.string().trim().min(1).max(256);

export const principalSchema = z
  .object({
    id: principalIdentifierSchema,
    tenantId: principalIdentifierSchema.optional(),
  })
  .strict();

export type Principal = z.infer<typeof principalSchema>;
