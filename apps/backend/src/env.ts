import { z } from "zod/v4";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3000),
  JWT_ACCESS_SECRET: z.string().min(1, "JWT_ACCESS_SECRET is required"),
  JWT_REFRESH_SECRET: z.string().min(1, "JWT_REFRESH_SECRET is required"),
  LEETCODE_USERNAME: z.string().optional(),
  LEETCODE_SESSION: z.string().optional(),
  LEETCODE_CSRF: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  CHROMA_URL: z.string().default("http://localhost:8000"),
  CHROMA_HOST: z.string().optional(),
  CHROMA_API_KEY: z.string().optional(),
  CHROMA_TENANT: z.string().optional(),
  CHROMA_DATABASE: z.string().optional(),
  RERANK_ENABLED: z.coerce.boolean().default(true),
  RERANK_MODEL: z.string().default("cross-encoder/ms-marco-MiniLM-L-6-v2"),
  RERANK_TOP_K: z.coerce.number().default(5),
  CONFIDENCE_LOW: z.coerce.number().default(0.5),
  CONFIDENCE_HIGH: z.coerce.number().default(0.8),
});

try {
  // eslint-disable-next-line node/no-process-env
  envSchema.parse(process.env);
}
catch (error) {
  if (error instanceof z.ZodError) {
    console.error("Missing environment variables:", error.issues.flatMap(issue => issue.path));
  }
  else {
    console.error(error);
  }
  process.exit(1);
}

// eslint-disable-next-line node/no-process-env
export const env = envSchema.parse(process.env);
