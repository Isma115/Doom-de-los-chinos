const { app, BrowserWindow, ipcMain, screen } = require('electron');
const { spawn } = require('node:child_process');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const rootDir = path.join(__dirname, '..');
const devUrl = 'http://127.0.0.1:5173/';
let viteProcess = null;

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

function startVite() {
    if (viteProcess && !viteProcess.killed) {
        return;
    }

    const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

    viteProcess = spawn(
        npmCommand,
        ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '5173', '--strictPort'],
        {
            cwd: rootDir,
            stdio: 'inherit',
            env: {
                ...process.env,
                BROWSER: 'none'
            }
        }
    );

    viteProcess.on('exit', () => {
        viteProcess = null;
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
        minWidth: Math.min(960, width),
        minHeight: Math.min(600, height),
        fullscreen: false,
        kiosk: false,
        resizable: true,
        backgroundColor: '#07070d',
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.cjs')
        }
    });

    if (app.isPackaged) {
        await win.loadFile(path.join(rootDir, 'dist', 'index.html'));
        return;
    }

    startVite();
    await waitForServer(devUrl);
    await win.loadURL(devUrl);
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
    if (viteProcess) {
        viteProcess.kill();
        viteProcess = null;
    }
});
