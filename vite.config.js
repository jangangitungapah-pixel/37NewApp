import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    sourcemap: false,
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined;
          }
          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/react-router-dom/') ||
            id.includes('/react-router/') ||
            id.includes('/scheduler/') ||
            id.includes('\\react\\') ||
            id.includes('\\react-dom\\') ||
            id.includes('\\react-router-dom\\') ||
            id.includes('\\react-router\\') ||
            id.includes('\\scheduler\\')
          ) {
            return 'react-vendor';
          }
          if (id.includes('lucide-react')) {
            return 'ui-icons';
          }
          if (id.includes('zrender')) {
            return 'ui-zrender';
          }
          if (id.includes('echarts')) {
            return 'ui-echarts';
          }
          if (id.includes('motion') || id.includes('framer-motion')) {
            return 'ui-motion';
          }
          if (id.includes('@base-ui/react') || id.includes('sonner') || id.includes('cmdk')) {
            return 'ui-primitives';
          }
          if (
            id.includes('@tanstack/') ||
            id.includes('react-hook-form') ||
            id.includes('@hookform/resolvers') ||
            id.includes('zod') ||
            id.includes('react-day-picker') ||
            id.includes('date-fns') ||
            id.includes('zustand')
          ) {
            return 'ui-forms-data';
          }
          if (id.includes('@firebase/firestore') || id.includes('firebase/firestore')) {
            return 'firebase-firestore';
          }
          if (id.includes('firebase') || id.includes('@firebase')) {
            return 'firebase-core';
          }
          return undefined;
        },
      },
    },
  },
});
