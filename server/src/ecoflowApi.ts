import crypto from 'node:crypto'

/**
 * Cliente mínimo de la API oficial de EcoFlow (Developer Platform / IoT Open).
 * Docs: https://developer.ecoflow.com/us/document/generalInfo
 */
export interface EcoflowCredentials {
  accessKey: string
  secretKey: string
  host: string // ej. https://api-a.ecoflow.com
}

export interface MqttCertification {
  certificateAccount: string
  certificatePassword: string
  url: string
  port: string
  protocol: string
}

export interface DeviceInfo {
  sn: string
  deviceName?: string
  online: number
  productName?: string
}

/** Aplana objetos anidados: {a:{b:1}, c:[1,2]} -> {"a.b":1, "c[0]":1, "c[1]":2} */
function flatten(obj: Record<string, unknown>, prefix = '', out: Record<string, string> = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (item !== null && typeof item === 'object') flatten(item as Record<string, unknown>, `${key}[${i}]`, out)
        else out[`${key}[${i}]`] = String(item)
      })
    } else if (v !== null && typeof v === 'object') {
      flatten(v as Record<string, unknown>, key, out)
    } else if (v !== undefined) {
      out[key] = String(v)
    }
  }
  return out
}

function signHeaders(creds: EcoflowCredentials, params: Record<string, unknown> = {}) {
  const nonce = String(Math.floor(100000 + Math.random() * 900000))
  const timestamp = String(Date.now())
  const flat = flatten(params)
  const sorted = Object.keys(flat)
    .sort()
    .map((k) => `${k}=${flat[k]}`)
    .join('&')
  const base = `accessKey=${creds.accessKey}&nonce=${nonce}&timestamp=${timestamp}`
  const toSign = sorted ? `${sorted}&${base}` : base
  const sign = crypto.createHmac('sha256', creds.secretKey).update(toSign).digest('hex')
  return { accessKey: creds.accessKey, nonce, timestamp, sign }
}

async function get<T>(creds: EcoflowCredentials, path: string, query: Record<string, string> = {}): Promise<T> {
  const qs = new URLSearchParams(query).toString()
  const res = await fetch(`${creds.host}${path}${qs ? `?${qs}` : ''}`, {
    headers: { ...signHeaders(creds, query), 'Content-Type': 'application/json;charset=UTF-8' },
  })
  const body = (await res.json()) as { code: string; message: string; data: T }
  if (body.code !== '0') throw new Error(`EcoFlow API ${path}: [${body.code}] ${body.message}`)
  return body.data
}

export const ecoflowApi = {
  listDevices: (c: EcoflowCredentials) => get<DeviceInfo[]>(c, '/iot-open/sign/device/list'),
  quotaAll: (c: EcoflowCredentials, sn: string) =>
    get<Record<string, unknown>>(c, '/iot-open/sign/device/quota/all', { sn }),
  certification: (c: EcoflowCredentials) => get<MqttCertification>(c, '/iot-open/sign/certification'),
}
