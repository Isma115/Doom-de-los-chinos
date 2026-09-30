# Genera un coche low-poly para el mapa de El Hormiguero.
# Salida: assets/3D/coches/coche_lowpoly.obj y .mtl
# Ejes: +X derecha, +Y arriba, +Z morro.
import math, os
OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "3D", "coches")
V, N, G = [], [], {}
def norm(v):
    l = math.sqrt(sum(c * c for c in v)) or 1.0
    return [c / l for c in v]

def fnormal(p):
    n = [0.0, 0.0, 0.0]
    for i, a in enumerate(p):
        b = p[(i + 1) % len(p)]
        n[0] += (a[1] - b[1]) * (a[2] + b[2])
        n[1] += (a[2] - b[2]) * (a[0] + b[0])
        n[2] += (a[0] - b[0]) * (a[1] + b[1])
    return norm(n)

def face(mat, pts, hint=None):
    pts = [list(p) for p in pts]
    n = fnormal(pts)
    if hint:
        h = norm(hint)
        if sum(n[i] * h[i] for i in range(3)) < 0:
            pts.reverse()
            n = [-c for c in n]
    G.setdefault(mat, []).append(([len(V) + i + 1 for i in range(len(pts))], len(N) + 1))
    V.extend(pts)
    N.append(n)

