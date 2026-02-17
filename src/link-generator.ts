/**
 * Affiliate Link Generator
 *
 * Generates unique tracking links for each affiliate network.
 * The subId embeds the agent's wallet address for attribution.
 *
 * INTEGRATION NOTE:
 * - Option 1: Use generateAffiliateLink() with affiliate network credentials
 * - Option 2: Call Laguna backend via lagunaClient.generateTrackingLink()
 */

import { config } from './config.js'

export type AffiliateNetwork = 'impact' | 'rakuten' | 'partnerize' | 'involve' | 'ichannel' | 'chinesean'

interface MerchantInfo {
  campaignId: string
  url: string
  deepLink?: string
  thirdPartyType: string
  metadata?: any
}

/**
 * Generate a unique subId that encodes the wallet address
 * Format: agent_{wallet_prefix}_{random}_{timestamp}
 *
 * This allows us to trace conversions back to the agent's wallet
 */
export function generateSubId(walletAddress: string): string {
  const walletPrefix = walletAddress.slice(2, 10).toLowerCase()
  const random = Math.random().toString(36).substring(2, 12)
  const timestamp = Date.now().toString(36)
  return `agent_${walletPrefix}_${random}_${timestamp}`
}

/**
 * Extract wallet prefix from subId (for postback processing)
 */
export function extractWalletPrefix(subId: string): string | null {
  const match = subId.match(/^agent_([a-f0-9]{8})_/)
  return match ? match[1] : null
}

/**
 * Generate affiliate link for any supported network
 *
 * NOTE: Requires network credentials in environment variables.
 * If credentials not available, fallback to Laguna backend.
 */
export async function generateAffiliateLink(
  network: AffiliateNetwork,
  merchant: MerchantInfo,
  subId: string
): Promise<string> {
  switch (network) {
    case 'impact':
      return generateImpactLink(merchant, subId)
    case 'rakuten':
      return generateRakutenLink(merchant, subId)
    case 'partnerize':
      return generatePartnerizeLink(merchant, subId)
    case 'involve':
      return generateInvolveLink(merchant, subId)
    case 'ichannel':
      return generateIChannelLink(merchant, subId)
    case 'chinesean':
      return generateChineseanLink(merchant, subId)
    default:
      throw new Error(`Unsupported affiliate network: ${network}`)
  }
}

// ============================================================
// Network-specific generators
// ============================================================

async function generateImpactLink(merchant: MerchantInfo, subId: string): Promise<string> {
  if (!config.IMPACT_ACCOUNT_SID || !config.IMPACT_AUTH_TOKEN) {
    throw new Error('Impact credentials not configured')
  }

  const params = new URLSearchParams({ subId1: subId, Type: 'vanity' })
  if (merchant.deepLink) params.set('DeepLink', merchant.deepLink)

  const response = await fetch(
    `https://api.impact.com/Mediapartners/${config.IMPACT_ACCOUNT_SID}/Programs/${merchant.campaignId}/TrackingLinks?${params}`,
    {
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.IMPACT_ACCOUNT_SID}:${config.IMPACT_AUTH_TOKEN}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
    }
  )

  if (!response.ok) throw new Error(`Impact API error: ${response.status}`)
  const data = await response.json()
  return data.TrackingURL
}

async function generateRakutenLink(merchant: MerchantInfo, subId: string): Promise<string> {
  if (!config.RAKUTEN_TOKEN) throw new Error('Rakuten credentials not configured')

  const response = await fetch('https://api.linksynergy.com/v1/links/deep_links', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.RAKUTEN_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: merchant.url,
      advertiser_id: Number(merchant.campaignId),
      u1: subId,
    }),
  })

  if (!response.ok) throw new Error(`Rakuten API error: ${response.status}`)
  const data = await response.json()
  return data.advertiser?.deep_link?.deep_link_url
}

async function generatePartnerizeLink(merchant: MerchantInfo, subId: string): Promise<string> {
  if (!config.PARTNERIZE_SID || !config.PARTNERIZE_TOKEN) {
    throw new Error('Partnerize credentials not configured')
  }

  const response = await fetch(
    `https://api.partnerize.com/v2/publishers/${config.PARTNERIZE_SID}/links`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.PARTNERIZE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        campaign_id: merchant.campaignId,
        params: [{ key: 'Pubref', value: subId }],
        active: true,
      }),
    }
  )

  if (!response.ok) throw new Error(`Partnerize API error: ${response.status}`)
  const data = await response.json()
  return data.link?.tracking_url
}

async function generateInvolveLink(merchant: MerchantInfo, subId: string): Promise<string> {
  // Involve uses URL construction (no API call needed)
  return `https://invol.co/click?offer_id=${merchant.campaignId}&aff_sub=${subId}`
}

async function generateIChannelLink(merchant: MerchantInfo, subId: string): Promise<string> {
  const url = new URL(merchant.url || 'https://www.ichannel.com/click')
  url.searchParams.set('subId', subId)
  return url.toString()
}

function generateChineseanLink(merchant: MerchantInfo, subId: string): string {
  if (merchant.metadata?.Url) {
    const url = new URL(merchant.metadata.Url)
    url.searchParams.set('mId', subId)
    return url.toString().replace('http://', 'https://')
  }

  const params = new URLSearchParams({
    wId: merchant.metadata?.websiteId || '',
    pId: merchant.metadata?.programId || '',
    cId: merchant.campaignId,
    mId: subId,
  })
  return `https://www.chinesean.com/affiliate/clickBanner.do?${params}`
}
