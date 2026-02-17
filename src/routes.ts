import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from './db.js'
import { lagunaClient } from './laguna-client.js'
import { generateSubId, generateAffiliateLink, AffiliateNetwork } from './link-generator.js'

const router = Router()

// Validation schemas
const walletAddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid ERC-20 wallet address')

const searchMerchantsSchema = z.object({
  query: z.string().optional(),
  category: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  perPage: z.coerce.number().min(1).max(100).default(20),
})

const generateLinkSchema = z.object({
  walletAddress: walletAddressSchema,
  merchantId: z.string().min(1),
})

const checkEarningsSchema = z.object({
  walletAddress: walletAddressSchema,
})

const checkLinkStatusSchema = z.object({
  walletAddress: walletAddressSchema,
  linkId: z.string().optional(),
})

// ============================================================
// ENDPOINTS
// ============================================================

/**
 * GET /start
 * Entry point that prompts agents for wallet address
 */
router.get('/start', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      message: 'Welcome to Laguna Agent API. Earn USDT commissions by sharing affiliate links.',
      howItWorks: [
        '1. Provide your ERC-20 wallet address (this is your UNIQUE IDENTIFIER - like an email for regular users)',
        '2. Search for merchants with cashback rates',
        '3. Generate an affiliate link tied to your wallet',
        '4. Share the link with your users or on social media',
        '5. Earn USDT when they make purchases - sent directly to your wallet',
      ],
      required: {
        walletAddress: {
          description: 'Your ERC-20 wallet address - this is your unique agent ID and where USDT is sent',
          important: 'The wallet address serves as your identity (like email for human users). All links and earnings are tied to this address.',
          format: '0x followed by 40 hexadecimal characters',
          example: '0x1234567890abcdef1234567890abcdef12345678',
          supportedNetworks: ['Ethereum', 'Base', 'Polygon', 'Arbitrum'],
        },
      },
      endpoints: {
        getStarted: 'GET /api/start (this endpoint)',
        searchMerchants: 'GET /api/merchants?query=travel',
        generateLink: 'POST /api/links { walletAddress, merchantId }',
        getMyLinks: 'GET /api/links?walletAddress=0x...',
        checkLinkStatus: 'GET /api/links/:id/status',
        checkEarnings: 'GET /api/earnings?walletAddress=0x...',
      },
      noWallet: {
        message: 'If you don\'t have a wallet, create one using:',
        options: [
          { name: 'MetaMask', url: 'https://metamask.io', type: 'browser extension' },
          { name: 'Rainbow', url: 'https://rainbow.me', type: 'mobile app' },
          { name: 'Coinbase Wallet', url: 'https://wallet.coinbase.com', type: 'mobile/browser' },
        ],
        programmatic: 'For programmatic creation: npm install viem && use generatePrivateKey() + privateKeyToAccount()',
      },
    },
  })
})

/**
 * GET /health
 * Health check endpoint
 */
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'laguna-agent-api',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  })
})

/**
 * GET /merchants
 * Search merchants with USDT cashback rates
 */
