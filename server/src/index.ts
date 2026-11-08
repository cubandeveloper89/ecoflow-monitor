import express from 'express'
import http from 'node:http'
import path from 'node:path'
import fs from 'node:fs'
import { WebSocketServer, WebSocket } from 'ws'
import { EcoflowCloudSource, MockSource, type DataSource } from './sources.js'
import { ecoflowApi, type EcoflowCredentials } from './ecoflowApi.js'
import { recordSample, history, energyByDay, prune } from './db.js'
import type { Snapshot } from './normalize.js'

const PORT = Number(process.env.PORT ?? 3030)
const MOCK = process.env.ECOFLOW_MOCK === '1'
const creds: EcoflowCredentials = {
  accessKey: process.env.ECOFLOW_ACCESS_KEY ?? '',
  secretKey: process.env.ECOFLOW_SECRET_KEY ?? '',
  host: process.env.ECOFLOW_API_HOST ?? 'https://api.ecoflow.com',
}
const SN = process.env.ECOFLOW_SN ?? ''

if (!MOCK && (!creds.accessKey || !creds.secretKey || !SN)) {
  console.error('Faltan ECOFLOW_ACCESS_KEY / ECOFLOW_SECRET_KEY / ECOFLOW_SN en .env (o usa npm run dev:mock)')
  process.exit(1)
}

const source: DataSource = MOCK ? new MockSource() : new EcoflowCloudSource(creds, SN)
let latest: Snapshot | null = null

const app = express()
const server = http.createServer(app)
const wss = new WebSocketServer({ server, path: '/ws' })

const broadcast = (data: unknown) => {
  const msg = JSON.stringify(data)
  wss.clients.forEach((c) => c.readyState === WebSocket.OPEN && c.send(msg))
}

source.on('snapshot', (s) => {
  latest = s
  recordSample(s)
  broadcast({ type: 'snapshot', data: s })
})
source.on('status', (online) => broadcast({ type: 'status', online }))

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'hello', mock: MOCK, sn: SN, online: source.online, data: latest }))
})

app.get('/api/state', (_req, res) => res.json({ mock: MOCK, sn: SN, online: source.online, data: latest }))
app.get('/api/history', (req, res) => {
  const hours = Math.min(Number(req.query.hours ?? 24), 24 * 120)
  res.json(history(Date.now() - hours * 3_600_000))
})
app.get('/api/energy', (req, res) => res.json(energyByDay(Math.min(Number(req.query.days ?? 7), 120))))
app.get('/api/raw', (_req, res) => res.json(source.raw)) // útil para mapear claves nuevas
app.get('/api/devices', async (_req, res) => {
  try {
    res.json(await ecoflowApi.listDevices(creds))
  } catch (e) {
    res.status(502).json({ error: (e as Error).message })
  }
})

// En producción sirve el build de Vue
const dist = path.resolve(import.meta.dirname, '../../web/dist')
if (fs.existsSync(dist)) {
  app.use(express.static(dist))
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')))
}

server.listen(PORT, async () => {
  console.log(`EcoFlow Monitor en http://localhost:${PORT} ${MOCK ? '(modo simulado)' : ''}`)
  prune()
  setInterval(prune, 6 * 3_600_000)
  try {
    await source.start()
  } catch (e) {
    console.error('[ecoflow] No se pudo iniciar la fuente:', (e as Error).message)
  }
})

process.on('SIGINT', () => {
  source.stop()
  process.exit(0)
})
