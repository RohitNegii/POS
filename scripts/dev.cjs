const { spawn, execFileSync } = require('child_process');
const http = require('http');
const path = require('path');

const DEV_SERVER_URL = 'http://127.0.0.1:5173';

function compileMainProcess() {
  console.log('[dev] Compiling Electron Main and Preload TypeScript...');
  const tscBin = path.join(__dirname, '..', 'node_modules', 'typescript', 'bin', 'tsc');
  execFileSync(process.execPath, [tscBin, '-p', 'tsconfig.main.json'], {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..'),
  });
}

function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Timed out waiting for Vite dev server at ${url}`));
        } else {
          setTimeout(check, 250);
        }
      });
      req.end();
    };
    check();
  });
}

async function startDev() {
  try {
    compileMainProcess();

    const viteBin = path.join(__dirname, '..', 'node_modules', 'vite', 'bin', 'vite.js');
    console.log('[dev] Starting Vite React HMR Dev Server...');
    const viteProcess = spawn(process.execPath, [viteBin], {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
      env: { ...process.env },
    });

    await waitForServer(DEV_SERVER_URL);
    console.log(`[dev] Vite ready at ${DEV_SERVER_URL}. Launching Electron...`);

    const electronBinary = require('electron');
    const electronProcess = spawn(electronBinary, ['.'], {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
      env: {
        ...process.env,
        VITE_DEV_SERVER_URL: DEV_SERVER_URL,
      },
    });

    const cleanup = () => {
      if (!viteProcess.killed) {
        viteProcess.kill();
      }
      if (!electronProcess.killed) {
        electronProcess.kill();
      }
    };

    electronProcess.on('close', (code) => {
      cleanup();
      process.exit(code ?? 0);
    });

    process.on('SIGINT', () => {
      cleanup();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      cleanup();
      process.exit(0);
    });
  } catch (err) {
    console.error('[dev] Failed to start development environment:', err);
    process.exit(1);
  }
}

startDev();