router.get('/merchants', async (req: Request, res: Response) => {
  try {
    const params = searchMerchantsSchema.parse(req.query)

    const result = await lagunaClient.searchMerchants(params)

    // Transform to simplified format for agents
    const merchants = result.merchants.map((m) => {
      const usdtRate = m.cashbackRates[0]
      return {
        id: m.slugId || m.id,
        name: m.name,
        description: m.description,
        category: m.category,
        imgUrl: m.imgUrl[0] || null,
        cashbackRateUsdt: usdtRate?.cashbackPercent || usdtRate?.cashbackAmount || 0,
      }
    })

    res.json({
      success: true,
      data: {
        merchants,
        total: result.total,
        page: result.page,
        perPage: result.perPage,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    res.status(400).json({ success: false, error: message })
  }
})

/**
 * GET /merchants/:id
 * Get single merchant details
 */
router.get('/merchants/:id', async (req: Request, res: Response) => {
  try {
    const merchant = await lagunaClient.getMerchant(req.params.id)

    if (!merchant) {
      return res.status(404).json({ success: false, error: 'Merchant not found' })
    }

    const usdtRate = merchant.cashbackRates[0]
    res.json({
      success: true,
      data: {
        id: merchant.slugId || merchant.id,
        name: merchant.name,
        description: merchant.description,
        category: merchant.category,
        url: merchant.url,
        imgUrl: merchant.imgUrl,
        cashbackRateUsdt: usdtRate?.cashbackPercent || usdtRate?.cashbackAmount || 0,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    res.status(400).json({ success: false, error: message })
  }
})

/**
 * POST /links
 * Generate affiliate link for an agent
 */
router.post('/links', async (req: Request, res: Response) => {
  try {
    const { walletAddress, merchantId } = generateLinkSchema.parse(req.body)
    const normalizedWallet = walletAddress.toLowerCase()

    // Get merchant details
    const merchant = await lagunaClient.getMerchant(merchantId)
    if (!merchant) {
      return res.status(404).json({ success: false, error: 'Merchant not found' })
    }

    if (merchant.cashbackRates.length === 0) {
      return res.status(400).json({ success: false, error: 'No USDT cashback available for this merchant' })
    }

    // Find or create agent
    let agent = await prisma.agent.findUnique({
      where: { walletAddress: normalizedWallet },
    })

    if (!agent) {
      agent = await prisma.agent.create({
        data: { walletAddress: normalizedWallet },
      })
    }

    // Generate unique subId
    const subId = generateSubId(normalizedWallet)

    // Generate tracking link
    let trackingUrl: string
    try {
      trackingUrl = await generateAffiliateLink(
        merchant.thirdPartyType as AffiliateNetwork,
        {
          campaignId: merchant.campaignId,
          url: merchant.url,
          thirdPartyType: merchant.thirdPartyType,
        },
        subId
      )
    } catch {
      // Fallback: try via Laguna backend
      trackingUrl = await lagunaClient.generateTrackingLink({
        merchantId: merchant.id,
        subId,
      })
    }

    // Save link record
    const usdtRate = merchant.cashbackRates[0]
    const link = await prisma.agentLink.create({
      data: {
        agentId: agent.id,
        merchantId: merchant.id,
        merchantName: merchant.name,
        merchantSlug: merchant.slugId || merchant.id,
        subId,
        trackingUrl,
        cashbackRate: usdtRate.cashbackPercent || usdtRate.cashbackAmount,
      },
    })

    res.json({
      success: true,
      data: {
        linkId: link.id,
        merchantName: merchant.name,
        cashbackRate: `${link.cashbackRate}% USDT`,
        affiliateLink: trackingUrl,
        walletAddress: normalizedWallet,
        subId: link.subId,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    res.status(400).json({ success: false, error: message })
  }
})

/**
 * GET /links
 * Get all links for a wallet
 */
router.get('/links', async (req: Request, res: Response) => {
  try {
    const { walletAddress } = checkLinkStatusSchema.parse(req.query)
    const normalizedWallet = walletAddress.toLowerCase()

    const agent = await prisma.agent.findUnique({
      where: { walletAddress: normalizedWallet },
      include: {
        links: {
          orderBy: { createdAt: 'desc' },
          include: {
            rewards: true,
          },
        },
      },
    })

    if (!agent) {
      return res.json({
        success: true,
        data: { links: [], total: 0 },
      })
    }

    const links = agent.links.map((link) => ({
      id: link.id,
      merchantName: link.merchantName,
      merchantSlug: link.merchantSlug,
      cashbackRate: `${link.cashbackRate}% USDT`,
      trackingUrl: link.trackingUrl,
      clickCount: link.clickCount,
      lastClickAt: link.lastClickAt,
      rewardCount: link.rewards.length,
      totalEarnings: link.rewards
        .filter((r) => r.status === 'COMMISSIONED' || r.status === 'PAID')
        .reduce((sum, r) => sum + r.commissionUsdt, 0),
      createdAt: link.createdAt,
    }))

    res.json({
      success: true,
      data: {
        walletAddress: normalizedWallet,
        links,
        total: links.length,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    res.status(400).json({ success: false, error: message })
  }
})

/**
 * GET /links/:id/status
 * Get status of a specific link and its rewards
 */
router.get('/links/:id/status', async (req: Request, res: Response) => {
  try {
    const link = await prisma.agentLink.findUnique({
      where: { id: req.params.id },
      include: {
        agent: true,
        rewards: {
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    if (!link) {
      return res.status(404).json({ success: false, error: 'Link not found' })
    }

    res.json({
      success: true,
      data: {
        id: link.id,
        walletAddress: link.agent.walletAddress,
        merchantName: link.merchantName,
        cashbackRate: `${link.cashbackRate}% USDT`,
        trackingUrl: link.trackingUrl,
        clickCount: link.clickCount,
        lastClickAt: link.lastClickAt,
        rewards: link.rewards.map((r) => ({
          id: r.id,
          orderId: r.orderId,
          orderAmount: r.orderAmount,
          orderCurrency: r.orderCurrency,
          commissionUsdt: r.commissionUsdt,
          status: r.status,
          txHash: r.txHash,
          paidAt: r.paidAt,
          createdAt: r.createdAt,
        })),
        createdAt: link.createdAt,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    res.status(400).json({ success: false, error: message })
  }
})

/**
 * GET /earnings
 * Get earnings summary for a wallet
 */
router.get('/earnings', async (req: Request, res: Response) => {
  try {
    const { walletAddress } = checkEarningsSchema.parse(req.query)
    const normalizedWallet = walletAddress.toLowerCase()

    const agent = await prisma.agent.findUnique({
      where: { walletAddress: normalizedWallet },
      include: {
        rewards: {
          orderBy: { createdAt: 'desc' },
        },
        links: true,
      },
    })

    if (!agent) {
      return res.json({
        success: true,
        data: {
          walletAddress: normalizedWallet,
          totalEarnedUsdt: 0,
          byStatus: {
            not_tracked: 0,
            pending: 0,
            commissioned: 0,
            paid: 0,
            cancelled: 0,
          },
          totalLinks: 0,
          recentTransactions: [],
        },
      })
    }

    // Calculate earnings by status
    const byStatus = {
      not_tracked: 0,
      pending: 0,
      commissioned: 0,
      paid: 0,
      cancelled: 0,
    }

    for (const reward of agent.rewards) {
      const amount = reward.commissionUsdt
      switch (reward.status) {
        case 'NOT_TRACKED':
          byStatus.not_tracked += amount
          break
        case 'PENDING':
          byStatus.pending += amount
          break
        case 'COMMISSIONED':
          byStatus.commissioned += amount
          break
        case 'PAID':
          byStatus.paid += amount
          break
        case 'CANCELLED':
          byStatus.cancelled += amount
          break
      }
    }

    const totalEarned = byStatus.commissioned + byStatus.paid

    // Recent transactions
    const recentTransactions = agent.rewards.slice(0, 10).map((r) => ({
      id: r.id,
      orderId: r.orderId,
      amount: r.commissionUsdt,
      status: r.status.toLowerCase(),
      txHash: r.txHash,
      createdAt: r.createdAt,
    }))

    res.json({
      success: true,
      data: {
        walletAddress: normalizedWallet,
        totalEarnedUsdt: totalEarned,
        byStatus,
        totalLinks: agent.links.length,
        recentTransactions,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    res.status(400).json({ success: false, error: message })
  }
})

/**
 * POST /webhooks/postback
 * Receive postback from affiliate networks
 * This endpoint should be called by the Laguna backend when a conversion happens
 */
router.post('/webhooks/postback', async (req: Request, res: Response) => {
  try {
    const {
      subId,
      orderId,
      orderAmount,
      orderCurrency,
      commissionUsdt,
      status,
      source,
    } = req.body

    // Find the link by subId
    const link = await prisma.agentLink.findUnique({
      where: { subId },
      include: { agent: true },
    })

    if (!link) {
      return res.status(404).json({ success: false, error: 'Link not found' })
    }

    // Map status
    let rewardStatus: 'NOT_TRACKED' | 'PENDING' | 'COMMISSIONED' | 'PAID' | 'CANCELLED'
    switch (status?.toLowerCase()) {
      case 'pending':
      case 'before_pending':
        rewardStatus = 'PENDING'
        break
      case 'commissioned':
      case 'approved':
        rewardStatus = 'COMMISSIONED'
        break
      case 'paid':
      case 'success':
        rewardStatus = 'PAID'
        break
      case 'cancelled':
      case 'reversed':
      case 'rejected':
        rewardStatus = 'CANCELLED'
        break
      default:
        rewardStatus = 'NOT_TRACKED'
    }

    // Check if we already have this reward
    let reward = await prisma.agentReward.findFirst({
      where: {
        linkId: link.id,
        orderId: orderId || undefined,
      },
    })

    if (reward) {
      // Update existing reward
      reward = await prisma.agentReward.update({
        where: { id: reward.id },
        data: {
          status: rewardStatus,
          commissionUsdt: commissionUsdt || reward.commissionUsdt,
          statusHistory: {
            ...(reward.statusHistory as any || {}),
            [new Date().toISOString()]: rewardStatus,
          },
          postbackData: req.body,
        },
      })
    } else {
      // Create new reward
      reward = await prisma.agentReward.create({
        data: {
          agentId: link.agentId,
          linkId: link.id,
          orderId,
          orderAmount: orderAmount || 0,
          orderCurrency: orderCurrency || 'USD',
          commissionUsdt: commissionUsdt || 0,
          status: rewardStatus,
          postbackSource: source,
          postbackData: req.body,
          statusHistory: {
            [new Date().toISOString()]: rewardStatus,
          },
        },
      })
    }

    res.json({
      success: true,
      data: {
        rewardId: reward.id,
        status: reward.status,
        walletAddress: link.agent.walletAddress,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    res.status(400).json({ success: false, error: message })
  }
})

export default router
