import { z } from "zod";

export const createTableSchema = z.object({
  name: z.string().min(2, "Минимум 2 символа"),
  type: z.enum(["companies", "people", "custom"]),
});

export type CreateTableForm = z.infer<typeof createTableSchema>;

export const integrationConfigSchema = z.object({
  apiKey: z.string().optional(),
  endpoint: z.string().url().or(z.literal("")).optional(),
});
