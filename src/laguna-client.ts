/**
 * Client for Laguna Backend API
 * Fetches merchants and generates affiliate links via the main backend
 */

import { config } from './config.js'

export interface Merchant {
  id: string
  slugId: string
  name: string
  description: string
  url: string
  imgUrl: string[]
  category: string
  thirdPartyType: string // impact, rakuten, partnerize, involve, ichannel, chinesean
  campaignId: string
  cashbackRates: CashbackRate[]
}

export interface CashbackRate {
  id: string
  tokenName: string
  tokenSymbol: string
  cashbackPercent: number
  cashbackAmount: number
}

export interface SearchMerchantsParams {
  query?: string
  category?: string
  page?: number
  perPage?: number
}

export interface GenerateLinkParams {
  merchantId: string
  subId: string
}

class LagunaBackendClient {
  private baseUrl: string
  private apiKey?: string

  constructor() {
    this.baseUrl = config.LAGUNA_BACKEND_URL
    this.apiKey = config.LAGUNA_API_KEY
  }

  private async fetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    }

    if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers,
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.message || `API error: ${response.status}`)
    }

    return response.json()
  }

  /**
   * Search merchants from Laguna backend
   * Filters for USDT cashback rates only
   */
  async searchMerchants(params: SearchMerchantsParams): Promise<{
    merchants: Merchant[]
    total: number
    page: number
    perPage: number
  }> {
    const searchParams = new URLSearchParams()
    if (params.query) searchParams.set('search', params.query)
    if (params.category) searchParams.set('category', params.category)
    if (params.page) searchParams.set('page', params.page.toString())
    if (params.perPage) searchParams.set('perPage', params.perPage.toString())

    // Call the anonymous/list-merchant endpoint
    const response = await this.fetch<any>(
      `/anonymous/list-merchant?${searchParams.toString()}`
    )

    // Filter for USDT rates and transform
    const merchants = (response.data || []).map((m: any) => ({
      id: m.id,
      slugId: m.slugId || m.id,
      name: m.name,
      description: m.description || '',
      url: m.url,
      imgUrl: m.imgUrl || [],
      category: m.categoryMerchant?.[0]?.name || 'General',
      thirdPartyType: m.thirdPartyType,
      campaignId: m.campaignId,
      cashbackRates: (m.cashBackRates || [])
        .filter((r: any) =>
          r.tokenInfo?.name?.toLowerCase().includes('usdt') ||
          r.tokenInfo?.symbol?.toLowerCase().includes('usdt')
        )
        .map((r: any) => ({
          id: r.id,
          tokenName: r.tokenInfo?.name || 'USDT',
          tokenSymbol: r.tokenInfo?.symbol || 'USDT',
          cashbackPercent: Number(r.cashbackPercent || 0),
          cashbackAmount: Number(r.cashbackAmount || 0),
        })),
    })).filter((m: Merchant) => m.cashbackRates.length > 0)

    return {
      merchants,
      total: merchants.length,
      page: params.page || 1,
      perPage: params.perPage || 20,
    }
  }

  /**
   * Get merchant by ID or slug
   */
  async getMerchant(id: string): Promise<Merchant | null> {
    try {
      const response = await this.fetch<any>(`/anonymous/merchant/${id}`)
      const m = response.data

      if (!m) return null

      return {
        id: m.id,
        slugId: m.slugId || m.id,
        name: m.name,
        description: m.description || '',
        url: m.url,
        imgUrl: m.imgUrl || [],
        category: m.categoryMerchant?.[0]?.name || 'General',
        thirdPartyType: m.thirdPartyType,
        campaignId: m.campaignId,
        cashbackRates: (m.cashBackRates || [])
          .filter((r: any) =>
            r.tokenInfo?.name?.toLowerCase().includes('usdt') ||
            r.tokenInfo?.symbol?.toLowerCase().includes('usdt')
          )
          .map((r: any) => ({
            id: r.id,
            tokenName: r.tokenInfo?.name || 'USDT',
            tokenSymbol: r.tokenInfo?.symbol || 'USDT',
            cashbackPercent: Number(r.cashbackPercent || 0),
            cashbackAmount: Number(r.cashbackAmount || 0),
          })),
      }
    } catch {
      return null
    }
  }

  /**
   * Generate tracking link via Laguna backend
   * This calls the user/link-refer endpoint with a virtual user
   */
  async generateTrackingLink(params: GenerateLinkParams): Promise<string> {
    // For agent links, we call a dedicated endpoint or construct manually
    // The subId is used for tracking
    const response = await this.fetch<any>(`/anonymous/merchant/${params.merchantId}/tracking-link`, {
      method: 'POST',
      body: JSON.stringify({ subId: params.subId }),
    })

    return response.data?.linkTracking || response.linkTracking
  }
}

export const lagunaClient = new LagunaBackendClient()
