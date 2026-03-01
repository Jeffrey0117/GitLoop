# GitLoop

AI-native Git platform — the missing piece of your dev ecosystem.
Self-hosted Gitea + AI code review + Telegram notifications + CloudPipe deploy integration.

## Stack
- **Runtime**: Node.js + TypeScript (strict)
- **Git engine**: Gitea (self-hosted, Docker)
- **Validation**: zod
- **Notifications**: Telegram Bot API
- **AI**: Claude API (Haiku for reviews)
- **Entry**: `src/index.ts`

## Architecture

```
src/
  index.ts           ← Entry point, wires everything together
  config/
    env.ts           ← Environment config (zod validated)
  core/
    gitea-client.ts  ← Gitea REST API client
    mirror.ts        ← GitHub ↔ Gitea mirror sync
  webhook/
    server.ts        ← HTTP server for Gitea webhooks
  telegram/
    notifier.ts      ← Telegram push notifications
  ai/
    reviewer.ts      ← Claude-powered code review
  types/
    index.ts         ← Shared TypeScript types

docker/
  docker-compose.yml ← Gitea + GitLoop containers
  Dockerfile         ← GitLoop app image
```

## Key Features

### Webhook Pipeline
Gitea push/PR events → webhook server → parallel processing:
1. **Telegram notification** (instant)
2. **AI code review** (Claude Haiku, async)
3. **CloudPipe deploy trigger** (if configured)

### AI Code Review
- Auto-reviews every push and PR
- Checks: security, breaking changes, bugs, performance
- Results pushed to Telegram with severity levels
- Uses Claude Haiku (fast, cheap)

### GitHub Mirror
- Bidirectional sync between Gitea and GitHub
- GitHub as backup, Gitea as primary
- Config stored in `data/mirrors.json`

## Ecosystem Integration

```
ClaudeBot (手機指揮台)
    ↓ /deploy
GitLoop (版控循環)  ←→  GitHub (備份)
    ↓ webhook
CloudPipe (部署管道)
    ↓
Live services
```

## Code Style

- TypeScript strict mode
- ESM (type: "module")
- Immutable patterns — never mutate, always spread
- Small files (200-400 lines)
- Error handling with try/catch
- No console.log (use console.error for operational logs)
- Validate all input with zod

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GITEA_URL` | yes | Gitea instance URL |
| `GITEA_ADMIN_TOKEN` | yes | Gitea API token |
| `GITEA_WEBHOOK_SECRET` | no | Webhook HMAC secret |
| `TELEGRAM_BOT_TOKEN` | no | Telegram bot for notifications |
| `TELEGRAM_CHAT_ID` | no | Chat ID for notifications |
| `CLAUDE_API_KEY` | no | Claude API key for AI reviews |
| `PORT` | no | Webhook server port (default: 4100) |

## Running

### Development
```bash
npm run dev
```

### Docker (Gitea + GitLoop)
```bash
cd docker && docker-compose up -d
```

### Setup
```bash
npm run setup   # Interactive setup wizard
```
