import express from 'express'
import http from 'node:http'
import path from 'node:path'
import fs from 'node:fs'
import { EventEmitter } from 'node:events'
import type { AddressInfo } from 'node:net'
import { WebSocketServer, WebSocket } from 'ws'
import { EcoflowCloudSource, MockSource, type DataSource } from './sources.js'
import { EcoflowAppSource } from './appSource.js'
import { ecoflowApi } from './ecoflowApi.js'
import { initDb, recordSample, history, energyByDay, prune } from './db.js'
import type { Snapshot } from './normalize.js'
import { initOutages, trackGrid, outageReport, type OutageEvent } from './outages.js'

/** Cómo conectarse al EcoFlow. La usan tanto el .env (CLI) como la configuración de la app de escritorio. */
export interface SourceConfig {
  mode: 'app' | 'open' | 'mock'
  sn: string
  // modo app (API de la app móvil)
  email?: string
  password?: string
  appHost?: string
  // modo open (API oficial)
  accessKey?: string
  secretKey?: string
  apiHost?: string
}

/** Error de configuración (faltan datos): no tiene sentido reintentar */
class ConfigError extends Error {}

export function createSource(cfg: SourceConfig): DataSource {
  if (cfg.mode === 'mock') return new MockSource()
  if (!cfg.sn) throw new ConfigError('Falta el número de serie (SN)')
  if (cfg.mode === 'app') {
    if (!cfg.email || !cfg.password) throw new ConfigError('Faltan el correo o la contraseña de EcoFlow')
    return new EcoflowAppSource(
      { email: cfg.email, password: cfg.password, host: cfg.appHost || 'api.ecoflow.com' },
      cfg.sn,
    )
  }
  if (!cfg.accessKey || !cfg.secretKey) throw new ConfigError('Faltan la Access Key o la Secret Key')
  return new EcoflowCloudSource(
    { accessKey: cfg.accessKey, secretKey: cfg.secretKey, host: cfg.apiHost || 'https://api.ecoflow.com' },
    cfg.sn,
  )
}

export interface ServerOptions {
  port: number
  /** 127.0.0.1 = solo esta PC; 0.0.0.0 = también desde el móvil en la red local */
  host?: string
  dataDir: string
  /** Carpeta con el build de Vue (web/dist). Si no existe, solo se sirve la API. */
  staticDir?: string
  /** Si el puerto está ocupado, usar uno libre en vez de fallar */
  fallbackPort?: boolean
}

export interface ServerEvents {
  snapshot: [Snapshot]
  status: [boolean]
  outage: [OutageEvent]
  sourceError: [string]
}

export interface EcoflowServer extends EventEmitter<ServerEvents> {
  readonly port: number
  readonly latest: Snapshot | null
  readonly online: boolean
  /** Cambia la fuente de datos (al guardar la configuración). null = sin configurar */
  setSource(cfg: SourceConfig | null): Promise<void>
  close(): Promise<void>
}

