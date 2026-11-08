# EcoFlow Monitor

Web app local (Vue 3 + TS + Tailwind / Node) para ver en vivo la carga y descarga de tu EcoFlow
y guardar historial, usando la **API oficial de EcoFlow** (REST + MQTT en la nube).

```
EcoFlow ──wifi──> nube EcoFlow ──MQTT──> server (Node, tu PC) ──WebSocket──> navegador (Vue)
                                              └─ SQLite: muestra cada 15 s → historial y kWh por día
```

## 1. Credenciales
1. Entra a https://developer.ecoflow.com con tu cuenta de la app EcoFlow y pide acceso de desarrollador
   (la aprobación puede tardar unos días).
2. En *Access Key*, crea un par **Access Key / Secret Key**.
3. Copia `.env.example` a `.env` y llena `ECOFLOW_ACCESS_KEY`, `ECOFLOW_SECRET_KEY`, `ECOFLOW_SN`.
   - `ECOFLOW_API_HOST`: usa la región de tu cuenta (`api-a` América, `api-e` Europa, `api` global).
   - El SN lo ves en la app, o arranca el server y abre `http://localhost:3030/api/devices`.

## 2. Correr
```bash
npm install
npm run dev:mock   # UI con datos simulados, sin equipo → http://localhost:5173
npm run dev        # con tu EcoFlow real
```
Producción (todo en un puerto): `npm run build && npm start` → http://localhost:3030

## 3. Endpoints
| Ruta | Qué devuelve |
|---|---|
| `/api/state` | último snapshot normalizado |
| `/api/history?hours=24` | serie de potencia/SOC (máx. 600 puntos) |
| `/api/energy?days=7` | Wh cargados/consumidos por día |
| `/api/raw` | quota crudo del equipo (para mapear claves) |
| `/api/devices` | equipos de tu cuenta |
| `ws://…/ws` | stream en vivo |

## 4. Si algún valor sale "—"
Los nombres de campos cambian por modelo (Delta 3 / Pro 3 usan `powInSumW`, `cmsBattSoc`…;
el Delta Pro original usa `pd.wattsInSum`, `bmsMaster.soc`…). Abre `/api/raw`, busca la clave
correcta y agrégala en `server/src/normalize.ts`.

## Notas
- Necesita internet en el EcoFlow y en la PC. Si el MQTT se cae, igual refresca por REST cada 60 s.
- La energía se calcula integrando la potencia; huecos de más de 5 min (PC apagada) no cuentan.
- El historial se guarda en `data/ecoflow.db` (120 días).
