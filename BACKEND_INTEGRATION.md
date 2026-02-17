# Backend Integration Guide

**For: Backend Dev**
**Time to read: 5 min**

---

## What We Built

Two new repositories for AI agents to earn USDT commissions via affiliate links:

| Repo | Purpose | Stack |
|------|---------|-------|
| `laguna-agent-api` | REST API for agents | Express + Prisma + PostgreSQL |
| `laguna-agent-skill` | MCP Server (AI tool interface) | TypeScript + MCP SDK |

**Flow:**
```
AI Agent → MCP Server → Agent API → Laguna Backend → Affiliate Networks
```

---

## What You Need to Expose from Backend

### 1. GET `/api/merchants/search`

Search merchants with cashback rates.

**Request:**
```
GET /api/merchants/search?query=travel&category=shopping&limit=20
```

**Response needed:**
```json
{
  "merchants": [
    {
      "id": "uuid",
      "name": "Trip.com",
      "slugId": "trip-com",
      "logo": "https://...",
      "category": "Travel",
      "cashbackRates": [
        {
          "currency": "USDT",
          "cashbackPercent": 4.5,
          "cashbackAmount": null
        }
      ]
    }
  ]
}
```

**Fields required:**
- `id` - unique merchant ID
- `name` - display name
- `slugId` - URL slug
- `cashbackRates` - array with at least one USDT rate

> **Note:** Affiliate network details (impact, rakuten, etc.) are used internally for link generation only. They are NOT exposed to AI agents — agents only see merchant name, category, and USDT rates.

---

### 2. GET `/api/merchants/:id`

Get single merchant by ID.

**Response:** Same structure as above, single merchant object.

---

### 3. POST `/api/agent/generate-link`

Generate affiliate tracking link for an agent.

**Request:**
```json
{
  "merchantId": "uuid",
  "walletAddress": "0x1234567890abcdef...",
  "subId": "agent_12345678_abc123_xyz"
}
```

**Response:**
```json
{
  "trackingUrl": "https://sg.trip.com/?Allianceid=...",
  "subId": "agent_12345678_abc123_xyz"
}
```

**Important:**
- `walletAddress` = unique agent identifier (like email for human users)
- `subId` = our tracking ID embedded in the link, format: `agent_{walletHash}_{uniqueId}_{random}`
- Create agent record if wallet doesn't exist (auto-registration)

---

### 4. POST `/api/webhooks/postback`

Receive commission postbacks from affiliate networks.

**Request:**
```json
{
  "subId": "agent_12345678_abc123_xyz",
  "orderId": "ORDER123",
  "orderAmount": 150.00,
  "orderCurrency": "USD",
  "commission": 6.75,
  "status": "pending"
}
```

**Action needed:**
- Parse `subId` to identify agent wallet
- Convert commission to USDT
- Update reward status: `NOT_TRACKED` → `PENDING` → `COMMISSIONED` → `PAID` / `CANCELLED`

---

### 5. Automatic USDT Withdrawal on PAID

When a commission reaches `PAID` status, the Agent API automatically triggers a withdrawal to the agent's wallet using the existing backend withdrawal manager.

**How it works:**
1. Postback webhook receives `status: "paid"` or `"success"`
2. Agent API calls `POST /api/user/request-withdraw-dynamic-v2` on the backend
3. Backend's `OrderService.requestWithdrawDynamicV2` creates a `transactionHistory` record and queues the withdrawal job

**Request sent to backend:**
```json
{
  "data": [
    {
      "tokenId": "USDT",
      "wallet": "0xAgentWalletAddress",
      "quantity": "6.75"
    }
  ],
  "agentRewardId": "reward-uuid"
}
```

**Backend needs to:**
- [ ] Accept agent withdrawal requests via API key auth (no user session needed)
- [ ] Resolve `tokenId: "USDT"` to the actual tokenInfo UUID (query `tokenInfo` where `name = 'USDT'`)
- [ ] Skip the user order validation (`validateDataRequestWithdrawDynamic`) for agent withdrawals
- [ ] Process the withdrawal through the existing queue/payout pipeline

---

## Database Schema (Agent API)

Already created in `laguna-agent-api/prisma/schema.prisma`:

