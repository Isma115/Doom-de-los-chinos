const { app, BrowserWindow, dialog, ipcMain, screen } = require('electron');
const { spawn } = require('node:child_process');
const { readFile, writeFile } = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const rootDir = path.join(__dirname, '..');
const isEditorMode = process.argv.includes('--editor') || process.env.DOOM3D_EDITOR === '1';
const gameDevUrl = 'http://127.0.0.1:5175/';
const editorDevUrl = 'http://127.0.0.1:5174/';
const viteProcesses = new Map();

function clampPercentage(value) {
    if (value === null || value === undefined || value === '') {
        return null;
    }

    const numericValue = Number(value);
    return Number.isFinite(numericValue)
        ? Math.min(100, Math.max(0, numericValue))
        : null;
}

function getSystemMetrics() {
    const processMetrics = typeof app.getAppMetrics === 'function'
        ? app.getAppMetrics()
        : [];

    const appRamBytes = processMetrics.reduce((total, metric) => {
        const workingSetSize = metric.memory?.workingSetSize ?? 0;
        return total + (Number(workingSetSize) || 0) * 1024;
    }, 0);

    const cpuPercent = processMetrics.reduce((total, metric) => {
        return total + (Number(metric.cpu?.percent) || 0);
    }, 0);

    const gpuProcessMetrics = processMetrics.filter(metric => metric.type === 'GPU');
    const gpuProcessCpuPercent = gpuProcessMetrics
        .reduce((total, metric) => {
            return total + (Number(metric.cpu?.percent) || 0);
        }, 0);

    const totalRamBytes = os.totalmem();
    const systemUsedRamBytes = Math.max(0, totalRamBytes - os.freemem());

    return {
        source: 'electron-app-metrics',
        sampledAt: Date.now(),
        cpuPercent: clampPercentage(cpuPercent),
        // Electron exposes the GPU process CPU load, not the whole hardware
        // engine utilization. Keeping the source explicit avoids presenting
        // this value as a system-wide GPU benchmark.
        gpuPercent: gpuProcessMetrics.length > 0
            ? clampPercentage(gpuProcessCpuPercent)
            : null,
        ramUsedMb: appRamBytes / (1024 * 1024),
        ramPercent: totalRamBytes > 0 ? (appRamBytes / totalRamBytes) * 100 : null,
        systemRamUsedPercent: totalRamBytes > 0
            ? (systemUsedRamBytes / totalRamBytes) * 100
            : null,
        processCount: processMetrics.length
    };
}

ipcMain.handle('system-metrics:get', () => getSystemMetrics());

function safeMapId(value) {
    const id = String(value || '').trim();
    return /^[a-zA-Z0-9_-]+$/.test(id) ? id : null;
}

function bundledMapRoots() {
    const roots = [path.join(rootDir, 'mapas')];
    if (app.isPackaged) {
        roots.unshift(
            path.join(rootDir, 'dist-editor', 'mapas'),
            path.join(process.resourcesPath, 'dist-editor', 'mapas')
        );
    }
    return [...new Set(roots)];
}

ipcMain.handle('editor:read-bundled-map', async (_event, mapId) => {
    const safeId = safeMapId(mapId);
    if (!safeId) return { content: null };

    for (const mapsRoot of bundledMapRoots()) {
        for (const extension of ['.json', '.txt']) {
            const filePath = path.join(mapsRoot, `${safeId}${extension}`);
            try {
                const content = await readFile(filePath, 'utf8');
                return { content, extension, filePath };
            } catch (error) {
                if (error.code !== 'ENOENT') console.warn(`No se pudo leer ${filePath}:`, error.message);
            }
        }
    }

    return { content: null };
});

ipcMain.handle('editor:open-map', async (_event, mode = 'json') => {
    const wantsTxt = mode === 'txt';
    const result = await dialog.showOpenDialog({
        title: wantsTxt ? 'Importar mapa TXT' : 'Cargar mapa JSON',
        properties: ['openFile'],
        filters: wantsTxt
            ? [{ name: 'Mapas TXT', extensions: ['txt'] }, { name: 'Todos los mapas', extensions: ['json', 'txt'] }]
            : [{ name: 'Mapas JSON', extensions: ['json'] }, { name: 'Todos los mapas', extensions: ['json', 'txt'] }],
    });

    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    const filePath = result.filePaths[0];
    return {
        canceled: false,
        content: await readFile(filePath, 'utf8'),
        filePath,
    };
});

