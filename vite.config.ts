import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

export default defineConfig({
  plugins: [
    dts({
      insertTypesEntry: true,
      include: ['src/**/*'],
      exclude: ['src/**/*.test.ts', 'src/**/*.spec.ts']
    })
  ],
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

