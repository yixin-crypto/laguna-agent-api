# Laguna Agent API

REST API for AI agents to earn USDT commissions via Laguna affiliate network.

## Overview

This API allows AI agents to:
- Search merchants with USDT cashback rates
- Generate affiliate links tied to their ERC-20 wallet
- Track clicks and purchases
- Check earnings by status
- Receive commission payouts in USDT

**Key Concept**: The agent's wallet address serves as their unique identifier (like email for human users). All links and earnings are tied to this address.

## Quick Start

```bash
# Install
yarn install

# Configure
cp .env.example .env
# Edit .env with database URL and Laguna backend URL

# Database setup
yarn db:generate
yarn db:migrate

# Run
yarn dev
```

## API Endpoints

### GET /api/start

Entry point for agents. Returns instructions and prompts for wallet address.

```bash
curl http://localhost:3100/api/start
```

Response:
```json
{
  "success": true,
  "data": {
    "message": "Welcome to Laguna Agent API...",
    "howItWorks": ["1. Provide your ERC-20 wallet address...", ...],
    "required": {
      "walletAddress": {
        "description": "Your ERC-20 wallet address - this is your unique agent ID",
        "format": "0x followed by 40 hexadecimal characters",
        "example": "0x1234567890abcdef1234567890abcdef12345678"
      }
    },
    "endpoints": {...}
  }
}
```

### GET /api/merchants/search?name=...

Search for a specific merchant by name. Returns match or suggests the best alternative.

**Path A: Agent knows the merchant name**

```bash
curl "http://localhost:3100/api/merchants/search?name=Nike"
```

Response (matched):
```json
{
  "success": true,
  "data": {
    "matched": true,
    "merchant": { "id": "nike", "name": "Nike", "category": "Fashion", "cashbackRateUsdt": 3.5 }
  }
}
```

Response (not matched — suggests best in similar category):
```json
{
  "success": true,
  "data": {
    "matched": false,
    "suggestion": {
      "message": "We don't have \"XYZ\". Here's the top merchant in Fashion:",
      "merchant": { "id": "nike", "name": "Nike", "category": "Fashion", "cashbackRateUsdt": 3.5 }
    }
  }
}
```

### GET /api/merchants/categories

**Path B: Agent doesn't know the merchant** — list all categories first.

```bash
curl http://localhost:3100/api/merchants/categories
```

Response:
```json
{
  "success": true,
  "data": {
    "categories": ["Fashion", "Food & Drink", "Travel"],
    "hint": "Pick a category, then call GET /api/merchants/top?category=<category>"
  }
}
```

### GET /api/merchants/top?category=...

Get the merchant with the highest USDT cashback rate in a category.

```bash
curl "http://localhost:3100/api/merchants/top?category=Travel"
```

Response:
```json
{
  "success": true,
  "data": {
    "merchant": { "id": "trip-com", "name": "Trip.com", "category": "Travel", "cashbackRateUsdt": 4.5 }
  }
}
```

### POST /api/links

Generate an affiliate link. Requires wallet address and merchant ID.

```bash
curl -X POST http://localhost:3100/api/links \
  -H "Content-Type: application/json" \
  -d '{"walletAddress": "0x1234...", "merchantId": "trip-com"}'
```

Response:
```json
{
  "success": true,
  "data": {
    "linkId": "uuid",
    "merchantName": "Trip.com",
    "cashbackRate": "4.5% USDT",
    "affiliateLink": "https://go.laguna.network/abc123X",
    "fullLink": "https://sg.trip.com/?affiliate_id=...",
    "walletAddress": "0x1234...",
    "subId": "agent_12345678_abc123_xyz"
  }
}
```

### GET /api/go/:code

Redirect short URL to full affiliate link. Tracks click count for analytics.

```bash
curl -L http://localhost:3100/api/go/abc123X
# → Redirects to full affiliate URL (e.g., https://sg.trip.com/?...)
```

### GET /api/links

Get all links for a wallet.

```bash
curl "http://localhost:3100/api/links?walletAddress=0x1234..."
```

