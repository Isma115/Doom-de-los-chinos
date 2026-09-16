# Editor de Mapas — Doom3D

Aplicación **separada** del juego para crear mapas, cargarlos y guardarlos. La
vista de trabajo es una escena 3D de Three.js y se abre en una ventana Electron.

## Arranque

```bash
npm run editor          # ventana Electron + servidor Vite del editor 3D
npm run editor:desktop  # alias explícito del comando anterior
npm run editor:web      # alternativa: editor 3D en el navegador
npm run editor:build    # build en dist-editor/
npm run editor:preview  # previsualizar la build (puerto 4174)
```

En desarrollo, Electron levanta el editor en `http://127.0.0.1:5174/` y también
el servidor del juego en `http://127.0.0.1:5175/` para que **Probar en juego**
funcione desde la misma sesión. El juego por separado sigue arrancándose con
`npm run dev`.

## Uso

- **Editar 3D**: clic / arrastrar con la brocha sobre el suelo. Clic derecho = suelo.
- **Navegar 3D**: arrastra para orbitar, rueda para acercar y botón central para desplazar.
- Tecla `N` cambia entre editar y navegar; `B` cambia entre brocha y pipeta.
- **Brocha**: código de bloque + rotación + (en enemigos) max spawns y spawn rate.
- **Cargar JSON / Guardar JSON**: formato nativo del editor (`{format, version, name, width, height, grid}`).
- **Importar TXT / Exportar TXT**: formato clásico del juego `(P[180])`, `(S1)`, `(SMuni)`…
- **Cargar del juego**: trae `default`, `mapa1`, `mapa2` o `pruebas_alien` al editor.
- **▶ Probar en juego**: abre el juego con tu mapa.
  - Si editor y juego comparten origen, el mapa viaja solo (`?map=__custom`).
  - Si están en servidores distintos, se descarga el `.json`: cópialo en la
    carpeta `mapas/` del juego y recarga la pestaña del juego que se abre
    (`?map=<nombre>&autostart=1`).
- El campo **Juego** (barra superior) configura la URL del juego.

## Jugar un mapa del editor de forma permanente

1. Guarda el `.json` (o exporta el `.txt`) dentro de `mapas/` con el nombre que quieras.
2. Abre `index.html?map=<nombre>&autostart=1` — el juego acepta cualquier id de `mapas/`.

## Estructura

```
editor/
  index.html   # entrada de la app
  app.js       # lógica del editor 3D (Three.js + OrbitControls)
  style.css    # estilos
```

## Formato JSON v1

```json
{
  "format": "doom3d-map",
  "version": 1,
  "name": "mi_mapa",
  "width": 12,
  "height": 10,
  "grid": [[{ "code": "B" }, { "code": "P", "rotation": 180 }]]
}
```

Cada celda es `{code, rotation?, maxSpawns?, spawnRate?}` o un string (`"P[180]"`, `"S1"`, `"#"`).
