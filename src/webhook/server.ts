import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from '../config/env.js'
import type { GiteaPushEvent, GiteaPREvent } from '../types/index.js'

type WebhookHandler = {
  readonly onPush?: (event: GiteaPushEvent) => Promise<void>
  readonly onPullRequest?: (event: GiteaPREvent) => Promise<void>
}

let handlers: WebhookHandler = {}
let serverInstance: Server | null = null

export function setWebhookHandlers(h: WebhookHandler): void {
  handlers = h
}

export function stopServer(): void {
  if (serverInstance) {
    serverInstance.close()
    serverInstance = null
  }
}

function verifySignature(payload: string, signature: string): boolean {
  const secret = env.GITEA_WEBHOOK_SECRET
  if (!secret) return true
  const hmac = createHmac('sha256', secret)
  const expected = hmac.update(payload).digest('hex')
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  } catch {
    return false
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    req.on('error', reject)
  })
}

async function handleWebhook(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'text/plain' })
    res.end('Method Not Allowed')
    return
  }
  const body = await readBody(req)
  const signature = (req.headers['x-gitea-signature'] as string) ?? ''
  if (env.GITEA_WEBHOOK_SECRET && !verifySignature(body, signature)) {
    res.writeHead(401, { 'Content-Type': 'text/plain' })
    res.end('Invalid signature')
    return
  }
  const event = req.headers['x-gitea-event'] as string
  try {
    const payload = JSON.parse(body)
    switch (event) {
      case 'push':
        await handlers.onPush?.(payload as GiteaPushEvent)
        break
      case 'pull_request':
        await handlers.onPullRequest?.(payload as GiteaPREvent)
        break
      default:
        console.error(`[webhook] Unhandled event: ${event}`)
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
  } catch (error) {
    console.error(`[webhook] Error processing ${event}:`, error)
    res.writeHead(500, { 'Content-Type': 'text/plain' })
    res.end('Internal Server Error')
  }
}

function handleHealth(_req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ status: 'ok', service: 'gitloop' }))
}

export function startServer(): void {
  const server = createServer((req, res) => {
    const url = req.url ?? '/'
    if (url === '/health' || url === '/api/health') {
      handleHealth(req, res)
      return
    }
    if (url === '/webhook' || url === '/api/webhook') {
      handleWebhook(req, res).catch((err) => {
        console.error('[webhook] Unhandled error:', err)
        if (!res.headersSent) {
          res.writeHead(500)
          res.end('Internal Server Error')
        }
      })
      return
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not Found')
  })

  serverInstance = server

  let retryCount = 0
  const MAX_RETRIES = 15

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE' && retryCount < MAX_RETRIES) {
      retryCount++
      const delay = Math.min(retryCount * 500, 3000)
      console.error(`[gitloop] Port ${env.PORT} busy, retry ${retryCount}/${MAX_RETRIES} in ${delay}ms...`)
      setTimeout(() => server.listen(env.PORT), delay)
    } else if (err.code === 'EADDRINUSE') {
      console.error(`[gitloop] Port ${env.PORT} still busy after ${MAX_RETRIES} retries, running without webhook server`)
    } else {
      console.error('[gitloop] Server error:', err)
    }
  })

  server.listen(env.PORT, () => {
    console.error(`[gitloop] Webhook server listening on :${env.PORT}`)
  })
}
