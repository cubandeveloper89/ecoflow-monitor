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

export type Sample = Omit<Snapshot, 'chgRemainMin' | 'dsgRemainMin'>

export interface DayEnergy {
  day: string
  inWh: number
  outWh: number
  acInWh: number
  pvInWh: number
}
