<script setup lang="ts">
import { computed } from 'vue'
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS, LineElement, PointElement, LinearScale, TimeScale, CategoryScale, Filler, Tooltip, Legend,
} from 'chart.js'
import type { Sample } from '../types'

ChartJS.register(LineElement, PointElement, LinearScale, TimeScale, CategoryScale, Filler, Tooltip, Legend)

const props = defineProps<{ samples: Sample[]; hours: number }>()

const fmt = (ts: number) =>
  new Date(ts).toLocaleString('es', props.hours > 24 ? { day: '2-digit', month: 'short', hour: '2-digit' } : { hour: '2-digit', minute: '2-digit' })

const data = computed(() => ({
  labels: props.samples.map((s) => fmt(s.ts)),
  datasets: [
    { label: 'Entrada (W)', data: props.samples.map((s) => s.inW), borderColor: '#34d399', backgroundColor: '#34d39922', fill: true, yAxisID: 'w' },
    { label: 'Salida (W)', data: props.samples.map((s) => s.outW), borderColor: '#fb923c', backgroundColor: '#fb923c22', fill: true, yAxisID: 'w' },
    { label: 'Batería (%)', data: props.samples.map((s) => s.soc), borderColor: '#a78bfa', borderDash: [4, 4], yAxisID: 'soc' },
  ],
}))

const options = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false as const,
  interaction: { mode: 'index' as const, intersect: false },
  elements: { point: { radius: 0 }, line: { borderWidth: 2, tension: 0.25 } },
  plugins: { legend: { labels: { color: '#cbd5e1', boxWidth: 12 } } },
  scales: {
    x: { ticks: { color: '#64748b', maxTicksLimit: 8 }, grid: { color: '#1e293b' } },
    w: { position: 'left' as const, beginAtZero: true, ticks: { color: '#64748b' }, grid: { color: '#1e293b' } },
    soc: { position: 'right' as const, min: 0, max: 100, ticks: { color: '#64748b' }, grid: { display: false } },
  },
}
</script>

<template>
  <div class="h-72"><Line :data="data" :options="options" /></div>
</template>
