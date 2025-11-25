import os
import datetime

# ----- CONFIGURACIÓN -----
obj_in = "assets/3D/10446_Palm_Tree_v1_max2010_iteration-2.obj"
obj_out = "assets/3D/10446_Palm_Tree_v1_max2010_iteration-2.obj"

# eje de salida para cada coordenada de entrada: (nuevo_x, nuevo_y, nuevo_z)
axis_map = ("x", "z", "y")   # aquí cambias como quieras

# ----- COPIA DE SEGURIDAD -----

backup_dir = "copias_seguridad"
os.makedirs(backup_dir, exist_ok=True)

timestamp = datetime.datetime.now().strftime("%Y-%m-%d_%H-%M-%S")

obj_name = os.path.basename(obj_in).replace(".obj", "")
obj_backup = f"{backup_dir}/{obj_name}_{timestamp}.obj"

with open(obj_in, "r") as f:
    original_obj = f.read()

with open(obj_backup, "w") as f:
    f.write(original_obj)

print("Copia de seguridad OBJ creada:", obj_backup)


# ----- FUNCIÓN PARA REORDENAR LOS EJES -----

def reorder(x, y, z, axis_map):
    values = {"x": x, "y": y, "z": z}
    return values[axis_map[0]], values[axis_map[1]], values[axis_map[2]]


# ----- PROCESAR ROTACIÓN -----

nuevo = []

with open(obj_in, "r") as f:
    for linea in f:
        if linea.startswith("v "):
            _, x, y, z = linea.split()
            x, y, z = float(x), float(y), float(z)
            nx, ny, nz = reorder(x, y, z, axis_map)
            nuevo.append(f"v {nx} {ny} {nz}\n")

        elif linea.startswith("vn "):
            _, x, y, z = linea.split()
            x, y, z = float(x), float(y), float(z)
            nx, ny, nz = reorder(x, y, z, axis_map)
            nuevo.append(f"vn {nx} {ny} {nz}\n")

        else:
            nuevo.append(linea)

with open(obj_out, "w") as f:
    f.writelines(nuevo)

print("Rotación aplicada con axis_map =", axis_map)
print("Guardado en:", obj_out)
