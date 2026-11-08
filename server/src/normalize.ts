/**
 * Convierte el "quota" crudo del EcoFlow en un snapshot uniforme.
 * Los nombres de campos cambian por modelo:
 *  - Delta 3 / Delta Pro 3 (protocolo nuevo): powInSumW, powOutSumW, cmsBattSoc...
 *  - Delta Pro (original):                     pd.wattsInSum, pd.wattsOutSum, bmsMaster.soc...
 * Si algún valor sale vacío, mira /api/raw y agrega la clave aquí.
 */
export interface Snapshot {
  ts: number
  soc: number | null
  inW: number | null
  outW: number | null
  acInW: number | null
  pvInW: number | null
  acOutW: number | null
  dcOutW: number | null
  chgRemainMin: number | null
  dsgRemainMin: number | null
  tempC: number | null
}

type Raw = Record<string, unknown>

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}

/** Primer campo existente */
const first = (raw: Raw, keys: string[]) => {
  for (const k of keys) {
    const n = num(raw[k])
    if (n !== null) return n
  }
  return null
}

/** Suma de los campos existentes (null si ninguno existe) */
const sum = (raw: Raw, keys: string[]) => {
  let total: number | null = null
  for (const k of keys) {
    const n = num(raw[k])
    if (n !== null) total = (total ?? 0) + Math.abs(n)
  }
  return total
}

const round = (n: number | null, d = 0) => (n === null ? null : Math.round(n * 10 ** d) / 10 ** d)

export function normalize(raw: Raw): Snapshot {
  const soc = first(raw, ['cmsBattSoc', 'bmsBattSoc', 'ems.lcdShowSoc', 'bmsMaster.f32ShowSoc', 'pd.soc', 'bmsMaster.soc'])
  const inW = first(raw, ['powInSumW', 'pd.wattsInSum'])
  const outW = first(raw, ['powOutSumW', 'pd.wattsOutSum'])
  const acInW = first(raw, ['powGetAcIn', 'inv.inputWatts'])
  const pvInW =
    sum(raw, ['powGetPvH', 'powGetPvL']) ?? first(raw, ['powGetPv', 'powGetPv2', 'mppt.inWatts'])
  const acOutW =
    sum(raw, ['powGetAcHvOut', 'powGetAcLvOut']) ?? first(raw, ['powGetAc', 'powGetAcOut', 'inv.outputWatts'])
  const dcOutW = outW !== null && acOutW !== null ? Math.max(0, outW - acOutW) : null

  const chgRemainMin = first(raw, ['cmsChgRemTime', 'ems.chgRemainTime'])
  const dsgRemainMin = first(raw, ['cmsDsgRemTime', 'ems.dsgRemainTime'])
  const tempC = first(raw, ['bmsMaxCellTemp', 'bmsMaster.temp', 'bmsMaster.maxCellTemp'])

  return {
    ts: Date.now(),
    soc: round(soc, 1),
    inW: round(inW !== null ? Math.abs(inW) : null),
    outW: round(outW !== null ? Math.abs(outW) : null),
    acInW: round(acInW),
    pvInW: round(pvInW),
    acOutW: round(acOutW),
    dcOutW: round(dcOutW),
    chgRemainMin,
    dsgRemainMin,
    tempC: round(tempC, 1),
  }
}

/**
 * Los mensajes MQTT del Delta Pro original llegan como {typeCode:"pdStatus", params:{wattsInSum:..}}
 * sin prefijo; los nuevos (Delta 3 / Pro 3) llegan como {param:{...}} o {params:{...}} con claves planas.
 */
const TYPECODE_PREFIX: Record<string, string> = {
  pdStatus: 'pd',
  bmsStatus: 'bmsMaster',
  invStatus: 'inv',
  mpptStatus: 'mppt',
  emsStatus: 'ems',
}

export function unwrapMqtt(msg: Raw): Raw {
  const body = (msg.params ?? msg.param ?? {}) as Raw
  const prefix = typeof msg.typeCode === 'string' ? TYPECODE_PREFIX[msg.typeCode] : undefined
  if (!prefix) return body
  return Object.fromEntries(Object.entries(body).map(([k, v]) => [`${prefix}.${k}`, v]))
}
