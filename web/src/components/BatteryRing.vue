<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ soc: number | null; netW: number }>()
const R = 70
const C = 2 * Math.PI * R
const pct = computed(() => Math.max(0, Math.min(100, props.soc ?? 0)))
const color = computed(() => (pct.value < 20 ? '#f87171' : props.netW > 5 ? '#34d399' : props.netW < -5 ? '#fb923c' : '#94a3b8'))
const label = computed(() => (props.netW > 5 ? 'Cargando' : props.netW < -5 ? 'Descargando' : 'En reposo'))
</script>

<template>
  <div class="relative flex items-center justify-center">
    <svg viewBox="0 0 180 180" class="h-48 w-48 -rotate-90">
      <circle cx="90" cy="90" :r="R" fill="none" stroke="#1e293b" stroke-width="14" />
      <circle
        cx="90" cy="90" :r="R" fill="none" :stroke="color" stroke-width="14" stroke-linecap="round"
        :stroke-dasharray="C" :stroke-dashoffset="C * (1 - pct / 100)"
        class="transition-all duration-700"
      />
    </svg>
    <div class="absolute text-center">
      <div class="text-4xl font-semibold text-white">{{ soc === null ? '—' : Math.round(soc) }}<span class="text-xl text-slate-400">%</span></div>
      <div class="mt-1 text-sm" :style="{ color }">{{ label }}</div>
    </div>
  </div>
</template>
