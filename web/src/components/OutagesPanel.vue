<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { C } from '../theme'
import { fmtDay, fmtDur, fmtShort, fmtTime } from '../utils'
import type { Outage, OutageReport } from '../types'

const props = defineProps<{ report: OutageReport | null; gridOn: boolean | null }>()

/* Reloj para que la duración en curso avance sola */
const now = ref(Date.now())
let t: number | undefined
onMounted(() => (t = window.setInterval(() => (now.value = Date.now()), 30_000)))
onUnmounted(() => clearInterval(t))

const current = computed(() => props.report?.current ?? null)
/* El estado en vivo manda; el reporte puede ir hasta 30 s atrasado */
const isOut = computed(() => (props.gridOn ?? props.report?.gridOn) === false)

const status = computed(() => {
  if (isOut.value) {
    const since = current.value?.start
    return {
      title: 'Apagón en curso',
      color: C.low,
      detail: since ? `desde las ${fmtTime(since)} · ${fmtDur((now.value - since) / 60_000)}` : 'esperando confirmación…',
    }
  }
  if ((props.gridOn ?? props.report?.gridOn) === true) {
    const since = props.report?.lastEnd
    return {
      title: 'Hay corriente',
      color: C.charge,
      detail: since ? `desde las ${fmtTime(since)} (${fmtDay(since).toLowerCase()}) · ${fmtDur((now.value - since) / 60_000)}` : 'sin apagones registrados todavía',
    }
  }
  return { title: 'Sin datos de la red', color: C.faint, detail: 'esperando la primera lectura del equipo' }
})

const stats = computed(() => {
  const s = props.report?.stats
  return [
    { label: 'Apagones', value: s ? String(s.count) : '—' },
    { label: 'Sin corriente', value: s ? fmtDur(s.totalMin) : '—' },
    { label: 'El más largo', value: s && s.count ? fmtDur(s.longestMin) : '—' },
    { label: 'Promedio', value: s && s.avgMin ? fmtDur(s.avgMin) : '—' },
  ]
})

/* Línea de tiempo: últimos 7 días, cada fila = 24 h */
const DAY = 86_400_000
const timeline = computed(() => {
  const items = props.report?.items ?? []
  const rows = []
  const base = new Date()
  base.setHours(0, 0, 0, 0)
  for (let i = 0; i < 7; i++) {
    const start = base.getTime() - i * DAY
    const end = start + DAY
    let offMin = 0
    const blocks = items
      .map((o: Outage) => {
        const a = Math.max(o.start, start)
        const b = Math.min(o.end ?? now.value, end)
        return b > a ? { o, a, b } : null
      })
      .filter((x): x is { o: Outage; a: number; b: number } => !!x)
      .map(({ o, a, b }) => {
        offMin += (b - a) / 60_000
        return {
          left: ((a - start) / DAY) * 100,
          width: Math.max(0.4, ((b - a) / DAY) * 100),
          live: o.end === null,
          title: `${fmtTime(o.start)} – ${o.end ? fmtTime(o.end) : 'ahora'} · ${fmtDur(o.durationMin)}${o.approx ? ' (aprox.)' : ''}`,
        }
      })
    const nowPct = i === 0 ? ((now.value - start) / DAY) * 100 : null
    rows.push({ key: start, label: fmtDay(start + 1), blocks, offMin, nowPct })
  }
  return rows
})

const recent = computed(() => (props.report?.items ?? []).slice(0, 6))
</script>

<template>
  <div class="panel flex flex-col p-5 sm:p-6 lg:p-8" aria-labelledby="out-h">
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <h2 id="out-h" class="text-base font-medium text-ink">Apagones</h2>
      <span class="eyebrow">Últimos {{ report?.stats.days ?? 30 }} días</span>
    </div>

    <!-- Estado actual -->
    <div class="mt-5 flex items-start gap-3 rounded-xl border border-line bg-raised p-4">
      <span class="mt-1.5 size-2.5 flex-none rounded-full" :class="{ 'animate-pulse': isOut }" :style="{ background: status.color }" />
      <div class="min-w-0">
        <p class="text-lg font-medium leading-tight" :style="{ color: isOut ? C.low : C.ink }">{{ status.title }}</p>
        <p class="mt-1 text-[13px] text-muted">{{ status.detail }}</p>
      </div>
    </div>

    <!-- Totales -->
    <dl class="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
      <div v-for="s in stats" :key="s.label">
        <dt class="text-[13px] text-muted">{{ s.label }}</dt>
        <dd class="num mt-1 text-xl font-medium leading-tight">{{ s.value }}</dd>
      </div>
    </dl>

    <!-- Línea de tiempo -->
    <div class="mt-6 border-t border-line pt-5">
      <div class="mb-2 grid grid-cols-[4.5rem_minmax(0,1fr)_4rem] gap-3 text-[11px] text-faint">
        <span />
        <div class="flex justify-between"><span>0 h</span><span>6</span><span>12</span><span>18</span><span>24</span></div>
        <span />
      </div>
      <ul class="space-y-2">
        <li v-for="r in timeline" :key="r.key" class="grid grid-cols-[4.5rem_minmax(0,1fr)_4rem] items-center gap-3 text-[13px]">
          <span class="truncate text-muted">{{ r.label }}</span>
          <div class="relative h-4 overflow-hidden rounded bg-line" :style="{ '--g': C.grid }">
            <div class="absolute inset-0 rounded" :style="{ background: `color-mix(in oklab, ${C.charge} 18%, transparent)`, width: r.nowPct != null ? `${r.nowPct}%` : '100%' }" />
            <div
              v-for="(b, j) in r.blocks" :key="j" :title="b.title"
              class="absolute inset-y-0 rounded-sm" :class="{ 'animate-pulse': b.live }"
              :style="{ left: `${b.left}%`, width: `${b.width}%`, background: C.low }"
            />
            <div v-if="r.nowPct != null" class="absolute inset-y-0 w-px bg-ink/60" :style="{ left: `${r.nowPct}%` }" />
          </div>
          <span class="num whitespace-nowrap text-right text-[12px]" :class="r.offMin ? 'text-text' : 'text-faint'">{{ r.offMin ? fmtShort(r.offMin) : '—' }}</span>
        </li>
      </ul>
      <div class="mt-3 flex gap-4 text-[12px] text-muted">
        <span class="flex items-center gap-1.5"><span class="chip" :style="{ background: C.charge, opacity: 0.5 }" />Con corriente</span>
        <span class="flex items-center gap-1.5"><span class="chip" :style="{ background: C.low }" />Apagón</span>
      </div>
    </div>

    <!-- Lista -->
    <div v-if="recent.length" class="mt-6 border-t border-line pt-5">
      <p class="mb-3 text-[13px] font-medium text-muted">Recientes</p>
      <ul class="divide-y divide-line text-[13px]">
        <li v-for="o in recent" :key="o.start" class="flex items-baseline gap-3 py-2">
          <span class="w-20 flex-none text-muted">{{ fmtDay(o.start) }}</span>
          <span class="num text-text">{{ fmtTime(o.start) }} – {{ o.end ? fmtTime(o.end) : 'ahora' }}</span>
          <span class="num ml-auto" :style="{ color: o.end ? C.ink : C.low }">
            {{ o.approx ? '≈ ' : '' }}{{ fmtDur(o.end ? o.durationMin : (now - o.start) / 60_000) }}
          </span>
        </li>
      </ul>
    </div>
  </div>
</template>
