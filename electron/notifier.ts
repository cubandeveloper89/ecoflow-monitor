import { Notification } from 'electron'
import type { Snapshot } from '../server/src/normalize'
import type { OutageEvent } from '../server/src/outages'
import type { NotificationPrefs } from './config'

const fmtDur = (min: number) => {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`
}

/** Avisos del sistema: apagón, vuelta de la corriente, batería baja y batería llena */
export class Notifier {
  private lowSent = false
  private fullSent = false

  constructor(
    private prefs: () => NotificationPrefs,
    private latest: () => Snapshot | null,
    private onClick: () => void,
    private icon?: string,
  ) {}

  private show(title: string, body: string) {
    if (!Notification.isSupported()) return
    const n = new Notification({ title, body, icon: this.icon })
    n.on('click', this.onClick)
    n.show()
  }

  private batteryLine() {
    const s = this.latest()
    if (s?.soc == null) return ''
    const soc = `Batería al ${Math.round(s.soc)} %`
    const rem = s.dsgRemainMin
    return rem && rem > 0 && rem < 5999 ? `${soc} · unas ${fmtDur(rem)} de autonomía` : soc
  }

  outage(e: OutageEvent) {
    if (!this.prefs().outage) return
    if (e.type === 'start') {
      this.show('Se fue la corriente', this.batteryLine() || 'El EcoFlow está alimentando las cargas.')
    } else {
      const soc = this.latest()?.soc
      this.show(
        'Volvió la corriente',
        `Después de ${e.approx ? '≈ ' : ''}${fmtDur(e.durationMin)}${soc != null ? ` · batería al ${Math.round(soc)} %` : ''}`,
      )
    }
  }

  snapshot(s: Snapshot) {
    const p = this.prefs()
    if (s.soc == null) return
    const discharging = (s.outW ?? 0) > (s.inW ?? 0)

    if (s.soc <= p.lowBatteryPct && discharging) {
      if (p.lowBattery && !this.lowSent) this.show(`Batería baja: ${Math.round(s.soc)} %`, this.batteryLine())
      this.lowSent = true
    } else if (s.soc >= p.lowBatteryPct + 5) {
      this.lowSent = false
    }

    if (s.soc >= 99.5) {
      if (p.full && !this.fullSent) this.show('Batería llena', 'El EcoFlow llegó al 100 %.')
      this.fullSent = true
    } else if (s.soc < 95) {
      this.fullSent = false
    }
  }
}
