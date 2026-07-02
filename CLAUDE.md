# Market Sentinel

Dashboard de inteligencia de inversión sobre el S&P 500: 3 niveles de riesgo (Value/DCF, Growth score, Event-driven), motor de alertas con interpretación por agentes IA (Anthropic) y capa observer de recomendaciones. Ver el documento de arquitectura v1 para el diseño completo.

## Comandos

```bash
docker compose up --build          # todo el sistema (db + api + worker + frontend en :5173)

# Desarrollo local (requiere Postgres en :5432 o docker compose up db)
cd backend && python -m venv .venv && .venv/bin/pip install -r requirements.txt
cd backend && .venv/bin/uvicorn app.main:app --reload          # API en :8000
cd backend && .venv/bin/python worker.py                       # scheduler + backfill inicial
cd backend && .venv/bin/python -m pytest                       # tests
cd frontend && npm install && npm run dev                      # frontend dev en :5173 (proxy /api -> :8000)
```

Disparo manual de cualquier job: `POST /api/admin/refresh/{job}` (universe, prices_history, prices_latest, fundamentals, technicals, dcf, screens, news_macro, news_alerts, scan_alerts, agent_jobs, event_scout, observer).

## Arquitectura

- `backend/app/models.py` — **contrato central**: 10 tablas. Unidades: fundamentals en fracción (0.15=15%), técnicos/DCF en porcentaje (-35.2). Símbolos en formato Yahoo (`BRK-B`).
- `backend/app/config.py` — settings por env (umbrales, DCF, modelo de agentes). `backend/app/db.py` — engine + `session_scope()` para workers, `get_db()` para FastAPI.
- `backend/app/ingestion/` — universe (Wikipedia), prices (yfinance + fallback Stooq), fundamentals (rotación ~100/día), news (RSS).
- `backend/app/analysis/` — technicals (ATH, soportes, RSI), dcf (conservador, auditable), screens (value + growth).
- `backend/app/alerts/engine.py` — reglas de umbral con dedup persistido en `alert_states`; cada alerta encola un `agent_jobs`.
- `backend/app/agents/` — research (por alerta), event_scout (Nivel 3), observer (reporte diario), runner (procesa la cola). Sin `ANTHROPIC_API_KEY` los jobs quedan `skipped` y el resto del sistema funciona.
- `backend/app/scheduler.py` + `worker.py` — cadencias de la sección 10; backfill inicial si la DB está vacía.
- `frontend/` — Vite + React + TS, UI en español, tema oscuro. Proxy `/api` a la API.

## Convenciones

- Todo lo caro corre en batch y persiste en Postgres; el frontend solo lee la API.
- Los agentes solo razonan sobre datos recuperados de la DB; nunca inventan cifras. Todo output del observer lleva disclaimer.
- Datos faltantes → `None` / `NO_VALORABLE`, nunca forzar un número.
- No pasar `temperature`/`top_p` al API de Anthropic (los modelos actuales los rechazan).
