import { EventEmitter } from 'node:events'
import crypto from 'node:crypto'
import path from 'node:path'
import protobuf from 'protobufjs'
import mqtt, { type MqttClient } from 'mqtt'
import { normalize, type Snapshot } from './normalize.js'
import type { DataSource } from './sources.js'

/**
 * Fuente "app": usa la misma API privada que la app móvil de EcoFlow (login con correo y contraseña).
 * Necesaria para modelos que la API oficial no deja leer (ej. DELTA 3 Plus → error 1006).
 *
 * Flujo (basado en github.com/tolwi/hassio-ecoflow-cloud):
 *  1. POST /auth/login                → token + userId
 *  2. GET  /iot-auth/app/certification → credenciales MQTT
 *  3. MQTT: escucha /app/device/property/{sn} y .../thing/property/get_reply
 *  4. Publica un "get all" protobuf en .../thing/property/get para pedir el estado completo
 *
 * Los mensajes del Delta 3 / 3 Plus son protobuf (ef_delta3.proto), a veces con pdata cifrado por XOR.
 */

interface AppCreds {
  email: string
  password: string
  host: string // ej. api.ecoflow.com (sin https://)
}

interface Login {
  token: string
  userId: string
}

interface Cert {
  url: string
  port: string
  certificateAccount: string
  certificatePassword: string
}

const PROTO_PATH = path.resolve(import.meta.dirname, '../proto/ef_delta3.proto')

async function apiJson<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const body = (await res.json()) as { code: string | number; message: string; data: T }
  if (String(body.code) !== '0') throw new Error(`${new URL(url).pathname}: [${body.code}] ${body.message}`)
  return body.data
}

async function login(c: AppCreds): Promise<Login> {
  const data = await apiJson<{ token: string; user: { userId: string } }>(`https://${c.host}/auth/login`, {
    method: 'POST',
    headers: { lang: 'en_US', 'content-type': 'application/json' },
    body: JSON.stringify({
      email: c.email,
      password: Buffer.from(c.password).toString('base64'),
      scene: 'IOT_APP',
      userType: 'ECOFLOW',
    }),
  })
  return { token: data.token, userId: String(data.user.userId) }
}

async function certification(c: AppCreds, l: Login): Promise<Cert> {
  return apiJson<Cert>(`https://${c.host}/iot-auth/app/certification?userId=${l.userId}`, {
    headers: { lang: 'en_US', authorization: `Bearer ${l.token}`, 'content-type': 'application/json' },
  })
}

/** Mensajes protobuf que sabemos decodificar: [cmdFunc, cmdId] → tipo */
const DECODERS: Array<[number, number, string]> = [
  [254, 21, 'Delta3DisplayPropertyUpload'],
  [254, 22, 'Delta3RuntimePropertyUpload'],
  [32, 2, 'Delta3CMSHeartBeatReport'],
]
const BMS_HEARTBEAT = new Set(['3,1', '3,2', '3,30', '3,50', '32,1', '32,3', '32,50', '32,51'])

export class EcoflowAppSource extends EventEmitter implements DataSource {
  raw: Record<string, unknown> = {}
  online = false
  private client?: MqttClient
  private timer?: NodeJS.Timeout
  private root?: protobuf.Root
  private userId = ''

  constructor(private creds: AppCreds, private sn: string) {
    super()
  }

  private setOnline(v: boolean) {
    if (v !== this.online) {
      this.online = v
      this.emit('status', v)
    }
  }

  /** Decodifica un payload MQTT (HeaderMessage con 1..n headers) y devuelve los campos */
  decode(buf: Buffer): Record<string, unknown> {
    const root = this.root!
    const HeaderMessage = root.lookupType('Delta3HeaderMessage')
    let msg: protobuf.Message & { header?: Array<Record<string, any>> }
    try {
      msg = HeaderMessage.decode(buf) as typeof msg
      if (!msg.header?.length) throw new Error('vacío')
    } catch {
      // Algunos payloads vienen en base64
      msg = HeaderMessage.decode(Buffer.from(buf.toString(), 'base64')) as typeof msg
    }

    const out: Record<string, unknown> = {}
    for (const h of msg.header ?? []) {
      let pdata: Buffer = h.pdata ? Buffer.from(h.pdata) : Buffer.alloc(0)
      if (!pdata.length) continue
      if (h.encType === 1 && h.src !== 32) {
        const seq = (h.seq ?? 0) & 0xff
        pdata = Buffer.from(pdata.map((b) => b ^ seq))
      }
      const key = `${h.cmdFunc ?? 0},${h.cmdId ?? 0}`
      const typeName =
        DECODERS.find(([f, i]) => `${f},${i}` === key)?.[2] ??
        (BMS_HEARTBEAT.has(key) ? 'Delta3BMSHeartBeatReport' : undefined)
      if (!typeName) continue
      try {
        const T = root.lookupType(typeName)
        Object.assign(out, T.toObject(T.decode(pdata), { longs: Number, enums: Number, bytes: String }))
      } catch {
        /* mensaje que no encaja con el proto: ignorar */
      }
    }
    return out
  }

  /** "Dame todo": header vacío con src/dest 32, igual que la app al abrir el equipo */
  private quotaRequest(): Uint8Array {
    const Send = this.root!.lookupType('Delta3SendHeaderMsg')
    return Send.encode(
      Send.create({ msg: [{ src: 32, dest: 32, seq: 999900000 + crypto.randomInt(10000, 99999), from: 'Android' }] }),
    ).finish()
  }

  async start() {
    this.root = await protobuf.load(PROTO_PATH)

    const l = await login(this.creds)
    this.userId = l.userId
    console.log('[ecoflow-app] login OK')
    const cert = await certification(this.creds, l)

    this.client = mqtt.connect(`mqtts://${cert.url}:${cert.port}`, {
      username: cert.certificateAccount,
      password: cert.certificatePassword,
      clientId: `ANDROID_${crypto.randomUUID().replace(/-/g, '').toUpperCase()}_${l.userId}`,
      reconnectPeriod: 5000,
      protocolVersion: 4,
    })

    const dataTopic = `/app/device/property/${this.sn}`
    const getTopic = `/app/${this.userId}/${this.sn}/thing/property/get`
    const getReplyTopic = `${getTopic}_reply`

    const askAll = () => this.client?.connected && this.client.publish(getTopic, Buffer.from(this.quotaRequest()))

    this.client.on('connect', () => {
      console.log('[ecoflow-app] MQTT conectado')
      this.client!.subscribe([dataTopic, getReplyTopic], (err) => {
        if (err) console.error('[ecoflow-app] subscribe:', err.message)
        else askAll()
      })
    })
    this.client.on('error', (e) => console.error('[ecoflow-app] MQTT error:', e.message))
    this.client.on('close', () => this.setOnline(false))
    this.client.on('message', (_topic, payload) => {
      try {
        const fields = this.decode(payload)
        if (!Object.keys(fields).length) return
        Object.assign(this.raw, fields)
        this.setOnline(true)
        this.emit('snapshot', normalize(this.raw) satisfies Snapshot)
      } catch (e) {
        if (process.env.ECOFLOW_DEBUG === '1') console.warn('[ecoflow-app] no se pudo decodificar:', (e as Error).message)
      }
    })

    // El equipo manda cambios solo cuando algo varía; pedimos el estado completo cada minuto
    this.timer = setInterval(askAll, 60_000)
  }

  stop() {
    clearInterval(this.timer)
    this.client?.end(true)
  }
}
