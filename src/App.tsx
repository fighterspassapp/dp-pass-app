import { useState } from 'react'
import { supabase } from './supabase'
import './App.css'

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

    if (error) return setError(`Database error: ${error.message}`)
    if (!data) return setError('Email not found in system')

    setUser(data as UserRow)
  }

  const signOut = () => {
    setUser(null)
    setEmail('')
    setError('')
  }

  return (
    <div className="page">
      {/* HEADER */}
      <div className="headerBar">
        <img src="/fightingLogo.png" className="headerLogo" alt="Fighting Fourth" />
        <div className="headerTitle">Fighters Pass Tracker</div>
      </div>

      {/* MAIN */}
      <div className="mainArea">
        {!user ? (
          <div className="loginPanel">
            <h2 className="loginTitle">Enter your email</h2>
            <p className="loginSub">
              If your email is in the system, you’ll see your current pass balance.
            </p>

            <form className="login" onSubmit={handleSubmit}>
              <input
                className="input"
                type="email"
                placeholder="email@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />

              <button className="btn btnGold" type="submit" disabled={loading}>
                {loading ? 'Checking…' : 'Continue'}
              </button>

              {error && <div className="error">{error}</div>}
            </form>
          </div>
        ) : (
          <div className="card">
            <div className="cardHeader">
              <img src="/fightingLogo.png" className="logo" alt="Fighting Fourth" />
              <div className="titleBlock">
                <h1 className="name">{user.name}</h1>
                <p className="email">{user.email}</p>
              </div>
            </div>

            <div className="hr" />

            <div className="statsRow">
              <div className="label">Passes Left</div>
              <div className="passes">{user.passes}</div>
            </div>

            <div className="actions">
              <button className="btn btnGold" type="button">
                Request Pass
              </button>

              <button className="btn" type="button" onClick={signOut}>
                Sign out
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
