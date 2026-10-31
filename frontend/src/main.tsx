import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthLayout } from './features/auth/AuthLayout'
import { LoginPage } from './features/auth/LoginPage'
import { RegisterPage } from './features/auth/RegisterPage'
import { RequireAuth, RequireRole } from './features/auth/guards'
import { AccountShell } from './features/auth/AccountShell'
import { ProductDetailRoute, ProductFormRoute, ProductListRoute } from './features/products'

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}><BrowserRouter><Routes>
      <Route path="/" element={<App />} />
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>
      <Route element={<RequireAuth />}>
        <Route element={<RequireRole roles={['customer']} />}><Route path="/portal/*" element={<AccountShell area="portal" />} /></Route>
        <Route element={<RequireRole roles={['admin', 'staff']} />}>
          <Route path="/app" element={<AccountShell area="app" />}>
            <Route path="products" element={<ProductListRoute />} />
            <Route element={<RequireRole roles={['admin']} />}>
              <Route path="products/new" element={<ProductFormRoute />} />
            </Route>
            <Route path="products/:id" element={<ProductDetailRoute />} />
          </Route>
        </Route>
      </Route>
    </Routes></BrowserRouter></QueryClientProvider>
  </StrictMode>,
)
