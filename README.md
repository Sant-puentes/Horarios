# Horarios del personal

Visor web para organizar los turnos semanales del restaurante: una planilla de lunes a domingo, con los empleados como bloques de color que se arrastran y se estiran para marcar sus horas. Incluye dos grupos independientes (Cocina, y Barra y servicio) y una franja de "Descanso" por día para marcar quién libra.

## Uso

Al entrar al sitio (`index.html`), la primera pantalla es **HORARIOS CASAPAELLA**: un formulario para marcar la entrada o salida (solo pide el nombre) y, debajo, un botón **"Ver horarios →"** que lleva a `horarios.html`, donde está la planilla completa (y donde se entra como admin con la clave para editar). No necesita instalación ni build: todo es HTML + CSS + JavaScript plano, sin transpilar. Los turnos se guardan en el navegador de cada dispositivo (`localStorage`) y, si `api/shifts.js` está desplegado y configurado (ver abajo), también se sincronizan en la nube para compartirse entre dispositivos.

## Estructura de archivos

```
index.html            → pantalla de bienvenida / marcaje (autosuficiente, un solo archivo)
horarios.html          → cascarón HTML de la planilla + panel admin
assets/horarios.css    → CSS de horarios.html
assets/horarios.js     → JS de horarios.html (datos, drag&drop, Control de horario, QR del local, etc.)
vendor/qrcode.min.js   → librería de generación de QR (MIT), solo la usa horarios.html
vendor/jsqr.min.js     → lector de QR jsQR (Apache-2.0), solo la usa index.html como respaldo (iPhone/Safari)
api/shifts.js          → guarda/lee el horario planeado en Redis
api/attendance.js      → guarda/lee los marcajes de entrada/salida
api/location.js        → guarda el código secreto del QR del local
api/devices.js         → registro de celulares por empleado (anti-suplantación)
CONTEXTO.md            → mapa corto del proyecto, pensado para pegar al abrir un chat nuevo
```

`index.html` se dejó como un solo archivo autosuficiente porque es chico (~5 KB) y no lo justifica. `horarios.html` sí se separó en HTML/CSS/JS porque pesaba más de 60 KB en un solo archivo — dividirlo hace más barato (en tokens, para quien lo edite con IA) leer o tocar solo la parte que cambia.

## Sincronización en la nube (Vercel + Redis)

El proyecto incluye `api/shifts.js`, una Vercel Function que guarda todo el estado de la app (empleados, turnos y descansos de ambos grupos) en una base de datos Redis (Upstash), bajo la clave `horarios:shifts`. Esa base de datos es compartida con el proyecto del tablero; para no chocar con sus variables, este proyecto usa las suyas propias, ya configuradas en Vercel:

- `HORARIOS_KV_REST_API_URL`
- `HORARIOS_KV_REST_API_TOKEN`

Con esas variables presentes, los turnos se sincronizan entre dispositivos automáticamente. Si llegaran a faltar (por ejemplo en un fork o en otro entorno de Vercel), la app sigue funcionando igual, solo que guardando exclusivamente en `localStorage` de cada dispositivo.

## Publicarlo en GitHub Pages

1. Sube estos archivos a un repositorio (puede ir directo en la raíz o dentro de una carpeta).
2. En el repositorio, ve a **Settings → Pages**.
3. En **Source**, elige la rama (por ejemplo `main`) y la carpeta (`/root` o `/docs` según dónde queden los archivos).
4. Guarda. GitHub te da un enlace del tipo `https://tu-usuario.github.io/tu-repo/` donde queda publicada la app (nota: sin `api/`, la sincronización en la nube y el marcaje no funcionan en GitHub Pages — solo la planilla en modo local).

## Grupos: Cocina / Barra y servicio

La app maneja dos planillas independientes, cada una con su propia lista de empleados, turnos y descansos: **Cocina** y **Barra y servicio**. Se cambia entre ellas con el selector de la cabecera; los datos de un grupo no se mezclan con los del otro (ni en pantalla ni al guardar).

## Días de descanso

Arriba de cada columna de día hay una franja que dice "Descanso". Si arrastras a un empleado desde la paleta y lo sueltas ahí (en vez de en la grilla de horas), queda marcado como libre ese día — aparece como una etiqueta con su color, y se quita tocándola. Esto es independiente de los turnos con hora: no impide ni borra un turno que ya tenga ese empleado ese día.

