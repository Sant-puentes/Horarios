# Contexto rápido — Horarios Casapaella

Pega este archivo al abrir un chat nuevo para retomar el proyecto sin tener que releer todo el repo. Para el detalle de cada función, el README tiene una sección por tema.

## Qué es

App de horarios de personal para un restaurante (Cocina / Barra y servicio), con marcaje real de entrada y salida. Sin build: HTML+CSS+JS planos, desplegado en Vercel con auto-deploy al hacer push a `main`. Persistencia en Redis (Upstash) vía Vercel Functions en `api/`.

## Mapa de archivos

| Archivo | Qué es |
|---|---|
| `index.html` | Pantalla de bienvenida: título, marcar entrada/salida (solo nombre), botón "Ver horarios →". Público, sin clave. Incluye escáner de QR con cámara (`#scanbtn`, `startScan()`); el código `loc` vive solo en memoria y se borra tras marcar. Un solo archivo (salvo jsQR bajo demanda). |
| `horarios.html` | Cascarón HTML de la planilla + panel admin: estructura y `<dialog>`s. Carga `assets/horarios.css`, `vendor/qrcode.min.js` y `assets/horarios.js`, en ese orden. |
| `assets/horarios.css` | Todo el CSS de `horarios.html` (variables de tema, grilla, bloques, modo compacto, etc). |
| `assets/horarios.js` | Todo el JS de `horarios.html`: datos, drag&drop, Control de horario, candado de edición, QR del local, reparación de carriles. |
| `vendor/jsqr.min.js` | Librería jsQR (Apache-2.0). `index.html` la carga solo si el navegador no tiene `BarcodeDetector` (iPhone). |
| `vendor/qrcode.min.js` | Librería `qrcode-generator` (Kazuhiko Arase, MIT) minificada. Solo genera el QR del panel admin; no se toca casi nunca. |
| `api/shifts.js` | GET/POST del horario planeado (`horarios:shifts` en Redis). POST exige header `x-edit-key`. |
| `api/attendance.js` | POST registra marcaje (alterna entrada/salida por empleado); exige `loc` si ya hay QR de local configurado. GET público, devuelve el historial (≤45 días). Con `x-edit-key` acepta `action` `edit`/`delete`/`add` para que el admin corrija marcajes (Control → tocar un bloque o ⋯ → Corregir marcajes). |
| `api/devices.js` | Registro de celulares por empleado (`horarios:devices`): el admin genera códigos de un solo uso (GET/`invite`/`reset` exigen `x-edit-key`); el empleado los canjea (`register`, público). `api/attendance.js` exige que el celular (`device`) coincida con el registrado. Panel: menú ⋯ → "Celulares" en `horarios.html`. |
| `api/location.js` | Token secreto del QR del local (`horarios:location`). GET y POST exigen `x-edit-key` (nunca es público, si no cualquiera arma el link sin ir al local). |
| `CONTEXTO.md` | Este archivo. |
| `README.md` | Documentación completa, una sección por función. |

## Cosas que hay que saber antes de tocar código

- **Clave de edición**: `1111`, hardcodeada como `EDIT_PASSWORD` en `assets/horarios.js` y como `EDIT_KEY` en cada `api/*.js`. No es seguridad real, solo un candado simple.
- **Dos grupos independientes**: Cocina y Barra y servicio, cada uno con su propio roster, turnos, descansos y carriles por día (ajustables con botones +/−, `DATA[g].lanes[day]`).
- **Encabezado de `horarios.html`**: sin título; grupos + `?` (ayuda) + `⋯` (menú admin con Empleados, QR del local, Celulares, Vaciar semana); fila Planeado/Control solo en edición.
- **Horas extras** (admin): pestaña en la fila Planeado/Control/Horas extras. 42 h/semana, marcajes redondeados a 30 min (empate → menor), sin comparar aún con el plan (el plan no se guarda por semana). Ver README.
- **`horarios.html` tiene 3 modos**: solo lectura (público, filtra por empleado), edición (admin, drag&drop), y "Control de horario" (admin, solo lectura, horas reales por semana con selector de semana).
- **El QR del local prueba presencia, no identidad**: cualquiera físicamente ahí puede escribir el nombre de otro. Se complementa con el registro de celular por empleado (`api/devices.js`), que evita que se marque con el nombre de otro; empleados sin celular registrado siguen marcando solo por nombre (transición).
- **Nunca asumas que el repo está como lo dejaste**: el usuario y otras sesiones/herramientas editan directamente en GitHub. Siempre `git fetch origin main` + revisar `git log` antes de tocar nada, y `git rebase FETCH_HEAD` si hay commits nuevos.
- **Validar sin navegador real cuando alcance**: `node --check` para sintaxis. Para probar interacción de verdad hay Playwright instalado (Chromium real) — más confiable que jsdom para temas de layout/CSS (fue necesario para el bug de Barra vs Cocina).

## Flujo de trabajo con git

1. `git fetch origin main` y revisar `git log --oneline -5 origin/main` antes de editar.
2. Si hay commits nuevos, `git rebase FETCH_HEAD` (o si conviene, revisar el diff a fondo antes).
3. Editar, validar sintaxis (`node --check`), probar si el cambio lo amerita.
4. Commit descriptivo, `git fetch` de nuevo por si acaso, y push con el PAT que el usuario pega en el chat (expira en ~7 días; pedir uno nuevo si el push falla por auth).

## Para empezar un chat nuevo

Describe el síntoma con precisión (qué pantalla, qué se espera, qué se ve). Si es un cambio chico, decir "sin pruebas" o "prueba mínima" ahorra tokens — por defecto se valida con bastante rigor.
