<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useEcoflow } from './composables/useEcoflow'
import BatteryRing from './components/BatteryRing.vue'
import StatCard from './components/StatCard.vue'
import PowerChart from './components/PowerChart.vue'
import EnergyChart from './components/EnergyChart.vue'
import type { Sample, DayEnergy } from './types'

const { live, online, connected, mock, sn } = useEcoflow()

const netW = computed(() => (live.value?.inW ?? 0) - (live.value?.outW ?? 0))

const fmtMin = (m: number | null | undefined) => {
  if (m == null || m <= 0 || m >= 5999) return null
  const h = Math.floor(m / 60)
  return h ? `${h} h ${m % 60} min` : `${m} min`
}
const remaining = computed(() => {
  if (!live.value) return null
  if (netW.value > 5) {
    const t = fmtMin(live.value.chgRemainMin)
    return t ? `Llena en ${t}` : null
  }
  if (netW.value < -5) {
    const t = fmtMin(live.value.dsgRemainMin)
    return t ? `Se agota en ${t}` : null
  }
  return null
})

const ranges = [
  { label: '6 h', hours: 6 },
  { label: '24 h', hours: 24 },
  { label: '7 días', hours: 168 },
  { label: '30 días', hours: 720 },
]
const hours = ref(24)
const samples = ref<Sample[]>([])
const energy = ref<DayEnergy[]>([])
const today = computed(() => energy.value.at(-1))

async function loadHistory() {
  samples.value = await fetch(`/api/history?hours=${hours.value}`).then((r) => r.json())
}
async function loadEnergy() {
  energy.value = await fetch('/api/energy?days=7').then((r) => r.json())
}
watch(hours, loadHistory)

let timer: number | undefined
onMounted(() => {
  loadHistory()
  loadEnergy()
  timer = window.setInterval(() => {
    loadHistory()
    loadEnergy()
  }, 30_000)
})
onUnmounted(() => clearInterval(timer))

const kwh = (wh?: number) => (wh == null ? '—' : wh >= 1000 ? `${(wh / 1000).toFixed(2)} kWh` : `${wh} Wh`)
const updated = computed(() => (live.value ? new Date(live.value.ts).toLocaleTimeString('es') : '—'))
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-6 text-slate-200">
    <header class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold text-white">EcoFlow Monitor</h1>
        <p class="text-sm text-slate-500">
          {{ mock ? 'Modo simulado' : `SN ${sn}` }} · actualizado {{ updated }}
        </p>
      </div>
      <div class="flex gap-2 text-xs">
        <span class="rounded-full px-3 py-1" :class="connected ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'">
          {{ connected ? 'Servidor conectado' : 'Sin servidor' }}
        </span>
        <span class="rounded-full px-3 py-1" :class="online ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-700 text-slate-400'">
          {{ online ? 'Equipo en línea' : 'Equipo offline' }}
        </span>
      </div>
    </header>

    <section class="grid gap-4 md:grid-cols-[auto_1fr]">
      <div class="flex flex-col items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <BatteryRing :soc="live?.soc ?? null" :net-w="netW" />
        <p class="mt-3 h-5 text-sm text-slate-400">{{ remaining }}</p>
        <p v-if="live?.tempC != null" class="text-xs text-slate-500">Temp. batería {{ live.tempC }} °C</p>
      </div>

      <div class="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="Entrada total" :value="live?.inW ?? null" accent="#34d399" />
        <StatCard label="Salida total" :value="live?.outW ?? null" accent="#fb923c" />
        <StatCard label="Balance" :value="live ? netW : null" :accent="netW >= 0 ? '#34d399' : '#fb923c'" hint="Entrada − salida" />
        <StatCard label="Red eléctrica (AC in)" :value="live?.acInW ?? null" accent="#60a5fa" />
        <StatCard label="Solar" :value="live?.pvInW ?? null" accent="#facc15" />
        <StatCard label="Salida AC / DC" :value="live?.acOutW ?? null" accent="#f472b6" :hint="live?.dcOutW != null ? `DC/USB: ${live.dcOutW} W` : undefined" />
      </div>
    </section>

    <section class="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="font-medium text-white">Potencia y batería</h2>
        <div class="flex gap-1 rounded-lg bg-slate-800 p-1 text-xs">
          <button
            v-for="r in ranges" :key="r.hours" @click="hours = r.hours"
            class="rounded-md px-3 py-1 transition"
            :class="hours === r.hours ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'"
          >{{ r.label }}</button>
        </div>
      </div>
      <PowerChart v-if="samples.length" :samples="samples" :hours="hours" />
      <p v-else class="py-16 text-center text-sm text-slate-500">Aún no hay historial. Se guarda una muestra cada 15 s.</p>
    </section>

    <section class="mt-6 grid gap-4 md:grid-cols-[1fr_2fr]">
      <div class="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h2 class="mb-4 font-medium text-white">Hoy</h2>
        <dl class="space-y-3 text-sm">
          <div class="flex justify-between"><dt class="text-slate-400">Energía cargada</dt><dd class="font-medium text-emerald-300">{{ kwh(today?.inWh) }}</dd></div>
          <div class="flex justify-between pl-3"><dt class="text-slate-500">de la red</dt><dd>{{ kwh(today?.acInWh) }}</dd></div>
          <div class="flex justify-between pl-3"><dt class="text-slate-500">solar</dt><dd>{{ kwh(today?.pvInWh) }}</dd></div>
          <div class="flex justify-between"><dt class="text-slate-400">Energía consumida</dt><dd class="font-medium text-orange-300">{{ kwh(today?.outWh) }}</dd></div>
        </dl>
      </div>
      <div class="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h2 class="mb-3 font-medium text-white">Últimos 7 días</h2>
        <EnergyChart :days="energy" />
      </div>
    </section>
  </div>
</template>
