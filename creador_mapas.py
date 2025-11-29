# sección [CREADOR DE MAPAS] Creador de mapas para el juego
import tkinter as tk
from tkinter import filedialog, messagebox
import json

class MapEditor:
    def __init__(self, root):
        self.root = root
        self.root.title("Doom Map Editor")
        self.root.geometry("1200x800")
        
        # Configuración del grid
        self.grid_width = 40
        self.grid_height = 30
        self.cell_size = 20
        
        # Tipo de bloque seleccionado
        self.selected_block = "."
        
        # Historial para hacer/deshacer
        self.history = []
        self.history_index = -1
        self.max_history_size = 50
        
        # Definición de tipos de bloques con sus colores
        self.block_types = {
            "#": {"name": "Muro", "color": "#888888"},
            "D": {"name": "Puerta", "color": "#00FFFF"},
            "+": {"name": "Comida", "color": "#FF0000"},
            ".": {"name": "Suelo", "color": "#44AA44"},
            "P": {"name": "Jugador", "color": "#0000FF"},
            "1": {"name": "Enemigo Pablo", "color": "#FF00FF"},
            "2": {"name": "Enemigo Pera", "color": "#FF8800"},
            "3": {"name": "Enemigo Slow", "color": "#8800FF"},
            "4": {"name": "Enemigo Medium", "color": "#FF0088"},
            "5": {"name": "Enemigo Medium 2", "color": "#00FF88"},
            "6": {"name": "Enemigo Shooter", "color": "#880088"},
            "MP": {"name": "Munición Pistola", "color": "#FFFF00"},
            "MA": {"name": "Munición Ametralladora", "color": "#FF8800"},
            "T": {"name": "Árbol 3D", "color": "#228822"},
            "B": {"name": "Arbusto", "color": "#336633"},
            "L": {"name": "Ladrillo", "color": "#AA4444"},
            " ": {"name": "Vacío", "color": "#222222"}
        }
        # Inicializar grid del mapa
        self.map_grid = [["." for _ in range(self.grid_width)] for _ in range(self.grid_height)]
        
        # Crear interfaz
        self.create_ui()
        
    def create_ui(self):
        # Frame principal
        main_frame = tk.Frame(self.root)
        main_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        
        # Frame izquierdo para la leyenda
        legend_frame = tk.Frame(main_frame, width=200, bg="#333333")
        legend_frame.pack(side=tk.LEFT, fill=tk.Y, padx=(0, 10))
        
        # Título de la leyenda
        title_label = tk.Label(legend_frame, text="BLOQUES", font=("Arial", 14, "bold"), bg="#333333", fg="white")
        title_label.pack(pady=10)
        
        # Crear botones de la leyenda
        self.create_legend(legend_frame)
        
        # Frame derecho para el canvas y controles
        right_frame = tk.Frame(main_frame)
        right_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        
        # Frame de controles superiores
        controls_frame = tk.Frame(right_frame)
        controls_frame.pack(side=tk.TOP, fill=tk.X, pady=(0, 10))
        
         # Botones de control
        btn_frame = tk.Frame(controls_frame)
        btn_frame.pack(side=tk.LEFT)
        
        btn_undo = tk.Button(btn_frame, text="↶ Deshacer", command=self.undo, bg="#FF9800", fg="black", font=("Arial", 9, "bold"), padx=10, pady=3)
        btn_undo.pack(side=tk.LEFT, padx=2)
        
        btn_redo = tk.Button(btn_frame, text="↷ Rehacer", command=self.redo, bg="#FF9800", fg="black", font=("Arial", 9, "bold"), padx=10, pady=3)
        btn_redo.pack(side=tk.LEFT, padx=2)
        
        btn_save = tk.Button(btn_frame, text="Guardar Mapa", command=self.save_map, bg="#4CAF50", fg="black", font=("Arial", 9, "bold"), padx=10, pady=3)
        btn_save.pack(side=tk.LEFT, padx=2)
        
        btn_load = tk.Button(btn_frame, text="Cargar Mapa", command=self.load_map, bg="#2196F3", fg="black", font=("Arial", 9, "bold"), padx=10, pady=3)
        btn_load.pack(side=tk.LEFT, padx=2)
        
        btn_clear = tk.Button(btn_frame, text="Limpiar", command=self.clear_map, bg="#F44336", fg="black", font=("Arial", 9, "bold"), padx=10, pady=3)
        btn_clear.pack(side=tk.LEFT, padx=2)
        
        # Frame para controles de tamaño
        size_frame = tk.Frame(controls_frame)
        size_frame.pack(side=tk.LEFT, padx=20)
        
        # Controles para cambiar tamaño del mapa
        size_label = tk.Label(size_frame, text="Tamaño Mapa:", font=("Arial", 9, "bold"))
        size_label.pack(side=tk.LEFT, padx=(0, 5))
        
        width_label = tk.Label(size_frame, text="Ancho:", font=("Arial", 8))
        width_label.pack(side=tk.LEFT, padx=(0, 2))
        
        self.width_var = tk.StringVar(value=str(self.grid_width))
        width_entry = tk.Entry(size_frame, textvariable=self.width_var, width=4, font=("Arial", 8))
        width_entry.pack(side=tk.LEFT, padx=(0, 5))
        
        height_label = tk.Label(size_frame, text="Alto:", font=("Arial", 8))
        height_label.pack(side=tk.LEFT, padx=(0, 2))
        
        self.height_var = tk.StringVar(value=str(self.grid_height))
        height_entry = tk.Entry(size_frame, textvariable=self.height_var, width=4, font=("Arial", 8))
        height_entry.pack(side=tk.LEFT, padx=(0, 5))
        
        btn_resize = tk.Button(size_frame, text="Redimensionar", command=self.resize_map, bg="#9C27B0", fg="black", font=("Arial", 8, "bold"), padx=8, pady=2)
        btn_resize.pack(side=tk.LEFT, padx=2)
        
        # Label para mostrar bloque seleccionado
        self.selected_label = tk.Label(controls_frame, text=f"Seleccionado: {self.block_types[self.selected_block]['name']}", font=("Arial", 10), bg="white", padx=10)
        self.selected_label.pack(side=tk.LEFT, padx=20)
        
        # Frame para el canvas con scrollbars
        canvas_frame = tk.Frame(right_frame)
        canvas_frame.pack(side=tk.TOP, fill=tk.BOTH, expand=True)
        
        # Crear scrollbars
        v_scrollbar = tk.Scrollbar(canvas_frame, orient=tk.VERTICAL)
        v_scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        
        h_scrollbar = tk.Scrollbar(canvas_frame, orient=tk.HORIZONTAL)
        h_scrollbar.pack(side=tk.BOTTOM, fill=tk.X)
        
        # Crear canvas
        self.canvas = tk.Canvas(
            canvas_frame,
            width=self.grid_width * self.cell_size,
            height=self.grid_height * self.cell_size,
            bg="white",
            yscrollcommand=v_scrollbar.set,
            xscrollcommand=h_scrollbar.set,
            scrollregion=(0, 0, self.grid_width * self.cell_size, self.grid_height * self.cell_size)
        )
        self.canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        
        v_scrollbar.config(command=self.canvas.yview)
        h_scrollbar.config(command=self.canvas.xview)
        
        # Dibujar grid inicial
        self.draw_grid()
        
        # Bind eventos del mouse
        self.canvas.bind("<Button-1>", self.paint_block)
        self.canvas.bind("<B1-Motion>", self.paint_block)
        # Importante: Detener el trazo al soltar el mouse para que el historial funcione
        self.canvas.bind("<ButtonRelease-1>", self.stop_painting)
        
        # Bind eventos de teclado para hacer/deshacer
        self.root.bind("<Control-z>", lambda e: self.undo())
        self.root.bind("<Control-Z>", lambda e: self.undo())
        self.root.bind("<Control-y>", lambda e: self.redo())
        self.root.bind("<Control-Y>", lambda e: self.redo())
        # Nuevos atajos solicitados
        self.root.bind("<Control-x>", lambda e: self.redo())
        self.root.bind("<Control-X>", lambda e: self.redo())
        
    def create_legend(self, parent):
        # Frame para el buscador
        search_frame = tk.Frame(parent, bg="#333333")
        search_frame.pack(fill=tk.X, padx=5, pady=(0, 10))
        
        # Label del buscador
        search_label = tk.Label(
            search_frame,
            text="Buscar bloque:",
            bg="#333333",
            fg="white",
            font=("Arial", 9),
            anchor="w"
        )
        search_label.pack(side=tk.TOP, fill=tk.X, pady=(0, 5))
        
        # Entry para el buscador
        self.search_var = tk.StringVar()
        search_entry = tk.Entry(
            search_frame,
            textvariable=self.search_var,
            font=("Arial", 9),
            bg="white",
            fg="black"
        )
        search_entry.pack(side=tk.TOP, fill=tk.X)
        
        # Frame contenedor para los botones de leyenda (con scrollbar)
        legend_container = tk.Frame(parent, bg="#333333")
        legend_container.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        # Canvas y scrollbar para los botones de leyenda
        legend_canvas = tk.Canvas(
            legend_container,
            bg="#333333",
            highlightthickness=0
        )
        
        scrollbar = tk.Scrollbar(
            legend_container,
            orient=tk.VERTICAL,
            command=legend_canvas.yview
        )
        
        self.legend_scrollable_frame = tk.Frame(
            legend_canvas,
            bg="#333333"
        )
        
        self.legend_scrollable_frame.bind(
            "<Configure>",
            lambda e: legend_canvas.configure(scrollregion=legend_canvas.bbox("all"))
        )
        
        legend_canvas.create_window((0, 0), window=self.legend_scrollable_frame, anchor="nw")
        legend_canvas.configure(yscrollcommand=scrollbar.set)
        
        legend_canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        
        # Crear botones de leyenda inicialmente
        self.create_legend_buttons()
        
        # Configurar el evento de búsqueda
        self.search_var.trace("w", self.filter_legend_buttons)
    
    def create_legend_buttons(self):
        # Limpiar frame existente
        for widget in self.legend_scrollable_frame.winfo_children():
            widget.destroy()
        
        # Diccionario para mantener referencia a los botones
        self.legend_buttons = {}
        
        # Crear botones para cada tipo de bloque
        for block_type, info in self.block_types.items():
            btn_frame = tk.Frame(self.legend_scrollable_frame, bg="#333333")
            btn_frame.pack(fill=tk.X, padx=5, pady=3)
            
            # Botón con el color del bloque - mejorado para mejor contraste
            btn = tk.Button(
                btn_frame,
                text=f"{block_type}",
                bg="white",
                fg="black",
                width=3,
                height=1,
                font=("Arial", 10, "bold"),
                relief="raised",
                bd=2,
                command=lambda bt=block_type: self.select_block(bt)
            )
            btn.pack(side=tk.LEFT, padx=5)
            
            # Label con el nombre del bloque
            label = tk.Label(
                btn_frame,
                text=info["name"],
                bg="#333333",
                fg="white",
                font=("Arial", 9),
                anchor="w"
            )
            label.pack(side=tk.LEFT, fill=tk.X, expand=True)
            
            # Guardar referencia al frame del botón para filtrado
            self.legend_buttons[block_type] = btn_frame
    
    def filter_legend_buttons(self, *args):
        search_text = self.search_var.get().lower().strip()
        
        if not search_text:
            # Mostrar todos los botones si no hay texto de búsqueda
            for block_type, btn_frame in self.legend_buttons.items():
                btn_frame.pack(fill=tk.X, padx=5, pady=3)
        else:
            # Filtrar botones según el texto de búsqueda
            for block_type, info in self.block_types.items():
                btn_frame = self.legend_buttons[block_type]
                
                # Buscar en el carácter del bloque y en el nombre
                block_char = block_type.lower()
                block_name = info["name"].lower()
                
                if search_text in block_char or search_text in block_name:
                    btn_frame.pack(fill=tk.X, padx=5, pady=3)
                else:
                    btn_frame.pack_forget()
        
        # Actualizar el scrollregion del canvas
        self.legend_scrollable_frame.update_idletasks()
        canvas = self.legend_scrollable_frame.master.master
        if hasattr(canvas, 'configure'):
            canvas.configure(scrollregion=canvas.bbox("all"))

    def select_block(self, block_type):
        self.selected_block = block_type
        self.selected_label.config(text=f"Seleccionado: {self.block_types[block_type]['name']}")
        
    def add_to_history(self):
        """Agrega el estado actual al historial"""
        # Crear una copia profunda del grid actual
        grid_copy = [row[:] for row in self.map_grid]
        
        # Si estamos en medio del historial, eliminar los estados futuros
        if self.history_index < len(self.history) - 1:
            self.history = self.history[:self.history_index + 1]
        
        # Agregar nuevo estado al historial
        self.history.append(grid_copy)
        self.history_index += 1
        
        # Limitar el tamaño del historial
        if len(self.history) > self.max_history_size:
            self.history.pop(0)
            self.history_index -= 1
    
    def undo(self):
        """Deshace la última acción"""
        if self.history_index > 0:
            self.history_index -= 1
            self.map_grid = [row[:] for row in self.history[self.history_index]]
            self.draw_grid()
    
    def redo(self):
        """Rehace la acción deshecha"""
        if self.history_index < len(self.history) - 1:
            self.history_index += 1
            self.map_grid = [row[:] for row in self.history[self.history_index]]
            self.draw_grid()
    
