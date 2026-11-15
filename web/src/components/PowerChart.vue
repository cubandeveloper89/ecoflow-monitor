<script setup lang="ts">
import { computed } from 'vue'
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS, LineElement, PointElement, LinearScale, TimeScale, CategoryScale, Filler, Tooltip, Legend,
} from 'chart.js'
import { C, fade } from '../theme'
import type { Sample } from '../types'

ChartJS.register(LineElement, PointElement, LinearScale, TimeScale, CategoryScale, Filler, Tooltip, Legend)

const props = defineProps<{ samples: Sample[]; hours: number }>()

const fmt = (ts: number) =>
  new Date(ts).toLocaleString('es', props.hours > 24 ? { day: '2-digit', month: 'short', hour: '2-digit' } : { hour: '2-digit', minute: '2-digit' })

const legend = [
  { label: 'Entrada (W)', color: C.charge },
  { label: 'Salida (W)', color: C.discharge },
  { label: 'Batería (%)', color: C.soc, dashed: true },
]

const data = computed(() => ({
  labels: props.samples.map((s) => fmt(s.ts)),
  datasets: [
    { label: 'Entrada', data: props.samples.map((s) => s.inW), borderColor: C.charge, backgroundColor: fade(C.charge), fill: true, yAxisID: 'w' },
    { label: 'Salida', data: props.samples.map((s) => s.outW), borderColor: C.discharge, backgroundColor: fade(C.discharge), fill: true, yAxisID: 'w' },
    { label: 'Batería', data: props.samples.map((s) => s.soc), borderColor: C.soc, borderWidth: 1.5, borderDash: [3, 4], yAxisID: 'soc' },
  ],
}))

const options = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false as const,
  interaction: { mode: 'index' as const, intersect: false },
  elements: { point: { radius: 0, hoverRadius: 4 }, line: { borderWidth: 2, tension: 0.3 } },
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (c: { dataset: { label?: string }; parsed: { y: number | null } }) =>
          ` ${c.dataset.label}: ${(c.parsed.y ?? 0).toLocaleString('es')} ${c.dataset.label === 'Batería' ? '%' : 'W'}`,
      },
    },
  },
  scales: {
    x: { ticks: { maxTicksLimit: 7, maxRotation: 0 }, grid: { display: false }, border: { display: false } },
    w: { position: 'left' as const, beginAtZero: true, ticks: { maxTicksLimit: 5 }, border: { display: false } },
    soc: {
      position: 'right' as const, min: 0, max: 100,
      ticks: { stepSize: 25, callback: (v: string | number) => `${v}%` },
      grid: { display: false }, border: { display: false },
    },
  },
}
</script>

<template>
  <div>
    <ul class="mb-4 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-muted">
      <li v-for="l in legend" :key="l.label" class="flex items-center gap-2">
        <span
          class="h-0.5 w-4 rounded"
          :style="l.dashed ? { backgroundImage: `linear-gradient(90deg, ${l.color} 50%, transparent 50%)`, backgroundSize: '6px 2px' } : { background: l.color }"
        />{{ l.label }}
      </li>
    </ul>
    <div class="h-72 sm:h-80"><Line :data="data" :options="options" /></div>
  </div>
</template>
