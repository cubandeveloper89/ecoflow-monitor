<script setup lang="ts">
import { computed } from 'vue'
import { C } from '../theme'

const props = defineProps<{ soc: number | null; netW: number }>()
const R = 76
const CIRC = 2 * Math.PI * R
const TICKS = 48
const pct = computed(() => Math.max(0, Math.min(100, props.soc ?? 0)))
const state = computed(() => (props.netW > 5 ? 'charge' : props.netW < -5 ? 'discharge' : 'idle'))
const color = computed(() =>
  props.soc != null && pct.value < 20 ? C.low : state.value === 'charge' ? C.charge : state.value === 'discharge' ? C.discharge : C.idle,
)
const label = computed(() => ({ charge: 'Cargando', discharge: 'Descargando', idle: 'En reposo' })[state.value])
</script>

<template>
  <div
    class="relative grid size-52 place-items-center sm:size-56"
    role="img"
    :aria-label="soc === null ? 'Batería sin datos' : `Batería al ${Math.round(soc)} %, ${label}`"
  >
    <svg viewBox="0 0 200 200" class="absolute inset-0 size-full -rotate-90" aria-hidden="true">
      <g :stroke="C.line" stroke-width="1.5">
        <line
          v-for="i in TICKS" :key="i"
          x1="100" y1="4" x2="100" y2="9"
          :transform="`rotate(${(i * 360) / TICKS} 100 100)`"
          :stroke="(i / TICKS) * 100 <= pct && soc !== null ? color : C.line"
          :stroke-opacity="(i / TICKS) * 100 <= pct && soc !== null ? 0.55 : 1"
        />
      </g>
      <circle cx="100" cy="100" :r="R" fill="none" :stroke="C.line" stroke-width="12" />
      <circle
        cx="100" cy="100" :r="R" fill="none" :stroke="color" stroke-width="12" stroke-linecap="round"
        :stroke-dasharray="CIRC" :stroke-dashoffset="CIRC * (1 - pct / 100)"
        style="transition: stroke-dashoffset 700ms var(--ease-enter), stroke 400ms var(--ease-ui)"
      />
    </svg>
    <div class="text-center">
      <div class="num text-6xl font-medium leading-none">
        {{ soc === null ? '—' : Math.round(soc) }}<span class="ml-0.5 text-2xl text-muted">%</span>
      </div>
      <div class="mt-3 inline-flex items-center gap-1.5 text-sm font-medium" :style="{ color }">
        <span class="chip rounded-full" :style="{ background: color }" />{{ label }}
      </div>
    </div>
  </div>
</template>
