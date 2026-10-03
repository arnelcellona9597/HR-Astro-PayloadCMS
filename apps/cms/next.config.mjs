import { withPayload } from '@payloadcms/next/withPayload'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Payload runs in the same Node process as the Astro app (see /server.mjs). Keeping Payload and the
  // database driver external means both share ONE Payload instance and ONE SQLite connection pool
  // instead of each bundling its own copy.
  serverExternalPackages: [
    'payload',
    '@payloadcms/db-sqlite',
    '@payloadcms/drizzle',
    'nodemailer',
    'file-type',
    '@libsql/client',
    'libsql',
    'drizzle-orm',
    'exceljs',
  ],
  transpilePackages: ['@hr/shared'],
  poweredByHeader: false,
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      '.cjs': ['.cts', '.cjs'],
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    }
    return webpackConfig
  },
  turbopack: {
    root: path.resolve(dirname, '../..'),
  },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
