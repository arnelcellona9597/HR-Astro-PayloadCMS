// cPanel "Setup Node.js App" startup file. Passenger loads CommonJS, so hand off to the ESM server.
import('./server.mjs')
