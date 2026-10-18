// Electron shell for Folk AMLL Editor.
// Serves the built site (../dist) from a custom app:// origin and adds the two headers the
// spectrogram needs (cross-origin isolation), the same ones vercel.json sets for the website.
const { app, BrowserWindow, protocol, net, shell, Menu } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')

// Packaged app: dist is copied to <resources>/app. Running from the repo: ../dist
const DIST = app.isPackaged ? path.join(process.resourcesPath, 'app') : path.join(__dirname, '..', 'dist')

const ISOLATION_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true },
  },
])

function registerAppProtocol() {
  protocol.handle('app', async (request) => {
    const { pathname } = new URL(request.url)
    let filePath = path.normalize(path.join(DIST, decodeURIComponent(pathname)))
    // Never serve anything outside dist
    if (!filePath.startsWith(DIST)) return new Response('Forbidden', { status: 403 })
    // Single page app: unknown paths fall back to index.html
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory())
      filePath = path.join(DIST, 'index.html')

    const response = await net.fetch(pathToFileURL(filePath).toString())
    const headers = new Headers(response.headers)
    for (const [key, value] of Object.entries(ISOLATION_HEADERS)) headers.set(key, value)
    return new Response(response.body, { status: response.status, headers })
  })
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#18181b',
    title: 'Folk AMLL Editor',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  })

  // Links that would open a new window (GitHub, Genius token page...) go to the default browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('app://')) {
      event.preventDefault()
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    }
  })

  void win.loadURL('app://folk/index.html')
}

// Only one window/instance
if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.whenReady().then(() => {
    if (!fs.existsSync(path.join(DIST, 'index.html'))) {
      console.error(`Could not find ${DIST}/index.html. Run "pnpm build" in the project root first.`)
      app.quit()
      return
    }
    Menu.setApplicationMenu(null)
    registerAppProtocol()
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
