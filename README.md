# Horarios del personal

Visor web para organizar los turnos semanales del restaurante: una planilla de lunes a domingo, con los empleados como bloques de color que se arrastran y se estiran para marcar sus horas.

## Uso

Abre `index.html` en el navegador. No necesita instalación, servidor ni conexión a internet: todo funciona en el propio archivo (HTML + CSS + JavaScript). Los turnos se guardan en el navegador de cada dispositivo (`localStorage`), así que si lo abres desde otro computador o borras los datos del navegador, la planilla empieza vacía.

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
