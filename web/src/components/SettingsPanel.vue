<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { desktop, type ConfigInput, type Mode, type PublicConfig, type UpdateStatus } from '../desktop'

const props = defineProps<{ firstRun: boolean; update: UpdateStatus | null }>()
const emit = defineEmits<{ close: [] }>()

const loaded = ref<PublicConfig | null>(null)
const info = ref<{ version: string; dataDir: string; port: number } | null>(null)
const saving = ref(false)
const error = ref<string | null>(null)
const saved = ref(false)

const form = reactive({
  mode: 'app' as Exclude<Mode, 'mock'>,
  sn: '',
  email: '',
  password: '',
  appHost: 'api.ecoflow.com',
  accessKey: '',
  secretKey: '',
  apiHost: 'https://api-a.ecoflow.com',
  outage: true,
  lowBattery: true,
  lowBatteryPct: 20,
  full: false,
  openAtLogin: true,
  lanAccess: false,
})

/** Para no reconectar al EcoFlow si solo cambiaste los avisos */
let connectionSnapshot = ''
const connectionKey = () =>
  JSON.stringify([form.mode, form.sn, form.email, form.password, form.appHost, form.accessKey, form.secretKey, form.apiHost])

onMounted(async () => {
  if (!desktop) return
  const [c, i] = await Promise.all([desktop.getConfig(), desktop.getInfo()])
  loaded.value = c
  info.value = i
  if (c.source && c.source.mode !== 'mock') {
    form.mode = c.source.mode
    form.sn = c.source.sn
    form.email = c.source.email ?? ''
    form.appHost = c.source.appHost || 'api.ecoflow.com'
    form.accessKey = c.source.accessKey ?? ''
    form.apiHost = c.source.apiHost || 'https://api-a.ecoflow.com'
  }
  Object.assign(form, c.notifications, { openAtLogin: c.openAtLogin, lanAccess: c.lanAccess })
  connectionSnapshot = connectionKey()
})

const needsPassword = computed(() => form.mode === 'app' && !loaded.value?.hasPassword)
const needsSecret = computed(() => form.mode === 'open' && !loaded.value?.hasSecretKey)
const valid = computed(() => {
  if (!form.sn.trim()) return false
  if (form.mode === 'app') return !!form.email.trim() && (!needsPassword.value || !!form.password)
  return !!form.accessKey.trim() && (!needsSecret.value || !!form.secretKey)
})

async function save() {
  if (!desktop || !valid.value) return
  saving.value = true
  error.value = null
  saved.value = false
  const input: ConfigInput = {
    notifications: {
      outage: form.outage,
      lowBattery: form.lowBattery,
      lowBatteryPct: Math.min(80, Math.max(5, Number(form.lowBatteryPct) || 20)),
      full: form.full,
    },
    openAtLogin: form.openAtLogin,
    lanAccess: form.lanAccess,
  }
  if (!loaded.value?.source || connectionKey() !== connectionSnapshot) {
    input.source =
      form.mode === 'app'
        ? { mode: 'app', sn: form.sn, email: form.email, appHost: form.appHost, password: form.password || undefined }
        : { mode: 'open', sn: form.sn, accessKey: form.accessKey.trim(), apiHost: form.apiHost, secretKey: form.secretKey || undefined }
  }
  try {
    const r = await desktop.saveConfig(input)
    if (!r.ok) {
      error.value = r.error ?? 'No se pudo conectar'
      return
    }
    if (r.restart) return // la app se reinicia sola
    loaded.value = await desktop.getConfig()
    form.password = ''
    form.secretKey = ''
    connectionSnapshot = connectionKey()
    saved.value = true
    setTimeout(() => emit('close'), 600)
  } finally {
    saving.value = false
  }
}

const updateText = computed(() => {
  const u = props.update
  if (!u) return ''
  switch (u.state) {
    case 'unsupported': return 'Las actualizaciones solo funcionan en la app instalada.'
    case 'checking': return 'Buscando actualizaciones…'
    case 'none': return 'Tienes la última versión.'
    case 'available': return `Hay una versión nueva (${u.version}). Descargando…`
    case 'downloading': return `Descargando ${u.version}: ${u.percent} %`
    case 'downloaded': return `La versión ${u.version} está lista para instalar.`
    case 'error': return `No se pudo comprobar: ${u.message}`
    default: return ''
  }
})

