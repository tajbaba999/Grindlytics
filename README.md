# 🚀 LeetPulse

An AI-powered LeetCode analytics platform that syncs your coding profile, visualizes performance trends, and uses RAG to answer personalized questions about your strengths, weaknesses, and growth areas.

## 🎬 Demo

https://github.com/user-attachments/assets/bdb04e4e-7415-4aad-a99f-9c1ddf6b7950

## 💡 What it does

LeetPulse connects to your LeetCode account, syncs your entire solving history, and builds an AI chatbot that knows everything about your coding journey. Ask it anything — "What are my weakest topics?", "How many hard problems have I solved?", or "Give me a complete analysis" — and get answers grounded in your actual data.

### ✨ Features

- 🤖 **AI Chatbot** — RAG-powered assistant that answers questions about your LeetCode performance using your real data
- 📊 **Dashboard** — Stats cards, trend charts, difficulty breakdown, language distribution, and skill coverage
- 📝 **Questions** — Infinite-scroll problem list with difficulty and tag filters
- 🔥 **Activity** — GitHub-style submission heatmap, weakness radar chart, and topic-wise heat map
- 👤 **Profile** — Historical snapshots showing your growth over time
- 🔄 **Sync** — Real-time SSE-powered sync with 9-stage progress tracking

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Monorepo** | Turborepo + pnpm |
| **Backend** | Express 5, TypeScript, Prisma, BullMQ, Redis |
| **Frontend** | Next.js 16, React 19, Tailwind CSS 4 |
| **Database** | PostgreSQL (Neon) |
| **AI/RAG** | Google Gemini (embeddings + chat), ChromaDB (vector DB) |
| **Monitoring** | Prometheus, Loki, Grafana |

## 🚀 Getting Started

### 📋 Prerequisites

