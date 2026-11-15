<script setup lang="ts">
import { computed } from 'vue'
import { C } from '../theme'
import { fmtNum } from '../utils'
import type { BatteryInfo } from '../types'

const props = defineProps<{ battery: BatteryInfo | null; tempC: number | null }>()

const NOMINAL_V = 51.2 // LFP 16s — Delta 3 Plus: 20 Ah × 51,2 V = 1024 Wh

const b = computed(() => props.battery)
const soh = computed(() => b.value?.sohPct ?? null)
const sohColor = computed(() => (soh.value == null ? C.faint : soh.value >= 80 ? C.charge : soh.value >= 60 ? C.solar : C.low))
const sohLabel = computed(() =>
  soh.value == null ? '' : soh.value >= 90 ? 'Excelente' : soh.value >= 80 ? 'Buena' : soh.value >= 60 ? 'Desgastada' : 'Revisar',
)

const capAh = (mah: number | null | undefined) => (mah ? mah / 1000 : null)
const capacity = computed(() => {
  const full = capAh(b.value?.fullCapMah)
  const design = capAh(b.value?.designCapMah)
  if (full == null) return null
  return {
    text: design ? `${fmtNum(full, 1)} / ${fmtNum(design, 1)} Ah` : `${fmtNum(full, 1)} Ah`,
    wh: Math.round(full * NOMINAL_V),
  }
})

const cellDiff = computed(() => {
  const { cellMinMv: lo, cellMaxMv: hi } = b.value ?? {}
  if (!lo || !hi) return null
  const d = hi - lo
  return { mv: d, label: d <= 50 ? 'Bien balanceadas' : d <= 100 ? 'Algo desbalanceadas' : 'Revisar balance', ok: d <= 50 }
})

const kwh = (wh: number | null | undefined) => (wh ? fmtNum(wh / 1000, 1) : '—')
const efficiency = computed(() => {
  const c = b.value?.lifetimeChgWh
  const d = b.value?.lifetimeDsgWh
  return c && d ? Math.round((d / c) * 100) : null
})
</script>

<template>
  <div class="panel flex flex-col p-5 sm:p-6 lg:p-8" aria-labelledby="bat-h">
    <h2 id="bat-h" class="text-base font-medium text-ink">Salud de la batería</h2>

    <div class="mt-5">
      <div class="flex items-baseline justify-between gap-3">
        <p class="num text-4xl font-medium leading-none">
          {{ soh == null ? '—' : fmtNum(soh, soh % 1 ? 1 : 0) }}<span class="ml-1 font-sans text-base font-normal tracking-normal text-muted">%</span>
        </p>
        <span class="text-[13px] font-medium" :style="{ color: sohColor }">{{ sohLabel }}</span>
      </div>
      <div class="mt-3 h-2 overflow-hidden rounded-full bg-line" aria-hidden="true">
        <div class="h-full rounded-full transition-[width] duration-700" :style="{ width: `${soh ?? 0}%`, background: sohColor }" />
      </div>
      <p class="mt-2 text-[12px] text-faint">Capacidad real comparada con una batería nueva</p>
    </div>

    <dl class="mt-6 space-y-3 border-t border-line pt-5 text-[13px]">
      <div class="flex items-baseline justify-between gap-3">
        <dt class="text-muted">Ciclos</dt>
        <dd class="num text-text">{{ b?.cycles ?? '—' }}</dd>
      </div>
      <div class="flex items-baseline justify-between gap-3">
        <dt class="text-muted">Capacidad</dt>
        <dd class="num text-right text-text">
          {{ capacity?.text ?? '—' }}
          <span v-if="capacity" class="block text-[12px] text-faint">≈ {{ fmtNum(capacity.wh) }} Wh</span>
        </dd>
      </div>
      <div class="flex items-baseline justify-between gap-3">
        <dt class="text-muted">Voltaje</dt>
        <dd class="num text-text">{{ b?.voltV != null ? `${fmtNum(b.voltV, 1)} V` : '—' }}</dd>
      </div>
      <div class="flex items-baseline justify-between gap-3">
        <dt class="text-muted">Diferencia entre celdas</dt>
        <dd class="num text-right text-text">
          {{ cellDiff ? `${cellDiff.mv} mV` : '—' }}
          <span v-if="cellDiff" class="block font-sans text-[12px]" :style="{ color: cellDiff.ok ? C.faint : C.solar }">{{ cellDiff.label }}</span>
        </dd>
      </div>
      <div class="flex items-baseline justify-between gap-3">
        <dt class="text-muted">Temperatura</dt>
        <dd class="num text-text">{{ tempC != null ? `${tempC} °C` : '—' }}</dd>
      </div>
    </dl>

    <div class="mt-6 border-t border-line pt-5">
      <p class="text-[13px] font-medium text-muted">Desde que se compró</p>
      <dl class="mt-3 grid grid-cols-3 gap-3">
        <div>
          <dt class="flex items-center gap-1.5 text-[12px] text-muted"><span class="chip" :style="{ background: C.charge }" />Cargado</dt>
          <dd class="num mt-1 text-lg font-medium">{{ kwh(b?.lifetimeChgWh) }}<span class="ml-1 font-sans text-[12px] font-normal tracking-normal text-muted">kWh</span></dd>
        </div>
        <div>
          <dt class="flex items-center gap-1.5 text-[12px] text-muted"><span class="chip" :style="{ background: C.discharge }" />Entregado</dt>
          <dd class="num mt-1 text-lg font-medium">{{ kwh(b?.lifetimeDsgWh) }}<span class="ml-1 font-sans text-[12px] font-normal tracking-normal text-muted">kWh</span></dd>
        </div>
        <div>
          <dt class="text-[12px] text-muted">Eficiencia</dt>
          <dd class="num mt-1 text-lg font-medium">{{ efficiency ?? '—' }}<span class="ml-1 font-sans text-[12px] font-normal tracking-normal text-muted">%</span></dd>
        </div>
      </dl>
    </div>
  </div>
</template>
