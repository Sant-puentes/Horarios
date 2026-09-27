# Horarios del personal

Visor web para organizar los turnos semanales del restaurante: una planilla de lunes a domingo, con los empleados como bloques de color que se arrastran y se estiran para marcar sus horas. Incluye dos grupos independientes (Cocina, y Barra y servicio) y una franja de "Descanso" por día para marcar quién libra.

## Uso

Al entrar al sitio (`index.html`), la primera pantalla es **HORARIOS CASAPAELLA**: un formulario para marcar la entrada o salida (solo pide el nombre) y, debajo, un botón **"Ver horarios →"** que lleva a `horarios.html`, donde está la planilla completa (y donde se entra como admin con la clave para editar). No necesita instalación, servidor ni conexión a internet para la parte de la planilla: todo funciona en el propio archivo (HTML + CSS + JavaScript). Los turnos se guardan en el navegador de cada dispositivo (`localStorage`) y, si `api/shifts.js` está desplegado y configurado (ver abajo), también se sincronizan en la nube para compartirse entre dispositivos.

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

Por defecto la app se abre en **solo lectura**: cualquiera puede ver los horarios, cambiar de grupo y hacer zoom, pero no arrastrar, borrar, agregar empleados ni tocar los botones +/- de columnas. Abajo a la derecha hay un botón **Editar**; al tocarlo pide una clave (por ahora, fija: `1111`) y, si es correcta, desbloquea la edición completa hasta que se toque **Bloquear** o se cierre la pestaña (la sesión de edición se guarda en `sessionStorage`, no en `localStorage`).

Importante: esto es un freno para evitar ediciones accidentales, **no seguridad real**. Como todo el código corre en el navegador, la clave es visible para cualquiera que mire el código fuente de la página, y quien la conozca podría editar desde cualquier dispositivo. `api/shifts.js` también exige esa misma clave (header `x-edit-key`) antes de guardar en la nube, así que ni siquiera alguien que ataque la API directamente puede escribir sin ella — pero sigue sin ser una clave por usuario ni nada auditable. Si más adelante hace falta algo más serio, lo natural es reemplazar esto por variables de entorno por clave y, idealmente, autenticación real por persona.

### Vista de empleado vs. vista de admin

Las dos vistas son la misma pantalla con distinto comportamiento según si está desbloqueada o no:

- **Sin desbloquear (empleado)**: las horas totales junto a cada nombre en la paleta quedan ocultas. Al tocar el nombre de un empleado, la planilla se filtra para mostrar solo sus turnos y sus días de descanso (los del resto quedan ocultos); hay un chip **"Todos"** al inicio de la paleta para volver a ver a todo el mundo, y tocar de nuevo el mismo nombre también quita el filtro. No hay arrastre ni edición de ningún tipo.
- **Desbloqueada (admin)**: se ven las horas totales de cada quien, y tocar/arrastrar un nombre sirve para crear turnos (drag and drop) — no filtra nada; siempre se ve la planilla completa de todos.

## Control de horario (marcaje de entrada y salida)

Además de la planilla de turnos *planeados*, la app registra las horas *reales* que cada empleado trabaja.

- **`index.html`** (la pantalla con la que arranca el sitio) es el formulario de marcaje: se escribe el nombre del empleado (igual a como está escrito en el sistema; hay autocompletado) y se toca "Marcar". El primer marcaje del día registra la **entrada**; el siguiente marcaje de esa misma persona registra la **salida**; el que sigue vuelve a ser entrada, y así sucesivamente. La hora que se guarda es la del servidor, no la del celular que marca, para que nadie pueda adelantarla o atrasarla. No requiere la clave de edición — cualquier empleado debe poder marcar sin ser admin.
- Cada marcaje se guarda en Redis bajo la clave `horarios:attendance`, vía la función `api/attendance.js`, que también decide si el marcaje que llega es entrada o salida (buscando el nombre entre los empleados de Cocina y de Barra y servicio guardados en `horarios:shifts`).
- Dentro de `horarios.html`, en modo edición (admin desbloqueado), junto al selector de Cocina/Barra aparece un segundo interruptor: **Horario planeado** / **Control de horario**. Este último cambia la planilla a solo lectura y dibuja, en el mismo formato de cuadrícula, los intervalos reales de entrada-salida de la semana elegida, separados por grupo. Un turno sin salida registrada se marca con borde punteado: "En curso" si es hoy, o "Sin salida" si quedó abierto un día anterior. Es intencional que solo el admin lo vea: expone las horas de entrada/salida de cada persona, información más sensible que el horario planeado.
- **Selector de semanas**: arriba de la cuadrícula (visible solo en "Control de horario") hay un desplegable con cada semana que tenga al menos un marcaje, más la semana en curso aunque esté vacía (por ejemplo "21 al 27 de septiembre (actual)"). Cada semana guarda su propia información — no se mezcla ni se sobrescribe con la siguiente. Al llegar el lunes, la opción "(actual)" pasa a ser la nueva semana (vacía hasta que alguien marque) y la semana anterior queda disponible eligiéndola en el desplegable, tal como quedó.
- Es de solo lectura: no se puede arrastrar, estirar ni borrar nada ahí; para corregir un marcaje habría que hacerlo directamente en Redis (no hay UI de edición todavía).
- Limitación conocida: los marcajes se podan automáticamente a los 45 días (ver `api/attendance.js`), así que el selector no llega a mostrar semanas más viejas que eso; tampoco se soportan turnos que cruzan la medianoche.

## Subcarriles por categoría (Cocina/Producción, Barra/Servicio)

Dentro de cada día, las columnas de turnos se dividen en dos categorías con su propio ancho: en Cocina, "Cocina" (3 columnas) y "Producción" (2 columnas); en Barra y servicio, "Barra" (3) y "Servicio" (3). Los botones **+/-** junto a cada etiqueta (visibles solo en modo edición) ajustan cuántas columnas tiene esa categoría *ese día en particular* (mínimo 1, máximo 6) — no se puede quitar la última columna de una categoría si todavía tiene turnos asignados ese día.
