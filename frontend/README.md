# Dashboard — Monitoreo Avícola

Dashboard en React para ver en tiempo real la temperatura y el riego de los galpones.

**Estado:** prototipo visual con datos de demostración generados en el navegador
(`src/features/monitoring/mock-telemetry.ts`). En el siguiente paso se conecta a la API
(login, endpoints de consulta y actualizaciones en tiempo real).

## Stack

- Vite + React + TypeScript
- Tailwind CSS + shadcn/ui (tema propio en `src/index.css`)
- Apache ECharts para las gráficas
- Fuentes: Bricolage Grotesque (títulos y cifras) e IBM Plex Sans / Mono

## Desarrollo

```bash
npm install
npm run dev      # http://localhost:5180
npm run build
npm run lint
```

Todas las horas se muestran en tiempo de Guatemala (`America/Guatemala`, UTC−6).
