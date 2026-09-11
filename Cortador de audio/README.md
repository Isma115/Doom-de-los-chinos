# Cortador de audio

Aplicación sencilla de escritorio hecha con Python y Tkinter para seleccionar un fragmento de un vídeo o audio y exportarlo como:

- audio MP3;
- vídeo MP4.

## Requisitos

- Python 3.10 o superior con Tkinter.
- FFmpeg instalado y disponible en el `PATH` (`ffmpeg` y `ffprobe`).
- La dependencia opcional de arrastrar y soltar:

```bash
python3 -m pip install -r requirements.txt
```

En macOS, si usas Homebrew, puedes instalar FFmpeg con:

```bash
brew install ffmpeg
```

## Ejecutar

Desde esta carpeta:

```bash
python3 app.py
```

Arrastra un archivo a la zona superior o pulsa sobre ella para buscarlo. Después mueve las barras `Inicio` y `Fin`, y pulsa `Conseguir audio` o `Conseguir vídeo`.

Si `tkinterdnd2` no está instalado, la aplicación seguirá funcionando con el botón `Abrir archivo`, pero no tendrá arrastre y soltado.