### GET /api/links/:id/status

Get status of a specific link and its rewards.

```bash
curl http://localhost:3100/api/links/{linkId}/status
```

### GET /api/earnings

Check earnings for a wallet.

```bash
curl "http://localhost:3100/api/earnings?walletAddress=0x1234..."
```

Response:
```json
{
  "success": true,
  "data": {
    "walletAddress": "0x1234...",
    "totalEarnedUsdt": 150.50,
    "byStatus": {
      "not_tracked": 0,
      "pending": 25.00,
      "commissioned": 100.50,
      "paid": 50.00,
      "cancelled": 5.00
    },
    "totalLinks": 12,
    "recentTransactions": [...]
  }
}
```

### POST /api/webhooks/postback

Receive conversion postbacks from affiliate networks (called by Laguna backend).

```bash
curl -X POST http://localhost:3100/api/webhooks/postback \
  -H "Content-Type: application/json" \
  -d '{
    "subId": "agent_12345678_abc123_xyz",
    "orderId": "ORDER123",
    "orderAmount": 500.00,
    "commissionUsdt": 22.50,
    "status": "commissioned"
  }'
```

## Status Flow

```
NOT_TRACKED → PENDING → COMMISSIONED → PAID
                    ↘ CANCELLED
```

| Status | Description |
|--------|-------------|
| `NOT_TRACKED` | Click recorded, purchase not detected |
| `PENDING` | Purchase detected, awaiting merchant confirmation |
| `COMMISSIONED` | Confirmed by merchant, USDT credited |
| `PAID` | USDT sent to wallet |
| `CANCELLED` | Order cancelled or returned |

## Project Structure

```
laguna-agent-api/
├── prisma/
│   └── schema.prisma      # Database models (Agent, AgentLink, AgentReward)
├── src/
│   ├── index.ts           # Express server entry point
│   ├── routes.ts          # API endpoint handlers
│   ├── config.ts          # Environment configuration
│   ├── db.ts              # Prisma client
│   ├── laguna-client.ts   # Client to call Laguna backend
│   └── link-generator.ts  # Affiliate link generators per network
├── .env.example
├── package.json
└── tsconfig.json
```

## Integration with Laguna Backend

This API integrates with the main Laguna backend in two ways:

### 1. Fetch Merchants
Calls `/anonymous/list-merchant` to get merchants with USDT cashback rates.

### 2. Generate Links
Either:
- **Option A**: Use `link-generator.ts` with affiliate network credentials
- **Option B**: Call Laguna backend endpoint to generate links

### 3. Receive Postbacks
The Laguna backend should forward postbacks to `/api/webhooks/postback` when:
- A click is recorded
- A purchase is detected
- Commission status changes

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Server port (default: 3100) | No |
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `SHORT_URL_BASE` | Base URL for short links (default: https://go.laguna.network) | No |
| `LAGUNA_BACKEND_URL` | Main Laguna API URL | Yes |
| `LAGUNA_API_KEY` | API key for Laguna backend | No |

Optional (for direct link generation):
| Variable | Description |
|----------|-------------|
| `IMPACT_ACCOUNT_SID` | Impact network SID |
| `IMPACT_AUTH_TOKEN` | Impact network token |
| `RAKUTEN_TOKEN` | Rakuten API token |
| `PARTNERIZE_SID` | Partnerize publisher SID |
| `PARTNERIZE_TOKEN` | Partnerize API token |

## Database Schema

### Agent
Identified by ERC-20 wallet address (unique identifier like email for human users).

### AgentLink
Affiliate links with:
- `subId` - Unique tracking ID (embeds wallet prefix)
- `trackingUrl` - The affiliate link
- `cashbackRate` - USDT rate at time of creation

### AgentReward
Commission records with status tracking and payout info.

## MCP Server Integration

The [laguna-agent-skill](../laguna-agent-skill) MCP server calls this API:

```bash
LAGUNA_API_URL=http://localhost:3100/api npx laguna-agent-skill
```

## License

MIT
