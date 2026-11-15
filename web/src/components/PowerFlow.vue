<script setup lang="ts">
import { computed } from 'vue'
import BatteryRing from './BatteryRing.vue'
import { C } from '../theme'
import type { Snapshot } from '../types'

const props = defineProps<{ live: Snapshot | null; netW: number; remaining: string | null }>()

interface Node { key: string; label: string; w: number | null; color: string; sub?: string | null; alert?: boolean }

const inputs = computed<Node[]>(() => [
  {
    key: 'ac', label: 'Red eléctrica', w: props.live?.acInW ?? null, color: C.grid,
    sub: props.live?.gridOn === false ? 'Sin corriente' : props.live?.gridV != null ? `${props.live.gridV} V` : null,
    alert: props.live?.gridOn === false,
  },
  {
    key: 'pv', label: 'Solar', w: props.live?.pvInW ?? null, color: C.solar,
    sub: props.live?.pvTempC != null ? `Panel a ${props.live.pvTempC} °C` : null,
  },
])
const outputs = computed<Node[]>(() => [
  { key: 'acout', label: 'Salida AC', w: props.live?.acOutW ?? null, color: C.acOut },
  { key: 'dc', label: 'DC / USB', w: props.live?.dcOutW ?? null, color: C.dcOut },
])

/** Faster pulses for more power: 4 s at a trickle, 1.4 s at 1.5 kW+. */
const dur = (w: number | null) => `${Math.max(1.4, 4 - ((w ?? 0) / 1500) * 2.6).toFixed(2)}s`
const on = (w: number | null) => (w ?? 0) > 1
const fmt = (w: number | null) => (w === null ? '—' : w.toLocaleString('es'))
</script>

<template>
  <div class="grid items-center gap-y-0 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
    <!-- Inputs -->
    <div>
      <p class="eyebrow mb-3 md:hidden">Entradas</p>
      <div class="grid grid-cols-2 gap-3 md:grid-cols-1 md:gap-4">
        <div v-for="n in inputs" :key="n.key" class="flex items-center">
          <div class="flow-node" :class="{ 'is-idle': !on(n.w) }">
            <div class="flex items-center gap-2 text-[13px] font-medium text-muted">
              <span class="chip" :style="{ background: n.color }" />{{ n.label }}
            </div>
            <div class="num mt-2 text-2xl font-medium leading-none sm:text-3xl">
              {{ fmt(n.w) }}<span class="ml-1 font-sans text-sm font-normal tracking-normal text-muted">W</span>
            </div>
            <p v-if="n.sub" class="mt-2 text-[12px]" :class="n.alert ? 'font-medium text-low' : 'text-faint'">{{ n.sub }}</p>
          </div>
          <div
            class="lane lane--h hidden min-w-8 flex-1 md:block"
            :class="{ 'is-on': on(n.w) }" :style="{ '--c': n.color, '--dur': dur(n.w) }" aria-hidden="true"
          ><span class="lane__pulse" /></div>
        </div>
      </div>
      <div
        class="lane lane--v mt-3 md:hidden" :class="{ 'is-on': on(live?.inW ?? null) }"
        :style="{ '--c': C.charge, '--dur': dur(live?.inW ?? null) }" aria-hidden="true"
      ><span class="lane__pulse" /></div>
    </div>

    <!-- Battery -->
    <div class="flex flex-col items-center px-2 py-3 md:px-1">
      <BatteryRing :soc="live?.soc ?? null" :net-w="netW" />
      <p class="mt-4 min-h-5 text-sm text-text">{{ remaining ?? '' }}</p>
      <p v-if="live?.tempC != null" class="mt-1 text-[13px] text-muted">
        Batería a <span class="num text-text">{{ live.tempC }}</span> °C
      </p>
    </div>

    <!-- Outputs -->
    <div>
      <div
        class="lane lane--v mb-3 md:hidden" :class="{ 'is-on': on(live?.outW ?? null) }"
        :style="{ '--c': C.discharge, '--dur': dur(live?.outW ?? null) }" aria-hidden="true"
      ><span class="lane__pulse" /></div>
      <p class="eyebrow mb-3 md:hidden">Salidas</p>
      <div class="grid grid-cols-2 gap-3 md:grid-cols-1 md:gap-4">
        <div v-for="n in outputs" :key="n.key" class="flex items-center">
          <div
            class="lane lane--h hidden min-w-8 flex-1 md:block"
            :class="{ 'is-on': on(n.w) }" :style="{ '--c': n.color, '--dur': dur(n.w) }" aria-hidden="true"
          ><span class="lane__pulse" /></div>
          <div class="flow-node" :class="{ 'is-idle': !on(n.w) }">
            <div class="flex items-center gap-2 text-[13px] font-medium text-muted">
              <span class="chip" :style="{ background: n.color }" />{{ n.label }}
            </div>
            <div class="num mt-2 text-2xl font-medium leading-none sm:text-3xl">
              {{ fmt(n.w) }}<span class="ml-1 font-sans text-sm font-normal tracking-normal text-muted">W</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.flow-node {
  flex: 1;
  min-width: 0;
  max-width: 100%;
  padding: 16px 18px;
  border-radius: 12px;
  background: var(--color-raised);
  border: 1px solid var(--color-line);
  transition: opacity 400ms var(--ease-ui);
}
@media (min-width: 768px) {
  .flow-node { flex: 0 1 15rem; }
}
.flow-node.is-idle .num { color: var(--color-muted); }
</style>
