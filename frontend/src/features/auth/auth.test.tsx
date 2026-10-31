// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiRequest } from '../../lib/api'
import { LoginPage } from './LoginPage'
import { RegisterPage } from './RegisterPage'
import { RequireAuth, RequireRole } from './guards'
import { safeReturnPath } from './useAuth'

vi.mock('../../lib/api', async (original) => {
  const actual = await original<typeof import('../../lib/api')>()
  return { ...actual, apiRequest: vi.fn() }
})

const mockedRequest = vi.mocked(apiRequest)
afterEach(() => { cleanup(); vi.resetAllMocks() })

function renderPage(path: string, from?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[{ pathname: path, state: { from } }]}><Routes>
    <Route path="/register" element={<RegisterPage />} />
    <Route path="/login" element={<LoginPage />} />
    <Route path="/portal/*" element={<div>Portal destination</div>} />
    <Route path="/app/*" element={<div>Back office destination</div>} />
  </Routes></MemoryRouter></QueryClientProvider>)
}

describe('registration', () => {
  it('shows password rules and disables submission while registration is pending', async () => {
    const user = userEvent.setup()
    mockedRequest.mockImplementation(() => new Promise(() => {}))
    renderPage('/register')
    expect(screen.getByText(/More than 8 characters/)).toBeInTheDocument()
    expect(screen.getByText(/An uppercase letter/)).toBeInTheDocument()
    expect(screen.getByText(/A lowercase letter/)).toBeInTheDocument()
    expect(screen.getByText(/A special character/)).toBeInTheDocument()
    await user.type(screen.getByLabelText('Full name'), 'Example Customer')
    await user.type(screen.getByLabelText('Email'), 'customer@example.com')
    await user.type(screen.getByLabelText('Password'), 'Example!Pass123')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('button', { name: 'Creating account…' })).toBeDisabled()
  })

  it('shows duplicate email on the email field', async () => {
    const user = userEvent.setup()
    mockedRequest.mockRejectedValue(new ApiError(409, 'EMAIL_ALREADY_EXISTS', 'Email already exists'))
    renderPage('/register')
    await user.type(screen.getByLabelText('Full name'), 'Example Customer')
    await user.type(screen.getByLabelText('Email'), 'customer@example.com')
    await user.type(screen.getByLabelText('Password'), 'Example!Pass123')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByText('Email already exists')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
  })

  it('rejects an eight-character password before submitting', async () => {
    const user = userEvent.setup()
    renderPage('/register')
    await user.type(screen.getByLabelText('Full name'), 'Example Customer')
    await user.type(screen.getByLabelText('Email'), 'customer@example.com')
    await user.type(screen.getByLabelText('Password'), 'Abcde!1x')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('More than 8 characters')
    expect(mockedRequest).not.toHaveBeenCalled()
  })

  it('refreshes the session and navigates to the portal after registration', async () => {
    const user = userEvent.setup()
    mockedRequest.mockResolvedValueOnce({}).mockResolvedValueOnce({ id: 1, email: 'customer@example.com', full_name: 'Customer', role: 'customer', customer_id: 1 })
    renderPage('/register')
    await user.type(screen.getByLabelText('Full name'), 'Example Customer')
    await user.type(screen.getByLabelText('Email'), 'customer@example.com')
    await user.type(screen.getByLabelText('Password'), 'Example!Pass123')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByText('Portal destination')).toBeInTheDocument()
    expect(mockedRequest).toHaveBeenCalledWith('/auth/me')
  })
})

describe('login', () => {
  it.each([['customer', 'Portal destination'], ['admin', 'Back office destination'], ['staff', 'Back office destination']])('routes %s to the correct area', async (role, destination) => {
    const user = userEvent.setup()
    mockedRequest.mockResolvedValueOnce({}).mockResolvedValueOnce({ id: 1, email: 'user@example.com', full_name: 'User', role, customer_id: null })
    renderPage('/login')
    await user.type(screen.getByLabelText('Email'), 'user@example.com')
    await user.type(screen.getByLabelText('Password'), 'Example!Pass123')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(screen.getByText(destination)).toBeInTheDocument())
  })

  it('rejects external and cross-role return paths', () => {
    expect(safeReturnPath('//evil.example', 'customer')).toBe('/portal')
    expect(safeReturnPath('/\\evil.example', 'customer')).toBe('/portal')
    expect(safeReturnPath('/app/admin', 'customer')).toBe('/portal')
    expect(safeReturnPath('/portal/invoices', 'customer')).toBe('/portal/invoices')
  })
})

describe('route guards', () => {
  it('blocks a customer from the back office', async () => {
    mockedRequest.mockResolvedValue({ id: 1, email: 'customer@example.com', full_name: 'Customer', role: 'customer', customer_id: 1 })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/app']}><Routes>
      <Route element={<RequireAuth />}><Route element={<RequireRole roles={['admin', 'staff']} />}><Route path="/app" element={<div>Private back office</div>} /></Route></Route>
      <Route path="/login" element={<div>Login destination</div>} />
    </Routes></MemoryRouter></QueryClientProvider>)
    expect(await screen.findByRole('alert')).toHaveTextContent('403')
    expect(screen.queryByText('Private back office')).not.toBeInTheDocument()
  })

  it('redirects an anonymous visitor to login', async () => {
    mockedRequest.mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'Authentication required'))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/portal']}><Routes>
      <Route element={<RequireAuth />}><Route path="/portal" element={<div>Private portal</div>} /></Route>
      <Route path="/login" element={<div>Login destination</div>} />
    </Routes></MemoryRouter></QueryClientProvider>)
    expect(await screen.findByText('Login destination')).toBeInTheDocument()
    expect(screen.queryByText('Private portal')).not.toBeInTheDocument()
  })
})
