import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { existsSync } from 'fs'
import path from 'path'

// Read env from the backend's .env so the shared API var (single source of
// truth) drives both the Google callback URL and the frontend's API base URL.
// Falls back to this project's own .env when backend/.env isn't available
// (e.g. the Docker build only copies the frontend context).
const backendEnvDir = path.resolve(__dirname, '../backend')
const hasBackendEnv = existsSync(path.join(backendEnvDir, '.env'))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  ...(hasBackendEnv ? { envDir: backendEnvDir } : {}),
})
