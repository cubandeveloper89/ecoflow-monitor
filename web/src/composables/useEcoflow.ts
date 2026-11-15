import { ref, onMounted, onUnmounted } from 'vue'
import type { Snapshot } from '../types'

export function useEcoflow() {
  const live = ref<Snapshot | null>(null)
  const online = ref(false)
  const connected = ref(false)
  const mock = ref(false)
  const sn = ref('')
  /** false = el servidor no tiene equipo configurado (app de escritorio recién instalada) */
  const configured = ref(true)
  const sourceError = ref<string | null>(null)
  /** Se incrementa cuando el server confirma un cambio de corriente (empieza/termina apagón) */
  const outageTick = ref(0)
  let ws: WebSocket | null = null
  let retry: number | undefined
  let closed = false

  const connect = () => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    ws = new WebSocket(`${proto}://${location.host}/ws`)
    ws.onopen = () => (connected.value = true)
    ws.onclose = () => {
      connected.value = false
      if (!closed) retry = window.setTimeout(connect, 3000)
    }
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.type === 'hello') {
        mock.value = msg.mock
        sn.value = msg.sn
        configured.value = msg.configured ?? true
        sourceError.value = msg.error ?? null
        online.value = msg.online
        live.value = msg.data
      } else if (msg.type === 'snapshot') {
        live.value = msg.data
        online.value = true
      } else if (msg.type === 'outage') {
        outageTick.value++
      } else if (msg.type === 'status') {
        online.value = msg.online
      }
    }
  }

  onMounted(connect)
  onUnmounted(() => {
    closed = true
    clearTimeout(retry)
    ws?.close()
  })

  return { live, online, connected, mock, sn, outageTick, configured, sourceError }
}
