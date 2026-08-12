import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().default(8787),
  WEB_ORIGIN: z.string().default("http://localhost:5173"),
  DATABASE_PATH: z.string().default("./data/copilot.db"),
  LLM_PROVIDER: z.enum(["demo", "openai"]).default("demo"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
});

export const config = schema.parse(process.env);
