import { z } from 'zod'

const envSchema = z.object({
  PORT: z.string().default('3100'),
  DATABASE_URL: z.string(),

  // Laguna Backend API (to fetch merchants and generate links)
  LAGUNA_BACKEND_URL: z.string().default('https://api.laguna.network'),
  LAGUNA_API_KEY: z.string().optional(),

  // Affiliate network credentials (for direct link generation)
  IMPACT_ACCOUNT_SID: z.string().optional(),
  IMPACT_AUTH_TOKEN: z.string().optional(),
  RAKUTEN_TOKEN: z.string().optional(),
  PARTNERIZE_SID: z.string().optional(),
  PARTNERIZE_TOKEN: z.string().optional(),
  INVOLVE_API_KEY: z.string().optional(),
  ICHANNEL_API_KEY: z.string().optional(),
})

export const config = envSchema.parse(process.env)

export const SUPPORTED_NETWORKS = ['ethereum', 'base', 'polygon', 'arbitrum'] as const
export type SupportedNetwork = (typeof SUPPORTED_NETWORKS)[number]