- [Node.js](https://nodejs.org/) 22+
- [pnpm](https://pnpm.io/) 9+
- [Docker](https://www.docker.com/) (for Docker setup)

### 🐳 Option 1: Docker (Recommended)

```bash
git clone https://github.com/tajbaba999/Grindlytics.git
cd Grindlytics

# Create the root .env file (for Docker services)
cp apps/backend/.env .env

# Start all services
docker compose up -d
```

**Services started:**

| Service | Port | Description |
|---------|------|-------------|
| `frontend` | 3001 | Next.js app |
| `backend` | 3000 | Express API |
| `redis` | 6379 | Job queue |
| `chroma` | 8000 | Vector database (local fallback) |
| `prometheus` | 9090 | Metrics |
| `grafana` | 3002 | Dashboards (admin/admin) |
| `loki` | 3100 | Log aggregation |

```bash
# Check status
docker compose ps

# View logs
docker compose logs -f backend

# Stop all services
docker compose down
```

### 💻 Option 2: Local Development

```bash
git clone https://github.com/tajbaba999/LeetRAG.git
cd LeetRAG

pnpm install
pnpm run dev
```

- **Frontend:** http://localhost:3001
- **Backend API:** http://localhost:3000

## 🔐 Environment Variables

All environment variables go in `apps/backend/.env`.

### ✅ Required

These must be set or the server won't start:

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host/db?sslmode=require` |
| `JWT_ACCESS_SECRET` | Secret for signing access tokens (15 min expiry) | Any random 64-char hex string |
| `JWT_REFRESH_SECRET` | Secret for signing refresh tokens (7 day expiry) | Any random 64-char hex string |

### 🤖 AI / RAG

| Variable | Required? | Description |
|----------|-----------|-------------|
| `GEMINI_API_KEY` | Yes (for chat) | Google AI Studio API key — powers the AI chatbot and embeddings |
| `CHROMA_HOST` | Optional | ChromaDB Cloud host (e.g. `api.trychroma.com`) — uses cloud if set |
| `CHROMA_API_KEY` | Optional | ChromaDB Cloud API key |
| `CHROMA_TENANT` | Optional | ChromaDB Cloud tenant ID |
| `CHROMA_DATABASE` | Optional | ChromaDB Cloud database name |
| `CHROMA_URL` | Optional | Local ChromaDB URL — defaults to `http://localhost:8000` (used by Docker) |

> If `CHROMA_API_KEY` + `CHROMA_TENANT` are set → uses ChromaDB Cloud.
> If not → falls back to local Docker ChromaDB at `CHROMA_URL`.

### 💻 LeetCode

| Variable | Required? | Description |
|----------|-----------|-------------|
| `LEETCODE_USERNAME` | Required | Your LeetCode username — used as default if not provided in requests |
| `LEETCODE_SESSION` | Required | Session cookie from LeetCode — required for the Questions page (authenticated API) |
| `LEETCODE_CSRF` | Required | CSRF token from LeetCode — required alongside `LEETCODE_SESSION` |

> Without LeetCode cookies, the Questions page won't load. All other features (sync, chat, dashboard) work without them.

### ⚡ Redis

| Variable | Required? | Description |
|----------|-----------|-------------|
| `REDIS_URL` | Optional | Redis connection string — defaults to `redis://localhost:6379`. Only needed for BullMQ background job queues |

### ⚙️ Server

| Variable | Required? | Description |
|----------|-----------|-------------|
| `NODE_ENV` | Optional | `development` (default), `production`, or `test` |
| `PORT` | Optional | Backend port — defaults to `3000` |

### 🍪 How to get LeetCode cookies

1. Log in to [leetcode.com](https://leetcode.com)
2. Open DevTools → Application → Cookies → `https://leetcode.com`
3. Copy the values of `LEETCODE_SESSION` and `csrftoken`
4. Add them to `apps/backend/.env`:

```
LEETCODE_SESSION=<paste session value>
LEETCODE_CSRF=<paste csrftoken value>
```

> These cookies expire. If the Questions page stops working, grab fresh ones.

## 🧪 API Testing

The project includes a [Bruno](https://www.usebruno.com/) API collection at `apps/backend/bruno/` with pre-configured requests for every endpoint.

### 📖 How to use

1. Open Bruno
2. Import the collection from `apps/backend/bruno/`
3. Select the **Localhost** environment
4. Start making requests

### 📂 What's included

| Folder | Endpoints |
|--------|-----------|
| **Auth** | Signup, Signin, Refresh Token |
| **Coding Profile** | Initial Sync, Sync, Get Profile, History, History Diff, Activity, Solved Questions |
| **LeetCode** | Profile, Progress, Contests, Skill Stats, Language Stats, Question Progress, Session Progress, Calendar |
| **RAG** | Ingest, Chat |

## 📁 Project Structure

```
LeetPulse/
├── apps/
│   ├── backend/              # Express API + RAG pipeline
│   │   ├── bruno/            # API testing collection
│   │   └── src/
│   │       ├── api/          # Route handlers
│   │       ├── services/rag/ # RAG pipeline (embeddings, ChromaDB, chat)
│   │       ├── workers/      # BullMQ background jobs
│   │       └── fetchers/     # LeetCode GraphQL queries
│   └── frontend/             # Next.js SPA
│       └── src/app/          # App router pages
├── packages/
│   ├── db/                   # Prisma schema + client
│   ├── eslint-config/        # Shared ESLint
│   └── typescript-config/    # Shared tsconfig
├── docker-compose.yml
└── turbo.json
```

## 🧠 RAG Pipeline

1. **Build Chunks** — Generates ~12 summary chunks (skills, weaknesses, contest, calendar) + 1 chunk per solved problem
2. **Diff Hashes** — SHA-256 hashing for incremental updates (only re-indexes changed data)
3. **Embed** — Gemini embedding-001 (768-dim vectors)
4. **Upsert** — Store vectors in ChromaDB (user-scoped)
5. **Chat** — Embed question → query ChromaDB for top-8 relevant chunks → build context → Gemini 2.5 Flash response