ipcMain.handle('editor:save-map', async (_event, payload = {}) => {
    const extension = payload.extension === 'txt' || payload.filename?.toLowerCase?.().endsWith('.txt')
        ? 'txt'
        : 'json';
    const rawFilename = path.basename(String(payload.filename || `mi_mapa.${extension}`));
    const sanitizedFilename = rawFilename
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .replace(/\.{2,}/g, '.') || `mi_mapa.${extension}`;
    const filename = sanitizedFilename.toLowerCase().endsWith(`.${extension}`)
        ? sanitizedFilename
        : `${sanitizedFilename}.${extension}`;
    const content = typeof payload.content === 'string' ? payload.content : '';
    const result = await dialog.showSaveDialog({
        title: extension === 'txt' ? 'Exportar mapa TXT' : 'Guardar mapa JSON',
        defaultPath: path.join(rootDir, 'mapas', filename),
        filters: extension === 'txt'
            ? [{ name: 'Mapa TXT', extensions: ['txt'] }]
            : [{ name: 'Mapa JSON', extensions: ['json'] }],
    });

    if (result.canceled || !result.filePath) return { canceled: true };
    await writeFile(result.filePath, content, 'utf8');
    return { canceled: false, filePath: result.filePath };
});

// Modo Construcción (juego): autoguardado directo sin diálogo.
// Sobrescribe mapas/<id>.txt y modelos/<id>_models.json del proyecto.
ipcMain.handle('build:save-map-files', async (_event, payload = {}) => {
    const { mkdir } = require('node:fs/promises');
    const mapId = safeMapId(payload.mapId);
    if (!mapId) return { ok: false, error: 'mapId inválido' };
    if (typeof payload.txt !== 'string' || typeof payload.modelsJson !== 'string') {
        return { ok: false, error: 'contenido inválido' };
    }
    // Validar que el JSON de modelos parsea antes de sobrescribir.
    try {
        const parsed = JSON.parse(payload.modelsJson);
        if (!Array.isArray(parsed)) throw new Error('modelsJson debe ser un array');
    } catch (err) {
        return { ok: false, error: `modelsJson inválido: ${err.message}` };
    }
    try {
        const mapsDir = path.join(rootDir, 'mapas');
        const modelsDir = path.join(rootDir, 'modelos');
        await mkdir(mapsDir, { recursive: true });
        await mkdir(modelsDir, { recursive: true });
        const txtPath = path.join(mapsDir, `${mapId}.txt`);
        const modelsPath = path.join(modelsDir, `${mapId}_models.json`);
        await writeFile(txtPath, payload.txt, 'utf8');
        await writeFile(modelsPath, payload.modelsJson, 'utf8');
        return { ok: true, txtPath, modelsPath };
    } catch (err) {
        console.error('[build:save-map-files]', err);
        return { ok: false, error: err.message };
    }
});

function waitForServer(url, timeoutMs = 15000) {
    const startedAt = Date.now();

    return new Promise((resolve, reject) => {
        const check = () => {
            const request = http.get(url, (response) => {
                response.resume();
                resolve();
            });

            request.on('error', () => {
                if (Date.now() - startedAt > timeoutMs) {
                    reject(new Error(`Vite no respondió en ${url}`));
                    return;
                }

                setTimeout(check, 250);
            });
        };

        check();
    });
}

function startVite(kind) {
    const config = kind === 'editor'
        ? { script: 'editor:web', port: 5174 }
        : { script: 'dev', port: 5175 };
    const existingProcess = viteProcesses.get(kind);
    if (existingProcess && !existingProcess.killed) {
        return;
    }

    const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

    const viteProcess = spawn(
        npmCommand,
        ['run', config.script, '--', '--host', '127.0.0.1', '--port', String(config.port), '--strictPort'],
        {
            cwd: rootDir,
            stdio: 'inherit',
            env: {
                ...process.env,
                BROWSER: 'none'
            }
        }
    );
    viteProcesses.set(kind, viteProcess);

    viteProcess.on('exit', () => {
        if (viteProcesses.get(kind) === viteProcess) viteProcesses.delete(kind);
    });
}

async function createWindow() {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { x, y, width, height } = primaryDisplay.workArea;

    const win = new BrowserWindow({
        x,
        y,
        width,
        height,
        minWidth: Math.min(isEditorMode ? 1100 : 960, width),
        minHeight: Math.min(isEditorMode ? 700 : 600, height),
        fullscreen: false,
        kiosk: false,
        resizable: true,
        title: isEditorMode ? 'Editor 3D de Mapas — Doom3D' : 'Doom3D',
        backgroundColor: '#07070d',
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.cjs')
        }
    });

    win.webContents.setWindowOpenHandler(({ url }) => {
        const isLocalUrl = [gameDevUrl, editorDevUrl].some(baseUrl => url.startsWith(baseUrl))
            || url.startsWith('file://');
        return { action: isLocalUrl ? 'allow' : 'deny' };
    });

    if (app.isPackaged) {
        const entry = isEditorMode
            ? path.join(rootDir, 'dist-editor', 'index.html')
            : path.join(rootDir, 'dist', 'index.html');
        await win.loadFile(entry);
        return;
    }

    const targetUrl = isEditorMode ? editorDevUrl : gameDevUrl;
    startVite(isEditorMode ? 'editor' : 'game');
    if (isEditorMode) startVite('game');
    await waitForServer(targetUrl);
    await win.loadURL(targetUrl);
}

app.whenReady().then(() => {
    createWindow().catch((error) => {
        console.error(error);
        app.quit();
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow().catch(console.error);
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    viteProcesses.forEach(process => process.kill());
    viteProcesses.clear();
});