export async function startServer(opts: ServerOptions): Promise<EcoflowServer> {
  initDb(opts.dataDir)
  initOutages()
  prune()
  const pruneTimer = setInterval(prune, 6 * 3_600_000)

  const events = new EventEmitter<ServerEvents>()
  let source: DataSource | null = null
  let sourceCfg: SourceConfig | null = null
  let latest: Snapshot | null = null
  let lastError: string | null = null

  const app = express()
  const server = http.createServer(app)
  const wss = new WebSocketServer({ server, path: '/ws' })

  const broadcast = (data: unknown) => {
    const msg = JSON.stringify(data)
    wss.clients.forEach((c) => c.readyState === WebSocket.OPEN && c.send(msg))
  }

  const hello = () => ({
    type: 'hello',
    configured: !!sourceCfg,
    mock: sourceCfg?.mode === 'mock',
    sn: sourceCfg?.sn ?? '',
    online: source?.online ?? false,
    error: lastError,
    data: latest,
  })

  wss.on('connection', (ws) => ws.send(JSON.stringify(hello())))

  app.get('/api/state', (_req, res) => res.json(hello()))
  app.get('/api/history', (req, res) => {
    const hours = Math.min(Number(req.query.hours ?? 24), 24 * 120)
    res.json(history(Date.now() - hours * 3_600_000))
  })
  app.get('/api/energy', (req, res) => res.json(energyByDay(Math.min(Number(req.query.days ?? 7), 120))))
  app.get('/api/outages', (req, res) => res.json(outageReport(Math.min(Number(req.query.days ?? 30), 120))))
  app.get('/api/raw', (_req, res) => res.json(source?.raw ?? {})) // útil para mapear claves nuevas
  app.get('/api/devices', async (_req, res) => {
    if (sourceCfg?.mode !== 'open') return res.status(400).json({ error: 'Solo disponible con la API oficial' })
    try {
      res.json(
        await ecoflowApi.listDevices({
          accessKey: sourceCfg.accessKey ?? '',
          secretKey: sourceCfg.secretKey ?? '',
          host: sourceCfg.apiHost || 'https://api.ecoflow.com',
        }),
      )
    } catch (e) {
      res.status(502).json({ error: (e as Error).message })
    }
  })

  if (opts.staticDir && fs.existsSync(opts.staticDir)) {
    app.use(express.static(opts.staticDir))
    app.get('*', (_req, res) => res.sendFile(path.join(opts.staticDir!, 'index.html')))
  }

  let retryTimer: NodeJS.Timeout | undefined
  const RETRY_MS = 60_000

  async function setSource(cfg: SourceConfig | null, isRetry = false) {
    clearTimeout(retryTimer)
    source?.stop()
    source?.removeAllListeners()
    source = null
    sourceCfg = cfg
    latest = null
    lastError = null

    if (cfg) {
      try {
        const s = createSource(cfg)
        source = s
        s.on('snapshot', (snap) => {
          if (source !== s) return
          latest = snap
          recordSample(snap)
          trackGrid(snap, (e) => {
            broadcast({ type: 'outage' })
            if (e) events.emit('outage', e)
          })
          broadcast({ type: 'snapshot', data: snap })
          events.emit('snapshot', snap)
        })
        s.on('status', (online) => {
          if (source !== s) return
          broadcast({ type: 'status', online })
          events.emit('status', online)
        })
        await s.start()
      } catch (e) {
        const msg = (e as Error).message
        // Los errores de la API traen código: "[1006] …". Sin código = red caída (apagón, sin internet)
        const network = !(e instanceof ConfigError) && !/\[\w+\]/.test(msg)
        lastError = network ? 'Sin conexión con EcoFlow. Reintentando cada minuto…' : msg
        console.error('[ecoflow] No se pudo iniciar la fuente:', msg)
        if (network) retryTimer = setTimeout(() => sourceCfg === cfg && setSource(cfg, true), RETRY_MS)
        if (!isRetry) events.emit('sourceError', lastError)
      }
    }
    broadcast(hello())
  }

  const listen = (port: number) =>
    new Promise<void>((resolve, reject) => {
      const onError = (err: NodeJS.ErrnoException) => {
        server.off('listening', onListening)
        reject(err)
      }
      const onListening = () => {
        server.off('error', onError)
        resolve()
      }
      server.once('error', onError)
      server.once('listening', onListening)
      server.listen(port, opts.host ?? '127.0.0.1')
    })

  try {
    await listen(opts.port)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EADDRINUSE' || !opts.fallbackPort) throw e
    console.warn(`[server] Puerto ${opts.port} ocupado, usando uno libre`)
    await listen(0)
  }

  return Object.assign(events, {
    get port() {
      return (server.address() as AddressInfo).port
    },
    get latest() {
      return latest
    },
    get online() {
      return source?.online ?? false
    },
    setSource,
    async close() {
      clearInterval(pruneTimer)
      clearTimeout(retryTimer)
      source?.stop()
      wss.clients.forEach((c) => c.terminate())
      await new Promise<void>((r) => server.close(() => r()))
    },
  })
}
