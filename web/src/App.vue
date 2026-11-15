<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useEcoflow } from './composables/useEcoflow'
import PowerFlow from './components/PowerFlow.vue'
import StatCard from './components/StatCard.vue'
import PowerChart from './components/PowerChart.vue'
import EnergyChart from './components/EnergyChart.vue'
import OutagesPanel from './components/OutagesPanel.vue'
import BatteryHealth from './components/BatteryHealth.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import { desktop, type UpdateStatus } from './desktop'
import { C } from './theme'
import type { Sample, DayEnergy, OutageReport } from './types'

const { live, online, connected, mock, sn, outageTick, configured, sourceError } = useEcoflow()

/* ---- App de escritorio: configuración y actualizaciones ---- */
const settingsOpen = ref(false)
const firstRun = computed(() => !!desktop && !configured.value)
watch(firstRun, (v) => v && (settingsOpen.value = true), { immediate: true })

const update = ref<UpdateStatus | null>(null)
const offs: Array<() => void> = []
if (desktop) {
  desktop.getUpdateStatus().then((s) => (update.value = s))
  offs.push(desktop.onUpdateStatus((s) => (update.value = s)))
  offs.push(desktop.onOpenSettings(() => (settingsOpen.value = true)))
}
onUnmounted(() => offs.forEach((off) => off()))

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

const outages = ref<OutageReport | null>(null)
async function loadOutages() {
  outages.value = await fetch('/api/outages?days=30').then((r) => r.json())
}
watch(outageTick, loadOutages)

/* Segmented control indicator: sized to the active button, moved by transform. */
const segBtns = ref<HTMLButtonElement[]>([])
const ind = ref({ x: 0, w: 0 })
function placeIndicator() {
  const i = ranges.findIndex((r) => r.hours === hours.value)
  const b = segBtns.value[i]
  if (b) ind.value = { x: b.offsetLeft, w: b.offsetWidth }
}
watch(hours, () => nextTick(placeIndicator))

let timer: number | undefined
let ro: ResizeObserver | undefined
onMounted(() => {
  loadHistory()
  loadEnergy()
  loadOutages()
  timer = window.setInterval(() => {
    loadHistory()
    loadEnergy()
    loadOutages()
  }, 30_000)
  placeIndicator()
  document.fonts?.ready.then(placeIndicator)
  ro = new ResizeObserver(placeIndicator)
  if (segBtns.value[0]?.parentElement) ro.observe(segBtns.value[0].parentElement)
})
onUnmounted(() => {
  clearInterval(timer)
  ro?.disconnect()
})

const kwh = (wh?: number) =>
  wh == null ? '—' : wh >= 1000 ? (wh / 1000).toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(wh)
const kwhUnit = (wh?: number) => (wh == null ? '' : wh >= 1000 ? 'kWh' : 'Wh')
const todayNet = computed(() => (today.value ? today.value.inWh - today.value.outWh : undefined))
const share = (part?: number, total?: number) => (part && total ? `${Math.round((part / total) * 100)}%` : '0%')
const updated = computed(() => (live.value ? new Date(live.value.ts).toLocaleTimeString('es') : '—'))
</script>

