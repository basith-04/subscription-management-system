import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthLayout } from './features/auth/AuthLayout'
import { LoginPage } from './features/auth/LoginPage'
import { RegisterPage } from './features/auth/RegisterPage'
import { RequireAuth, RequireRole } from './features/auth/guards'
import { CustomerDetailPage, CustomerFormPage, CustomerListPage } from './features/customers'
import { BillingRunPage } from './features/billing-runs'
import { InvoiceDetailRoute, InvoiceListRoute, InvoicePrintRoute } from './features/invoices'
import { PaymentListRoute } from './features/payments'
import { QuotationCreatePage, QuotationDetailPage, QuotationListPage, SubscriptionDetailPage, SubscriptionListPage } from './features/subscriptions'
import { ProfilePage } from './features/portal/pages/ProfilePage'
import { ProductDetailRoute, ProductFormRoute, ProductListRoute } from './features/products'
import { AuditLogPage } from './features/audit-logs'
import { PlanListRoute } from './features/plans/routes/PlanListRoute'
import { TaxListPage } from './features/taxes'
import { PaymentTermListPage } from './features/payment-terms'
import { StaffListPage } from './features/users'
import { BackOfficeLayout } from './layouts/BackOfficeLayout'
import { PortalLayout } from './layouts/PortalLayout'

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
          <Route path="/portal" element={<PortalLayout />}>
            <Route index element={<Navigate to="profile" replace />} />
            <Route path="profile" element={<ProfilePage />} />
          </Route>
        </Route>
        <Route element={<RequireRole roles={['admin', 'staff']} />}>
          <Route path="/app" element={<BackOfficeLayout />}>
            <Route index element={<Navigate to="customers" replace />} />
            <Route path="customers" element={<CustomerListPage />} />
            <Route path="customers/new" element={<CustomerFormPage />} />
            <Route path="customers/:id" element={<CustomerDetailPage />} />
            <Route path="customers/:id/edit" element={<CustomerFormPage />} />
            <Route path="invoices" element={<InvoiceListRoute />} />
            <Route path="invoices/:id" element={<InvoiceDetailRoute />} />
            <Route path="quotations" element={<QuotationListPage />} />
            <Route path="quotations/new" element={<QuotationCreatePage />} />
            <Route path="quotations/:id" element={<QuotationDetailPage />} />
            <Route path="quotations/:id/edit" element={<QuotationCreatePage />} />
            <Route path="subscriptions" element={<SubscriptionListPage />} />
            <Route path="subscriptions/:id" element={<SubscriptionDetailPage />} />
            <Route path="payments" element={<PaymentListRoute />} />
            <Route path="billing" element={<BillingRunPage />} />
            <Route path="products" element={<ProductListRoute />} />
            <Route element={<RequireRole roles={['admin']} />}>
              <Route path="products/new" element={<ProductFormRoute />} />
            </Route>
            <Route path="products/:id" element={<ProductDetailRoute />} />
            <Route path="plans" element={<PlanListRoute />} />
            <Route path="taxes" element={<TaxListPage />} />
            <Route path="payment-terms" element={<PaymentTermListPage />} />
            <Route element={<RequireRole roles={['admin']} />}>
              <Route path="users" element={<StaffListPage />} />
              <Route path="settings/audit-log" element={<AuditLogPage />} />
            </Route>
          </Route>
        </Route>
        {/* Standalone print view: deliberately outside any app chrome. */}
        <Route element={<RequireRole roles={['admin', 'staff']} />}>
          <Route path="/print/invoices/:id" element={<InvoicePrintRoute />} />
        </Route>
      </Route>
    </Routes></BrowserRouter></QueryClientProvider>
  </StrictMode>,
)
