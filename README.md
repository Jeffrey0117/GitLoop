<p align="center">
  <img src="gitloop-logo.png" alt="GitLoop" width="160" />
</p>

<h1 align="center">GitLoop</h1>

<p align="center">
  <strong>Your own GitHub. Except it thinks.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT" />
  <img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen" alt="Node 20+" />
  <img src="https://img.shields.io/badge/engine-Gitea-orange" alt="Gitea" />
</p>

<p align="center">
  <strong>English</strong> | <a href="README.zh-TW.md">繁體中文</a>
</p>

---

## Picture This

You push code. Before you even switch tabs:

> **AI Review:** No critical issues. 2 medium suggestions. Auto-approved.
> **Deploy triggered.** `myapp.yourdomain.com` updating...

A teammate pushes a commit with an exposed API key. Your phone buzzes:

> 🔴 **CRITICAL:** Hardcoded secret in `config.ts:42`. Blocked.

You reply from Telegram: "revert that commit." Done.

That's GitLoop. A self-hosted Git platform that **reads your code, reviews it, and tells you what happened** — before you ask.

---

## Why Not Just Use GitHub?

| | GitHub | GitLab Self-Hosted | **GitLoop** |
|---|---|---|---|
| Cost | $4+/mo for teams | Free but heavy | **Free, lightweight** |
| AI code review | Copilot ($19/mo) | None built-in | **Every push, free** |
| Telegram notifications | Email only | Email only | **Instant, interactive** |
| Auto-deploy integration | GitHub Actions | CI/CD config | **One webhook, zero YAML** |
| Voice operations | No | No | **"Merge PR 23" via ClaudeBot** |
| You own everything | No | Yes | **Yes** |
| Setup time | N/A | Hours | **5 minutes** |

GitHub is great. But GitHub doesn't know about your deployment platform. Doesn't push to your Telegram. Doesn't review code with AI automatically. Doesn't speak to your bot.

GitLoop does. Because it's **your** platform, built to fit **your** ecosystem.

---

## The Ecosystem: A Complete Loop

GitLoop is the final piece. The loop is now closed:

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│   ClaudeBot       You speak. AI writes code.            │
│   ↓               From your phone, via Telegram.        │
│                                                         │
│   GitLoop         Code lands here.                      │
│   ↓               AI reviews it. You get notified.      │
│                   GitHub stays as backup.                │
│                                                         │
│   CloudPipe       Deploys automatically.                │
│   ↓               Health checks. Rollback if needed.    │
│                                                         │
│   Live.           Your app is online.                   │
│                   The whole loop: under 2 minutes.      │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

