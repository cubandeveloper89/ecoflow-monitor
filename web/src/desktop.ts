/**
 * Puente con la app de escritorio (Electron). Solo existe dentro de la app:
 * en el navegador `desktop` es undefined y la UI esconde lo que depende de él.
 */
export type Mode = 'app' | 'open' | 'mock'

export interface SourceSettings {
  mode: Mode
  sn: string
  email?: string
  appHost?: string
  accessKey?: string
  apiHost?: string
}

export interface NotificationPrefs {
  outage: boolean
  lowBattery: boolean
  lowBatteryPct: number
  full: boolean
}

export interface PublicConfig {
  source: SourceSettings | null
  notifications: NotificationPrefs
  openAtLogin: boolean
  lanAccess: boolean
  port: number
  hasPassword: boolean
  hasSecretKey: boolean
}

export interface ConfigInput {
  source?: (SourceSettings & { password?: string; secretKey?: string }) | null
  notifications?: Partial<NotificationPrefs>
  openAtLogin?: boolean
  lanAccess?: boolean
  port?: number
}

export type UpdateStatus =
  | { state: 'idle' | 'checking' | 'none' | 'unsupported' }
  | { state: 'available'; version: string }
  | { state: 'downloading'; version: string; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string }

export interface DesktopBridge {
  getConfig(): Promise<PublicConfig>
  saveConfig(input: ConfigInput): Promise<{ ok: boolean; error?: string; restart?: boolean }>
  getInfo(): Promise<{ version: string; dataDir: string; port: number }>
  openDataFolder(): Promise<void>
  getUpdateStatus(): Promise<UpdateStatus>
  checkForUpdates(): Promise<UpdateStatus>
  installUpdate(): Promise<void>
  onUpdateStatus(cb: (s: UpdateStatus) => void): () => void
  onOpenSettings(cb: () => void): () => void
}

export const desktop = (window as unknown as { desktop?: DesktopBridge }).desktop
