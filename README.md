# Horarios del personal

Visor web para organizar los turnos semanales del restaurante: una planilla de lunes a domingo, con los empleados como bloques de color que se arrastran y se estiran para marcar sus horas.

## Uso

Abre `index.html` en el navegador. No necesita instalación, servidor ni conexión a internet: todo funciona en el propio archivo (HTML + CSS + JavaScript). Los turnos se guardan en el navegador de cada dispositivo (`localStorage`) y, si `api/shifts.js` está desplegado y configurado (ver abajo), también se sincronizan en la nube para compartirse entre dispositivos.

## Sincronización en la nube (Vercel + Redis)

El proyecto incluye `api/shifts.js`, una Vercel Function que guarda el arreglo completo de turnos en una base de datos Redis (Upstash), bajo la clave `horarios:shifts`. Esa base de datos es compartida con el proyecto del tablero; para no chocar con sus variables, este proyecto usa las suyas propias, ya configuradas en Vercel:

- `HORARIOS_KV_REST_API_URL`
- `HORARIOS_KV_REST_API_TOKEN`

Con esas variables presentes, los turnos se sincronizan entre dispositivos automáticamente. Si llegaran a faltar (por ejemplo en un fork o en otro entorno de Vercel), la app sigue funcionando igual, solo que guardando exclusivamente en `localStorage` de cada dispositivo.

## Publicarlo en GitHub Pages

1. Sube este archivo a un repositorio (puede ir directo en la raíz o dentro de una carpeta).
2. En el repositorio, ve a **Settings → Pages**.
3. En **Source**, elige la rama (por ejemplo `main`) y la carpeta (`/root` o `/docs` según dónde quede `index.html`).
4. Guarda. GitHub te da un enlace del tipo `https://tu-usuario.github.io/tu-repo/` donde queda publicada la planilla.

## Editar empleados

Los nombres y colores están al inicio del `<script>`, en la lista `EMP`:

```js
const EMP=[{n:'Jefferson',c:'#e2622a'},{n:'Jean',c:'#2f7de1'}, ...];
```

Para agregar, quitar o renombrar a alguien, edita esa lista con un editor de texto y vuelve a subir el archivo.
