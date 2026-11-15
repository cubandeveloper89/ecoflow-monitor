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
  /** Voltaje de entrada AC y si hay corriente de la red (≥ 80 V) */
  gridV: number | null
  gridOn: boolean | null
  pvTempC: number | null
  battery: BatteryInfo
}

export interface BatteryInfo {
  cycles: number | null
  sohPct: number | null
  designCapMah: number | null
  fullCapMah: number | null
  remainCapMah: number | null
  voltV: number | null
  cellMinMv: number | null
  cellMaxMv: number | null
  /** Energía acumulada de toda la vida del equipo (Wh) */
  lifetimeChgWh: number | null
  lifetimeDsgWh: number | null
}

export const GRID_ON_MIN_V = 80

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
  // Delta 3 Plus tiene 2 MPPT (powGetPv + powGetPv2); Pro 3 usa PvH/PvL
  const pvInW = sum(raw, ['powGetPv', 'powGetPv2']) ?? sum(raw, ['powGetPvH', 'powGetPvL']) ?? first(raw, ['mppt.inWatts'])
  const acOutRaw =
    sum(raw, ['powGetAcHvOut', 'powGetAcLvOut']) ?? first(raw, ['powGetAcOut', 'powGetAc', 'inv.outputWatts'])
  const acOutW = acOutRaw === null ? null : Math.abs(acOutRaw)
  const dcOutW = outW !== null && acOutW !== null ? Math.max(0, outW - acOutW) : null

  const chgRemainMin = first(raw, ['cmsChgRemTime', 'ems.chgRemainTime'])
  const dsgRemainMin = first(raw, ['cmsDsgRemTime', 'ems.dsgRemainTime'])
  const tempC = first(raw, ['bmsMaxCellTemp', 'bmsMaster.temp', 'bmsMaster.maxCellTemp'])

  const gridV = first(raw, ['plugInInfoAcInVol'])
  const gridOn = gridV !== null ? gridV >= GRID_ON_MIN_V : acInW !== null && acInW > 0 ? true : null

  const positive = (raw2: Raw, keys: string[]) => {
    for (const k of keys) {
      const n = num(raw2[k])
      if (n !== null && n > 0) return n
    }
    return null
  }

  const battery: BatteryInfo = {
    cycles: first(raw, ['cycles', 'bmsMaster.cycles']),
    sohPct: round(positive(raw, ['realSoh', 'bmsBattSoh', 'soh', 'bmsMaster.soh']), 1),
    designCapMah: positive(raw, ['designCap', 'bmsDesignCap', 'bmsMaster.designCap']),
    fullCapMah: positive(raw, ['fullCap', 'bmsFullCap', 'bmsMaster.fullCap']),
    remainCapMah: positive(raw, ['remainCap', 'bmsRemainCap', 'bmsMaster.remainCap']),
    voltV: round(positive(raw, ['bmsBattVol', 'cmsBattVol']), 1),
    cellMinMv: positive(raw, ['bmsMinCellVol', 'minCellVol', 'bmsMaster.minCellVol']),
    cellMaxMv: positive(raw, ['bmsMaxCellVol', 'maxCellVol', 'bmsMaster.maxCellVol']),
    lifetimeChgWh: positive(raw, ['accuChgEnergy']),
    lifetimeDsgWh: positive(raw, ['accuDsgEnergy']),
  }

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
    gridV: round(gridV),
    gridOn,
    pvTempC: round(first(raw, ['tempPv'])),
    battery,
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
