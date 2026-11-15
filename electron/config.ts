import { app, safeStorage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { SourceConfig } from '../server/src/app'

/**
 * Configuración de la app de escritorio, guardada en la carpeta de usuario:
 *   Windows: %APPDATA%\EcoFlow Monitor\config.json
 * La contraseña y la Secret Key se cifran con safeStorage (DPAPI en Windows).
 */
export interface NotificationPrefs {
  outage: boolean
  lowBattery: boolean
  lowBatteryPct: number
  full: boolean
}

export interface AppConfig {
  source: Omit<SourceConfig, 'password' | 'secretKey'> | null
  secrets: { password?: string; secretKey?: string }
  notifications: NotificationPrefs
  openAtLogin: boolean
  /** Permitir abrir el monitor desde el móvil en la red local */
  lanAccess: boolean
  port: number
}

/** Lo que ve la interfaz: sin secretos, solo si están guardados */
export type PublicConfig = Omit<AppConfig, 'secrets'> & { hasPassword: boolean; hasSecretKey: boolean }

/** Lo que manda la interfaz al guardar. Secretos vacíos o ausentes = conservar los actuales */
export type ConfigInput = Partial<Omit<AppConfig, 'secrets' | 'source'>> & {
  source?: (Omit<SourceConfig, 'password' | 'secretKey'> & { password?: string; secretKey?: string }) | null
}

const DEFAULTS: AppConfig = {
  source: null,
  secrets: {},
  notifications: { outage: true, lowBattery: true, lowBatteryPct: 20, full: false },
  openAtLogin: true,
  lanAccess: false,
  port: 3030,
}

const file = () => path.join(app.getPath('userData'), 'config.json')

const encrypt = (v: string) =>
  safeStorage.isEncryptionAvailable() ? 'enc:' + safeStorage.encryptString(v).toString('base64') : 'raw:' + v

const decrypt = (v?: string) => {
  if (!v) return undefined
  try {
    if (v.startsWith('enc:')) return safeStorage.decryptString(Buffer.from(v.slice(4), 'base64'))
    if (v.startsWith('raw:')) return v.slice(4)
  } catch {
    /* cifrado de otro usuario/equipo: hay que volver a escribirla */
  }
  return undefined
}

export function loadConfig(): AppConfig {
  try {
    const saved = JSON.parse(fs.readFileSync(file(), 'utf8')) as Partial<AppConfig>
    return {
      ...DEFAULTS,
      ...saved,
      notifications: { ...DEFAULTS.notifications, ...saved.notifications },
      secrets: saved.secrets ?? {},
    }
  } catch {
    return structuredClone(DEFAULTS)
  }
}

export function saveConfig(current: AppConfig, input: ConfigInput): AppConfig {
  const next: AppConfig = {
    ...current,
    ...(input.notifications ? { notifications: { ...current.notifications, ...input.notifications } } : {}),
    ...(input.openAtLogin !== undefined ? { openAtLogin: input.openAtLogin } : {}),
    ...(input.lanAccess !== undefined ? { lanAccess: input.lanAccess } : {}),
    ...(input.port ? { port: input.port } : {}),
    secrets: { ...current.secrets },
  }
  if (input.source !== undefined) {
    if (input.source === null) {
      next.source = null
    } else {
      const { password, secretKey, ...rest } = input.source
      next.source = { ...rest, sn: rest.sn.trim(), email: rest.email?.trim() }
      if (password) next.secrets.password = encrypt(password)
      if (secretKey) next.secrets.secretKey = encrypt(secretKey)
    }
  }
  fs.mkdirSync(path.dirname(file()), { recursive: true })
  fs.writeFileSync(file(), JSON.stringify(next, null, 2))
  return next
}

export function toSourceConfig(c: AppConfig): SourceConfig | null {
  if (!c.source) return null
  return { ...c.source, password: decrypt(c.secrets.password), secretKey: decrypt(c.secrets.secretKey) }
}

export function toPublic(c: AppConfig): PublicConfig {
  const { secrets, ...rest } = c
  return { ...rest, hasPassword: !!decrypt(secrets.password), hasSecretKey: !!decrypt(secrets.secretKey) }
}
