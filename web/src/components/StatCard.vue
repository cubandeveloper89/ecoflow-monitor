<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ label: string; value: number | null; unit?: string; accent?: string; hint?: string; signed?: boolean }>()

const shown = computed(() => {
  if (props.value === null) return '—'
  const abs = Math.abs(props.value).toLocaleString('es')
  if (!props.signed || props.value === 0) return props.value.toLocaleString('es')
  return (props.value > 0 ? '+' : '−') + abs
})
</script>

<template>
  <div class="panel flex min-w-0 flex-col justify-between gap-3 p-4 sm:gap-4 sm:p-5">
    <div class="flex items-center gap-2 text-[13px] font-medium leading-tight text-muted">
      <span class="chip" :style="{ background: accent ?? 'var(--color-faint)' }" />
      {{ label }}
    </div>
    <div>
      <div class="num text-2xl font-medium leading-none sm:text-4xl">
        {{ shown }}<span class="ml-1 font-sans text-sm font-normal tracking-normal text-muted sm:ml-1.5 sm:text-base">{{ unit ?? 'W' }}</span>
      </div>
      <div v-if="hint" class="mt-2 hidden text-[13px] text-faint sm:block">{{ hint }}</div>
    </div>
  </div>
</template>
