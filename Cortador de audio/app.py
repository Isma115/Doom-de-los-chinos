"""Cortador sencillo de audio y vídeo con Tkinter y FFmpeg."""

from __future__ import annotations

import math
import os
import shutil
import subprocess
import tempfile
import threading
from pathlib import Path
from tkinter import filedialog, messagebox, ttk
import tkinter as tk
from urllib.parse import unquote


try:
    from tkinterdnd2 import DND_FILES, TkinterDnD

    DRAG_AND_DROP_AVAILABLE = True
except ImportError:
    DND_FILES = None
    TkinterDnD = None
    DRAG_AND_DROP_AVAILABLE = False


WINDOW_TITLE = "Cortador de audio"
MIN_CLIP_SECONDS = 0.01
MEDIA_FILETYPES = [
    (
        "Vídeos y audios",
        "*.mp4 *.mkv *.mov *.avi *.webm *.flv *.m4v *.mp3 *.wav *.m4a *.aac *.ogg *.flac",
    ),
    ("Todos los archivos", "*.*"),
]
COLORS = {
    "background": "#0b1220",
    "surface": "#111c2f",
    "surface_alt": "#1b2a43",
    "border": "#293b59",
    "text": "#f8fafc",
    "muted": "#91a0b7",
    "primary": "#8b5cf6",
    "primary_hover": "#7c3aed",
    "audio": "#14b8a6",
    "audio_hover": "#0d9488",
    "video": "#f97316",
    "video_hover": "#ea580c",
}


