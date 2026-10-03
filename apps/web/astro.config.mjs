// @ts-check
import node from '@astrojs/node'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'

const cmsPort = process.env.CMS_DEV_PORT || '3001'
const cmsTarget = `http://localhost:${cmsPort}`

export default defineConfig({
  output: 'server',
  // `handler` is mounted by /server.mjs next to the Payload admin; it doesn't listen on its own.
  // Requests over 12 MB are refused before they're read (uploads are limited to 10 MB).
  adapter: node({ mode: 'standalone', bodySizeLimit: 12 * 1024 * 1024 }),
  // Origin is checked in src/middleware.ts against the Host header, which works behind cPanel's proxy.
  security: { checkOrigin: false },
  devToolbar: { enabled: false },
  server: { port: 4321 },
  vite: {
    plugins: [tailwindcss()],
    ssr: {
      // Payload and the SQLite driver are loaded from node_modules at runtime and shared with the
      // admin panel in the same process.
      external: ['payload', '@payloadcms/db-sqlite', '@payloadcms/drizzle', 'libsql', '@libsql/client', 'drizzle-orm', 'exceljs', 'dotenv', 'nodemailer', 'file-type', 'pdf-lib', '@pdf-lib/fontkit'],
    },
    server: {
      // Dev only: the Payload admin & REST API run on the Next.js dev server.
      proxy: {
        '/admin': { target: cmsTarget, changeOrigin: false },
        '/api': { target: cmsTarget, changeOrigin: false },
        '/_next': { target: cmsTarget, changeOrigin: false, ws: true },
      },
    },
  },
})