const canClose = computed(() => !props.firstRun || !!loaded.value?.source)
const onKey = (e: KeyboardEvent) => e.key === 'Escape' && canClose.value && emit('close')
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
watch(() => form.mode, () => (error.value = null))
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:items-center" @click.self="canClose && emit('close')">
    <form
      class="panel my-auto w-full max-w-xl p-5 shadow-2xl sm:p-7" role="dialog" aria-modal="true" aria-labelledby="set-h"
      @submit.prevent="save"
    >
      <div class="flex items-start justify-between gap-4">
        <div>
          <h2 id="set-h" class="text-lg font-semibold text-ink">{{ firstRun ? 'Conecta tu EcoFlow' : 'Configuración' }}</h2>
          <p v-if="firstRun" class="mt-1 text-[13px] text-muted">Solo hay que hacerlo una vez. Los datos se guardan cifrados en esta PC.</p>
        </div>
        <button v-if="canClose" type="button" class="icon-btn" aria-label="Cerrar" @click="emit('close')">
          <svg viewBox="0 0 20 20" class="size-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="m5 5 10 10M15 5 5 15" /></svg>
        </button>
      </div>

      <!-- Conexión -->
      <section class="mt-6">
        <h3 class="eyebrow mb-3">Conexión</h3>
        <div class="grid grid-cols-2 gap-2">
          <label class="choice" :class="{ 'is-on': form.mode === 'app' }">
            <input v-model="form.mode" type="radio" value="app" class="sr-only" />
            <span class="font-medium text-ink">Cuenta de la app</span>
            <span class="text-[12px] text-muted">Correo y contraseña. Funciona con DELTA 3 Plus.</span>
          </label>
          <label class="choice" :class="{ 'is-on': form.mode === 'open' }">
            <input v-model="form.mode" type="radio" value="open" class="sr-only" />
            <span class="font-medium text-ink">API oficial</span>
            <span class="text-[12px] text-muted">Access Key y Secret Key del portal de desarrollador.</span>
          </label>
        </div>

        <div class="mt-4 grid gap-3">
          <template v-if="form.mode === 'app'">
            <label class="field">
              <span>Correo de EcoFlow</span>
              <input v-model="form.email" type="email" autocomplete="username" required />
            </label>
            <label class="field">
              <span>Contraseña</span>
              <input
                v-model="form.password" type="password" autocomplete="current-password"
                :placeholder="loaded?.hasPassword ? '•••••••• (guardada, deja vacío para no cambiarla)' : ''"
                :required="needsPassword"
              />
            </label>
          </template>
          <template v-else>
            <label class="field">
              <span>Access Key</span>
              <input v-model="form.accessKey" type="text" spellcheck="false" required />
            </label>
            <label class="field">
              <span>Secret Key</span>
              <input
                v-model="form.secretKey" type="password"
                :placeholder="loaded?.hasSecretKey ? '•••••••• (guardada, deja vacío para no cambiarla)' : ''"
                :required="needsSecret"
              />
            </label>
            <label class="field">
              <span>Región de la cuenta</span>
              <select v-model="form.apiHost">
                <option value="https://api-a.ecoflow.com">América (api-a)</option>
                <option value="https://api-e.ecoflow.com">Europa (api-e)</option>
                <option value="https://api.ecoflow.com">Global (api)</option>
              </select>
            </label>
          </template>
          <label class="field">
            <span>Número de serie (SN)</span>
            <input v-model="form.sn" type="text" spellcheck="false" placeholder="P351…" class="font-mono uppercase" required />
          </label>
        </div>
      </section>

      <!-- Avisos -->
      <section class="mt-7 border-t border-line pt-5">
        <h3 class="eyebrow mb-3">Avisos</h3>
        <div class="space-y-1">
          <label class="toggle"><span>Cuando se va y vuelve la corriente</span><input v-model="form.outage" type="checkbox" /></label>
          <label class="toggle">
            <span>
              Batería baja, al llegar al
              <input
                v-model.number="form.lowBatteryPct" type="number" min="5" max="80" step="5"
                class="num mx-1 w-14 rounded-md border border-line bg-raised px-2 py-0.5 text-center text-sm" @click.stop
              />%
            </span>
            <input v-model="form.lowBattery" type="checkbox" />
          </label>
          <label class="toggle"><span>Batería llena</span><input v-model="form.full" type="checkbox" /></label>
        </div>
      </section>

      <!-- Sistema -->
      <section class="mt-2 border-t border-line pt-5">
        <h3 class="eyebrow mb-3">Sistema</h3>
        <div class="space-y-1">
          <label class="toggle">
            <span>Iniciar con Windows <span class="block text-[12px] text-faint">Arranca escondida en la bandeja y sigue registrando</span></span>
            <input v-model="form.openAtLogin" type="checkbox" />
          </label>
          <label class="toggle">
            <span>
              Ver el monitor desde el móvil
              <span class="block text-[12px] text-faint">
                Abre <span class="num">http://IP-de-esta-PC:{{ info?.port ?? 3030 }}</span> en la misma red. Reinicia la app.
              </span>
            </span>
            <input v-model="form.lanAccess" type="checkbox" />
          </label>
        </div>
        <button type="button" class="link mt-3" @click="desktop?.openDataFolder()">Abrir carpeta de datos (historial)</button>
      </section>

      <!-- Actualizaciones -->
      <section v-if="!firstRun" class="mt-2 border-t border-line pt-5">
        <h3 class="eyebrow mb-3">Actualizaciones</h3>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <p class="text-[13px] text-text">
            Versión <span class="num">{{ info?.version ?? '—' }}</span>
            <span class="block text-[12px] text-muted">{{ updateText }}</span>
          </p>
          <button
            v-if="update?.state === 'downloaded'" type="button" class="btn btn--primary"
            @click="desktop?.installUpdate()"
          >Reiniciar y actualizar</button>
          <button
            v-else type="button" class="btn"
            :disabled="update?.state === 'unsupported' || update?.state === 'checking' || update?.state === 'downloading'"
            @click="desktop?.checkForUpdates()"
          >Buscar actualizaciones</button>
        </div>
      </section>

      <!-- Acciones -->
      <p v-if="error" class="mt-6 rounded-lg border border-low/40 bg-low/10 px-3 py-2 text-[13px] text-low" role="alert">{{ error }}</p>
      <div class="mt-6 flex items-center justify-end gap-3">
        <span v-if="saved" class="mr-auto text-[13px] text-charge">Guardado</span>
        <button v-if="canClose" type="button" class="btn" @click="emit('close')">Cancelar</button>
        <button type="submit" class="btn btn--primary" :disabled="!valid || saving">
          {{ saving ? 'Conectando…' : firstRun ? 'Conectar' : 'Guardar' }}
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.choice {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid var(--color-line);
  background: var(--color-raised);
  font-size: 13px;
  cursor: pointer;
  transition: border-color 150ms var(--ease-ui);
}
.choice:hover { border-color: var(--color-line-strong); }
.choice.is-on { border-color: var(--color-charge); box-shadow: inset 0 0 0 1px var(--color-charge); }
.choice:has(:focus-visible) { outline: 2px solid var(--color-charge); outline-offset: 2px; }

