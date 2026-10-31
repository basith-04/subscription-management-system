import { useEffect, useState } from 'react'
import { listUsers, updateUser, createStaff } from '../../../api/users'
import type { User } from '../types'

export function StaffListPage({ navigate: _navigate }: { navigate?: (path: string) => void }) {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const [showModal, setShowModal] = useState(false)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [modalError, setModalError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const load = () => {
    setLoading(true)
    listUsers().then(res => setUsers(res.data)).catch(e => setError(e.message)).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setModalError(null); setSubmitting(true)
    try {
      await createStaff({ full_name: fullName, email, password })
      setShowModal(false)
      setFullName(''); setEmail(''); setPassword('')
      load()
    } catch (err: any) {
      setModalError(err.message || 'Failed to create staff')
    } finally { setSubmitting(false) }
  }

  const toggleActive = async (user: User) => {
    try {
      await updateUser(user.id, { is_active: !user.is_active })
      load()
    } catch (err: any) {
      alert(err.message || 'Failed to update user')
    }
  }

  return (
    <div className="page">
      <main style={{ padding: '2rem', width: 'min(1000px, calc(100% - 3rem))', margin: '0 auto' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ fontSize: '1.8rem' }}>Staff Accounts</h1>
            <p style={{ color: '#6b675f' }}>Manage internal users and roles.</p>
          </div>
          <button className="button primary" onClick={() => setShowModal(true)}>Add Staff</button>
        </header>

        {loading && <p>Loading…</p>}
        {error && <p style={{ color: '#a33030' }}>{error}</p>}
        
        {!loading && !error && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.95rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid #e2ded4' }}>
                <th style={{ padding: '0.75rem 0' }}>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} style={{ borderBottom: '1px solid #f2efe8' }}>
                  <td style={{ padding: '0.75rem 0', fontWeight: 600 }}>{u.full_name}</td>
                  <td>{u.email}</td>
                  <td style={{ textTransform: 'capitalize' }}>{u.role}</td>
                  <td>
                    <span style={{ color: u.is_active ? '#1f6f4a' : '#a33030', fontWeight: 600 }}>
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="button ghost" style={{ padding: '0.3rem 0.6rem', fontSize: '0.85rem' }} 
                      onClick={() => toggleActive(u)}>
                      {u.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'grid', placeItems: 'center', zIndex: 50 }}>
          <div style={{ background: '#fff', padding: '2rem', borderRadius: 16, width: 'min(400px, 90vw)' }}>
            <h2 style={{ marginBottom: '1rem' }}>Create Staff Account</h2>
            <form onSubmit={handleCreate} style={{ display: 'grid', gap: '1rem' }}>
              <input required placeholder="Full Name" value={fullName} onChange={e => setFullName(e.target.value)} style={inputStyle} />
              <input required type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} />
              <input required type="password" placeholder="Temporary Password" value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} />
              {modalError && <p style={{ color: '#a33030', fontSize: '0.85rem' }}>{modalError}</p>}
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button type="button" className="button ghost" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="button primary" disabled={submitting}>{submitting ? 'Creating…' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = { padding: '0.5rem 0.7rem', border: '1px solid #e2ded4', borderRadius: 8, width: '100%' }
