# HousetechEditor (SyncForge)

A production-grade, local-first collaborative document editor built with **Next.js 16**, **React 19**, **Zustand**, **Dexie.js (IndexedDB)**, **Prisma**, **PostgreSQL**, **Auth.js (NextAuth)**, and **Socket.IO**.

---

## 🏗️ Architecture Overview

HousetechEditor follows a strict **Offline-First / Local-First** architecture. Browser user interactions write directly to local memory (Zustand store) and are persisted immediately in IndexedDB (via Dexie.js). Background processes then synchronize local edits to the central PostgreSQL server.

```
Browser UI (TipTap) 
      ↓
Zustand Store
      ↓
IndexedDB (Dexie.js) ──[Primary Source of Truth]
      ↓
Sync Queue (Pending operations)
      ↓
Background Sync Engine (HTTP POST /api/sync)
      ↓
Server (Next.js Route Handlers)
      ↓
PostgreSQL Database (Prisma)
```

Real-time cursors, typing indicators, and immediate keystroke syncing are handled out-of-band by a standalone **Socket.IO WebSockets Server**.

---

## 📂 Folder Structure

```
├── .github/
│   └── workflows/
│       └── ci.yml             # CI/CD GitHub Actions Configuration
├── prisma/
│   └── schema.prisma          # PostgreSQL Database Schema
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/          # Auth.js / NextAuth handler & Credentials API
│   │   │   ├── documents/     # Fetching, creating, deleting documents
│   │   │   ├── sync/          # Pushing local ops and pulling server ops
│   │   │   └── versions/      # Snapshot creation and version restorations
│   │   ├── auth/              # Login and Register pages
│   │   ├── dashboard/         # Dashboard layout showing stats & document lists
│   │   ├── document/          # Main document editor page
│   │   ├── globals.css        # Premium style overrides & TipTap prose CSS
│   │   ├── layout.tsx         # Root layout with Tailwind CSS setup
│   │   ├── page.tsx           # Glassmorphic Landing page
│   │   └── middleware.ts      # Auth route guard middleware
│   ├── components/
│   │   ├── connection-status.tsx  # Dynamic network & sync indicator
│   │   └── editor.tsx         # TipTap collaborative editor with cursor tracking
│   ├── lib/
│   │   ├── conflict/
│   │   │   └── merge.ts       # Sibling sorting conflict resolution logic
│   │   ├── crypto.ts          # Salted password hashing utilities
│   │   ├── db.ts              # Global Prisma Client instance
│   │   ├── dexie/
│   │   │   └── db.ts          # IndexedDB local storage database schemas
│   │   ├── editor/
│   │   │   └── block-id-extension.ts # TipTap UUID block identifier
│   │   ├── socket/
│   │   │   └── socket-client.ts # Collaboration WebSockets connection manager
│   │   ├── store/
│   │   │   └── editor-store.ts # Zustand editor state management store
│   │   ├── sync/
│   │   │   └── sync-engine.ts  # Background synchronization loops
│   │   └── utils.ts           # Classnames merging helper (cn)
│   └── socket-server/
│       └── server.ts          # Standalone Socket.IO WebSockets server
├── tests/
│   ├── conflict.test.ts       # Vitest unit tests for Lamport conflict resolution
│   └── e2e/
│       └── offline-editor.spec.ts # Playwright E2E offline transitions test
├── playwright.config.ts       # Playwright E2E configuration
├── vercel.json                # Vercel deployment headers & redirects
└── package.json               # Package manifests & scripts
```

---

## 🗄️ Database Schema (Prisma)

The PostgreSQL schema is structured as follows:

- **User**: Holds user account information and hashed credentials.
- **Workspace**: Belongs to an owner, groups documents.
- **Document**: Contains metadata and the latest compiled block JSON string.
- **DocumentMember**: Maps users to documents with specific RBAC roles: `OWNER`, `EDITOR`, or `VIEWER`.
- **DocumentVersion**: Retains git-like full snapshots of document block lists for audit versioning.
- **DocumentOperation**: Retains the linear sequence of CRDT block operations for syncing and merging.

---

## 🔒 Authentication & Authorization (RBAC)

