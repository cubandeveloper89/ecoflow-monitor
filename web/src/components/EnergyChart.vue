<script setup lang="ts">
import { computed } from 'vue'
import { Bar } from 'vue-chartjs'
import { Chart as ChartJS, BarElement, LinearScale, CategoryScale, Tooltip, Legend } from 'chart.js'
import { C } from '../theme'
import type { DayEnergy } from '../types'

ChartJS.register(BarElement, LinearScale, CategoryScale, Tooltip, Legend)

const props = defineProps<{ days: DayEnergy[] }>()

const legend = [
  { label: 'Cargado', color: C.charge },
  { label: 'Consumido', color: C.discharge },
]

const data = computed(() => ({
  labels: props.days.map((d) => new Date(d.day + 'T12:00').toLocaleDateString('es', { weekday: 'short', day: 'numeric' })),
  datasets: [
    { label: 'Cargado', data: props.days.map((d) => d.inWh), backgroundColor: C.charge, borderRadius: 4, barPercentage: 0.8, categoryPercentage: 0.6 },
    { label: 'Consumido', data: props.days.map((d) => d.outWh), backgroundColor: C.discharge, borderRadius: 4, barPercentage: 0.8, categoryPercentage: 0.6 },
  ],
}))

const kwhTick = (v: string | number) => {
  const n = Number(v)
  return n >= 1000 ? `${(n / 1000).toLocaleString('es', { maximumFractionDigits: 1 })} kWh` : `${n} Wh`
}

const options = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index' as const, intersect: false },
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (c: { dataset: { label?: string }; parsed: { y: number | null } }) => ` ${c.dataset.label}: ${kwhTick(c.parsed.y ?? 0)}`,
      },
    },
  },
  scales: {
    x: { ticks: { maxRotation: 0, autoSkipPadding: 6 }, grid: { display: false }, border: { display: false } },
    y: { beginAtZero: true, ticks: { maxTicksLimit: 5, callback: kwhTick }, border: { display: false } },
  },
}
</script>

<template>
  <div class="flex h-full flex-col">
    <ul class="mb-4 flex gap-5 text-[13px] text-muted">
      <li v-for="l in legend" :key="l.label" class="flex items-center gap-2">
        <span class="chip" :style="{ background: l.color }" />{{ l.label }}
      </li>
    </ul>
    <div class="relative h-60"><Bar :data="data" :options="options" /></div>
  </div>
</template>