## Agregar y quitar empleados

Ya no hace falta editar el código. Con el botón **Empleados** de la cabecera (visible solo en modo edición) se abre un formulario para agregar a alguien (nombre + color) o quitarlo, siempre dentro del grupo que esté activo en ese momento. Quitar a un empleado también borra sus turnos y descansos guardados en ese grupo (se pide confirmación antes).

## Modo edición (clave)

Por defecto la app se abre en **solo lectura**: cualquiera puede ver los horarios, cambiar de grupo y hacer zoom con pinch, pero no arrastrar, borrar, agregar empleados ni tocar los botones +/- de columnas. Abajo a la derecha hay un botón **Editar**; al tocarlo pide una clave (por ahora, fija: `1111`) y, si es correcta, desbloquea la edición completa hasta que se toque **Bloquear** o se cierre la pestaña (la sesión de edición se guarda en `sessionStorage`, no en `localStorage`).

Importante: esto es un freno para evitar ediciones accidentales, **no seguridad real**. Como todo el código corre en el navegador, la clave es visible para cualquiera que mire el código fuente de la página, y quien la conozca podría editar desde cualquier dispositivo. `api/shifts.js` también exige esa misma clave (header `x-edit-key`) antes de guardar en la nube, así que ni siquiera alguien que ataque la API directamente puede escribir sin ella — pero sigue sin ser una clave por usuario ni nada auditable. Si más adelante hace falta algo más serio, lo natural es reemplazar esto por variables de entorno por clave y, idealmente, autenticación real por persona.

### Vista de empleado vs. vista de admin

Las dos vistas son la misma pantalla con distinto comportamiento según si está desbloqueada o no:

- **Sin desbloquear (empleado)**: las horas totales junto a cada nombre en la paleta quedan ocultas. Al tocar el nombre de un empleado, la planilla se filtra para mostrar solo sus turnos y sus días de descanso (los del resto quedan ocultos); hay un chip **"Todos"** al inicio de la paleta para volver a ver a todo el mundo, y tocar de nuevo el mismo nombre también quita el filtro. No hay arrastre ni edición de ningún tipo.
- **Desbloqueada (admin)**: se ven las horas totales de cada quien, y tocar/arrastrar un nombre sirve para crear turnos (drag and drop) — no filtra nada; siempre se ve la planilla completa de todos.

## Encabezado de horarios.html

El encabezado ocupa poco espacio para dejar la semana a la vista (en celular ~90 px en lectura y ~170 px en edición, antes ~300 y ~390):

- **Sin título.** Solo el selector **Cocina / Barra y servicio** a lo ancho, un botón **?** (muestra u oculta el texto de ayuda de cada modo) y, en edición, un botón **⋯**.
- **Menú ⋯ (solo admin, con la edición desbloqueada):** **Empleados**, **QR del local**, **Celulares** y **Vaciar semana**. Se cierra al elegir una opción o al tocar fuera. Los botones conservan sus ids (`empBtn`, `locBtn`, `devBtn`, `clr`), así que la lógica no cambió.
- **Fila de modo (solo edición):** **Planeado / Control**; en Control aparecen en la misma fila el selector de semanas y **↻** (actualizar).
- **Fichas de empleados más compactas:** en lectura, una sola fila que se desplaza a los lados (**Todos** + nombres); en edición, fichas chicas que se acomodan en 2 filas.

## Control de horario (marcaje de entrada y salida)

Además de la planilla de turnos *planeados*, la app registra las horas *reales* que cada empleado trabaja.

