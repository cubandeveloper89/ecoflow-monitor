/**
 * Arranque por línea de comandos (npm run dev / npm start), configurado con el .env.
 * La app de escritorio usa startServer() directamente desde electron/main.ts.
 */
import path from 'node:path'
import { startServer, type SourceConfig } from './app.js'

const env = process.env
const cfg: SourceConfig = {
  mode: env.ECOFLOW_MOCK === '1' ? 'mock' : ((env.ECOFLOW_MODE ?? 'open') as 'open' | 'app'),
  sn: env.ECOFLOW_SN ?? '',
  email: env.ECOFLOW_EMAIL,
  password: env.ECOFLOW_PASSWORD,
  appHost: env.ECOFLOW_APP_HOST,
  accessKey: env.ECOFLOW_ACCESS_KEY,
  secretKey: env.ECOFLOW_SECRET_KEY,
  apiHost: env.ECOFLOW_API_HOST,
}

const root = path.resolve(import.meta.dirname, '../..')
const server = await startServer({
  port: Number(env.PORT ?? 3030),
  host: env.HOST ?? '0.0.0.0',
  dataDir: path.join(root, 'data'),
  staticDir: path.join(root, 'web/dist'),
})

const label = { mock: 'simulado', app: 'API app', open: 'API oficial' }[cfg.mode]
console.log(`EcoFlow Monitor en http://localhost:${server.port} (${label})`)
await server.setSource(cfg)

process.on('SIGINT', async () => {
  await server.close()
  process.exit(0)
})
