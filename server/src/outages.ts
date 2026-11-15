import { db } from './db.js'
import type { Snapshot } from './normalize.js'

/**
 * Registro de apagones a partir del voltaje de entrada AC.
 * Un cambio (hay corriente ↔ no hay) se confirma solo si dura ≥ 20 s, para ignorar parpadeos.
 * Si el server estuvo apagado durante un cambio, la hora queda marcada como aproximada.
 */
export function initOutages() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS outages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      start INTEGER NOT NULL,
      end INTEGER,
      approx INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS outages_start ON outages(start);
  `)
  confirmed = openRow() ? false : null
}

const CONFIRM_MS = 20_000
const STALE_MS = 5 * 60_000 // más de 5 min sin datos → no sabemos cuándo cambió exactamente

interface Row {
  id: number
  start: number
  end: number | null
  approx: number
}

const openRow = () => db.prepare('SELECT * FROM outages WHERE end IS NULL ORDER BY start DESC LIMIT 1').get() as unknown as Row | undefined

// Estado confirmado: false = apagón en curso. null = aún no sabemos (recién arrancó el server)
let confirmed: boolean | null = null
let candidate: { on: boolean; since: number } | null = null
let lastSeen = 0
let restored = true // primera lectura tras arrancar

export type OutageEvent =
  | { type: 'start'; at: number; approx: boolean }
  | { type: 'end'; start: number; end: number; durationMin: number; approx: boolean }

export function trackGrid(s: Snapshot, onChange?: (e: OutageEvent | null) => void) {
  if (s.gridOn === null) return
  const now = s.ts
  const stale = restored || now - lastSeen > STALE_MS
  const lastBefore = lastSeen
  lastSeen = now
  restored = false

  if (s.gridOn === confirmed) {
    candidate = null
    return
  }

  // Tras un hueco sin datos el cambio ya ocurrió: confirmar de inmediato, con hora aproximada
  if (stale && confirmed !== null) {
    onChange?.(apply(s.gridOn, lastBefore || now, true))
    return
  }

  if (!candidate || candidate.on !== s.gridOn) candidate = { on: s.gridOn, since: now }
  if (now - candidate.since >= CONFIRM_MS) {
    // Primer estado conocido: si arrancamos durante un apagón, su inicio es aproximado
    const e = apply(s.gridOn, candidate.since, confirmed === null)
    candidate = null
    onChange?.(e)
  }
}

function apply(on: boolean, at: number, approx: boolean): OutageEvent | null {
  let event: OutageEvent | null = null
  if (on) {
    const row = openRow()
    if (row) {
      db.prepare('UPDATE outages SET end = ?, approx = approx | ? WHERE id = ?').run(at, approx ? 1 : 0, row.id)
      event = { type: 'end', start: row.start, end: at, durationMin: Math.round((at - row.start) / 60_000), approx: approx || !!row.approx }
    }
  } else if (!openRow()) {
    db.prepare('INSERT INTO outages (start, approx) VALUES (?, ?)').run(at, approx ? 1 : 0)
    event = { type: 'start', at, approx }
  }
  confirmed = on
  return event
}

export interface Outage {
  start: number
  end: number | null
  durationMin: number
  approx: boolean
}

export function outageReport(days: number) {
  const now = Date.now()
  const from = now - days * 86_400_000
  const rows = db
    .prepare('SELECT * FROM outages WHERE end IS NULL OR end >= ? ORDER BY start DESC')
    .all(from) as unknown as Row[]
  const items: Outage[] = rows.map((r) => ({
    start: r.start,
    end: r.end,
    durationMin: Math.round(((r.end ?? now) - r.start) / 60_000),
    approx: !!r.approx,
  }))
  const closed = items.filter((o) => o.end !== null)
  const total = items.reduce((a, o) => a + o.durationMin, 0)
  return {
    gridOn: confirmed,
    current: items.find((o) => o.end === null) ?? null,
    lastEnd: closed[0]?.end ?? null,
    items,
    stats: {
      days,
      count: items.length,
      totalMin: total,
      longestMin: items.reduce((a, o) => Math.max(a, o.durationMin), 0),
      avgMin: closed.length ? Math.round(closed.reduce((a, o) => a + o.durationMin, 0) / closed.length) : 0,
    },
  }
}
