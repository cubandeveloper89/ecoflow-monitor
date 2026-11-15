import { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, shell } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { startServer, type EcoflowServer } from '../server/src/app'
import { setProtoPath } from '../server/src/appSource'
import type { Snapshot } from '../server/src/normalize'
import { loadConfig, saveConfig, toPublic, toSourceConfig, type AppConfig, type ConfigInput } from './config'
import { Notifier } from './notifier'
import { Updater } from './updater'

/**
 * Proceso principal de la app de escritorio.
 * Corre el mismo servidor de siempre (MQTT + SQLite + API) dentro de Electron y muestra la web en una ventana.
 * Al cerrar la ventana la app sigue en la bandeja del sistema, registrando datos y apagones.
 */

const APP_ID = 'com.cubandeveloper89.ecoflowmonitor'
const DEV_URL = process.env.VITE_DEV_SERVER_URL // lo pone scripts/dev.mjs
const startHidden = process.argv.includes('--hidden')
const forceMock = process.argv.includes('--mock') // npm run dev:mock

// Solo una instancia: si ya está abierta, la segunda le pide mostrarse y se cierra
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) app.exit(0)

app.setAppUserModelId(APP_ID) // necesario para notificaciones en Windows

const resource = (...p: string[]) => path.join(app.getAppPath(), ...p)
const iconPath = resource('build', 'icon.png')
const trayIconPath = resource('build', process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png')

let config: AppConfig
let server: EcoflowServer
let win: BrowserWindow | null = null
let tray: Tray | null = null
let updater: Updater
let quitting = false

// ---------- Ventana ----------

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 380,
    minHeight: 500,
    show: false,
    title: 'EcoFlow Monitor',
    backgroundColor: '#0b0d0c',
    autoHideMenuBar: true,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
    },
  })
  Menu.setApplicationMenu(null)

  win.loadURL(DEV_URL ?? `http://127.0.0.1:${server.port}`)
  win.once('ready-to-show', () => {
    if (!startHidden || showWhenReady) win?.show()
    if (DEV_URL) win?.webContents.openDevTools({ mode: 'detach' })
  })

  // Links externos → navegador
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
  // F12 / Ctrl+Shift+I abren las DevTools también en la versión instalada
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && (input.key === 'F12' || (input.control && input.shift && input.key === 'I'))) {
      win?.webContents.toggleDevTools()
    }
  })

  // Cerrar = esconder en la bandeja (la app sigue registrando)
  win.on('close', (e) => {
    if (quitting) return
    e.preventDefault()
    win?.hide()
  })
  win.on('closed', () => (win = null))
}

let showWhenReady = false

function showWindow() {
  // Puede llamarse antes de que el servidor esté listo (p. ej. abrir la app dos veces seguidas)
  if (!server) {
    showWhenReady = true
    return
  }
  if (!win) createWindow()
  if (win!.isMinimized()) win!.restore()
  win!.show()
  win!.focus()
}

function openSettings() {
  showWindow()
  win?.webContents.send('settings:open')
}

// ---------- Bandeja ----------

function trayStatus(s: Snapshot | null): string {
  if (!config.source && !forceMock) return 'Sin configurar'
  if (!s || s.soc == null) return server.online ? 'Conectando…' : 'Equipo sin conexión'
  const soc = `${Math.round(s.soc)} %`
  const net = (s.inW ?? 0) - (s.outW ?? 0)
  const flow = net > 5 ? `cargando ${Math.round(net)} W` : net < -5 ? `descargando ${Math.round(-net)} W` : 'en reposo'
  return s.gridOn === false ? `Apagón · ${soc} · ${flow}` : `${soc} · ${flow}`
}

function updateTray() {
  if (!tray) return
  const status = trayStatus(server.latest)
  tray.setToolTip(`EcoFlow Monitor\n${status}`)
  const u = updater.status
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Abrir EcoFlow Monitor', click: showWindow },
      { label: status, enabled: false },
      { type: 'separator' },
      { label: 'Configuración…', click: openSettings },
      {
        label: 'Iniciar con Windows',
        type: 'checkbox',
        checked: config.openAtLogin,
        click: (item) => {
          config = saveConfig(config, { openAtLogin: item.checked })
          applyLoginItem()
        },
      },
      u.state === 'downloaded'
        ? { label: `Reiniciar y actualizar a ${u.version}`, click: () => updater.install() }
        : {
            label: u.state === 'downloading' ? `Descargando actualización ${u.percent} %` : 'Buscar actualizaciones',
            enabled: app.isPackaged && u.state !== 'downloading' && u.state !== 'checking',
            click: () => updater.check(true),
          },
      { type: 'separator' },
      { label: `Versión ${app.getVersion()}`, enabled: false },
      {
        label: 'Salir',
        click: () => {
          quitting = true
          app.quit()
        },
      },
    ]),
  )
}

