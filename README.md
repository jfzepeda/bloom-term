# Market Sentinel

Dashboard de inteligencia de inversión sobre el S&P 500: 3 niveles de análisis (Value/DCF, Growth score, Event-driven), motor de alertas con interpretación por agentes IA (Anthropic) y capa observer de recomendaciones. Ver `CLAUDE.md` y el documento de arquitectura v1 para el diseño completo.

> **Disclaimer**: esto no es asesoría financiera. Generado por IA sobre fuentes públicas; verifica antes de operar.

## Requisitos

- Docker Desktop (para el modo recomendado), o
- Python 3.12 ([uv](https://docs.astral.sh/uv/)) + Node 22+ ([pnpm](https://pnpm.io/)) + Postgres 16 (para desarrollo local)
- Opcional: `ANTHROPIC_API_KEY` para la capa de agentes IA (sin key todo funciona igual, los jobs de agentes quedan `skipped`)

## Configuración

```bash
cp .env.example .env    # editar si quieres agentes IA u otros umbrales
```

Variables principales (todas tienen default razonable):

| Variable | Qué controla |
|---|---|
| `ANTHROPIC_API_KEY` | Habilita los agentes IA (research, event scout, observer) |
| `AGENT_MODEL` | Modelo de Anthropic (default `claude-sonnet-5`) |
| `ALERT_DROP_PCT`, `ALERT_SPIKE_PCT` | Umbrales de caída/subida diaria (-7 / +10) |
| `DRAWDOWN_THRESHOLDS`, `RALLY_THRESHOLDS` | Cruces desde ATH / mínimo 52w |
| `DCF_*` | Supuestos del DCF conservador (tasa, terminal, margen de seguridad…) |
| `PRICE_HISTORY_PERIOD` | Histórico del backfill inicial (default `10y`) |

## Levantar el servicio

### Con Docker (recomendado)

```bash
docker compose up --build          # primer arranque (construye imágenes)
docker compose up -d               # arranques siguientes, en background
```

Levanta 4 servicios:

| Servicio | Qué es | Puerto |
|---|---|---|
| `db` | PostgreSQL 16 (volumen `pgdata`, persiste entre reinicios) | 5432 |
| `api` | FastAPI (uvicorn) | 8000 |
| `worker` | Bootstrap inicial + scheduler (APScheduler) | — |
| `frontend` | React servido por nginx | 5173 |

- Dashboard: <http://localhost:5173>
- API + docs interactivas: <http://localhost:8000/docs>

**Primer arranque**: si la DB está vacía, el `worker` hace el backfill completo (universo de ~503 tickers desde Wikipedia + 10 años de precios + técnicos + alertas). Puede tardar bastantes minutos; se puede seguir con `docker compose logs -f worker`.

### Apagar

```bash
docker compose stop                # detiene contenedores, conserva todo
docker compose down                # además elimina contenedores y red (la DB persiste en el volumen)
docker compose down -v             # ⚠️ borra también el volumen: la DB se pierde y el próximo arranque re-hace el backfill
```

Reiniciar un servicio suelto: `docker compose restart worker` (o `api`, `frontend`).

### Logs y estado

```bash
docker compose ps                  # estado de los servicios
docker compose logs -f worker      # seguir el scheduler y los jobs
docker compose logs -f api         # peticiones y jobs manuales
```

### Desarrollo local (sin Docker, salvo la DB)

```bash
docker compose up -d db            # solo Postgres en :5432

cd backend
uv sync                                      # instala deps (pyproject.toml + uv.lock)
uv run uvicorn app.main:app --reload         # API en :8000
uv run python worker.py                      # (otra terminal) scheduler + backfill inicial
uv run pytest                                # tests

cd ../frontend
pnpm install && pnpm run dev                 # dev server en :5173 con proxy /api -> :8000
```

Para detener: `Ctrl+C` en cada proceso y `docker compose stop db`.

## Disparar procesos del worker manualmente

Cualquier job se puede lanzar sin esperar al scheduler:

```bash
curl -X POST http://localhost:8000/api/admin/refresh/{job}
```

Responde `{"status": "started", "job": "..."}` de inmediato y corre en background (el resultado se ve en los logs de `api`). Jobs válidos:

| Job | Qué hace |
|---|---|
| `universe` | Refresca el universo S&P 500 desde Wikipedia |
| `prices_history` | Backfill de histórico de precios (todo el universo, lento) |
| `prices_latest` | Precios recientes (incremental) |
| `fundamentals` | Siguiente lote rotatorio de fundamentales (~100 tickers) |
| `technicals` | Técnicos: ATH, drawdown, soportes/resistencias, RSI |
| `dcf` | Valoración DCF conservadora (Nivel 1) |
| `screens` | Screens value + growth |
| `news_macro` | Noticias macro (RSS) |
| `news_alerts` | Noticias priorizadas de tickers con alertas recientes |
| `scan_alerts` | Escaneo de reglas de alerta (con dedup) |
| `agent_jobs` | Procesa la cola de agentes IA pendientes |
| `event_scout` | Agente Nivel 3: ideas event-driven del día |
| `observer` | Agente observer: reporte diario |

Ejemplo — recalcular todo el pipeline de análisis tras tocar umbrales:

```bash
for j in technicals dcf screens scan_alerts; do
  curl -X POST http://localhost:8000/api/admin/refresh/$j
done
```

## Cadencias automáticas del scheduler

Todas en horario de mercado de NY (`America/New_York`):

| Job | Cuándo |
|---|---|
| `intraday` (precios + alertas) | cada 15 min, lun–vie 9:30–16:10 |
| `close_pass` (precios + técnicos + alertas) | 16:20 lun–vie |
| `news_refresh` (noticias priorizadas + macro) | cada 30 min |
| `agent_queue` (cola de agentes IA) | cada minuto |
| `fundamentals_nightly` (lote rotatorio) | 00:30 diario |
| `analysis_nightly` (técnicos + DCF + screens) | 01:30 diario |
| `observer_daily` | 17:00 lun–vie |
| `event_scout_daily` | 21:00 diario |
| `universe_weekly` | domingos 08:00 |

Un job que falla se logea y no tumba el scheduler.

## API (lectura)

| Endpoint | Devuelve |
|---|---|
| `GET /api/health` | Estado del servicio |
| `GET /api/universe` | Tickers activos con último precio y sector |
| `GET /api/screens/value` · `/api/screens/growth` | Resultados del último screen |
| `GET /api/alerts` | Alertas recientes (filtros: `symbol`, `severity`, `limit`) |
| `GET /api/tickers/{symbol}` | Detalle completo: precios, técnicos, DCF, fundamentales, noticias |
| `GET /api/observer/latest` · `/api/observer/{YYYY-MM-DD}` | Reporte del observer |

Docs interactivas completas en <http://localhost:8000/docs>.

## Solución de problemas

- **`docker compose up` falla con "cannot connect to the Docker daemon"** → Docker Desktop no está corriendo: `open -a Docker` y reintentar.
- **Frontend sin datos** → el backfill inicial aún no termina; revisar `docker compose logs -f worker` o disparar jobs manualmente (arriba).
- **Agentes en `skipped`** → falta `ANTHROPIC_API_KEY` en `.env`; ponerla y reiniciar (`docker compose restart api worker`).
- **Empezar de cero** → `docker compose down -v && docker compose up --build` (borra la DB y re-hace el backfill).