def draw_grid(self):
    self.canvas.delete("all")
    for y in range(self.grid_height):
        for x in range(self.grid_width):
            x1 = x * self.cell_size
            y1 = y * self.cell_size
            x2 = x1 + self.cell_size
            y2 = y1 + self.cell_size
            
            cell_data = self.map_grid[y][x]
            
            if hasattr(cell_data, '__iter__') and not isinstance(cell_data, str):
                block_type = cell_data[0] if len(cell_data) > 0 else "."
                rotation = cell_data[1] if len(cell_data) > 1 else 0
            else:
                block_type = cell_data
                rotation = 0
            
            color = self.block_types.get(block_type, self.block_types["."])["color"]
            
            self.canvas.create_rectangle(
                x1, y1, x2, y2,
                fill=color,
                outline="#CCCCCC",
                tags=f"cell_{x}_{y}"
            )
            
            if block_type != ".":
                display_text = block_type
                if rotation != 0:
                    display_text += f"[{rotation}°]"
                
                self.canvas.create_text(
                    x1 + self.cell_size // 2,
                    y1 + self.cell_size // 2,
                    text=display_text,
                    font=("Arial", 6 if rotation != 0 else 8, "bold"),
                    fill="white" if block_type == "#" else "black"
                )
    
    self.canvas.config(scrollregion=(0, 0, self.grid_width * self.cell_size, self.grid_height * self.cell_size))
    
    def stop_painting(self, event):
        """Reinicia la bandera de pintado al soltar el mouse"""
        if hasattr(self, '_painting'):
            del self._painting

