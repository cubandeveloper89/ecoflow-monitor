import { EventEmitter } from 'node:events'
import crypto from 'node:crypto'
import mqtt, { type MqttClient } from 'mqtt'
import { ecoflowApi, type EcoflowCredentials } from './ecoflowApi.js'
import { normalize, unwrapMqtt, type Snapshot } from './normalize.js'

export interface DataSource extends EventEmitter {
  start(): Promise<void>
  stop(): void
  raw: Record<string, unknown>
  online: boolean
  on(event: 'snapshot', listener: (s: Snapshot) => void): this
  on(event: 'status', listener: (online: boolean) => void): this
}

/** Fuente real: snapshot inicial por REST + actualizaciones en vivo por MQTT */
export class EcoflowCloudSource extends EventEmitter implements DataSource {
  raw: Record<string, unknown> = {}
  online = false
  private client?: MqttClient
  private pollTimer?: NodeJS.Timeout

  constructor(private creds: EcoflowCredentials, private sn: string) {
    super()
  }

  private apply(partial: Record<string, unknown>) {
    Object.assign(this.raw, partial)
    this.emit('snapshot', normalize(this.raw))
  }

  private setOnline(v: boolean) {
    if (v !== this.online) {
      this.online = v
      this.emit('status', v)
    }
  }

  private async refreshQuota() {
    try {
      this.apply(await ecoflowApi.quotaAll(this.creds, this.sn))
      this.setOnline(true)
    } catch (e) {
      console.error('[ecoflow] quota/all falló:', (e as Error).message)
    }
  }

  async start() {
    await this.refreshQuota()
    // Respaldo: si el MQTT se cae, igual refrescamos cada 60 s por REST
    this.pollTimer = setInterval(() => this.refreshQuota(), 60_000)

    const cert = await ecoflowApi.certification(this.creds)
    const url = `${cert.protocol || 'mqtts'}://${cert.url}:${cert.port}`
    const account = cert.certificateAccount
    this.client = mqtt.connect(url, {
      username: account,
      password: cert.certificatePassword,
      clientId: `${account}_${crypto.randomBytes(6).toString('hex')}`,
      reconnectPeriod: 5000,
    })

    const quotaTopic = `/open/${account}/${this.sn}/quota`
    const statusTopic = `/open/${account}/${this.sn}/status`

    this.client.on('connect', () => {
      console.log('[ecoflow] MQTT conectado')
      this.client!.subscribe([quotaTopic, statusTopic])
    })
    this.client.on('error', (e) => console.error('[ecoflow] MQTT error:', e.message))
    this.client.on('message', (topic, payload) => {
      try {
        const msg = JSON.parse(payload.toString())
        if (topic === statusTopic) {
          this.setOnline(Number(msg.params?.status ?? msg.status) === 1)
          return
        }
        this.setOnline(true)
        this.apply(unwrapMqtt(msg))
      } catch {
        /* payload no JSON: ignorar */
      }
    })
  }

  stop() {
    clearInterval(this.pollTimer)
    this.client?.end(true)
  }
}

/** Fuente simulada para desarrollar la UI sin el equipo */
export class MockSource extends EventEmitter implements DataSource {
  raw: Record<string, unknown> = {}
  online = true
  private timer?: NodeJS.Timeout
  private soc = 62

  async start() {
    const tick = () => {
      const h = new Date().getHours() + new Date().getMinutes() / 60
      const pv = h > 7 && h < 18 ? Math.max(0, Math.sin(((h - 7) / 11) * Math.PI) * 380 + (Math.random() - 0.5) * 40) : 0
      const gridOn = Math.floor(Date.now() / 600_000) % 3 !== 0 // "apagón" 1 de cada 3 bloques de 10 min
      const ac = gridOn && this.soc < 95 ? 450 + Math.random() * 30 : 0
      const acOut = 120 + Math.random() * 180
      const dcOut = 15 + Math.random() * 10
      const inW = pv + ac
      const outW = acOut + dcOut
      this.soc = Math.min(100, Math.max(0, this.soc + ((inW - outW) / 4096) * (2 / 3600) * 100 * 30))
      this.raw = {
        cmsBattSoc: this.soc,
        powInSumW: inW,
        powOutSumW: outW,
        powGetAcIn: ac,
        powGetPv: pv,
        powGetAc: acOut,
        cmsChgRemTime: inW > outW ? Math.round(((100 - this.soc) / 100) * 4096 / (inW - outW) * 60) : 5999,
        cmsDsgRemTime: outW > inW ? Math.round((this.soc / 100) * 4096 / (outW - inW) * 60) : 5999,
        bmsMaxCellTemp: 28 + Math.random() * 3,
      }
      this.emit('snapshot', normalize(this.raw))
    }
    tick()
    this.timer = setInterval(tick, 2000)
  }

  stop() {
    clearInterval(this.timer)
  }
}
