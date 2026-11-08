<script setup lang="ts">
defineProps<{ label: string; value: number | null; unit?: string; accent?: string; hint?: string }>()
</script>

<template>
  <div class="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
    <div class="flex items-center gap-2 text-sm text-slate-400">
      <span class="h-2 w-2 rounded-full" :style="{ background: accent ?? '#64748b' }" />
      {{ label }}
    </div>
    <div class="mt-2 text-3xl font-semibold text-white">
      {{ value === null ? '—' : value.toLocaleString('es') }}<span class="ml-1 text-base text-slate-400">{{ unit ?? 'W' }}</span>
    </div>
    <div v-if="hint" class="mt-1 text-xs text-slate-500">{{ hint }}</div>
  </div>
</template>