### Authentication
Implemented via **Auth.js (NextAuth v5)** with:
- Credentials provider (using secure PBKDF2 salted password hashing).
- OAuth providers (GitHub and Google).
- JSON Web Token (JWT) sessions and cookie validation.
- Middleware-level page guards.

### Authorization Roles
Strict Role-Based Access Control (RBAC) is validated on both client-side and server-side:
- **OWNER**: Manage members, delete documents, and restore version snapshots.
- **EDITOR**: Edit document blocks, save version snapshots, and sync changes.
- **VIEWER**: Read-only access. Denied from broadcasting WebSockets, pushing operations to `/api/sync`, or creating snapshots.

---

## 🔄 Synchronization Engine & Conflict Resolution

### Background Sync Engine
1. **Network Listeners**: Tracks online/offline browser state.
2. **Operations Queue**: Store edits offline in Dexie's `syncQueue` table as `PENDING`.
3. **Batch Pushes**: On reconnecting, gathers pending operations (up to 100 per request) and POSTs to `/api/sync`.
4. **Exponential Backoff**: Retries on server connectivity loss with a progressive delay ($1\text{s} \to 2\text{s} \to 4\text{s} \to \dots \to 60\text{s}$).

### Deterministic Conflict Resolution (Lamport Merge)
We model a document as a list of distinct block nodes: `{ id: UUID, type: NodeType, content: HTML/JSON, prevId: ParentNodeID }`.
To merge concurrent operations from multiple clients without Last-Write-Wins (LWW) data loss:
1. Sort operations by `lamportTimestamp` (ascending).
2. Resolve ties by sorting lexicographically by `clientId`.
3. Sibling inserts sharing the same preceding block ID (`prevId`) are sorted descending by timestamp.
4. Traversal via Depth-First Search (DFS) rebuilds the document list identically on all machines.
5. Deletes are maintained as tombstones so child nodes can resolve their positioning.

---

## 🛡️ Security Safeguards

1. **Request Payload Limits**: Sync requests exceeding `1MB` are automatically rejected.
2. **JSON Bomb Protection**: Ingested sync payloads are parsed and rejected if JSON nesting depth exceeds `5`.
3. **Strict Tenant Isolation**: Server queries verify user membership against `DocumentMember` table before completing. Client IDs are never trusted blindly.

---

## ⚙️ Environment Variables

Create a `.env.local` file in the root directory:

```env
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/houseeditor?schema=public"

# Auth.js Secrets
NEXTAUTH_SECRET="your-32-character-random-base64-string"
AUTH_SECRET="your-32-character-random-base64-string"
NEXTAUTH_URL="http://localhost:3000"

# Optional OAuth
GITHUB_ID="github-client-id"
GITHUB_SECRET="github-client-secret"
GOOGLE_ID="google-client-id"
GOOGLE_SECRET="google-client-secret"

# Sockets (Optional: defaults to http://localhost:3001)
NEXT_PUBLIC_SOCKET_URL="http://localhost:3001"
```

---

## 🚀 Getting Started

### 1. Install dependencies
```bash
npm install --legacy-peer-deps
```

### 2. Configure Database & Prisma
```bash
# Push database schema to PostgreSQL
npx prisma db push

# Generate Prisma Client
npx prisma generate
```

### 3. Run Servers
Run the Next.js development server:
```bash
npm run dev
```

In a separate terminal, run the standalone Socket.IO collaboration server:
```bash
npx tsx src/socket-server/server.ts
```

Next.js will open on [http://localhost:3000](http://localhost:3000) and WebSockets on port `3001`.

---

## 🧪 Testing

### Unit Tests (Vitest)
Runs conflict resolution logic and deterministic merge validations:
```bash
npx vitest run tests/conflict.test.ts
```

### E2E Integration Tests (Playwright)
Runs offline transition mock tests:
```bash
# Install browsers
npx playwright install

# Run E2E tests
npx playwright test
```

---

## 🛡️ Tradeoffs & Future Improvements

- **Local Storage Quota Limits**: In browsers, IndexedDB is restricted by disk space. Adding an eviction mechanism for extremely old operation logs once snapshots are confirmed by the server would prevent database bloat.
- **WebSocket Server Scalability**: Currently, the Socket.IO server tracks rooms in-memory. For horizontal scaling in production, we should deploy a Redis Adapter to share rooms across multiple Socket.IO server nodes.
