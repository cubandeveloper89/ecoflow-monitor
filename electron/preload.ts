import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { ConfigInput, PublicConfig } from './config'
import type { UpdateStatus } from './updater'

/** API mínima que ve la web (window.desktop). Solo existe dentro de la app de escritorio. */
const desktop = {
  getConfig: (): Promise<PublicConfig> => ipcRenderer.invoke('config:get'),
  saveConfig: (input: ConfigInput): Promise<{ ok: boolean; error?: string; restart?: boolean }> =>
    ipcRenderer.invoke('config:save', input),
  getInfo: (): Promise<{ version: string; dataDir: string; port: number }> => ipcRenderer.invoke('app:info'),
  openDataFolder: (): Promise<void> => ipcRenderer.invoke('app:open-data'),
  getUpdateStatus: (): Promise<UpdateStatus> => ipcRenderer.invoke('update:status'),
  checkForUpdates: (): Promise<UpdateStatus> => ipcRenderer.invoke('update:check'),
  installUpdate: (): Promise<void> => ipcRenderer.invoke('update:install'),
  onUpdateStatus: (cb: (s: UpdateStatus) => void) => {
    const fn = (_e: IpcRendererEvent, s: UpdateStatus) => cb(s)
    ipcRenderer.on('update:status', fn)
    return () => ipcRenderer.off('update:status', fn)
  },
  onOpenSettings: (cb: () => void) => {
    const fn = () => cb()
    ipcRenderer.on('settings:open', fn)
    return () => ipcRenderer.off('settings:open', fn)
  },
}

export type DesktopBridge = typeof desktop

contextBridge.exposeInMainWorld('desktop', desktop)