- **`index.html`** (la pantalla con la que arranca el sitio) es el formulario de marcaje: se escribe el nombre del empleado (igual a como está escrito en el sistema; hay autocompletado) y se toca "Marcar". El primer marcaje del día registra la **entrada**; el siguiente marcaje de esa misma persona registra la **salida**; el que sigue vuelve a ser entrada, y así sucesivamente. La hora que se guarda es la del servidor, no la del celular que marca, para que nadie pueda adelantarla o atrasarla. No requiere la clave de edición — cualquier empleado debe poder marcar sin ser admin.
- Cada marcaje se guarda en Redis bajo la clave `horarios:attendance`, vía la función `api/attendance.js`, que también decide si el marcaje que llega es entrada o salida (buscando el nombre entre los empleados de Cocina y de Barra y servicio guardados en `horarios:shifts`).
- Dentro de `horarios.html`, en modo edición (admin desbloqueado), junto al selector de Cocina/Barra aparece un segundo interruptor: **Horario planeado** / **Control de horario**. Este último cambia la planilla a solo lectura y dibuja, en el mismo formato de cuadrícula, los intervalos reales de entrada-salida de la semana elegida, separados por grupo. Un turno sin salida registrada se marca con borde punteado: "En curso" si es hoy, o "Sin salida" si quedó abierto un día anterior. Es intencional que solo el admin lo vea: expone las horas de entrada/salida de cada persona, información más sensible que el horario planeado.
- **Selector de semanas**: arriba de la cuadrícula (visible solo en "Control de horario") hay un desplegable con cada semana que tenga al menos un marcaje, más la semana en curso aunque esté vacía (por ejemplo "21 al 27 de septiembre (actual)"). Cada semana guarda su propia información — no se mezcla ni se sobrescribe con la siguiente. Al llegar el lunes, la opción "(actual)" pasa a ser la nueva semana (vacía hasta que alguien marque) y la semana anterior queda disponible eligiéndola en el desplegable, tal como quedó.
- Es de solo lectura: no se puede arrastrar, estirar ni borrar nada ahí; para corregir un marcaje habría que hacerlo directamente en Redis (no hay UI de edición todavía).
- Limitación conocida: los marcajes se podan automáticamente a los 45 días (ver `api/attendance.js`), así que el selector no llega a mostrar semanas más viejas que eso; tampoco se soportan turnos que cruzan la medianoche.

## Celular registrado por empleado (anti-suplantación)

Para que un compañero no pueda marcar con el nombre de otro, cada empleado registra **su celular** una sola vez:

- **Qué es el "ID del celular":** un código aleatorio que `index.html` genera y guarda en `localStorage` del navegador (la web no puede leer el IMEI ni nada del hardware). Al servidor solo llega su hash SHA-256 y se guarda en Redis (`horarios:devices`) ligado a un empleado.
- **Cómo se registra (lo aprueba el admin):** en `horarios.html`, con la edición desbloqueada, el menú **⋯ → Celulares** lista a todos los empleados; **Código** genera un código de un solo uso (8 caracteres, vence en 24 h) con su QR y link (`index.html?reg=CODIGO`). El empleado lo canjea en su propio celular, ya sea escribiéndolo en "Registrar este celular" o escaneando el QR con su cámara.
- **Qué se exige al marcar:** si el empleado tiene celular registrado, solo puede marcar desde ese celular. Y un celular registrado solo puede marcar a su dueño (no a otros). Si no coincide, el servidor responde 403.
- **Cambio de celular:** el admin genera un **Código** nuevo y el empleado lo canjea en el celular nuevo; el celular anterior deja de funcionar. **Restablecer** borra el vínculo (ese empleado vuelve a marcar sin restricción hasta registrar otro celular).
- **Transición:** los empleados sin celular registrado siguen marcando como antes (solo QR del local + nombre), así que hay que registrar a todos para que la protección sea completa. Al quitar un empleado en "Empleados", su vínculo también se borra.
- **Límites:** si se borran los datos del navegador, se usa modo incógnito u otro navegador en el mismo celular, se pierde el ID y hay que pedir un código nuevo. Si un empleado presta su celular a otro, no se detecta. El código de registro no tiene límite de intentos (8 caracteres sobre 31 posibles, válido 24 h).

## Nombres visibles en Cocina y en Barra y servicio

## Zoom de la semana (pinch)

La semana se acerca y se aleja con **dos dedos** (pinch) sobre la planilla, sin botones; en computador, con Ctrl + rueda o el pellizco del trackpad. El punto que quedas tocando se mantiene bajo los dedos. El zoom es continuo: desde la **semana completa** ajustada a la pantalla hasta 312 px por día (con desplazamiento horizontal); el pinch responde con ganancia 1,5× (`PINCH_GAIN`) para que un gesto normal ya se note. Si empiezas un pinch mientras arrastras un turno, el arrastre se corta.