<template>
  <div class="mx-auto max-w-[1200px] px-4 pb-12 pt-6 sm:px-6 lg:px-8 lg:pt-8">
    <!-- Header -->
    <header class="enter mb-6 flex flex-wrap items-end justify-between gap-4 lg:mb-8" style="--i: 0">
      <div>
        <h1 class="text-xl font-semibold tracking-tight text-ink sm:text-2xl">EcoFlow Monitor</h1>
        <p class="mt-1 text-[13px] text-muted">
          {{ mock ? 'Modo simulado' : `SN ${sn || '—'}` }}
          <span class="mx-1.5 text-faint">·</span>
          actualizado <span class="num text-text">{{ updated }}</span>
        </p>
      </div>
      <ul class="flex flex-wrap gap-2 text-[13px]" aria-label="Estado de conexión">
        <li class="flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5">
          <span class="size-2 rounded-full" :style="{ background: connected ? C.charge : C.low }" />
          <span :class="connected ? 'text-text' : 'text-low'">{{ connected ? 'Servidor conectado' : 'Sin servidor' }}</span>
        </li>
        <li class="flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5">
          <span class="size-2 rounded-full" :style="{ background: online ? C.charge : C.faint }" />
          <span :class="online ? 'text-text' : 'text-muted'">{{ online ? 'Equipo en línea' : 'Equipo offline' }}</span>
        </li>
        <li v-if="desktop">
          <button
            type="button" class="flex size-[34px] items-center justify-center rounded-full border border-line bg-surface text-muted transition-colors hover:text-ink"
            aria-label="Configuración" title="Configuración" @click="settingsOpen = true"
          >
            <svg viewBox="0 0 20 20" class="size-4" fill="none" stroke="currentColor" stroke-width="1.6">
              <circle cx="10" cy="10" r="2.6" />
              <path d="M10 1.8v2.4M10 15.8v2.4M1.8 10h2.4M15.8 10h2.4M4.2 4.2l1.7 1.7M14.1 14.1l1.7 1.7M4.2 15.8l1.7-1.7M14.1 5.9l1.7-1.7" stroke-linecap="round" />
            </svg>
          </button>
        </li>
      </ul>
    </header>

    <!-- Avisos de la app: actualización lista / error de conexión -->
    <div
      v-if="update?.state === 'downloaded'"
      class="enter mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-charge/40 bg-charge/10 px-4 py-3 text-[13px]"
    >
      <span class="text-text">La versión <span class="num text-ink">{{ update.version }}</span> está lista. Se instala al cerrar la app.</span>
      <button type="button" class="font-medium text-charge underline underline-offset-4" @click="desktop?.installUpdate()">Reiniciar y actualizar</button>
    </div>
    <div
      v-if="sourceError && !settingsOpen"
      class="enter mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-low/40 bg-low/10 px-4 py-3 text-[13px]" role="alert"
    >
      <span class="text-text">No se pudo conectar al EcoFlow: {{ sourceError }}</span>
      <button v-if="desktop" type="button" class="font-medium text-low underline underline-offset-4" @click="settingsOpen = true">Revisar configuración</button>
    </div>

    <main>
      <!-- Live power flow -->
      <section class="panel enter p-5 sm:p-6 lg:p-8" style="--i: 1" aria-labelledby="flow-h">
        <div class="mb-6 flex items-baseline justify-between gap-4 lg:mb-8">
          <h2 id="flow-h" class="text-base font-medium text-ink">Flujo de energía ahora</h2>
          <span class="eyebrow hidden md:inline">Entradas → batería → salidas</span>
        </div>
        <PowerFlow :live="live" :net-w="netW" :remaining="remaining" />
      </section>

      <!-- Totals -->
      <section class="enter mt-4 grid grid-cols-3 gap-3 sm:gap-4" style="--i: 2" aria-label="Totales en vivo">
        <StatCard label="Entrada total" :value="live?.inW ?? null" :accent="C.charge" hint="Red + solar" />
        <StatCard label="Salida total" :value="live?.outW ?? null" :accent="C.discharge" hint="AC + DC / USB" />
        <StatCard
          label="Balance" :value="live ? netW : null" signed
          :accent="netW >= 0 ? C.charge : C.discharge" hint="Entrada − salida"
        />
      </section>

      <!-- History -->
      <section class="panel enter mt-4 p-5 sm:p-6 lg:p-8" style="--i: 3" aria-labelledby="hist-h">
        <div class="mb-5 flex flex-wrap items-center justify-between gap-4">
          <h2 id="hist-h" class="text-base font-medium text-ink">Potencia y batería</h2>
          <div class="seg w-full sm:w-auto" role="group" aria-label="Rango de tiempo">
            <span class="seg__ind" :style="{ width: `${ind.w}px`, transform: `translateX(${ind.x}px)` }" aria-hidden="true" />
            <button
              v-for="r in ranges" :key="r.hours" ref="segBtns" type="button"
              class="seg__btn" :aria-pressed="hours === r.hours" @click="hours = r.hours"
            >{{ r.label }}</button>
          </div>
        </div>
        <PowerChart v-if="samples.length" :samples="samples" :hours="hours" />
        <p v-else class="grid h-80 place-items-center text-center text-sm text-muted">
          Aún no hay historial. El servidor guarda una muestra cada 15 s.
        </p>
      </section>

      <!-- Energy -->
      <section class="enter mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]" style="--i: 4">
        <div class="panel flex flex-col p-5 sm:p-6 lg:p-8" aria-labelledby="today-h">
          <h2 id="today-h" class="text-base font-medium text-ink">Energía de hoy</h2>

          <div class="mt-6">
            <p class="text-[13px] font-medium text-muted">Cargada</p>
            <p class="num mt-1.5 text-4xl font-medium leading-none" :style="{ color: C.charge }">
              {{ kwh(today?.inWh) }}<span class="ml-1.5 font-sans text-base font-normal tracking-normal text-muted">{{ kwhUnit(today?.inWh) }}</span>
            </p>
            <div class="mt-4 flex h-2 overflow-hidden rounded-full bg-line" aria-hidden="true">
              <div :style="{ width: share(today?.acInWh, today?.inWh), background: C.grid }" />
              <div :style="{ width: share(today?.pvInWh, today?.inWh), background: C.solar }" />
            </div>
            <dl class="mt-3 grid grid-cols-2 gap-2 text-[13px]">
              <div class="flex items-center gap-2">
                <span class="chip" :style="{ background: C.grid }" /><dt class="text-muted">Red</dt>
                <dd class="num ml-auto text-text">{{ kwh(today?.acInWh) }} {{ kwhUnit(today?.acInWh) }}</dd>
              </div>
              <div class="flex items-center gap-2 border-l border-line pl-3">
                <span class="chip" :style="{ background: C.solar }" /><dt class="text-muted">Solar</dt>
                <dd class="num ml-auto text-text">{{ kwh(today?.pvInWh) }} {{ kwhUnit(today?.pvInWh) }}</dd>
              </div>
            </dl>
          </div>

          <div class="mt-6 border-t border-line pt-6">
            <p class="text-[13px] font-medium text-muted">Consumida</p>
            <p class="num mt-1.5 text-4xl font-medium leading-none" :style="{ color: C.discharge }">
              {{ kwh(today?.outWh) }}<span class="ml-1.5 font-sans text-base font-normal tracking-normal text-muted">{{ kwhUnit(today?.outWh) }}</span>
            </p>
          </div>

          <div class="mt-6 flex items-baseline justify-between border-t border-line pt-4 text-[13px] lg:mt-auto">
            <span class="text-muted">Balance del día</span>
            <span class="num text-sm text-ink">
              {{ todayNet == null ? '—' : (todayNet >= 0 ? '+' : '−') + kwh(Math.abs(todayNet)) + ' ' + kwhUnit(Math.abs(todayNet)) }}
            </span>
          </div>
        </div>

        <div class="panel p-5 sm:p-6 lg:p-8" aria-labelledby="week-h">
          <h2 id="week-h" class="mb-5 text-base font-medium text-ink">Últimos 7 días</h2>
          <EnergyChart :days="energy" />
        </div>
      </section>

      <!-- Apagones + batería -->
      <section class="enter mt-4 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" style="--i: 5">
        <OutagesPanel :report="outages" :grid-on="live?.gridOn ?? null" />
        <BatteryHealth :battery="live?.battery ?? null" :temp-c="live?.tempC ?? null" />
      </section>
    </main>

    <SettingsPanel v-if="settingsOpen" :first-run="firstRun" :update="update" @close="settingsOpen = false" />
  </div>
</template>
