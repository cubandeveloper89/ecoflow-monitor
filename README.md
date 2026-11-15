# EcoFlow Monitor

App de escritorio (Electron + Vue 3 + TS + Tailwind) para ver en vivo la carga y descarga de tu EcoFlow,
guardar historial y registrar los apagones. También funciona como web local en el navegador.

```
EcoFlow ──wifi──> nube EcoFlow ──MQTT──> servidor (Node, dentro de la app) ──WebSocket──> ventana (Vue)
                                              └─ SQLite: muestra cada 15 s → historial, kWh por día y apagones
```

## App de escritorio

### Desarrollo
```bash
npm install
npm run dev:mock   # app con datos simulados
npm run dev        # app con tu EcoFlow (la primera vez pide correo, contraseña y SN)
```
- Los cambios en `web/` se ven al instante en la ventana (Vite).
- Los cambios en `electron/` o `server/` reinician la app sola.
- DevTools: `F12` o `Ctrl+Shift+I` (también en la app instalada).

### Instalador
```bash
npm run dist       # → release/EcoFlow-Monitor-Setup-<versión>.exe
```

### Publicar una actualización
Las apps instaladas buscan versiones nuevas en GitHub Releases al arrancar y cada 6 h,
la descargan en segundo plano y la instalan al cerrar (o con "Reiniciar y actualizar").

1. Sube la versión en `package.json` (por ejemplo `0.2.0` → `0.3.0`) y haz commit.
2. Crea y sube el tag:
   ```bash
   git tag v0.3.0
   git push origin main --tags
   ```
3. GitHub Actions (`.github/workflows/release.yml`) compila el instalador en Windows y lo publica en Releases.

Alternativa sin Actions: `GH_TOKEN=<token con permiso repo> npm run release` desde tu PC.

> El instalador no está firmado: Windows SmartScreen avisará la primera vez ("Más información → Ejecutar de todas formas").

### Dónde guarda las cosas
| Qué | Dónde (Windows) |
|---|---|
| Configuración (contraseña cifrada con DPAPI) | `%APPDATA%\EcoFlow Monitor\config.json` |
| Historial y apagones | `%APPDATA%\EcoFlow Monitor\data\ecoflow.db` |

La primera vez que corres `npm run dev`, si existe `./data/ecoflow.db` (de la versión web) se copia ahí.

### Qué hace la app
- Al cerrar la ventana queda en la bandeja del sistema y sigue registrando.
- Opción de iniciar con Windows (arranca escondida).
- Notificaciones: se fue / volvió la corriente, batería baja, batería llena.
- Si no hay internet (apagón), reintenta conectar cada minuto.
- Opcional: ver el monitor desde el móvil en la red local (`http://IP-de-la-PC:3030`).

## Conexión con EcoFlow
Se configura desde la app (botón ⚙). Dos modos:

- **Cuenta de la app** (recomendado, necesario para DELTA 3 Plus): correo y contraseña de la app de EcoFlow.
  Usa la misma API privada que la app móvil y decodifica los mensajes protobuf del Delta 3
  (`server/proto/ef_delta3.proto`, tomado de tolwi/hassio-ecoflow-cloud, Apache-2.0). No es oficial: EcoFlow puede cambiarla.
- **API oficial**: Access Key y Secret Key de https://developer.ecoflow.com. Algunos modelos devuelven
  `[1006] current device is not allowed to get device info` y no envían datos.

## Versión web (sin Electron)
Necesita Node ≥ 22.13 y un `.env` (ver `.env.example`).
```bash
npm run dev:web:mock   # http://localhost:5173 con datos simulados
npm run dev:web        # con tu EcoFlow
npm run start:server   # solo el servidor en http://localhost:3030 (sirve web/dist si existe)
```

### Endpoints
| Ruta | Qué devuelve |
|---|---|
| `/api/state` | último snapshot normalizado |
| `/api/history?hours=24` | serie de potencia/SOC (máx. 600 puntos) |
| `/api/energy?days=7` | Wh cargados/consumidos por día |
| `/api/outages?days=30` | apagones y estadísticas |
| `/api/raw` | datos crudos del equipo (para mapear claves) |
| `ws://…/ws` | stream en vivo |

## Si algún valor sale "—"
Los nombres de campos cambian por modelo. Abre `/api/raw`, busca la clave correcta y agrégala en
`server/src/normalize.ts`.

## Estructura
```
electron/   main (ventana, bandeja, avisos, inicio con Windows), preload, config, actualizaciones
server/     API + MQTT + SQLite (node:sqlite). app.ts = servidor embebible, index.ts = CLI con .env
web/        dashboard Vue
scripts/    dev.mjs (Vite + Electron), build-electron.mjs (esbuild)
build/      íconos
```