Cuando los bloques de turno quedan muy angostos, la planilla pasa al "modo de letras" (solo la inicial del empleado). Como Barra y servicio tiene más columnas por día (3+3 o más) que Cocina (3+2), antes Cocina podía mostrar nombre y horario mientras Barra solo letras. Ahora, en pantallas de 700 px o más, cada columna mide como mínimo `MIN_LANE` (37 px) según los carriles del grupo, así que ambos muestran nombre y horas (si no cabe, la planilla se desplaza en horizontal). En celular (menos de 700 px) el zoom es continuo y los dos grupos pasan de letras a nombre + horas en el mismo ancho por día (el del grupo con más carriles), para que nunca se vean distintos. Al añadir o quitar columnas con +/− el modo se recalcula.

## Reparación automática de turnos "fantasma"

Si un turno queda guardado con un carril que ya no existe ese día (por ejemplo `lane: 7` en un día que solo tiene 5 columnas, algo que pudo pasar con versiones anteriores de los botones +/− o al pisarse datos entre dispositivos), el turno se dibujaba fuera de su columna, no se veía, pero seguía bloqueando el horario de ese empleado. Ahora, al cargar los datos, `repairLanes()` (en `horarios.html`) lo reubica en el carril libre más cercano dentro del rango válido, en Cocina y en Barra. Si quien abre la página es admin (edición desbloqueada), la corrección se guarda en la nube y aparece un aviso; en modo solo lectura se corrige solo en pantalla, sin escribir nada. Además, el dibujo de cada turno limita el carril al rango válido, como segunda red de seguridad.

## QR del local (prueba de presencia)

Para que nadie pueda marcar entrada o salida desde su casa, el marcaje exige haber escaneado un **QR físico pegado en el local**:

- **Cómo se usa:** el empleado escanea el QR con la cámara normal de su celular; eso abre `index.html?loc=<código>` y ya puede escribir su nombre y marcar. Si abre la página sin escanear (por marcador, escribiendo la dirección, etc.), aparece el aviso *"escanea el QR pegado en el local"* y el servidor rechaza el marcaje (403).
- **Escáner dentro de la página:** `index.html` tiene el botón **Escanear QR del local**, que abre la cámara trasera y lee el QR sin salir de la web (necesita HTTPS y permiso de cámara). Usa `BarcodeDetector` si el navegador lo trae (Chrome/Android) y, si no, carga `vendor/jsqr.min.js` bajo demanda (iPhone/Safari). Si la cámara falla, el aviso sugiere escanear con la cámara normal del celular, que sigue funcionando (`?loc=`).
- **Hay que escanear cada vez:** el código viaja solo en la URL y a propósito **no se guarda** en el navegador, así que no sirve guardar el link para marcar después desde otro lado. Tras cada marcaje exitoso el código se borra de memoria y de la URL, y hay que volver a escanear.
- **Cómo lo genera el admin:** en `horarios.html`, con la edición desbloqueada, el menú **⋯ → QR del local** muestra el QR (con el link debajo), permite **Imprimir** una hoja lista para pegar, y **Regenerar código** (invalida el QR impreso anterior; hay que reimprimirlo. Útil si alguien le toma foto y lo comparte fuera del local).
- **Backend:** `api/location.js` guarda el código en Redis (`horarios:location`) y exige la clave de edición incluso para leerlo (si fuera público, cualquiera armaría el link sin ir al local). `api/attendance.js` compara el código recibido con el guardado.
- **Transición:** mientras el admin no haya generado el QR por primera vez (abrir el botón "QR del local" lo crea), el marcaje sigue funcionando como antes, sin exigir código.
- **Qué NO resuelve:** el QR prueba que *alguien* estaba en el local, no *quién*. Un compañero presente aún podría escribir el nombre de otro que no llegó, y quien tenga el link (por ejemplo, una foto del QR) puede usarlo hasta que se regenere. La suplantación por nombre se cubre con el registro de celular por empleado (sección siguiente).
- El QR se dibuja en el navegador con la librería `qrcode-generator` (MIT, Kazuhiko Arase), servida desde `vendor/qrcode.min.js`, sin depender de servicios externos.

## Subcarriles por categoría (Cocina/Producción, Barra/Servicio)

Dentro de cada día, las columnas de turnos se dividen en dos categorías con su propio ancho: en Cocina, "Cocina" (3 columnas) y "Producción" (2 columnas); en Barra y servicio, "Barra" (3) y "Servicio" (3). Los botones **+/-** junto a cada etiqueta (visibles solo en modo edición) ajustan cuántas columnas tiene esa categoría *ese día en particular* (mínimo 1, máximo 6) — no se puede quitar la última columna de una categoría si todavía tiene turnos asignados ese día.
