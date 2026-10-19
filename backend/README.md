# Backend — Monitoreo Avícola API

API en NestJS + Prisma + PostgreSQL. Consulta el [README principal](../README.md) para la puesta en marcha.

| Script | Descripción |
| --- | --- |
| `npm run start:dev` | API con recarga automática |
| `npm run build` | Genera el cliente de Prisma y compila a `dist/` |
| `npm run prisma:migrate` | Crea/aplica migraciones en desarrollo (`prisma migrate dev`) |
| `npm run prisma:deploy` | Aplica migraciones pendientes (`prisma migrate deploy`) |
| `npm run prisma:seed` | Registra el dispositivo "Galpón 1" |
| `npm run seed:prod` | Seed desde el código compilado (contenedor) |
| `npm test` | Pruebas unitarias (Vitest) |
| `npm run test:e2e` | Pruebas e2e (requiere Postgres en marcha) |
| `npm run lint` / `npm run format` | oxlint / Prettier |
