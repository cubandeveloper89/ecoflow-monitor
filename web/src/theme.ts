import { Chart, Tooltip } from 'chart.js'

/** Same values as the @theme tokens in style.css, for canvas drawing. */
export const C = {
  charge: '#3ddc97',
  discharge: '#ff9f43',
  solar: '#f5c518',
  grid: '#5aa9ff',
  acOut: '#ff9f43',
  dcOut: '#ff7a90',
  low: '#ff5d5d',
  soc: '#d9ded6',
  idle: '#8c958d',
  ink: '#eef1ec',
  text: '#c8cec7',
  muted: '#8c958d',
  faint: '#78817a',
  line: '#222724',
  raised: '#191d1a',
}

export function applyChartTheme() {
  Chart.register(Tooltip)
  Chart.defaults.font.family = "'Geist', ui-sans-serif, system-ui, sans-serif"
  Chart.defaults.font.size = 12
  Chart.defaults.color = C.muted
  Chart.defaults.borderColor = C.line
  Object.assign(Chart.defaults.plugins.tooltip, {
    backgroundColor: C.raised,
    borderColor: '#2e3530',
    borderWidth: 1,
    titleColor: C.ink,
    bodyColor: C.text,
    padding: 10,
    boxPadding: 4,
    cornerRadius: 8,
    usePointStyle: true,
  })
}

/** Vertical fade fill for area series. */
export const fade = (hex: string) => (ctx: { chart: Chart }) => {
  const { ctx: g, chartArea } = ctx.chart
  if (!chartArea) return 'transparent'
  const grad = g.createLinearGradient(0, chartArea.top, 0, chartArea.bottom)
  grad.addColorStop(0, hex + '38')
  grad.addColorStop(1, hex + '00')
  return grad
}
