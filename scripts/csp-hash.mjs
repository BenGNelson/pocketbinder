// Print the CSP sha256 of the inline (attribute-less) theme-init script in a
// built index.html, e.g. `node scripts/csp-hash.mjs frontend/dist/index.html`.
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const html = readFileSync(process.argv[2] || 'frontend/dist/index.html', 'utf8')
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map((m) => m[1])
  .find((t) => t.includes('data-theme'))
if (!inline) {
  console.error('inline theme script not found')
  process.exit(1)
}
console.log('sha256-' + createHash('sha256').update(inline, 'utf8').digest('base64'))
