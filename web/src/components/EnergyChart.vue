<script setup lang="ts">
import { computed } from 'vue'
import { Bar } from 'vue-chartjs'
import { Chart as ChartJS, BarElement, LinearScale, CategoryScale, Tooltip, Legend } from 'chart.js'
import type { DayEnergy } from '../types'

ChartJS.register(BarElement, LinearScale, CategoryScale, Tooltip, Legend)

const props = defineProps<{ days: DayEnergy[] }>()

const data = computed(() => ({
  labels: props.days.map((d) => new Date(d.day + 'T12:00').toLocaleDateString('es', { weekday: 'short', day: 'numeric' })),
  datasets: [
    { label: 'Cargado (Wh)', data: props.days.map((d) => d.inWh), backgroundColor: '#34d399', borderRadius: 4 },
    { label: 'Consumido (Wh)', data: props.days.map((d) => d.outWh), backgroundColor: '#fb923c', borderRadius: 4 },
  ],
}))

const options = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { labels: { color: '#cbd5e1', boxWidth: 12 } } },
  scales: {
    x: { ticks: { color: '#64748b' }, grid: { display: false } },
    y: { beginAtZero: true, ticks: { color: '#64748b' }, grid: { color: '#1e293b' } },
  },
}
</script>

<template>
  <div class="h-64"><Bar :data="data" :options="options" /></div>
</template>
