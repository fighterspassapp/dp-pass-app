import { useState } from 'react'
import { supabase } from './supabase'

type UserRow = {
  name: string
  email: string
  passes: number
  is_admin: boolean
}

export default function App() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [user, setUser] = useState<UserRow | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const normalizedEmail = email.trim().toLowerCase()

    const { data, error } = await supabase
      .from('users')
      .select('name, email, passes, is_admin')
      .eq('email', normalizedEmail)
      .maybeSingle()

    setLoading(false)

    if (error) {
      console.error(error)
      setError(`Database error: ${error.message}`)
      return
    }

    if (!data) {
      setError('Email not found in system')
      return
    }

    setUser(data as UserRow)
  }

  const handleSignOut = () => {
    setUser(null)
    setEmail('')
    setError('')
  }

  if (user) {
    return (
      <div style={{ padding: 40, fontFamily: 'system-ui, Arial' }}>
        <h1 style={{ marginBottom: 8 }}>🎫 Pass Page</h1>

        <div
          style={{
            marginTop: 16,
            padding: 16,
            border: '1px solid #ddd',
            borderRadius: 10,
            maxWidth: 420,
          }}
        >
          <p style={{ margin: '6px 0' }}>
            <strong>Name:</strong> {user.name}
          </p>
          <p style={{ margin: '6px 0' }}>
            <strong>Email:</strong> {user.email}
          </p>
          <p style={{ margin: '6px 0' }}>
            <strong>Available passes:</strong> {user.passes}
          </p>
        </div>

        <button
          onClick={handleSignOut}
          style={{ marginTop: 16, padding: '8px 12px', cursor: 'pointer' }}
        >
          Sign out
        </button>
      </div>
    )
  }

  return (
    <div style={{ padding: 40, fontFamily: 'system-ui, Arial' }}>
      <h1>Enter Email</h1>

      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="email@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{ padding: 10, width: 320, maxWidth: '90%' }}
        />

        <br />
        <br />

        <button type="submit" disabled={loading} style={{ padding: '8px 12px' }}>
          {loading ? 'Checking…' : 'Continue'}
        </button>
      </form>

      {error && <p style={{ color: 'red', marginTop: 12 }}>{error}</p>}
    </div>
  )
}
