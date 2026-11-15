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
  lifetimeChgWh: number | null
  lifetimeDsgWh: number | null
}

export type Sample = Pick<Snapshot, 'ts' | 'soc' | 'inW' | 'outW' | 'acInW' | 'pvInW' | 'acOutW' | 'dcOutW' | 'tempC'>

export interface Outage {
  start: number
  end: number | null
  durationMin: number
  approx: boolean
}

export interface OutageReport {
  gridOn: boolean | null
  current: Outage | null
  lastEnd: number | null
  items: Outage[]
  stats: { days: number; count: number; totalMin: number; longestMin: number; avgMin: number }
}

export interface DayEnergy {
  day: string
  inWh: number
  outWh: number
  acInWh: number
  pvInWh: number
}