function createTray() {
  const img = nativeImage.createFromPath(trayIconPath)
  tray = new Tray(img.isEmpty() ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 }) : img)
  tray.on('click', showWindow)
  tray.on('double-click', showWindow)
  updateTray()
}

// ---------- Inicio con Windows ----------

function applyLoginItem() {
  if (!app.isPackaged) return // en desarrollo no registrar electron.exe
  app.setLoginItemSettings({ openAtLogin: config.openAtLogin, args: ['--hidden'] })
}

// ---------- IPC (window.desktop) ----------

function registerIpc() {
  ipcMain.handle('config:get', () => toPublic(config))

  ipcMain.handle('config:save', async (_e, input: ConfigInput) => {
    const prev = config
    config = saveConfig(config, input)
    applyLoginItem()
    updateTray()

    // Cambiar acceso por red o puerto exige reiniciar el servidor → reiniciar la app
    if (prev.lanAccess !== config.lanAccess || prev.port !== config.port) {
      setTimeout(() => {
        quitting = true
        app.relaunch()
        app.exit(0)
      }, 300)
      return { ok: true, restart: true }
    }

    if (input.source !== undefined) {
      const err = await new Promise<string | null>((resolve) => {
        const onError = (m: string) => resolve(m)
        server.once('sourceError', onError)
        server.setSource(toSourceConfig(config)).then(() => {
          server.off('sourceError', onError)
          resolve(null)
        })
      })
      if (err) return { ok: false, error: err }
    }
    return { ok: true }
  })

  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    dataDir: path.join(app.getPath('userData'), 'data'),
    port: server.port,
  }))
  ipcMain.handle('app:open-data', () => shell.openPath(path.join(app.getPath('userData'), 'data')))

  ipcMain.handle('update:status', () => updater.status)
  ipcMain.handle('update:check', () => updater.check(true))
  ipcMain.handle('update:install', () => updater.install())
}

// ---------- Arranque ----------

app.on('second-instance', showWindow)
app.on('before-quit', () => (quitting = true))
app.on('window-all-closed', () => {
  /* seguir en la bandeja */
})

/**
 * La primera vez en desarrollo, trae el historial que ya tenías de la versión web (./data/ecoflow.db)
 * a la carpeta de la app. Así la app instalada arranca con tus datos y apagones.
 */
function importLegacyData(dataDir: string) {
  const legacy = path.join(app.getAppPath(), 'data')
  if (app.isPackaged || fs.existsSync(path.join(dataDir, 'ecoflow.db'))) return
  if (!fs.existsSync(path.join(legacy, 'ecoflow.db'))) return
  fs.mkdirSync(dataDir, { recursive: true })
  for (const f of ['ecoflow.db', 'ecoflow.db-wal', 'ecoflow.db-shm']) {
    if (fs.existsSync(path.join(legacy, f))) fs.copyFileSync(path.join(legacy, f), path.join(dataDir, f))
  }
  console.log(`[main] historial importado de ${legacy}`)
}

app.whenReady().then(async () => {
  console.log('[main] iniciando', app.getVersion())
  config = loadConfig()
  // El .proto va fuera del asar (asarUnpack) para que protobufjs lo lea como archivo normal
  setProtoPath(resource('server', 'proto', 'ef_delta3.proto').replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`))

  const dataDir = path.join(app.getPath('userData'), 'data')
  importLegacyData(dataDir)

  server = await startServer({
    port: DEV_URL ? 3030 : config.port, // en desarrollo Vite redirige /api a :3030
    host: config.lanAccess ? '0.0.0.0' : '127.0.0.1',
    dataDir,
    staticDir: DEV_URL ? undefined : resource('web', 'dist'),
    fallbackPort: !DEV_URL,
  })

  console.log(`[main] servidor en http://127.0.0.1:${server.port}`)
  updater = new Updater(showWindow)
  const notifier = new Notifier(
    () => config.notifications,
    () => server.latest,
    showWindow,
    iconPath,
  )

  let lastTray = 0
  server.on('snapshot', (s) => {
    notifier.snapshot(s)
    if (Date.now() - lastTray > 5000) {
      lastTray = Date.now()
      updateTray()
    }
  })
  server.on('outage', (e) => {
    notifier.outage(e)
    updateTray()
  })
  server.on('status', updateTray)
  updater.on('status', (s) => {
    win?.webContents.send('update:status', s)
    updateTray()
  })

  registerIpc()
  applyLoginItem()
  // Antes de abrir la ventana, para que la web ya sepa si hay equipo configurado
  const connecting = server.setSource(forceMock ? { mode: 'mock', sn: 'SIMULADO' } : toSourceConfig(config))
  createWindow()
  createTray()
  await connecting
  updateTray()
})

app.on('will-quit', () => {
  server?.close()
})