```prisma
model Agent {
  id            String   @id
  walletAddress String   @unique  // ERC-20 wallet = unique ID
  links         AgentLink[]
  rewards       AgentReward[]
}

model AgentLink {
  id           String   @id
  agentId      String
  merchantId   String
  subId        String   @unique   // Tracking ID
  trackingUrl  String             // Full affiliate URL
  shortCode    String   @unique   // Short URL code
  clickCount   Int                // Analytics
  rewards      AgentReward[]
}

model AgentReward {
  id             String   @id
  agentId        String
  linkId         String
  commissionUsdt Float
  status         RewardStatus  // NOT_TRACKED, PENDING, COMMISSIONED, PAID, CANCELLED
  txHash         String?       // Payout tx hash
}
```

---

## Deployment Checklist

### 1. Backend Changes
- [ ] Expose merchant search endpoint with USDT rates (no affiliate network details in response)
- [ ] Expose merchant detail endpoint
- [ ] Create agent link generation endpoint
- [ ] Handle wallet-based agent auto-registration
- [ ] Set up postback webhook handler
- [ ] Support agent withdrawals via `POST /api/user/request-withdraw-dynamic-v2` with API key auth (no user session)
- [ ] Resolve `tokenId: "USDT"` to tokenInfo UUID for agent withdrawal requests

### 2. Agent API Deployment
```bash
cd laguna-agent-api
cp .env.example .env
# Edit .env with:
#   DATABASE_URL=postgresql://...
#   LAGUNA_BACKEND_URL=https://api.laguna.network
#   SHORT_URL_BASE=https://go.laguna.network

yarn install
yarn db:push        # Create tables
yarn build
yarn start          # Runs on port 3100
```

### 3. MCP Server (OpenClaw Skill)
```bash
cd laguna-agent-skill
cp .env.example .env
# Edit .env with:
#   LAGUNA_AGENT_API_URL=https://agent-api.laguna.network

yarn install
yarn build
```

**Register on OpenClaw:**
1. Go to https://openclaw.ai
2. Upload `SKILL.md` from `laguna-agent-skill/`
3. Point to MCP server URL

**Register on Virtuals Protocol (agdp.io):**
1. Upload `acp-manifest.json` from `laguna-agent-skill/`

---

## API Endpoints Summary (Agent API)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/start` | GET | Onboarding info for agents |
| `/api/merchants/search` | GET | Search merchant by name |
| `/api/merchants/categories` | GET | List merchant categories |
| `/api/merchants/top` | GET | Top merchant in a category |
| `/api/links` | POST | Generate affiliate link (returns short URL) |
| `/api/go/:code` | GET | Redirect short URL → full affiliate URL |
| `/api/links` | GET | List agent's links |
| `/api/links/:id/status` | GET | Check link/reward status |
| `/api/earnings` | GET | Get agent's earnings |
| `/api/webhooks/postback` | POST | Receive commission callbacks |

---

## MCP Tools (for AI Agents)

| Tool | Purpose |
|------|---------|
| `laguna_get_started` | Prompt agent for wallet address |
| `laguna_search_merchants` | Search merchants by name/category |
| `laguna_generate_link` | Create affiliate link for merchant |
| `laguna_check_earnings` | Check commission status |

---

## Quick Test

```bash
# 1a. Search merchant by name
curl "http://localhost:3100/api/merchants/search?name=Nike"

# 1b. Browse categories then get top merchant
curl "http://localhost:3100/api/merchants/categories"
curl "http://localhost:3100/api/merchants/top?category=Travel"

# 2. Generate link
curl -X POST "http://localhost:3100/api/links" \
  -H "Content-Type: application/json" \
  -d '{"walletAddress":"0x1234...","merchantId":"merchant-uuid"}'

# 3. Test short URL redirect
curl -L "http://localhost:3100/api/go/abc123X"
```

---

## Questions?

The agent API code is in `/laguna-agent-api/src/`:
- `routes.ts` - all endpoints
- `laguna-client.ts` - calls to backend (update URLs here)
- `link-generator.ts` - affiliate link generation per network

The MCP server code is in `/laguna-agent-skill/src/`:
- `index.ts` - MCP tools definition
- `api.ts` - calls to agent API
