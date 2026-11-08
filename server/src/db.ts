import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import type { Snapshot } from './normalize.js'

const dir = path.resolve(import.meta.dirname, '../../data')
fs.mkdirSync(dir, { recursive: true })
const db = new Database(path.join(dir, 'ecoflow.db'))
db.pragma('journal_mode = WAL')

db.exec(`
  CREATE TABLE IF NOT EXISTS samples (
    ts INTEGER PRIMARY KEY,
    soc REAL, inW REAL, outW REAL, acInW REAL, pvInW REAL, acOutW REAL, dcOutW REAL, tempC REAL
  );
`)

const SAMPLE_EVERY_MS = 15_000
const RETENTION_DAYS = 120
const MAX_GAP_MS = 5 * 60_000 // huecos mayores (equipo/PC apagado) no cuentan para la energía

let lastInsert = 0
const insert = db.prepare(
  `INSERT OR REPLACE INTO samples (ts, soc, inW, outW, acInW, pvInW, acOutW, dcOutW, tempC)
   VALUES (@ts, @soc, @inW, @outW, @acInW, @pvInW, @acOutW, @dcOutW, @tempC)`,
)

export function recordSample(s: Snapshot) {
  if (s.ts - lastInsert < SAMPLE_EVERY_MS) return
  lastInsert = s.ts
  insert.run(s)
}

export type Sample = Omit<Snapshot, 'ts' | 'chgRemainMin' | 'dsgRemainMin'> & { ts: number }

export function history(fromTs: number, toTs = Date.now(), maxPoints = 600): Sample[] {
  const rows = db.prepare('SELECT * FROM samples WHERE ts BETWEEN ? AND ? ORDER BY ts').all(fromTs, toTs) as Sample[]
  if (rows.length <= maxPoints) return rows
  // Reducción simple: promedio por bucket
  const bucket = Math.ceil(rows.length / maxPoints)
  const out: Sample[] = []
  for (let i = 0; i < rows.length; i += bucket) {
    const chunk = rows.slice(i, i + bucket)
    const avg = (k: keyof Sample) => {
      const vals = chunk.map((r) => r[k]).filter((v): v is number => typeof v === 'number')
      return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null
    }
    out.push({
      ts: chunk[Math.floor(chunk.length / 2)].ts,
      soc: avg('soc'), inW: avg('inW'), outW: avg('outW'), acInW: avg('acInW'),
      pvInW: avg('pvInW'), acOutW: avg('acOutW'), dcOutW: avg('dcOutW'), tempC: avg('tempC'),
    })
  }
  return out
}

export interface DayEnergy {
  day: string // YYYY-MM-DD (hora local de la PC)
  inWh: number
  outWh: number
  acInWh: number
  pvInWh: number
}

const dayKey = (ts: number) => {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Energía cargada/descargada por día (integración trapezoidal de la potencia) */
export function energyByDay(days: number): DayEnergy[] {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - (days - 1))
  const rows = db
    .prepare('SELECT ts, inW, outW, acInW, pvInW FROM samples WHERE ts >= ? ORDER BY ts')
    .all(start.getTime()) as Pick<Sample, 'ts' | 'inW' | 'outW' | 'acInW' | 'pvInW'>[]

  const map = new Map<string, DayEnergy>()
  for (let d = 0; d < days; d++) {
    const t = new Date(start)
    t.setDate(t.getDate() + d)
    const k = dayKey(t.getTime())
    map.set(k, { day: k, inWh: 0, outWh: 0, acInWh: 0, pvInWh: 0 })
  }
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1]
    const b = rows[i]
    const dt = b.ts - a.ts
    if (dt <= 0 || dt > MAX_GAP_MS) continue
    const h = dt / 3_600_000
    const e = map.get(dayKey(b.ts))
    if (!e) continue
    const trap = (x: number | null, y: number | null) => (((x ?? 0) + (y ?? 0)) / 2) * h
    e.inWh += trap(a.inW, b.inW)
    e.outWh += trap(a.outW, b.outW)
    e.acInWh += trap(a.acInW, b.acInW)
    e.pvInWh += trap(a.pvInW, b.pvInW)
  }
  return [...map.values()].map((e) => ({
    day: e.day,
    inWh: Math.round(e.inWh),
    outWh: Math.round(e.outWh),
    acInWh: Math.round(e.acInWh),
    pvInWh: Math.round(e.pvInWh),
  }))
}

export function prune() {
  db.prepare('DELETE FROM samples WHERE ts < ?').run(Date.now() - RETENTION_DAYS * 86_400_000)
}