def format_time(seconds: float) -> str:
    """Devuelve un tiempo legible como HH:MM:SS.mmm."""

    total_milliseconds = max(0, round(seconds * 1000))
    hours, remainder = divmod(total_milliseconds, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    whole_seconds, milliseconds = divmod(remainder, 1000)
    return f"{hours:02d}:{minutes:02d}:{whole_seconds:02d}.{milliseconds:03d}"


def compact_time(seconds: float) -> str:
    """Devuelve un tiempo seguro para usar en un nombre de archivo."""

    total_seconds = max(0, round(seconds))
    minutes, remaining_seconds = divmod(total_seconds, 60)
    hours, minutes = divmod(minutes, 60)
    if hours:
        return f"{hours:02d}h{minutes:02d}m{remaining_seconds:02d}s"
    return f"{minutes:02d}m{remaining_seconds:02d}s"


class AudioCutterApp:
    """Interfaz principal de la aplicación."""

    def __init__(self, root: tk.Misc) -> None:
        self.root = root
        self.root.title(WINDOW_TITLE)
        self.root.geometry("760x510")
        self.root.minsize(650, 460)
        self.root.configure(bg=COLORS["background"])

        self.media_path: Path | None = None
        self.duration = 0.0
        self.loading = False
        self.exporting = False

        self.file_var = tk.StringVar(value="Sin archivo")
        self.details_var = tk.StringVar(value="—")
        self.status_var = tk.StringVar(value="Listo")
        self.start_time_var = tk.StringVar(value="00:00:00.000")
        self.end_time_var = tk.StringVar(value="00:00:00.000")
        self.selection_var = tk.StringVar(value="00:00:00.000")
        self.start_value = tk.DoubleVar(value=0.0)
        self.end_value = tk.DoubleVar(value=1.0)

        self._configure_styles()
        self._build_interface()
        self._configure_drag_and_drop()
        self._update_control_states()

    def _configure_styles(self) -> None:
        style = ttk.Style(self.root)
        try:
            style.theme_use("clam")
        except tk.TclError:
            pass

        background = COLORS["background"]
        surface = COLORS["surface"]
        surface_alt = COLORS["surface_alt"]
        border = COLORS["border"]
        text = COLORS["text"]
        muted = COLORS["muted"]

        style.configure("App.TFrame", background=background)
        style.configure("Card.TFrame", background=surface)
        style.configure(
            "Title.TLabel",
            background=background,
            foreground=text,
            font=("Helvetica", 25, "bold"),
        )
        style.configure(
            "CardTitle.TLabel",
            background=surface,
            foreground=text,
            font=("Helvetica", 13, "bold"),
        )
        style.configure(
            "CardText.TLabel",
            background=surface,
            foreground=muted,
            font=("Helvetica", 10),
        )
        style.configure(
            "FileName.TLabel",
            background=surface,
            foreground=text,
            font=("Helvetica", 11, "bold"),
        )
        style.configure(
            "Time.TLabel",
            background=surface,
            foreground=text,
            font=("Helvetica", 11, "bold"),
        )
        style.configure(
            "Selection.TLabel",
            background=surface,
            foreground=COLORS["primary"],
            font=("Helvetica", 11, "bold"),
        )
        style.configure(
            "Status.TLabel",
            background=background,
            foreground=muted,
            font=("Helvetica", 9),
        )
        style.configure(
            "Secondary.TButton",
            background=surface_alt,
            foreground=text,
            borderwidth=0,
            padding=(14, 9),
            font=("Helvetica", 10, "bold"),
        )
        style.map(
            "Secondary.TButton",
            background=[("active", border), ("disabled", surface_alt)],
            foreground=[("disabled", muted)],
        )
        style.configure(
            "Audio.TButton",
            background=COLORS["audio"],
            foreground="#061b1a",
            borderwidth=0,
            padding=(16, 10),
            font=("Helvetica", 10, "bold"),
        )
        style.map(
            "Audio.TButton",
            background=[("active", COLORS["audio_hover"]), ("disabled", surface_alt)],
            foreground=[("disabled", muted)],
        )
        style.configure(
            "Video.TButton",
            background=COLORS["video"],
            foreground="#261004",
            borderwidth=0,
            padding=(16, 10),
            font=("Helvetica", 10, "bold"),
        )
        style.map(
            "Video.TButton",
            background=[("active", COLORS["video_hover"]), ("disabled", surface_alt)],
            foreground=[("disabled", muted)],
        )

    def _build_interface(self) -> None:
        main = ttk.Frame(self.root, style="App.TFrame", padding=(30, 25, 30, 20))
        main.pack(fill="both", expand=True)

        header = ttk.Frame(main, style="App.TFrame")
        header.pack(fill="x", pady=(0, 18))
        ttk.Label(header, text=WINDOW_TITLE, style="Title.TLabel").pack(side="left")
        tk.Label(
            header,
            text="MP4  ·  MP3",
            bg=COLORS["surface_alt"],
            fg=COLORS["muted"],
            font=("Helvetica", 9, "bold"),
            padx=11,
            pady=6,
        ).pack(side="right", pady=3)

        self.drop_area = tk.Frame(
            main,
            bg=COLORS["surface"],
            highlightbackground=COLORS["border"],
            highlightcolor=COLORS["primary"],
            highlightthickness=2,
            bd=0,
            cursor="hand2",
            height=100,
        )
        self.drop_area.pack(fill="x", pady=(0, 16))
        self.drop_area.pack_propagate(False)

        self.drop_content = tk.Frame(self.drop_area, bg=COLORS["surface"])
        self.drop_content.place(relx=0.5, rely=0.5, anchor="center")
        self.drop_icon = tk.Label(
            self.drop_content,
            text="↓",
            bg=COLORS["surface"],
            fg=COLORS["primary"],
            font=("Helvetica", 28, "bold"),
        )
        self.drop_icon.pack(side="left", padx=(0, 17))
        self.drop_text = tk.Frame(self.drop_content, bg=COLORS["surface"])
        self.drop_text.pack(side="left")
        self.drop_label = tk.Label(
            self.drop_text,
            text="Suelta un archivo aquí",
            bg=COLORS["surface"],
            fg=COLORS["text"],
            font=("Helvetica", 12, "bold"),
        )
        self.drop_label.pack(anchor="w")
        self.drop_hint = tk.Label(
            self.drop_text,
            text="o haz clic para buscarlo",
            bg=COLORS["surface"],
            fg=COLORS["muted"],
            font=("Helvetica", 10),
        )
        self.drop_hint.pack(anchor="w", pady=(3, 0))

        file_card = ttk.Frame(main, style="Card.TFrame", padding=(15, 11))
        file_card.pack(fill="x", pady=(0, 16))
        self.file_chip = tk.Label(
            file_card,
            text="MEDIA",
            bg=COLORS["surface_alt"],
            fg=COLORS["primary"],
            font=("Helvetica", 8, "bold"),
            width=7,
            padx=8,
            pady=6,
        )
        self.file_chip.pack(side="left")
        file_info = ttk.Frame(file_card, style="Card.TFrame")
        file_info.pack(side="left", fill="x", expand=True, padx=(13, 0))
        ttk.Label(file_info, textvariable=self.file_var, style="FileName.TLabel").pack(
            anchor="w"
        )
        ttk.Label(file_info, textvariable=self.details_var, style="CardText.TLabel").pack(
            anchor="w", pady=(2, 0)
        )

        selection_card = ttk.Frame(main, style="Card.TFrame", padding=(17, 15))
        selection_card.pack(fill="both", expand=True)
        selection_header = ttk.Frame(selection_card, style="Card.TFrame")
        selection_header.pack(fill="x", pady=(0, 13))
        ttk.Label(selection_header, text="Fragmento", style="CardTitle.TLabel").pack(
            side="left"
        )
        ttk.Label(
            selection_header, textvariable=self.selection_var, style="Selection.TLabel"
        ).pack(side="right")

        start_header = ttk.Frame(selection_card, style="Card.TFrame")
        start_header.pack(fill="x")
        tk.Label(
            start_header,
            text="INICIO",
            bg=COLORS["surface"],
            fg=COLORS["muted"],
            font=("Helvetica", 8, "bold"),
        ).pack(side="left")
        ttk.Label(start_header, textvariable=self.start_time_var, style="Time.TLabel").pack(
            side="right"
        )

        self.start_scale = tk.Scale(
            selection_card,
            from_=0,
            to=1,
            orient=tk.HORIZONTAL,
            variable=self.start_value,
            command=lambda _value: self._selection_changed("start"),
            showvalue=False,
            resolution=0.01,
            bg=COLORS["surface"],
            fg=COLORS["primary"],
            activebackground=COLORS["primary_hover"],
            troughcolor=COLORS["surface_alt"],
            highlightthickness=0,
            bd=0,
            sliderlength=22,
            cursor="hand2",
            font=("Helvetica", 9),
        )
        self.start_scale.pack(fill="x", pady=(2, 12))

        end_header = ttk.Frame(selection_card, style="Card.TFrame")
        end_header.pack(fill="x")
        tk.Label(
            end_header,
            text="FIN",
            bg=COLORS["surface"],
            fg=COLORS["muted"],
            font=("Helvetica", 8, "bold"),
        ).pack(side="left")
        ttk.Label(end_header, textvariable=self.end_time_var, style="Time.TLabel").pack(
            side="right"
        )

        self.end_scale = tk.Scale(
            selection_card,
            from_=0,
            to=1,
            orient=tk.HORIZONTAL,
            variable=self.end_value,
            command=lambda _value: self._selection_changed("end"),
            showvalue=False,
            resolution=0.01,
            bg=COLORS["surface"],
            fg=COLORS["video"],
            activebackground=COLORS["video_hover"],
            troughcolor=COLORS["surface_alt"],
            highlightthickness=0,
            bd=0,
            sliderlength=22,
            cursor="hand2",
            font=("Helvetica", 9),
        )
        self.end_scale.pack(fill="x")

        actions = ttk.Frame(main, style="App.TFrame")
        actions.pack(fill="x", pady=(15, 0))
        self.open_button = ttk.Button(
            actions,
            text="Elegir archivo",
            style="Secondary.TButton",
            command=self.choose_file,
        )
        self.open_button.pack(side="left")

        self.audio_button = ttk.Button(
            actions,
            text="Conseguir audio",
            style="Audio.TButton",
            command=lambda: self.export_clip("audio"),
        )
        self.audio_button.pack(side="right", padx=(10, 0))
        self.video_button = ttk.Button(
            actions,
            text="Conseguir vídeo",
            style="Video.TButton",
            command=lambda: self.export_clip("video"),
        )
        self.video_button.pack(side="right")

        ttk.Label(main, textvariable=self.status_var, style="Status.TLabel").pack(
            anchor="w", pady=(9, 0)
        )

        for widget in (
            self.drop_area,
            self.drop_content,
            self.drop_text,
            self.drop_icon,
            self.drop_label,
            self.drop_hint,
        ):
            widget.bind("<Button-1>", self._choose_file_from_drop_area)
            widget.bind("<Enter>", self._drop_area_enter, add="+")
            widget.bind("<Leave>", self._drop_area_leave, add="+")

    def _configure_drag_and_drop(self) -> None:
        if not DRAG_AND_DROP_AVAILABLE:
            self.drop_label.configure(text="Haz clic para elegir un archivo")
            self.drop_hint.configure(text="Arrastrar y soltar requiere tkinterdnd2")
            return

        self.drop_hint.configure(text="suelta el archivo aquí o haz clic para buscarlo")
        for widget in (
            self.root,
            self.drop_area,
            self.drop_content,
            self.drop_text,
            self.drop_icon,
            self.drop_label,
            self.drop_hint,
        ):
            widget.drop_target_register(DND_FILES)
            widget.dnd_bind("<<Drop>>", self._handle_drop)
            widget.dnd_bind("<<DragEnter>>", self._drop_area_enter)
            widget.dnd_bind("<<DragLeave>>", self._drop_area_leave)

    def _drop_area_enter(self, _event=None):
        if not self.loading and not self.exporting:
            self.drop_area.configure(
                highlightbackground=COLORS["primary"], bg=COLORS["surface_alt"]
            )
            for widget in (
                self.drop_content,
                self.drop_text,
                self.drop_icon,
                self.drop_label,
                self.drop_hint,
            ):
                widget.configure(bg=COLORS["surface_alt"])

    def _drop_area_leave(self, _event=None):
        self.drop_area.configure(
            highlightbackground=COLORS["border"], bg=COLORS["surface"]
        )
        for widget in (
            self.drop_content,
            self.drop_text,
            self.drop_icon,
            self.drop_label,
            self.drop_hint,
        ):
            widget.configure(bg=COLORS["surface"])

    def _choose_file_from_drop_area(self, _event=None) -> None:
        if not self.loading and not self.exporting:
            self.choose_file()

    def choose_file(self) -> None:
        selected = filedialog.askopenfilename(
            title="Selecciona un vídeo o audio",
            filetypes=MEDIA_FILETYPES,
        )
        if selected:
            self.load_media(Path(selected))

    def _handle_drop(self, event) -> str:
        if self.loading or self.exporting:
            return "break"

        try:
            dropped_paths = self.root.tk.splitlist(event.data)
        except tk.TclError:
            dropped_paths = (event.data,)

        if dropped_paths:
            path_text = dropped_paths[0]
            if path_text.startswith("file://"):
                path_text = unquote(path_text[7:])
            self.load_media(Path(path_text))
        return "break"

    def load_media(self, path: Path) -> None:
        path = path.expanduser()
        if not path.is_file():
            self.status_var.set("No se encontró el archivo seleccionado.")
            return

        self.loading = True
        self.status_var.set("Analizando el archivo…")
        self._update_control_states()
        threading.Thread(target=self._probe_media, args=(path,), daemon=True).start()

    def _probe_media(self, path: Path) -> None:
        ffprobe = shutil.which("ffprobe")
        if not ffprobe:
            self._finish_probe(
                path,
                None,
                "No se encontró FFprobe. Instala FFmpeg y asegúrate de que esté en el PATH.",
            )
            return

        command = [
            ffprobe,
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ]
        try:
            result = subprocess.run(
                command,
                capture_output=True,
                text=True,
                errors="replace",
                check=False,
            )
        except OSError as error:
            self._finish_probe(path, None, f"No se pudo analizar el archivo: {error}")
            return

        if result.returncode != 0:
            detail = result.stderr.strip().splitlines()
            error_text = detail[-1] if detail else "Formato no compatible."
            self._finish_probe(path, None, f"No se pudo abrir el archivo: {error_text}")
            return

        try:
            duration = float(result.stdout.strip())
        except ValueError:
            self._finish_probe(path, None, "El archivo no tiene una duración válida.")
            return

        if not math.isfinite(duration) or duration <= 0:
            self._finish_probe(path, None, "El archivo está vacío o no tiene una duración válida.")
            return

        self._finish_probe(path, duration, None)

    def _finish_probe(
        self, path: Path, duration: float | None, error: str | None
    ) -> None:
        self.root.after(0, lambda: self._apply_probe_result(path, duration, error))

    def _apply_probe_result(
        self, path: Path, duration: float | None, error: str | None
    ) -> None:
        self.loading = False
        if error:
            self.status_var.set(error)
            self._update_control_states()
            return

        self.media_path = path
        self.duration = duration or 0.0
        self.start_value.set(0.0)
        self.end_value.set(self.duration)
        self.start_scale.configure(to=self.duration, state="normal")
        self.end_scale.configure(to=self.duration, state="normal")
        file_type = path.suffix.upper().lstrip(".") or "MEDIA"
        self.file_chip.configure(text=file_type[:7])
        self.file_var.set(path.name)
        self.details_var.set(format_time(self.duration))
        self.status_var.set("Listo para cortar")
        self._refresh_selection_labels()
        self._update_control_states()

    def _selection_changed(self, changed: str) -> None:
        if not self.duration:
            return

        start = max(0.0, min(self.duration, float(self.start_value.get())))
        end = max(0.0, min(self.duration, float(self.end_value.get())))
        minimum_gap = min(MIN_CLIP_SECONDS, self.duration / 100)

        if changed == "start" and start >= end:
            start = max(0.0, end - minimum_gap)
            self.start_value.set(start)
        elif changed == "end" and end <= start:
            end = min(self.duration, start + minimum_gap)
            self.end_value.set(end)

        self._refresh_selection_labels()

    def _refresh_selection_labels(self) -> None:
        start = max(0.0, float(self.start_value.get()))
        end = max(0.0, float(self.end_value.get()))
        self.start_time_var.set(format_time(start))
        self.end_time_var.set(format_time(end))
        self.selection_var.set(format_time(max(0.0, end - start)))

    def _update_control_states(self) -> None:
        busy = self.loading or self.exporting
        file_state = "disabled" if busy else "normal"
        self.open_button.configure(state=file_state)

        has_media = self.media_path is not None and self.duration > 0
        action_state = "normal" if has_media and not busy else "disabled"
        self.audio_button.configure(state=action_state)
        self.video_button.configure(state=action_state)

        scale_state = "disabled" if busy or not has_media else "normal"
        self.start_scale.configure(state=scale_state)
        self.end_scale.configure(state=scale_state)

    def export_clip(self, media_type: str) -> None:
        if not self.media_path or not self.duration:
            return

        start = float(self.start_value.get())
        end = float(self.end_value.get())
        if end <= start:
            messagebox.showwarning(
                WINDOW_TITLE,
                "El fin del corte debe ser posterior al inicio.",
                parent=self.root,
            )
            return

        extension = ".mp3" if media_type == "audio" else ".mp4"
        suffix = "audio" if media_type == "audio" else "video"
        initial_name = (
            f"{self.media_path.stem}_corte_{compact_time(start)}_"
            f"{compact_time(end)}_{suffix}{extension}"
        )
        output_name = filedialog.asksaveasfilename(
            title="Guardar fragmento",
            initialdir=str(self.media_path.parent),
            initialfile=initial_name,
            defaultextension=extension,
            filetypes=[
                ("Audio MP3", "*.mp3") if media_type == "audio" else ("Vídeo MP4", "*.mp4"),
                ("Todos los archivos", "*.*"),
            ],
        )
        if not output_name:
            return

        output_path = Path(output_name).expanduser()
        if output_path.suffix.lower() != extension:
            output_path = output_path.with_suffix(extension)

        try:
            same_file = output_path.resolve() == self.media_path.resolve()
        except OSError:
            same_file = output_path == self.media_path
        if same_file:
            messagebox.showwarning(
                WINDOW_TITLE,
                "El archivo de salida debe tener un nombre diferente al original.",
                parent=self.root,
            )
            return

        if output_path.exists() and not messagebox.askyesno(
            WINDOW_TITLE,
            f"El archivo ya existe:\n{output_path.name}\n\n¿Quieres reemplazarlo?",
            parent=self.root,
        ):
            return

        self.loading = False
        self.exporting = True
        self.status_var.set("Exportando el fragmento…")
        self._update_control_states()
        threading.Thread(
            target=self._run_export,
            args=(media_type, start, end, output_path),
            daemon=True,
        ).start()

    def _run_export(
        self, media_type: str, start: float, end: float, output_path: Path
    ) -> None:
        ffmpeg = shutil.which("ffmpeg")
        if not ffmpeg:
            self._finish_export(
                output_path,
                False,
                "No se encontró FFmpeg. Instala FFmpeg y asegúrate de que esté en el PATH.",
            )
            return

        temporary_path: Path | None = None
        try:
            temporary_path = self._temporary_output_path(output_path)
            command = [
                ffmpeg,
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-ss",
                f"{start:.3f}",
                "-i",
                str(self.media_path),
                "-t",
                f"{end - start:.3f}",
            ]
            if media_type == "audio":
                command.extend(["-map", "0:a:0", "-vn", "-c:a", "libmp3lame", "-q:a", "2"])
            else:
                command.extend(
                    [
                        "-map",
                        "0:v:0?",
                        "-map",
                        "0:a:0?",
                        "-c:v",
                        "libx264",
                        "-preset",
                        "medium",
                        "-c:a",
                        "aac",
                        "-movflags",
                        "+faststart",
                    ]
                )
            command.append(str(temporary_path))

            result = subprocess.run(
                command,
                capture_output=True,
                text=True,
                errors="replace",
                check=False,
            )
            if result.returncode != 0:
                detail = result.stderr.strip().splitlines()
                error_text = detail[-1] if detail else "FFmpeg no pudo generar el archivo."
                self._finish_export(output_path, False, error_text)
                return

            if not temporary_path.exists() or temporary_path.stat().st_size == 0:
                self._finish_export(output_path, False, "FFmpeg no generó un archivo válido.")
                return

            temporary_path.replace(output_path)
            temporary_path = None
            self._finish_export(output_path, True, None)
        except OSError as error:
            self._finish_export(output_path, False, f"No se pudo guardar el archivo: {error}")
        finally:
            if temporary_path and temporary_path.exists():
                try:
                    temporary_path.unlink()
                except OSError:
                    pass

    @staticmethod
    def _temporary_output_path(output_path: Path) -> Path:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        descriptor, temporary_name = tempfile.mkstemp(
            prefix=".cortador_", suffix=output_path.suffix, dir=output_path.parent
        )
        os.close(descriptor)
        temporary_path = Path(temporary_name)
        temporary_path.unlink()
        return temporary_path

    def _finish_export(
        self, output_path: Path, success: bool, error: str | None
    ) -> None:
        self.root.after(0, lambda: self._apply_export_result(output_path, success, error))

    def _apply_export_result(
        self, output_path: Path, success: bool, error: str | None
    ) -> None:
        self.exporting = False
        if success:
            self.status_var.set("Guardado")
            messagebox.showinfo(
                WINDOW_TITLE,
                f"El fragmento se ha guardado correctamente en:\n\n{output_path}",
                parent=self.root,
            )
        else:
            self.status_var.set("Error al exportar")
            messagebox.showerror(
                WINDOW_TITLE,
                f"No se pudo exportar el fragmento.\n\n{error}",
                parent=self.root,
            )
        self._update_control_states()


def main() -> None:
    if DRAG_AND_DROP_AVAILABLE:
        root = TkinterDnD.Tk()
    else:
        root = tk.Tk()

    AudioCutterApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
