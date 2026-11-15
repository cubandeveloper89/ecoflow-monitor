// npm run dev → Vite (web con recarga al instante) + Electron con el servidor dentro.
// Si cambias algo en electron/ o server/, Electron se reinicia solo.
import { createServer } from 'vite'
import { fork, spawn } from 'node:child_process'
import path from 'node:path'
import electronPath from 'electron'

const root = path.resolve(import.meta.dirname, '..')

const vite = await createServer({ configFile: path.join(root, 'web/vite.config.ts'), root: path.join(root, 'web') })
await vite.listen()
const url = vite.resolvedUrls.local[0]
console.log(`[dev] Vite en ${url}`)

let electron = null
let restarting = false
let timer
const startElectron = () => {
  electron = spawn(electronPath, ['.', ...process.argv.slice(2)], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, VITE_DEV_SERVER_URL: url },
  })
  electron.on('exit', () => {
    if (!restarting) {
      vite.close()
      process.exit(0)
    }
  })
}
const restart = () => {
  clearTimeout(timer)
  timer = setTimeout(() => {
    if (!electron) return startElectron()
    restarting = true
    electron.once('exit', () => {
      restarting = false
      startElectron()
    })
    electron.kill()
  }, 800)
}

// esbuild en modo watch avisa cada vez que termina de compilar
const builder = fork(path.join(root, 'scripts/build-electron.mjs'), ['--watch'], { cwd: root })
builder.on('message', (m) => m === 'built' && restart())
process.on('SIGINT', () => {
  electron?.kill()
  builder.kill()
  process.exit(0)
})
