import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { BrowserRouter, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthLayout } from './features/auth/AuthLayout'
import { LoginPage } from './features/auth/LoginPage'
import { RegisterPage } from './features/auth/RegisterPage'
import { RequireAuth, RequireRole } from './features/auth/guards'
import { AccountShell } from './features/auth/AccountShell'
import { CustomerDetailPage, CustomerFormPage, CustomerListPage } from './features/customers'
import { ProfilePage } from './features/portal/pages/ProfilePage'
import { ProductDetailPage, ProductFormPage, ProductListPage } from './features/products'

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
        <Route element={<RequireRole roles={['customer']} />}>
          <Route path="/portal/profile" element={<ProfilePage />} />
          <Route path="/portal/*" element={<AccountShell area="portal" />} />
        </Route>
        <Route element={<RequireRole roles={['admin', 'staff']} />}>
          <Route path="/app" element={<AccountShell area="app" />} />
          <Route path="/app/customers" element={<CustomerListPage />} />
          <Route path="/app/customers/new" element={<CustomerFormPage />} />
          <Route path="/app/customers/:id" element={<CustomerDetailPage />} />
          <Route path="/app/customers/:id/edit" element={<CustomerFormPage />} />
          <Route path="/app/products" element={<ProductListRoute />} />
          <Route path="/app/products/new" element={<ProductFormRoute />} />
          <Route path="/app/products/:id" element={<ProductDetailRoute />} />
        </Route>
      </Route>
    </Routes></BrowserRouter></QueryClientProvider>
  </StrictMode>,
)

function ProductListRoute() {
  return <ProductListPage navigate={useNavigate()} />
}

function ProductFormRoute() {
  return <ProductFormPage navigate={useNavigate()} />
}

function ProductDetailRoute() {
  const navigate = useNavigate()
  const id = Number(useParams().id)
  return Number.isSafeInteger(id) && id > 0
    ? <ProductDetailPage id={id} navigate={navigate} />
    : <Navigate to="/app/products" replace />
}
