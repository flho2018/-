import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [
    react()
  ],
  server: {
    port: Number(process.env.PORT) || 3000,
    host: true,
    watch: {
      ignored: ['**/house_of_roses/**']
    }
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react/') || id.includes('react-dom/') || id.includes('scheduler/')) {
              return 'vendor-react';
            }
            if (id.includes('firebase')) {
              return 'vendor-firebase';
            }
            if (id.includes('xlsx')) {
              return 'vendor-xlsx';
            }
            if (id.includes('lucide-react')) {
              return 'vendor-icons';
            }
            if (id.includes('html2canvas') || id.includes('qrcode') || id.includes('jsbarcode') || id.includes('html5-qrcode') || id.includes('qz-tray')) {
              return 'vendor-tools';
            }
            return 'vendor-libs';
          }
        }
      }
    }
  }
});
