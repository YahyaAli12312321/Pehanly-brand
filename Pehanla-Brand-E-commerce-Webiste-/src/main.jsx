import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './index.css';
import { useCurrencyStore } from './store/useCurrencyStore';

// A stored manual choice (already hydrated) wins; otherwise guess the market once for the first visit.
useCurrencyStore.getState().initDetected();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      // Never retry client errors (400-499); retry transient failures once.
      retry: (failureCount, error) => !(error?.status >= 400 && error?.status < 500) && failureCount < 1,
      staleTime: 1000 * 60, // per-query overrides below/in hooks
    },
    mutations: { retry: false },
  },
});

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
