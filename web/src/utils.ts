export const fmtDur = (min: number) => {
  if (min < 1) return '< 1 min'
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  if (h >= 24) return `${Math.floor(h / 24)} d ${h % 24} h`
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`
}

export const fmtTime = (ts: number) => new Date(ts).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })

export const fmtDay = (ts: number) => {
  const d = new Date(ts)
  const today = new Date()
  const yest = new Date()
  yest.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Hoy'
  if (d.toDateString() === yest.toDateString()) return 'Ayer'
  return d.toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' })
}

export const fmtNum = (n: number, digits = 0) =>
  n.toLocaleString('es', { minimumFractionDigits: digits, maximumFractionDigits: digits })

/** Formato compacto para columnas estrechas: 6h 48m */
export const fmtShort = (min: number) => {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`
}
