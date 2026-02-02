import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import './App.css'

type UserRow = {
  name: string
  email: string
  passes: number
  is_admin: boolean
}

type UserListRow = {
  name: string
  email: string
  passes: number
}

type PassTransferRequestRow = {
  id: number
  email: string
  name: string | null
  amount: number
  created_at: string
}

type IncentivePassRequestRow = {
  id: number
  email: string
  name: string | null
  amount: number
  reason: string
  created_at: string
}


type View = 'pass' | 'admin'
type AdminTab = 'passCount' | 'passTransferRequests' | 'incentivePassRequests'


export default function App() {

  const [showTransferUI, setShowTransferUI] = useState(false)
  const [transferAmount, setTransferAmount] = useState(1)
  const [transferLoading, setTransferLoading] = useState(false)


  const [transferReqs, setTransferReqs] = useState<PassTransferRequestRow[]>([])
  const [transferReqsLoading, setTransferReqsLoading] = useState(false)
  const [transferReqsError, setTransferReqsError] = useState('')
  const [transferActionId, setTransferActionId] = useState<number | null>(null)

  const [showIncentiveUI, setShowIncentiveUI] = useState(false)
  const [incentiveAmount, setIncentiveAmount] = useState(1)
  const [incentiveReason, setIncentiveReason] = useState('')
  const [incentiveLoading, setIncentiveLoading] = useState(false)
  const [incentiveMsg, setIncentiveMsg] = useState('')

  const [incentiveReqs, setIncentiveReqs] = useState<IncentivePassRequestRow[]>([])
  const [incentiveReqsLoading, setIncentiveReqsLoading] = useState(false)
  const [incentiveReqsError, setIncentiveReqsError] = useState('')
  const [incentiveActionId, setIncentiveActionId] = useState<number | null>(null)


  const submitIncentiveRequest = async () => {
    if (!user) return

    setIncentiveMsg('')
    setIncentiveLoading(true)

    const amt = Number(incentiveAmount)
    if (!Number.isInteger(amt) || amt < 1) {
      setIncentiveLoading(false)
      setIncentiveMsg('Enter a valid number of passes.')
      return
    }

    const reason = incentiveReason.trim()
    if (!reason) {
      setIncentiveLoading(false)
      setIncentiveMsg('Please add a reason.')
      return
    }

    const { error } = await supabase.from('incentive_pass_requests').insert({
      email: user.email,
      name: user.name,
      amount: amt,
      reason,
    })

    setIncentiveLoading(false)

    if (error) {
      console.error(error)
      setIncentiveMsg(`Request failed: ${error.message}`)
      return
    }

    setIncentiveMsg('Incentive request submitted.')
    setShowIncentiveUI(false)
    setIncentiveAmount(1)
    setIncentiveReason('')
  }



  const [pendingTransfer, setPendingTransfer] = useState<PassTransferRequestRow | null>(null)

  const loadMyPendingTransfer = async (userEmail: string) => {
    const { data, error } = await supabase
      .from('pass_transfer_requests')
      .select('id, name, email, amount, created_at')
      .eq('email', userEmail)
      .order('created_at', { ascending: false })
      .limit(1)

    if (error) {
      console.error(error)
      // don't block the UI; just don't show pending
      setPendingTransfer(null)
      return
    }

    const row = (data ?? [])[0] as PassTransferRequestRow | undefined
    setPendingTransfer(row ?? null)
  }


  const submitTransferRequest = async () => {
    if (!user) return


    setTransferLoading(true)

    const max = Number(user.passes ?? 0)
    const amt = Number(transferAmount)

  if (!Number.isInteger(amt) || amt < 1) {
    setTransferLoading(false)

    return
  }

  if (amt > max) {
    setTransferLoading(false)

    return
  }

  const { error } = await supabase.from('pass_transfer_requests').insert({
    email: user.email,
    name: user.name,
    amount: amt,
  })

  setTransferLoading(false)

  if (error) {
    console.error(error)

    return
  }

  if (user?.email) void loadMyPendingTransfer(user.email)
  setShowTransferUI(false)
  setTransferAmount(1)
}


  // login/pass state
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [user, setUser] = useState<UserRow | null>(null)

  // navigation state
  const [view, setView] = useState<View>('pass')
  const [adminTab, setAdminTab] = useState<AdminTab>('passCount')

  // admin state
  const [users, setUsers] = useState<UserListRow[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersError, setUsersError] = useState('')
  const [savingEmail, setSavingEmail] = useState<string | null>(null)

  // editable pass inputs
  const [draftPasses, setDraftPasses] = useState<Record<string, string>>({})

  const isAdmin = user?.is_admin === true

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
    setView('pass')
  }

  const signOut = () => {
    setUser(null)
    setEmail('')
    setError('')
    setView('pass')
    setAdminTab('passCount')
    setUsers([])
    setDraftPasses({})
    setUsersError('')
    setSavingEmail(null)
  }

  const enterAdmin = () => {
    if (!isAdmin) return
    setView('admin')
    setAdminTab('passCount')
  }

  const exitAdmin = () => {
    setView('pass')
  }

  const loadUsers = async () => {
    setUsersError('')
    setUsersLoading(true)

  

    const { data, error } = await supabase
      .from('users')
      .select('name, email, passes')
      .order('name', { ascending: true })

    setUsersLoading(false)

    if (error) {
      console.error(error)
      setUsersError(`Failed to load users: ${error.message}`)
      return
    }

    const rows = (data ?? []) as UserListRow[]
    setUsers(rows)

    const nextDraft: Record<string, string> = {}
    for (const r of rows) nextDraft[r.email] = String(r.passes ?? 0)
    setDraftPasses(nextDraft)
  }

  const loadIncentiveRequests = async () => {
    setIncentiveReqsError('')
    setIncentiveReqsLoading(true)

    const { data, error } = await supabase
      .from('incentive_pass_requests')
      .select('id, name, email, amount, reason, created_at')
      .order('created_at', { ascending: true })

    setIncentiveReqsLoading(false)

    if (error) {
      console.error(error)
      setIncentiveReqsError(`Failed to load incentive requests: ${error.message}`)
      return
    }

    setIncentiveReqs((data ?? []) as IncentivePassRequestRow[])
  }

  const denyIncentiveRequest = async (req: IncentivePassRequestRow) => {
    setIncentiveReqsError('')
    setIncentiveActionId(req.id)

    const { error } = await supabase
      .from('incentive_pass_requests')
      .delete()
      .eq('id', req.id)

    setIncentiveActionId(null)

    if (error) {
      console.error(error)
      setIncentiveReqsError(`Failed to deny request: ${error.message}`)
      return
    }

    setIncentiveReqs((prev) => prev.filter((r) => r.id !== req.id))
  }

  const approveIncentiveRequest = async (req: IncentivePassRequestRow) => {
    setIncentiveReqsError('')
    setIncentiveActionId(req.id)

    const amt = Number(req.amount)

    // 1) fetch current passes
    const { data: u, error: fetchErr } = await supabase
      .from('users')
      .select('passes')
      .eq('email', req.email)
      .maybeSingle()

    if (fetchErr) {
      setIncentiveActionId(null)
      console.error(fetchErr)
      setIncentiveReqsError(`Failed to read passes: ${fetchErr.message}`)
      return
    }

    const currentPasses = Number((u as any)?.passes ?? 0)
    if (!Number.isFinite(currentPasses)) {
      setIncentiveActionId(null)
      setIncentiveReqsError('Failed to read current pass balance.')
      return
    }

    // 2) update passes (ADD)
    const { error: updateErr } = await supabase
      .from('users')
      .update({ passes: currentPasses + amt })
      .eq('email', req.email)

    if (updateErr) {
      setIncentiveActionId(null)
      console.error(updateErr)
      setIncentiveReqsError(`Failed to update passes: ${updateErr.message}`)
      return
    }

    // 3) delete request
    const { error: deleteErr } = await supabase
      .from('incentive_pass_requests')
      .delete()
      .eq('id', req.id)

    setIncentiveActionId(null)

    if (deleteErr) {
      console.error(deleteErr)
      setIncentiveReqsError(`Passes updated but request not deleted: ${deleteErr.message}`)
      return
    }

    setIncentiveReqs((prev) => prev.filter((r) => r.id !== req.id))

    // optional: sync current user's display if they were approved
    setUser((prev) =>
      prev?.email === req.email ? { ...prev, passes: (prev.passes ?? 0) + amt } : prev
    )
  }


  const loadTransferRequests = async () => {
  setTransferReqsError('')
  setTransferReqsLoading(true)

    const { data, error } = await supabase
      .from('pass_transfer_requests')
      .select('id, name, email, amount, created_at')
      .order('created_at', { ascending: true })

    setTransferReqsLoading(false)

    if (error) {
      console.error(error)
      setTransferReqsError(`Failed to load transfer requests: ${error.message}`)
      return
    }

    setTransferReqs((data ?? []) as PassTransferRequestRow[])
  }

  const denyTransferRequest = async (req: PassTransferRequestRow) => {
  setTransferReqsError('')
  setTransferActionId(req.id)

    const { error } = await supabase
      .from('pass_transfer_requests')
      .delete()
      .eq('id', req.id)

    setTransferActionId(null)

    if (error) {
      console.error(error)
      setTransferReqsError(`Failed to deny request: ${error.message}`)
      return
    }

    setTransferReqs((prev) => prev.filter((r) => r.id !== req.id))
  }

  const approveTransferRequest = async (req: PassTransferRequestRow) => {
    setTransferReqsError('')
    setTransferActionId(req.id)

    const amt = Number(req.amount)

    const { data: u, error: fetchErr } = await supabase
      .from('users')
      .select('passes')
      .eq('email', req.email)
      .maybeSingle()

    if (fetchErr) {
      setTransferActionId(null)
      console.error(fetchErr)
      setTransferReqsError(`Failed to read user passes: ${fetchErr.message}`)
      return
    }

    const currentPasses = Number((u as any)?.passes ?? 0)
    if (!Number.isFinite(currentPasses) || currentPasses < amt) {
      setTransferActionId(null)
      setTransferReqsError('Cannot approve: user does not have enough passes.')
      return
    }

    const { error: updateErr } = await supabase
      .from('users')
      .update({ passes: currentPasses - amt })
      .eq('email', req.email)

    if (updateErr) {
      setTransferActionId(null)
      console.error(updateErr)
      setTransferReqsError(`Failed to update passes: ${updateErr.message}`)
      return
    }

    const { error: deleteErr } = await supabase
      .from('pass_transfer_requests')
      .delete()
      .eq('id', req.id)

    setTransferActionId(null)

    if (deleteErr) {
      console.error(deleteErr)
      setTransferReqsError(`Passes updated but request not deleted: ${deleteErr.message}`)
      return
    }

    setTransferReqs((prev) => prev.filter((r) => r.id !== req.id))

    // optional: sync admin pass list if it’s loaded
    setUsers((prev) =>
      prev.map((row) =>
        row.email === req.email ? { ...row, passes: Math.max(0, row.passes - amt) } : row
      )
    )

    // optional: sync the currently logged-in user if same person
    setUser((prev) =>
      prev?.email === req.email ? { ...prev, passes: Math.max(0, (prev.passes ?? 0) - amt) } : prev
    )
  }


  useEffect(() => {
    if (view === 'admin' && adminTab === 'passCount' && isAdmin) {
      void loadUsers()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, adminTab, isAdmin])

  useEffect(() => {
    if (view === 'admin' && adminTab === 'passTransferRequests' && isAdmin) {
      void loadTransferRequests()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, adminTab, isAdmin])

  useEffect(() => {
    if (user?.email) {
      void loadMyPendingTransfer(user.email)
    } else {
      setPendingTransfer(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email])

  useEffect(() => {
    if (view === 'admin' && adminTab === 'incentivePassRequests' && isAdmin) {
      void loadIncentiveRequests()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, adminTab, isAdmin])


  const savePasses = async (rowEmail: string) => {
    setUsersError('')
    setSavingEmail(rowEmail)

    const raw = (draftPasses[rowEmail] ?? '').trim()
    const parsed = Number(raw)

    if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
      setSavingEmail(null)
      setUsersError('Passes must be a whole number (0 or more).')
      return
    }

    const { error } = await supabase
      .from('users')
      .update({ passes: parsed })
      .eq('email', rowEmail)

    setSavingEmail(null)

    if (error) {
      console.error(error)
      setUsersError(`Failed to update passes for ${rowEmail}: ${error.message}`)
      return
    }

    setUsers((prev) =>
      prev.map((u) => (u.email === rowEmail ? { ...u, passes: parsed } : u))
    )
  }

  return (
    <div className="page">
      {/* HEADER */}
      <div className="headerBar">
        <img src="/fightingLogo.png" className="headerLogo" alt="Fighting Fourth" />
        <div className="headerTitle">Fighters Pass Tracker</div>

        <div className="headerRight">
          {/* only admins can see Admin Portal, only on pass view */}
          {isAdmin && view === 'pass' && (
            <button className="btn btnSmall" type="button" onClick={enterAdmin}>
              Admin Portal
            </button>
          )}

          {/* back only in admin */}
          {view === 'admin' && (
            <button className="btn btnSmall" type="button" onClick={exitAdmin}>
              Back
            </button>
          )}
        </div>
      </div>

      {/* MAIN */}
      <div className="mainArea">
        {!user ? (
          // LOGIN
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
        ) : view === 'admin' ? (
          // ADMIN
          <div className="adminShell">
            <aside className="adminNav">
              <div className="adminNavTitle">Admin</div>

              <button
                className={`btn btnGold adminTabBtn ${adminTab === 'passCount' ? 'active' : ''}`}
                type="button"
                onClick={() => setAdminTab('passCount')}
              >
                Pass Count
              </button>

              <button
                className={`btn btnGold adminTabBtn ${adminTab === 'passTransferRequests' ? 'active' : ''}`}
                type="button"
                onClick={() => setAdminTab('passTransferRequests')}
              >
                Pass Transfer Requests
              </button>

              <button
                className={`btn btnGold adminTabBtn ${adminTab === 'incentivePassRequests' ? 'active' : ''}`}
                type="button"
                onClick={() => setAdminTab('incentivePassRequests')}
              >
                Incentive Pass Requests
              </button>

              <div className="adminNavSpacer" />

              <button className="btn btnSmall" type="button" onClick={signOut}>
                Sign out
              </button>
            </aside>

            <section className="adminContent">
              {adminTab === 'passCount' ? (
                <>
                  <div className="adminTopRow">
                    <div>
                      <div className="adminTitle">Pass Count</div>
                      <div className="adminSub">
                        Adjust pass balances and click Save.
                      </div>
                    </div>

                    <button
                      className="btn btnSmall"
                      type="button"
                      onClick={loadUsers}
                      disabled={usersLoading}
                    >
                      {usersLoading ? 'Refreshing…' : 'Refresh'}
                    </button>
                  </div>

                  {usersError && <div className="error" style={{ marginTop: 10 }}>{usersError}</div>}

                  <div className="adminList">
                    {usersLoading ? (
                      <div className="adminEmpty">Loading users…</div>
                    ) : users.length === 0 ? (
                      <div className="adminEmpty">No users found.</div>
                    ) : (
                      users.map((u) => (
                        <div className="adminRow" key={u.email}>
                          <div className="adminRowLeft">
                            <div className="adminRowName">{u.name}</div>
                            <div className="adminRowEmail">{u.email}</div>
                          </div>

                          <div className="adminRowRight">
                            <div className="adminRowLabel">Passes</div>
                            <input
                              className="adminPassInput"
                              type="number"
                              min={0}
                              step={1}
                              value={draftPasses[u.email] ?? String(u.passes ?? 0)}
                              onChange={(e) =>
                                setDraftPasses((prev) => ({
                                  ...prev,
                                  [u.email]: e.target.value,
                                }))
                              }
                            />
                            <button
                              className="btn btnGold btnSmall"
                              type="button"
                              onClick={() => savePasses(u.email)}
                              disabled={savingEmail === u.email}
                            >
                              {savingEmail === u.email ? 'Saving…' : 'Save'}
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </>
                            ) : adminTab === 'passTransferRequests' ? (
                <>
                  <div className="adminTopRow">
                    <div>
                      <div className="adminTitle">Pass Transfer Requests</div>
                      <div className="adminSub">Approve to remove passes from this system.</div>
                    </div>

                    <button
                      className="btn btnSmall"
                      type="button"
                      onClick={loadTransferRequests}
                      disabled={transferReqsLoading}
                    >
                      {transferReqsLoading ? 'Refreshing…' : 'Refresh'}
                    </button>
                  </div>

                  {transferReqsError && (
                    <div className="error" style={{ marginTop: 10 }}>
                      {transferReqsError}
                    </div>
                  )}

                  <div className="adminList">
                    {transferReqsLoading ? (
                      <div className="adminEmpty">Loading requests…</div>
                    ) : transferReqs.length === 0 ? (
                      <div className="adminEmpty">No pending transfer requests.</div>
                    ) : (
                      transferReqs.map((r) => (
                        <div className="adminRow" key={r.id}>
                          <div className="adminRowLeft">
                            <div className="adminRowName">{r.name ?? 'Unknown name'}</div>
                            <div className="adminRowEmail">{r.email}</div>
                          </div>

                          <div className="adminRowRight">
                            <div className="adminRowLabel">Requested</div>
                            <div style={{ fontWeight: 800, color: 'rgba(201,162,74,0.95)' }}>
                              {r.amount}
                            </div>

                            <button
                              className="btn btnGold btnSmall"
                              type="button"
                              onClick={() => approveTransferRequest(r)}
                              disabled={transferActionId === r.id}
                            >
                              {transferActionId === r.id ? 'Working…' : 'Approve'}
                            </button>

                            <button
                              className="btn btnSmall"
                              type="button"
                              onClick={() => denyTransferRequest(r)}
                              disabled={transferActionId === r.id}
                            >
                              Deny
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="adminTopRow">
                    <div>
                      <div className="adminTitle">Incentive Pass Requests</div>
                      <div className="adminSub">Approve adds passes to Passes Remaining.</div>
                    </div>

                    <button
                      className="btn btnSmall"
                      type="button"
                      onClick={loadIncentiveRequests}
                      disabled={incentiveReqsLoading}
                    >
                      {incentiveReqsLoading ? 'Refreshing…' : 'Refresh'}
                    </button>
                  </div>

                  {incentiveReqsError && (
                    <div className="error" style={{ marginTop: 10 }}>
                      {incentiveReqsError}
                    </div>
                  )}

                  <div className="adminList">
                    {incentiveReqsLoading ? (
                      <div className="adminEmpty">Loading requests…</div>
                    ) : incentiveReqs.length === 0 ? (
                      <div className="adminEmpty">No incentive requests.</div>
                    ) : (
                      incentiveReqs.map((r) => (
                        <div className="adminRow" key={r.id}>
                          <div className="adminRowLeft">
                            <div className="adminRowName">{r.name ?? 'Unknown name'}</div>
                            <div className="adminRowEmail">{r.email}</div>

                            <div className="adminSub" style={{ marginTop: 6 }}>
                              {r.reason}
                            </div>
                          </div>

                          <div className="adminRowRight">
                            <div className="adminRowLabel">Requested</div>
                            <div style={{ fontWeight: 800, color: 'rgba(201,162,74,0.95)' }}>
                              {r.amount}
                            </div>

                            <button
                              className="btn btnGold btnSmall"
                              type="button"
                              onClick={() => approveIncentiveRequest(r)}
                              disabled={incentiveActionId === r.id}
                            >
                              {incentiveActionId === r.id ? 'Working…' : 'Approve'}
                            </button>

                            <button
                              className="btn btnSmall"
                              type="button"
                              onClick={() => denyIncentiveRequest(r)}
                              disabled={incentiveActionId === r.id}
                            >
                              Deny
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}

              </section>
            </div>

        ) : (
          // PASS PAGE
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
              <button
                className="btn btnGold"
                type="button"
                disabled={!!pendingTransfer}
                onClick={() => {
                  setTransferAmount(1)
                  setShowTransferUI((v) => !v)
                }}
              >
                Request Pass Transfer
              </button>

              <button
                className="btn btnGold"
                type="button"
                onClick={() => {
                  setIncentiveMsg('')
                  setIncentiveAmount(1)
                  setIncentiveReason('')
                  setShowIncentiveUI((v) => !v)
                }}
              >
                Request Incentive Passes
              </button>

              <button className="btn" type="button" onClick={signOut}>
                Sign out
              </button>
            </div>

            {showIncentiveUI && (
              <div style={{ marginTop: 14, display: 'grid', gap: 10, maxWidth: 520 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 13 }}>Passes to add:</div>

                  <input
                    className="input"
                    style={{ width: 160, padding: '10px 12px' }}
                    type="number"
                    min={1}
                    step={1}
                    value={incentiveAmount}
                    onChange={(e) => setIncentiveAmount(Number(e.target.value))}
                  />

                  <button
                    className="btn btnGold btnSmall"
                    type="button"
                    onClick={submitIncentiveRequest}
                    disabled={incentiveLoading}
                  >
                    {incentiveLoading ? 'Submitting…' : 'Submit'}
                  </button>

                  <button
                    className="btn btnSmall"
                    type="button"
                    onClick={() => setShowIncentiveUI(false)}
                    disabled={incentiveLoading}
                  >
                    Cancel
                  </button>
                </div>

                <textarea
                  className="input"
                  style={{ minHeight: 90, resize: 'vertical' }}
                  placeholder="Reason / description..."
                  value={incentiveReason}
                  onChange={(e) => setIncentiveReason(e.target.value)}
                />

                {incentiveMsg && <div className="loginSub">{incentiveMsg}</div>}
              </div>
            )}


            {showTransferUI && (
              <div
                style={{
                  marginTop: 14,
                  display: 'flex',
                  gap: 10,
                  flexWrap: 'wrap',
                  alignItems: 'center',
                }}
              >
                <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 13 }}>
                  Amount:
                </div>

                <select
                  className="input"
                  style={{ width: 160, padding: '10px 12px' }}
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(Number(e.target.value))}
                >
                  {Array.from({ length: Math.max(0, user.passes) }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>

                <button
                  className="btn btnGold btnSmall"
                  type="button"
                  onClick={submitTransferRequest}
                  disabled={transferLoading}
                >
                  {transferLoading ? 'Submitting…' : 'Submit'}
                </button>

                <button
                  className="btn btnSmall"
                  type="button"
                  onClick={() => setShowTransferUI(false)}
                  disabled={transferLoading}
                >
                  Cancel
                </button>
              </div>
            )}

            {pendingTransfer && (
              <div className="loginSub" style={{ marginTop: 10 }}>
                Transfer request pending for <b>{pendingTransfer.amount}</b> passes.
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  )

}