| Tool | What It Does | Repo |
|------|-------------|------|
| [**ClaudeBot**](https://github.com/Jeffrey0117/ClaudeBot) | Write code from your phone via AI | Telegram command center |
| **GitLoop** | AI-native Git platform with smart reviews | *you are here* |
| [**CloudPipe**](https://github.com/Jeffrey0117/CloudPipe) | Self-hosted Vercel. Auto-deploys from Git push | Deploy + manage from chat |
| [**DevUp**](https://github.com/Jeffrey0117/DevUp) | New machine? One command rebuilds everything | Environment bootstrap |
| [**ZeroSetup**](https://github.com/Jeffrey0117/ZeroSetup) | Any project, double-click to run | Zero setup steps |

**Voice → Code → Review → Deploy → Live. Without opening a laptop.**

---

## What Makes GitLoop Different

### AI Reviews Every Push

Not a linter. Not a rule checker. An actual AI that **understands your code**:

```
📦 Push to myapp/main (3 commits)
by Jeffrey — fix: auth token validation

🤖 AI Review:
  ✅ No critical issues
  🟡 medium: src/auth.ts — Token expiry not checked on refresh
  💡 suggestion: Consider adding rate limiting to /api/login

  Approved with suggestions.
```

It catches things linters can't:
- **Security**: Exposed secrets, injection vectors, missing auth
- **Breaking changes**: API signature changes, removed fields
- **Logic bugs**: Off-by-one, null checks, race conditions
- **Performance**: N+1 queries, missing indexes, memory leaks

Powered by Claude Haiku — fast, cheap, and surprisingly good.

### Telegram-Native

GitHub sends you emails. You ignore them.

GitLoop sends you Telegram messages. You actually read them.

```
📦 Push to claudebot/master (2 commits)
  abc1234 fix: voice recognition timeout
  def5678 feat: add /deploy command

  [View Diff]  [Start Review]  [Deploy]

🟢 PR #12 opened in cloudpipe
  "Add Redis sync for multi-machine"
  by Jeffrey — feature/redis → main

  [View PR]  [Approve]  [Request Changes]
```

Interactive buttons. Inline diffs. Voice commands via ClaudeBot. Git operations from the bus.

### GitHub as Backup

You don't abandon GitHub. You **demote** it:

```
GitLoop (primary)     ←→     GitHub (mirror)
  ↓                              ↑
  Push here first          Auto-synced
  AI reviews here          Backup copy
  Webhooks here            Community access
```

- Every push to GitLoop auto-mirrors to GitHub
- GitHub stays as your public face and backup
- If GitLoop goes down, GitHub has everything
- If GitHub goes down, you don't care

### Zero-YAML Deploys

GitHub Actions needs `.github/workflows/deploy.yml` — 50 lines of YAML, debugging why the runner can't find Node 20.

GitLoop → CloudPipe: **one webhook**. Push triggers deploy. No config files. No CI runners. No YAML.

```
git push origin main
  → GitLoop receives push
  → AI reviews (parallel)
  → Triggers CloudPipe deploy
  → CloudPipe builds, starts, health-checks
  → Telegram: "✅ Deploy successful. 28s."
```

---

## Quick Start

### Option 1: Docker (Recommended)

```bash
git clone https://github.com/Jeffrey0117/GitLoop.git
cd GitLoop
cp .env.example .env        # edit with your tokens
cd docker && docker-compose up -d
```

Gitea runs on `:3000`, GitLoop webhook server on `:4100`.

### Option 2: Manual

```bash
git clone https://github.com/Jeffrey0117/GitLoop.git
cd GitLoop
npm install
npm run setup     # interactive wizard
npm run dev
```

> **Prerequisites:** Node.js 20+, a running Gitea instance.
> Optional: Telegram bot token (notifications), Claude API key (AI reviews).

---

## Architecture

```
src/
  index.ts              ← Entry point, wires everything
  config/env.ts         ← zod-validated environment
  core/
    gitea-client.ts     ← Gitea REST API client
    mirror.ts           ← GitHub ↔ Gitea sync
  webhook/
    server.ts           ← HTTP server for Gitea events
  telegram/
    notifier.ts         ← Push/PR/review notifications
  ai/
    reviewer.ts         ← Claude-powered code review
  types/
    index.ts            ← Shared TypeScript types
```

### How It Works

```
Gitea push event
  ↓
GitLoop webhook server (:4100)
  ↓
┌──────────────────────────────────┐
│  Parallel processing:            │
│  1. Telegram notification  →  📱 │
│  2. AI code review         →  🤖 │
│  3. CloudPipe deploy       →  🚀 │
│  4. GitHub mirror sync     →  🔄 │
└──────────────────────────────────┘
```

---

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `GITEA_URL` | Yes | Gitea instance URL |
| `GITEA_ADMIN_TOKEN` | Yes | Gitea API token |
| `GITEA_WEBHOOK_SECRET` | No | HMAC signature verification |
| `TELEGRAM_BOT_TOKEN` | No | Telegram bot for notifications |
| `TELEGRAM_CHAT_ID` | No | Where to send notifications |
| `CLAUDE_API_KEY` | No | AI code review (Claude Haiku) |
| `PORT` | No | Webhook server port (default: 4100) |

---

## Roadmap

- [x] Gitea webhook integration
- [x] Telegram push/PR notifications
- [x] AI code review (Claude Haiku)
- [x] GitHub mirror sync
- [ ] Web dashboard (commit history, review results)
- [ ] Intelligent merge conflict resolution
- [ ] Auto-generated changelogs
- [ ] Branch protection with AI rules
- [ ] ClaudeBot `/merge`, `/revert` commands
- [ ] Multi-user support with role-based access

---

## The Numbers

| | |
|---|---|
| AI review per push | **< 5 seconds** (Haiku) |
| Telegram notification | **Instant** |
| GitHub mirror sync | **< 10 seconds** |
| Deploy trigger | **Immediate** |
| Setup time | **5 minutes** |
| Monthly cost | **$0** (self-hosted) |
| External dependencies | **0** (GitHub optional) |

---

## License

MIT
