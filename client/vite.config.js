import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { defineConfig } from 'vite';

// `npm run dev:https` serves over HTTPS with a self-signed certificate. Phones only allow
// camera access on https:// or localhost, so use it when you test the QR scanner from another device.
const target = process.env.SERVER_URL || 'http://localhost:3001';

export default defineConfig({
  plugins: [react(), ...(process.env.HTTPS ? [basicSsl()] : [])],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/socket.io': { target, ws: true },
      '/api': { target },
    },
  },
});