.field { display: grid; gap: 6px; font-size: 13px; color: var(--color-muted); }
.field input,
.field select {
  min-height: 40px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid var(--color-line);
  background: var(--color-raised);
  color: var(--color-ink);
  font-size: 14px;
}
.field input::placeholder { color: var(--color-faint); font-size: 13px; text-transform: none; font-family: var(--font-sans); }
.field input:focus,
.field select:focus { outline: none; border-color: var(--color-charge); }

.toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 8px 0;
  font-size: 14px;
  color: var(--color-text);
  cursor: pointer;
}
.toggle > input[type='checkbox'] {
  appearance: none;
  flex: none;
  position: relative;
  width: 38px;
  height: 22px;
  border-radius: 999px;
  background: var(--color-line-strong);
  cursor: pointer;
  transition: background-color 150ms var(--ease-ui);
}
.toggle > input[type='checkbox']::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--color-ink);
  transition: transform 180ms var(--ease-ui);
}
.toggle > input[type='checkbox']:checked { background: var(--color-charge); }
.toggle > input[type='checkbox']:checked::after { transform: translateX(16px); background: var(--color-ground); }

.btn {
  min-height: 38px;
  padding: 0 16px;
  border-radius: 10px;
  border: 1px solid var(--color-line-strong);
  background: var(--color-raised);
  color: var(--color-ink);
  font-size: 14px;
  font-weight: 500;
  transition: background-color 150ms var(--ease-ui), transform 90ms var(--ease-ui);
}
.btn:hover:not(:disabled) { background: var(--color-line); }
.btn:active:not(:disabled) { transform: scale(0.985); }
.btn:disabled { opacity: 0.45; cursor: not-allowed; }
.btn--primary { background: var(--color-charge); border-color: var(--color-charge); color: var(--color-ground); }
.btn--primary:hover:not(:disabled) { background: color-mix(in oklab, var(--color-charge) 88%, white); }

.link { font-size: 13px; color: var(--color-charge); text-decoration: underline; text-underline-offset: 3px; }
.icon-btn { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 9px; color: var(--color-muted); }
.icon-btn:hover { background: var(--color-raised); color: var(--color-ink); }
</style>
