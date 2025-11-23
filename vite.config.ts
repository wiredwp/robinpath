import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'RobinPath',
      fileName: 'index',
      formats: ['es']
    },
    rollupOptions: {
      external: []
    }
  }
})

