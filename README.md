# Horarios del personal

Visor web para organizar los turnos semanales del restaurante: una planilla de lunes a domingo, con los empleados como bloques de color que se arrastran y se estiran para marcar sus horas. Incluye dos grupos independientes (Cocina, y Barra y servicio) y una franja de "Descanso" por día para marcar quién libra.

## Uso

Abre `index.html` en el navegador. No necesita instalación, servidor ni conexión a internet: todo funciona en el propio archivo (HTML + CSS + JavaScript). Los turnos se guardan en el navegador de cada dispositivo (`localStorage`) y, si `api/shifts.js` está desplegado y configurado (ver abajo), también se sincronizan en la nube para compartirse entre dispositivos.

## Sincronización en la nube (Vercel + Redis)

El proyecto incluye `api/shifts.js`, una Vercel Function que guarda todo el estado de la app (empleados, turnos y descansos de ambos grupos) en una base de datos Redis (Upstash), bajo la clave `horarios:shifts`. Esa base de datos es compartida con el proyecto del tablero; para no chocar con sus variables, este proyecto usa las suyas propias, ya configuradas en Vercel:

- `HORARIOS_KV_REST_API_URL`
- `HORARIOS_KV_REST_API_TOKEN`

Con esas variables presentes, los turnos se sincronizan entre dispositivos automáticamente. Si llegaran a faltar (por ejemplo en un fork o en otro entorno de Vercel), la app sigue funcionando igual, solo que guardando exclusivamente en `localStorage` de cada dispositivo.

## Publicarlo en GitHub Pages

1. Sube este archivo a un repositorio (puede ir directo en la raíz o dentro de una carpeta).
2. En el repositorio, ve a **Settings → Pages**.
3. En **Source**, elige la rama (por ejemplo `main`) y la carpeta (`/root` o `/docs` según dónde quede `index.html`).
4. Guarda. GitHub te da un enlace del tipo `https://tu-usuario.github.io/tu-repo/` donde queda publicada la planilla.

## Grupos: Cocina / Barra y servicio

La app maneja dos planillas independientes, cada una con su propia lista de empleados, turnos y descansos: **Cocina** y **Barra y servicio**. Se cambia entre ellas con el selector de la cabecera; los datos de un grupo no se mezclan con los del otro (ni en pantalla ni al guardar).

## Días de descanso

Arriba de cada columna de día hay una franja que dice "Descanso". Si arrastras a un empleado desde la paleta y lo sueltas ahí (en vez de en la grilla de horas), queda marcado como libre ese día — aparece como una etiqueta con su color, y se quita tocándola. Esto es independiente de los turnos con hora: no impide ni borra un turno que ya tenga ese empleado ese día.

## Agregar y quitar empleados

Ya no hace falta editar el código. Con el botón **Empleados** de la cabecera se abre un formulario para agregar a alguien (nombre + color) o quitarlo, siempre dentro del grupo que esté activo en ese momento. Quitar a un empleado también borra sus turnos y descansos guardados en ese grupo (se pide confirmación antes).
