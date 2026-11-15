import { app, Notification } from 'electron'
import { EventEmitter } from 'node:events'
import { autoUpdater } from 'electron-updater'


/**
 * Actualizaciones automáticas desde GitHub Releases (cubandeveloper89/ecoflow-monitor).
 * - Revisa al arrancar y cada 6 horas; si hay versión nueva la descarga en segundo plano.
 * - Se instala al cerrar la app, o al momento con "Reiniciar y actualizar".
 * - Sin internet (apagones) falla en silencio y vuelve a intentar más tarde.
 */
export type UpdateStatus =
  | { state: 'idle' | 'checking' | 'none' | 'unsupported' }
  | { state: 'available'; version: string }
  | { state: 'downloading'; version: string; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string }

const CHECK_EVERY_MS = 6 * 3_600_000

export class Updater extends EventEmitter<{ status: [UpdateStatus] }> {
  status: UpdateStatus = { state: app.isPackaged ? 'idle' : 'unsupported' }
  private manual = false
  private nextVersion = ''

  constructor(private onClickNotification: () => void) {
    super()
    if (!app.isPackaged) return

    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.logger = null

    autoUpdater.on('checking-for-update', () => this.set({ state: 'checking' }))
    autoUpdater.on('update-not-available', () => this.set({ state: 'none' }))
    autoUpdater.on('update-available', (i) => {
      this.nextVersion = i.version
      this.set({ state: 'available', version: i.version })
    })
    autoUpdater.on('download-progress', (p) =>
      this.set({ state: 'downloading', version: this.nextVersion, percent: Math.round(p.percent) }),
    )
    autoUpdater.on('update-downloaded', (i) => {
      this.set({ state: 'downloaded', version: i.version })
      if (Notification.isSupported()) {
        const n = new Notification({
          title: `Actualización ${i.version} lista`,
          body: 'Se instalará al cerrar la app. Haz clic para verla.',
        })
        n.on('click', this.onClickNotification)
        n.show()
      }
    })
    autoUpdater.on('error', (e) => {
      // Errores de red en revisiones automáticas no se muestran
      if (this.manual) this.set({ state: 'error', message: e?.message?.split('\n')[0] ?? 'Error desconocido' })
      else this.set({ state: 'idle' })
    })

    setTimeout(() => this.check(false), 15_000)
    setInterval(() => this.check(false), CHECK_EVERY_MS)
  }

  private set(s: UpdateStatus) {
    // Una vez descargada, no volver atrás por revisiones posteriores
    if (this.status.state === 'downloaded' && s.state !== 'downloaded') return
    this.status = s
    this.emit('status', s)
  }

  async check(manual = true) {
    if (!app.isPackaged || this.status.state === 'downloaded') return this.status
    this.manual = manual
    try {
      await autoUpdater.checkForUpdates()
    } catch {
      /* lo maneja el evento 'error' */
    }
    return this.status
  }

  install() {
    if (this.status.state === 'downloaded') autoUpdater.quitAndInstall(false, true)
  }
}