def paint_block(self, event):
    canvas_x = self.canvas.canvasx(event.x)
    canvas_y = self.canvas.canvasy(event.y)
    
    grid_x = int(canvas_x // self.cell_size)
    grid_y = int(canvas_y // self.cell_size)
    
    if 0 <= grid_x < self.grid_width and 0 <= grid_y < self.grid_height:
        current_cell = self.map_grid[grid_y][grid_x]
        
        if hasattr(current_cell, '__iter__') and not isinstance(current_cell, str):
            current_block = current_cell[0] if len(current_cell) > 0 else "."
        else:
            current_block = current_cell
        
        if current_block != self.selected_block:
            if not hasattr(self, '_painting'):
                self._painting = True
                self.add_to_history()
            
            self.map_grid[grid_y][grid_x] = [self.selected_block, 0]
            
            x1 = grid_x * self.cell_size
            y1 = grid_y * self.cell_size
            x2 = x1 + self.cell_size
            y2 = y1 + self.cell_size
            
            color = self.block_types[self.selected_block]["color"]
            
            self.canvas.delete(f"cell_{grid_x}_{grid_y}")
            
            self.canvas.create_rectangle(
                x1, y1, x2, y2,
                fill=color,
                outline="#CCCCCC",
                tags=f"cell_{grid_x}_{grid_y}"
            )
            
            if self.selected_block != ".":
                self.canvas.create_text(
                    x1 + self.cell_size // 2,
                    y1 + self.cell_size // 2,
                    text=self.selected_block,
                    font=("Arial", 8, "bold"),
                    fill="white" if self.selected_block == "#" else "black",
                    tags=f"cell_{grid_x}_{grid_y}"
                )
    
def save_map(self):
    filename = filedialog.asksaveasfilename(
        defaultextension=".txt",
        filetypes=[("Text files", "*.txt"), ("All files", "*.*")],
        initialdir="./mapas"
    )
    
    if filename:
        try:
            with open(filename, 'w', encoding='utf-8') as f:
                for row in self.map_grid:
                    line = ""
                    for cell in row:
                        if hasattr(cell, '__iter__') and not isinstance(cell, str):
                            block_type = cell[0] if len(cell) > 0 else "."
                            rotation = cell[1] if len(cell) > 1 else 0
                            if rotation != 0:
                                line += f"({block_type}[{rotation}])"
                            else:
                                line += f"({block_type})"
                        else:
                            line += f"({cell})"
                    f.write(line + "\n")
            messagebox.showinfo("Éxito", f"Mapa guardado correctamente en:\n{filename}")
        except Exception as e:
            messagebox.showerror("Error", f"Error al guardar el mapa:\n{str(e)}")
    
def load_map(self):
    filename = filedialog.askopenfilename(
        filetypes=[("Text files", "*.txt"), ("All files", "*.*")],
        initialdir="./mapas"
    )
    
    if filename:
        try:
            with open(filename, 'r', encoding='utf-8') as f:
                lines = f.readlines()
            
            new_grid = []
            for line in lines:
                line = line.strip()
                row = []
                i = 0
                while i < len(line):
                    if line[i] == '(':
                        end = line.find(')', i)
                        if end != -1:
                            token = line[i+1:end]
                            
                            if '[' in token and ']' in token:
                                bracket_start = token.index('[')
                                bracket_end = token.index(']')
                                base = token[:bracket_start]
                                rotation = token[bracket_start+1:bracket_end]
                                try:
                                    rotation = int(rotation)
                                except ValueError:
                                    rotation = 0
                                row.append([base if base else ".", rotation])
                            else:
                                row.append([token if token else ".", 0])
                            
                            i = end + 1
                        else:
                            i += 1
                    else:
                        i += 1
                
                if row:
                    new_grid.append(row)
            
            if new_grid:
                self.add_to_history()
                
                self.grid_height = len(new_grid)
                self.grid_width = len(new_grid[0]) if new_grid else 0
                
                for row in new_grid:
                    while len(row) < self.grid_width:
                        row.append([".", 0])
                
                self.map_grid = new_grid
                
                self.canvas.config(
                    scrollregion=(0, 0, self.grid_width * self.cell_size, self.grid_height * self.cell_size)
                )
                self.draw_grid()
                
                messagebox.showinfo("Éxito", "Mapa cargado correctamente")
            else:
                messagebox.showwarning("Advertencia", "El archivo está vacío o tiene formato incorrecto")
                
        except Exception as e:
            messagebox.showerror("Error", f"Error al cargar el mapa:\n{str(e)}")
    
    def clear_map(self):
        if messagebox.askyesno("Confirmar", "¿Estás seguro de que quieres limpiar el mapa?"):
            # Agregar estado actual al historial antes de limpiar
            self.add_to_history()
            
            self.map_grid = [["." for _ in range(self.grid_width)] for _ in range(self.grid_height)]
            self.draw_grid()
            messagebox.showinfo("Éxito", "Mapa limpiado correctamente")


    def resize_map(self):
        """Redimensiona el mapa al tamaño especificado"""
        try:
            new_width = int(self.width_var.get())
            new_height = int(self.height_var.get())
            
            # Validar tamaños mínimos y máximos
            if new_width < 10 or new_height < 10:
                messagebox.showerror("Error", "El tamaño mínimo del mapa es 10x10")
                return
                
            if new_width > 200 or new_height > 200:
                messagebox.showerror("Error", "El tamaño máximo del mapa es 200x200")
                return
            
            # Agregar estado actual al historial antes de redimensionar
            self.add_to_history()
            
            # Crear nuevo grid
            new_grid = [["." for _ in range(new_width)] for _ in range(new_height)]
            
            # Copiar datos existentes manteniendo las posiciones válidas
            for y in range(min(self.grid_height, new_height)):
                for x in range(min(self.grid_width, new_width)):
                    new_grid[y][x] = self.map_grid[y][x]
            
            # Actualizar dimensiones
            self.grid_width = new_width
            self.grid_height = new_height
            self.map_grid = new_grid
            
            # Redibujar el grid completo
            self.draw_grid()
            
            messagebox.showinfo("Éxito", f"Mapa redimensionado a {new_width}x{new_height}")
            
        except ValueError:
            messagebox.showerror("Error", "Por favor ingresa valores numéricos válidos para el tamaño")

if __name__ == "__main__":
    root = tk.Tk()
    editor = MapEditor(root)
    root.mainloop()
# [Fin de sección]