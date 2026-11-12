# Cerrada Samarkanda 2.0 — PWA de control de acceso

Proyecto **aislado** (Firebase `cerrada-samarkanda-2`, repo `racosta123/cerrada-samarkanda-2`,
Worker `samarkanda2-proxy`, secrets propios). Clon de la plantilla de La Marquesa, sin datos de ella.

## Accesos (solo 2, ambos de ENTRADA)
| id en el Worker | Nombre en la app | Quién |
|---|---|---|
| `residentes` | Portón vehicular | residentes, familiares y visitas (QR/PIN) |
| `peatones`   | Puerta peatonal  | residentes, familiares y visitas (QR/PIN) |

- La **salida vehicular es libre** (hardware con detector de vehículo): no pasa por la app.
- El Worker rechaza con 400 cualquier otra puerta (no existen `visitantes` ni `salida`).
- **Suspendido por mora**: puede abrir la peatonal, NO el portón vehicular (ni con Siri).
- **Invitaciones QR y PIN**: válidas en los dos accesos. Lectores planeados (`readerId`):
  `vehicular-entrada` → portón, `peatonal-entrada` → peatonal. Un lector desconocido = 400.

## Roles
- **Master** y **Admin**: abren los 2 accesos + bitácora general.
- **Residente** (jefe de familia) y **familiares**: abren los 2 accesos, invitan con QR/PIN.

## Seguridad
- El cliente **nunca** toca la Shelly ni guarda llaves. Todo pasa por el Worker, que verifica el ID token y el rol.
- Aperturas, invitaciones y finanzas sensibles solo las escribe el Worker (service account). Reglas cerradas por defecto.
- API key web restringida a `racosta123.github.io` y a las APIs de Auth/Firestore/FCM.

## Secrets del Worker (`wrangler secret put NOMBRE`)
`FIREBASE_PROJECT SA_EMAIL SA_PRIVATE_KEY QR_SECRET READER_KEY CRON_SECRET` (cargados) ·
`SHELLY_HOST SHELLY_AUTH_KEY SHELLY_DEVICES READER_SYNC_URL` (pendientes: hardware).
`SHELLY_DEVICES` = `{"residentes":"<id>","peatones":"<id>"}`.

## Pendientes de Samarkanda (busca `PENDIENTE-SAMARKANDA` en el código)
- Foto de fondo de la app y de la tarjeta de invitación (`INVITE_BG` en app.js, `#bgLayer` en index.html).
- Link de Google Maps de la entrada (`MAPS_URL` en app.js).
- Cuota mensual (`CUOTA_DEFAULT` = 0 en worker.js; se captura en Finanzas › Configuración de cobranza).
- Proveedor y link de pago en línea (Finanzas › Configuración de cobranza).
- Datos del comité.
- Shelly (cuenta, IDs de los 2 relevadores) y lectores QR/PIN físicos.
- Atajo de Siri propio de Samarkanda (link de iCloud; lo pone el master en la app).

## Tarea diaria (mora y recordatorios) — GitHub Actions
- No hay Cron Trigger de Cloudflare (límite gratis de la cuenta). La dispara
  `.github/workflows/cron-diario.yml` todos los días a las 16:00 UTC (9:00 Hermosillo) → `POST /cron/diario`.
- Protegida con `CRON_SECRET` (secret del Worker **y** secret de GitHub Actions, el mismo valor; nunca en el código).
  Sin él o incorrecto: 401. Se compara en tiempo constante.
- Idempotente: la suspensión actúa una vez al mes (desde el día 5); cada recordatorio tiene marca por casa y día;
  un candado evita dos corridas simultáneas. Si GitHub la retrasa o la repite, no pasa nada.
- La respuesta (visible en el log público de Actions) trae solo conteos, nunca nombres ni casas.
- Prueba manual: Actions › «Tarea diaria» › Run workflow › modo `simular` (no cambia nada).
- Anti-desactivación de 60 días: el mismo workflow re-habilita su propio workflow por la API (`gh api … /enable`) en cada corrida.
- Rotar el secret: generar uno nuevo y ponerlo en los dos lados (`wrangler secret put CRON_SECRET` y `gh secret set CRON_SECRET`).

## Publicación
Cada publicación sube `CACHE` (`samarkanda2-vNN`) en `sw.js` y `APP_VERSION` en `app.js`.
Pruebas del Worker: `node test/<archivo>.test.mjs`.
