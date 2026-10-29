import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './auth/AuthContext.jsx';
import { ClubProvider } from './auth/ClubContext.jsx';
import App from './App.jsx';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false },
  },
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {/* Кабінет клубу — окрема сесія (токен club_account), поряд із входом АФУ */}
        <ClubProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </ClubProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>
);
