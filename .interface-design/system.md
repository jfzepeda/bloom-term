# Sistema de diseño — Market Sentinel Terminal

## Dirección

Terminal financiera de sala de trading (calidad Bloomberg), UI en español.
Denso, preciso, vivo, máquina-serio. El dato es la tipografía; la prosa IA es
la única voz humana y se distingue visualmente del dato.

## Tokens (Tailwind v4 `@theme`, en `frontend/src/styles.css`)

- Superficies (negro CRT cálido, saltos susurrados): `crt` #0c0b09 → `crt-1`
  #12110e (panel) → `crt-2` #191712 (cabecera/hover) → `crt-3` #211e17 (overlay).
- Acento único: `amber` #ffb43c (fósforo) + `amber-2` #c98a1e (tenue).
- Dirección de mercado (validados CVD + contraste, skill dataviz): `up` #2fd57b,
  `down` #f4453f. **Solo** para dirección/severidad; nunca decorativos. Deltas
  siempre con signo o flecha (codificación secundaria).
- Texto: `glow` #efeadd → `dim` #a09a8c → `faint` #6b665b → `ghost` #45423a.
- Bordes: `hair` (rgba 9%) / `hair-soft` (5%) / `hair-strong` (18%).
- Sin azul. Sin más colores.

## Profundidad

Solo bordes hairline. Esquinas rectas (sin rounded salvo dots de estado).
Sin sombras; el overlay se separa con `bg-crt/80` + `border-hair-strong`.

## Tipografía

- `font-term` (IBM Plex Mono, via @fontsource, importada en `main.tsx`) para
  TODO: datos, etiquetas, cabeceras. Números tabulares (global en body).
- `font-prose` (IBM Plex Sans) EXCLUSIVAMENTE para prosa generada por IA
  (observer, interpretaciones, tesis), siempre en `text-dim` y marcada `AiTag`.
- Etiquetas: uppercase `text-[9px]`/`text-[10px]` `tracking-[0.12em–0.18em]`.
- Datos: `text-[11px]`/`text-[12px]`. Filas ~22px (`py-[3px] px-2`).

## Firma

- Línea de comandos con prompt `❯` ámbar y cursor de bloque (`.term-cursor`).
- Paneles con código de 3 letras ámbar en cabecera (`MER SEÑ NOT OBS RAD AGN QUOTE`).
- Contenido IA marcado con `◮ IA` (AiTag) + riel ámbar; dato vs análisis.
- Cinta marquesina (`Tape`) con pausa al hover.
- Barra de estado con hotkeys en corchetes (`KeyHint`).

## Componentes canónicos (`frontend/src/components/terminal/`)

`Panel` (chrome único de paneles), `PanelTab`, `Stamp`, `TermEmpty`,
`TermLoading`, `AiTag`, `Tape`, `TopBar`, `StatusBar`/`KeyHint`.
Utilidades: `SEV_*`, `KIND_LABEL`, `VERDICT_TEXT`, `deltaClass`, `deltaArrow`,
`heatColor` (divergente rojo↔neutro↔verde, clamp ±3%, mezcla ≤0.5).

## Reglas de datos

- technicals/DCF en puntos porcentuales → `fmtPct`; fundamentals en fracción →
  `fmtFrac`; dinero `fmtMoney`; caps `fmtCap`; null → "—", nunca inventar.
- Estados obligatorios: cargando (`TermLoading`), vacío (`TermEmpty` con
  mensaje específico), error de red visible.
