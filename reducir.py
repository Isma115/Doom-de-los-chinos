import os
import datetime

scale_factor = 0.1

obj_in = "assets/3D/10446_Palm_Tree_v1_max2010_iteration-2.obj"
mtl_in = "assets/3D/10446_Palm_Tree_v1_max2010_iteration-2.mtl"

# ---- CREAR CARPETA DE COPIAS ----
backup_dir = "copias_seguridad"
os.makedirs(backup_dir, exist_ok=True)

timestamp = datetime.datetime.now().strftime("%Y-%m-%d_%H-%M-%S")

# ---- GENERAR RUTAS PARA COPIAS ----
obj_name = os.path.basename(obj_in).replace(".obj", "")
obj_backup = f"{backup_dir}/{obj_name}_{timestamp}.obj"

mtl_backup = None
if os.path.exists(mtl_in):
    mtl_name = os.path.basename(mtl_in).replace(".mtl", "")
    mtl_backup = f"{backup_dir}/{mtl_name}_{timestamp}.mtl"

# ---- COPIA DE OBJ ----
with open(obj_in, "r") as f:
    obj_original_data = f.read()

with open(obj_backup, "w") as f:
    f.write(obj_original_data)

print("Copia OBJ guardada en:", obj_backup)

# ---- COPIA DE MTL ----
if mtl_backup:
    with open(mtl_in, "r") as f:
        mtl_original_data = f.read()
    with open(mtl_backup, "w") as f:
        f.write(mtl_original_data)
    print("Copia MTL guardada en:", mtl_backup)


# ==== ESCALAR OBJ ====

with open(obj_in, "r") as f:
    obj_lines = f.readlines()

obj_out_lines = []

for line in obj_lines:
    if line.startswith("v "):
        _, x, y, z = line.split()
        x, y, z = float(x)*scale_factor, float(y)*scale_factor, float(z)*scale_factor
        obj_out_lines.append(f"v {x} {y} {z}\n")

    elif line.startswith("vn "):
        obj_out_lines.append(line)

    elif line.startswith("vt "):
        obj_out_lines.append(line)

    else:
        obj_out_lines.append(line)

with open(obj_in, "w") as f:
    f.writelines(obj_out_lines)

print("OBJ escalado guardado en:", obj_in)


# ==== ESCALAR MTL ====

if os.path.exists(mtl_in):
    with open(mtl_in, "r") as f:
        mtl_lines = f.readlines()

    mtl_out_lines = []

    for line in mtl_lines:

        if line.startswith("bump") or line.startswith("map_Bump"):
            parts = line.split()
            if "-bm" in parts:
                idx = parts.index("-bm") + 1
                try:
                    parts[idx] = str(float(parts[idx]) * scale_factor)
                except:
                    pass
            mtl_out_lines.append(" ".join(parts) + "\n")

        elif line.startswith("norm") and "-bm" in line:
            parts = line.split()
            idx = parts.index("-bm") + 1
            try:
                parts[idx] = str(float(parts[idx]) * scale_factor)
            except:
                pass
            mtl_out_lines.append(" ".join(parts) + "\n")

        else:
            mtl_out_lines.append(line)

    with open(mtl_in, "w") as f:
        f.writelines(mtl_out_lines)

    print("MTL actualizado:", mtl_in)
