import { Link, Outlet } from 'react-router-dom'
import './auth.css'

export function AuthLayout() {
  return <main className="auth-page"><Link className="auth-brand" to="/">Brightloop</Link><Outlet /></main>
}

export function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="auth-card"><h1>{title}</h1>{children}</section>
}