def box(m, a, b):
    x0, y0, z0 = a
    x1, y1, z1 = b
    p = [
        [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
        [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]
    ]
    sides = [
        ([0, 1, 2, 3], (0, 0, -1)), ([4, 7, 6, 5], (0, 0, 1)),
        ([0, 3, 7, 4], (-1, 0, 0)), ([1, 5, 6, 2], (1, 0, 0)),
        ([0, 4, 5, 1], (0, -1, 0)), ([3, 2, 6, 7], (0, 1, 0))
    ]
    for ids, hint in sides:
        face(m, [p[i] for i in ids], hint)

def frustum(m, y0, y1, xb, xt, z0b, z1b, z0t, z1t):
    p = [
        [-xb, y0, z1b], [xb, y0, z1b], [-xb, y0, z0b], [xb, y0, z0b],
        [-xt, y1, z1t], [xt, y1, z1t], [-xt, y1, z0t], [xt, y1, z0t]
    ]
    sides = [
        ([0, 2, 3, 1], (0, -1, 0)), ([4, 5, 7, 6], (0, 1, 0)),
        ([0, 1, 5, 4], (0, 0, 1)), ([2, 6, 7, 3], (0, 0, -1)),
        ([0, 4, 6, 2], (-1, 0, 0)), ([1, 3, 7, 5], (1, 0, 0))
    ]
    for ids, hint in sides:
        face(m, [p[i] for i in ids], hint)

def panel(m, c, hint, ins=0.76, off=0.022):
    ctr = [sum(p[i] for p in c) / len(c) for i in range(3)]
    h = norm(hint)
    pts = [[ctr[i] + (p[i] - ctr[i]) * ins + h[i] * off for i in range(3)] for p in c]
    face(m, pts, h)

def wheel(cx, cy, cz, r, w, n=10):
    hw = w / 2.0
    rr = r * 0.58
    a = [i * 2.0 * math.pi / n for i in range(n)]
    ol = [[cx - hw, cy + r * math.cos(t), cz + r * math.sin(t)] for t in a]
    orr = [[cx + hw, cy + r * math.cos(t), cz + r * math.sin(t)] for t in a]
    rl = [[cx - hw, cy + rr * math.cos(t), cz + rr * math.sin(t)] for t in a]
    rrr = [[cx + hw, cy + rr * math.cos(t), cz + rr * math.sin(t)] for t in a]
    for i in range(n):
        j = (i + 1) % n
        t = (a[i] + a[j]) / 2.0
        face("car_tire", [ol[i], ol[j], orr[j], orr[i]], (0, math.cos(t), math.sin(t)))
        face("car_tire", [ol[i], ol[j], rl[j], rl[i]], (-1, 0, 0))
        face("car_tire", [orr[i], orr[j], rrr[j], rrr[i]], (1, 0, 0))
        face("car_rim", [[cx - hw, cy, cz], rl[i], rl[j]], (-1, 0, 0))
        face("car_rim", [[cx + hw, cy, cz], rrr[j], rrr[i]], (1, 0, 0))

# Carroceria y cabina
frustum("car_body", 0.42, 1.10, 0.84, 0.92, -2.06, 2.06, -1.98, 1.98)
y0, y1 = 1.08, 1.78
hb, ht = 0.82, 0.60
fb, rb, ft, rt = 1.02, -1.02, 0.62, -0.58
frustum("car_body", y0, y1, hb, ht, rb, fb, rt, ft)

# Cristales (paneles ligeramente separados de la carroceria)
panel("car_glass", [[hb, y0, fb], [hb, y0, rb], [ht, y1, rt], [ht, y1, ft]], (1, 0, 0), 0.78, 0.024)
panel("car_glass", [[-hb, y0, fb], [-hb, y0, rb], [-ht, y1, rt], [-ht, y1, ft]], (-1, 0, 0), 0.78, 0.024)
panel("car_glass", [[-hb, y0, fb], [hb, y0, fb], [ht, y1, ft], [-ht, y1, ft]], (0, 0, 1), 0.72, 0.026)
panel("car_glass", [[-hb, y0, rb], [hb, y0, rb], [ht, y1, rt], [-ht, y1, rt]], (0, 0, -1), 0.74, 0.026)

# Paragolpes, parrilla, faros, pilotos, matriculas y espejos
box("car_trim", (-0.96, 0.40, 1.96), (0.96, 0.68, 2.18))
box("car_trim", (-0.96, 0.40, -2.18), (0.96, 0.68, -1.96))
box("car_trim", (-0.50, 0.70, 2.00), (0.50, 0.94, 2.08))
box("car_headlight", (0.50, 0.74, 2.00), (0.84, 0.98, 2.10))
box("car_headlight", (-0.84, 0.74, 2.00), (-0.50, 0.98, 2.10))
box("car_taillight", (0.48, 0.72, -2.10), (0.86, 1.02, -2.00))
box("car_taillight", (-0.86, 0.72, -2.10), (-0.48, 1.02, -2.00))
box("car_plate", (-0.30, 0.46, 2.18), (0.30, 0.62, 2.22))
box("car_plate", (-0.30, 0.46, -2.22), (0.30, 0.62, -2.18))
box("car_trim", (0.74, 1.17, 0.66), (0.95, 1.29, 0.82))
box("car_trim", (-0.95, 1.17, 0.66), (-0.74, 1.29, 0.82))

# Cuatro ruedas
for wx in (-0.82, 0.82):
    for wz in (1.32, -1.32):
        wheel(wx, 0.44, wz, 0.44, 0.32)

MATS = [
    ("car_body", ".78 .14 .08", ".32 .32 .32", 48, ".03 0 0"),
    ("car_glass", ".045 .09 .15", ".55 .62 .70", 90, "0 0 0"),
    ("car_tire", ".035 .035 .04", ".04 .04 .04", 10, "0 0 0"),
    ("car_rim", ".58 .61 .66", ".75 .78 .82", 80, "0 0 0"),
    ("car_trim", ".15 .16 .18", ".28 .28 .30", 34, "0 0 0"),
    ("car_headlight", ".98 .87 .52", ".72 .68 .50", 64, ".30 .24 .08"),
    ("car_taillight", ".82 .06 .05", ".62 .18 .16", 58, ".20 .01 0"),
    ("car_plate", ".86 .86 .80", ".30 .30 .28", 40, "0 0 0")
]
def num(x):
    s = ("%.5f" % x).rstrip("0").rstrip(".")
    return s if s not in ("", "-0") else "0"

L = ["mtllib coche_lowpoly.mtl", "o coche_lowpoly"]
L += ["v " + " ".join(num(c) for c in p) for p in V]
L += ["vn " + " ".join(num(c) for c in n) for n in N]
for name, faces in G.items():
    L.append("usemtl " + name)
    for ids, ni in faces:
        L.append("f " + " ".join(("%d//%d" % (vi, ni)) for vi in ids))

M = ["# Materiales del coche low-poly"]
for name, kd, ks, ns, ke in MATS:
    M += ["", "newmtl " + name, "Kd " + kd, "Ks " + ks, "Ns " + str(ns), "d 1.0", "illum 2"]
    if ke != "0 0 0":
        M.append("Ke " + ke)
os.makedirs(OUT, exist_ok=True)
open(os.path.join(OUT, "coche_lowpoly.obj"), "w").write("\n".join(L) + "\n")
open(os.path.join(OUT, "coche_lowpoly.mtl"), "w").write("\n".join(M) + "\n")
print("Coche low-poly generado:", len(V), "vertices,", len(N), "caras")
