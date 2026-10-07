---
name: report-phase
description: Reporta tu fase de trabajo a agent-monitor. Úsala al EMPEZAR cualquier tarea de código en este proyecto y cada vez que cambies de fase (exploración → planeación → ejecución → revisión) o tomes una asunción importante. Es un reporte de progreso ligero de una sola línea.
---

# Reportar fase a agent-monitor

Este proyecto está siendo monitorizado. Mantén actualizado tu estado ejecutando
**un solo comando de shell** cada vez que cambies de fase de trabajo. Es barato y
no requiere confirmación: hazlo y sigue trabajando.

Las 4 fases (en orden) son:

- `exploracion` — leyendo el código, entendiendo el problema, investigando.
- `planeacion` — decidiendo el enfoque, listando pasos, fijando asunciones.
- `ejecucion` — escribiendo/editando código, corriendo comandos.
- `revision` — verificando, depurando, corriendo tests, repasando el resultado.

## Cómo reportar

Ejecuta (vía Bash) al entrar en una fase nueva, con un `--detail` corto que diga
qué estás haciendo concretamente:

```bash
node "/Users/juanfelipezepeda/Developer/ai-lab/agent-monitor/bin/hook.js" phase <fase> --detail "<qué estás haciendo>"
```

Ejemplos:

```bash
node "/Users/juanfelipezepeda/Developer/ai-lab/agent-monitor/bin/hook.js" phase exploracion --detail "leyendo el módulo de auth"
node "/Users/juanfelipezepeda/Developer/ai-lab/agent-monitor/bin/hook.js" phase planeacion --detail "asumimos Postgres; 3 pasos"
node "/Users/juanfelipezepeda/Developer/ai-lab/agent-monitor/bin/hook.js" phase ejecucion --detail "implementando el endpoint /login"
node "/Users/juanfelipezepeda/Developer/ai-lab/agent-monitor/bin/hook.js" phase revision --detail "corriendo la suite de tests"
```

## Reglas

- Repórtate **al iniciar** la tarea (normalmente `exploracion`).
- Repórtate **al cambiar de fase**, y cuando tomes una **asunción** relevante
  (usa la fase actual con un `--detail` que empiece por "asumimos…").
- No reportes en cada acción pequeña: los detalles finos (qué archivo editas,
  qué comando corres) ya se capturan automáticamente. Tú solo marcas las fases.
- Si el comando falla, ignóralo y continúa: nunca interrumpe tu trabajo.
