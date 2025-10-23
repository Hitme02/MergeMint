// Minimal static file server for the built Vite app (SPA)
const http = require('http')
const fs = require('fs')
const path = require('path')

const PORT = process.env.PORT || 5173
const root = path.resolve(__dirname, 'dist')

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm'
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, Object.assign({ 'cache-control': 'no-cache' }, headers))
  res.end(body)
}

const server = http.createServer((req, res) => {
  try {
    let reqPath = (req.url || '/').split('?')[0]
    if (reqPath.endsWith('/')) reqPath += 'index.html'
    let filePath = path.join(root, path.normalize(decodeURIComponent(reqPath)))

    // Prevent path traversal
    if (!filePath.startsWith(root)) return send(res, 400, 'Bad Request')

    if (!fs.existsSync(filePath)) {
      // SPA fallback: serve index.html for routes without a dot
      const hasExt = path.extname(reqPath)
      if (!hasExt) filePath = path.join(root, 'index.html')
    }

    if (!fs.existsSync(filePath)) return send(res, 404, 'Not Found')

    const ext = path.extname(filePath)
    const type = mime[ext] || 'application/octet-stream'
    const data = fs.readFileSync(filePath)
    send(res, 200, data, { 'content-type': type })
  } catch (e) {
    send(res, 500, 'Internal Server Error')
  }
})

server.listen(PORT, () => {
  console.log(`[static] serving ${root} at http://localhost:${PORT}`)
})
