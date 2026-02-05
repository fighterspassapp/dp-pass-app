import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import './App.css'

/* ========= PASSWORD HASH HELPERS (ADD HERE) ========= */

function bytesToBase64(bytes: Uint8Array) {
  let s = ''
  bytes.forEach((b) => (s += String.fromCharCode(b)))
  return btoa(s)
}

function base64ToBytes(b64: string) {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

async function hashPasswordPBKDF2(password: string, saltBytes: Uint8Array) {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  )

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: saltBytes as unknown as ArrayBuffer,
      iterations: 150_000,
    },
    keyMaterial,
    256
  )

  return bytesToBase64(new Uint8Array(bits))
}

function makeSaltBytes() {
  const salt = new Uint8Array(16)
  crypto.getRandomValues(salt)
  return salt
}

const STORAGE_KEY = 'fighters_pass_tracker_email'

/* ========= END PASSWORD HELPERS ========= */


type UserRow = {
  name: string
  email: string
  passes: number
  cdnas: number
  is_admin: boolean
  on_probation: boolean
  password_hash?: string | null
  password_salt?: string | null
}


type UserListRow = {
  name: string
  email: string
  passes: number
  cdnas: number
  on_probation?: boolean | null
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
type AdminTab =
  | 'passCount'
  | 'passTransferRequests'
  | 'incentivePassRequests'
  | 'cdnaCount'
  | 'cdnaTransferRequests'
  | 'cdnaIncentiveRequests'
  | 'probationStatus'


function lastNameKey(fullName: string) {
  const name = (fullName ?? '').trim().toLowerCase()
  if (!name) return ''

  // Supports "Last, First" format
  if (name.includes(',')) {
    return name.split(',')[0].trim()
  }

  // Default: take last token as last name ("First Middle Last")
  const parts = name.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0]

  // Handle common suffixes
  const suffixes = new Set(['jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv', 'v'])
  let last = parts[parts.length - 1]
  if (suffixes.has(last) && parts.length >= 2) {
    last = parts[parts.length - 2]
  }
  return last
}


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

  // ===== CDNA request UI state =====
  const [showCdnaTransferUI, setShowCdnaTransferUI] = useState(false)
  const [cdnaTransferAmount, setCdnaTransferAmount] = useState(1)
  const [cdnaTransferLoading, setCdnaTransferLoading] = useState(false)
  const [cdnaPendingTransfer, setCdnaPendingTransfer] = useState<PassTransferRequestRow | null>(null)

  const [showCdnaIncentiveUI, setShowCdnaIncentiveUI] = useState(false)
  const [cdnaIncentiveAmount, setCdnaIncentiveAmount] = useState(1)
  const [cdnaIncentiveReason, setCdnaIncentiveReason] = useState('')
  const [cdnaIncentiveLoading, setCdnaIncentiveLoading] = useState(false)
  const [cdnaIncentiveMsg, setCdnaIncentiveMsg] = useState('')

  const [cdnaTransferReqs, setCdnaTransferReqs] = useState<PassTransferRequestRow[]>([])
  const [cdnaTransferReqsLoading, setCdnaTransferReqsLoading] = useState(false)
  const [cdnaTransferReqsError, setCdnaTransferReqsError] = useState('')
  const [cdnaTransferActionId, setCdnaTransferActionId] = useState<number | null>(null)

  const [cdnaIncentiveReqs, setCdnaIncentiveReqs] = useState<IncentivePassRequestRow[]>([])
  const [cdnaIncentiveReqsLoading, setCdnaIncentiveReqsLoading] = useState(false)
  const [cdnaIncentiveReqsError, setCdnaIncentiveReqsError] = useState('')
  const [cdnaIncentiveActionId, setCdnaIncentiveActionId] = useState<number | null>(null)

  const [adminUserSearch, setAdminUserSearch] = useState('')



  const loadCdnaTransferRequests = async () => {
    setCdnaTransferReqsError('')
    setCdnaTransferReqsLoading(true)

    const { data, error } = await supabase
      .from('cdna_transfer_requests')
      .select('id, name, email, amount, created_at')
      .order('created_at', { ascending: true })

    setCdnaTransferReqsLoading(false)

    if (error) {
      console.error(error)
      setCdnaTransferReqsError(`Failed to load CDNA transfer requests: ${error.message}`)
      return
    }

    setCdnaTransferReqs((data ?? []) as PassTransferRequestRow[])
  }

  const denyCdnaTransferRequest = async (req: PassTransferRequestRow) => {
    setCdnaTransferReqsError('')
    setCdnaTransferActionId(req.id)

    const { error } = await supabase
      .from('cdna_transfer_requests')
      .delete()
      .eq('id', req.id)

    setCdnaTransferActionId(null)

    if (error) {
      console.error(error)
      setCdnaTransferReqsError(`Failed to deny request: ${error.message}`)
      return
    }

    setCdnaTransferReqs((prev) => prev.filter((r) => r.id !== req.id))
  }

  const approveCdnaTransferRequest = async (req: PassTransferRequestRow) => {
    setCdnaTransferReqsError('')
    setCdnaTransferActionId(req.id)

    const amt = Number(req.amount)

    const { data: u, error: fetchErr } = await supabase
      .from('users')
      .select('cdnas')
      .eq('email', req.email)
      .maybeSingle()

    if (fetchErr) {
      setCdnaTransferActionId(null)
      console.error(fetchErr)
      setCdnaTransferReqsError(`Failed to read user CDNAs: ${fetchErr.message}`)
      return
    }

    const current = Number((u as any)?.cdnas ?? 0)
    if (!Number.isFinite(current) || current < amt) {
      setCdnaTransferActionId(null)
      setCdnaTransferReqsError('Cannot approve: user does not have enough CDNAs.')
      return
    }

    const { error: updateErr } = await supabase
      .from('users')
      .update({ cdnas: current - amt })
      .eq('email', req.email)

    if (updateErr) {
      setCdnaTransferActionId(null)
      console.error(updateErr)
      setCdnaTransferReqsError(`Failed to update CDNAs: ${updateErr.message}`)
      return
    }

    const { error: deleteErr } = await supabase
      .from('cdna_transfer_requests')
      .delete()
      .eq('id', req.id)

    setCdnaTransferActionId(null)

    if (deleteErr) {
      console.error(deleteErr)
      setCdnaTransferReqsError(`CDNAs updated but request not deleted: ${deleteErr.message}`)
      return
    }

    setCdnaTransferReqs((prev) => prev.filter((r) => r.id !== req.id))

    // sync admin list if loaded
    setUsers((prev) =>
      prev.map((row) =>
        row.email === req.email ? { ...row, cdnas: Math.max(0, row.cdnas - amt) } : row
      )
    )

    // sync logged in user display if same person
    setUser((prev) =>
      prev?.email === req.email ? { ...prev, cdnas: Math.max(0, (prev.cdnas ?? 0) - amt) } : prev
    )
  }
  
  const loadCdnaIncentiveRequests = async () => {
    setCdnaIncentiveReqsError('')
    setCdnaIncentiveReqsLoading(true)

    const { data, error } = await supabase
      .from('cdna_incentive_requests')
      .select('id, name, email, amount, reason, created_at')
      .order('created_at', { ascending: true })

    setCdnaIncentiveReqsLoading(false)

    if (error) {
      console.error(error)
      setCdnaIncentiveReqsError(`Failed to load incentive requests: ${error.message}`)
      return
    }

    setCdnaIncentiveReqs((data ?? []) as IncentivePassRequestRow[])
  }

  const denyCdnaIncentiveRequest = async (req: IncentivePassRequestRow) => {
    setCdnaIncentiveReqsError('')
    setCdnaIncentiveActionId(req.id)

    const { error } = await supabase
      .from('cdna_incentive_requests')
      .delete()
      .eq('id', req.id)

    setCdnaIncentiveActionId(null)

    if (error) {
      console.error(error)
      setCdnaIncentiveReqsError(`Failed to deny request: ${error.message}`)
      return
    }

    setCdnaIncentiveReqs((prev) => prev.filter((r) => r.id !== req.id))
  }

  const approveCdnaIncentiveRequest = async (req: IncentivePassRequestRow) => {
    setCdnaIncentiveReqsError('')
    setCdnaIncentiveActionId(req.id)

    const amt = Number(req.amount)

    const { data: u, error: fetchErr } = await supabase
      .from('users')
      .select('cdnas')
      .eq('email', req.email)
      .maybeSingle()

    if (fetchErr) {
      setCdnaIncentiveActionId(null)
      console.error(fetchErr)
      setCdnaIncentiveReqsError(`Failed to read CDNAs: ${fetchErr.message}`)
      return
    }

    const current = Number((u as any)?.cdnas ?? 0)
    if (!Number.isFinite(current)) {
      setCdnaIncentiveActionId(null)
      setCdnaIncentiveReqsError('Failed to read current CDNA balance.')
      return
    }

    const { error: updateErr } = await supabase
      .from('users')
      .update({ cdnas: current + amt })
      .eq('email', req.email)

    if (updateErr) {
      setCdnaIncentiveActionId(null)
      console.error(updateErr)
      setCdnaIncentiveReqsError(`Failed to update CDNAs: ${updateErr.message}`)
      return
    }

    const { error: deleteErr } = await supabase
      .from('cdna_incentive_requests')
      .delete()
      .eq('id', req.id)

    setCdnaIncentiveActionId(null)

    if (deleteErr) {
      console.error(deleteErr)
      setCdnaIncentiveReqsError(`CDNAs updated but request not deleted: ${deleteErr.message}`)
      return
    }

    setCdnaIncentiveReqs((prev) => prev.filter((r) => r.id !== req.id))

    // sync admin list
    setUsers((prev) =>
      prev.map((row) =>
        row.email === req.email ? { ...row, cdnas: (row.cdnas ?? 0) + amt } : row
      )
    )

    // sync logged in user if same
    setUser((prev) =>
      prev?.email === req.email ? { ...prev, cdnas: (prev.cdnas ?? 0) + amt } : prev
    )
  }







  const loadMyPendingCdnaTransfer = async (userEmail: string) => {
    const { data, error } = await supabase
      .from('cdna_transfer_requests')
      .select('id, name, email, amount, created_at')
      .eq('email', userEmail)
      .order('created_at', { ascending: false })
      .limit(1)

    if (error) {
      console.error(error)
      setCdnaPendingTransfer(null)
      return
    }

    const row = (data ?? [])[0] as PassTransferRequestRow | undefined
    setCdnaPendingTransfer(row ?? null)
  }



  const submitCdnaTransferRequest = async () => {
    if (!user) return

    setCdnaTransferLoading(true)

    const max = Number(user.cdnas ?? 0)
    const amt = Number(cdnaTransferAmount)

    if (!Number.isInteger(amt) || amt < 1) {
      setCdnaTransferLoading(false)
      return
    }

    if (amt > max) {
      setCdnaTransferLoading(false)
      return
    }

    const { error } = await supabase.from('cdna_transfer_requests').insert({
      email: user.email,
      name: user.name,
      amount: amt,
    })

    setCdnaTransferLoading(false)

    if (error) {
      console.error(error)
      return
    }

    if (user?.email) void loadMyPendingCdnaTransfer(user.email)
    setShowCdnaTransferUI(false)
    setCdnaTransferAmount(1)
  }

  const submitCdnaIncentiveRequest = async () => {
    if (!user) return

    setCdnaIncentiveMsg('')
    setCdnaIncentiveLoading(true)

    const amt = Number(cdnaIncentiveAmount)
    if (!Number.isInteger(amt) || amt < 1) {
      setCdnaIncentiveLoading(false)
      setCdnaIncentiveMsg('Enter a valid number of CDNAs.')
      return
    }

    const reason = cdnaIncentiveReason.trim()
    if (!reason) {
      setCdnaIncentiveLoading(false)
      setCdnaIncentiveMsg('Please add a reason.')
      return
    }

    const { error } = await supabase.from('cdna_incentive_requests').insert({
      email: user.email,
      name: user.name,
      amount: amt,
      reason,
    })

    setCdnaIncentiveLoading(false)

    if (error) {
      console.error(error)
      setCdnaIncentiveMsg(`Request failed: ${error.message}`)
      return
    }

    setCdnaIncentiveMsg('CDNA request submitted.')
    setShowCdnaIncentiveUI(false)
    setCdnaIncentiveAmount(1)
    setCdnaIncentiveReason('')
  }


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

    if (user.on_probation) {
      setTransferLoading(false)
      return
    }



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
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [needsPasswordSetup, setNeedsPasswordSetup] = useState(false)

  const [keepSignedIn, setKeepSignedIn] = useState(false)  

  // navigation state
  const [view, setView] = useState<View>('pass')
  const [adminTab, setAdminTab] = useState<AdminTab>('passCount')

  type Area = 'menu' | 'passes' | 'cdna'
  const [area, setArea] = useState<Area>('menu')


  // admin state
  const [users, setUsers] = useState<UserListRow[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersError, setUsersError] = useState('')
  const [savingEmail, setSavingEmail] = useState<string | null>(null)

  // editable pass inputs
  const [draftPasses, setDraftPasses] = useState<Record<string, string>>({})

  const [draftCdnas, setDraftCdnas] = useState<Record<string, string>>({})

  const [draftProbation, setDraftProbation] = useState<Record<string, boolean>>({})



  const isAdmin = user?.is_admin === true

  const submitCreatePassword = async () => {
    if (!user) return

    setError('')

    const p1 = password.trim()
    const p2 = confirmPassword.trim()

    if (p1.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    if (p1 !== p2) {
      setError('Passwords do not match.')
      return
    }

    const saltBytes = makeSaltBytes()
    const hash = await hashPasswordPBKDF2(p1, saltBytes)

    const { error: updateErr } = await supabase
      .from('users')
      .update({
        password_salt: bytesToBase64(saltBytes),
        password_hash: hash,
      })
      .eq('email', user.email)

    if (updateErr) {
      setError(`Failed to set password: ${updateErr.message}`)
      return
    }

    // keep local user state in sync so you don't need a refresh
    setUser((prev) =>
      prev
        ? { ...prev, password_salt: bytesToBase64(saltBytes), password_hash: hash }
        : prev
    )

    setNeedsPasswordSetup(false)
    setPassword('')
    setConfirmPassword('')
    setView('pass')
    setArea('menu')
  }

  const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault() // prevents page refresh so state changes actually show

      setError('')
      setLoading(true)

      const normalizedEmail = email.trim().toLowerCase()

      const { data, error } = await supabase
        .from('users')
        .select('name, email, passes, cdnas, is_admin, on_probation, password_hash, password_salt')
        .eq('email', normalizedEmail)
        .maybeSingle()

      setLoading(false)

      if (error) {
        setError(`Database error: ${error.message}`)
        return
      }

      if (!data) {
        setError('Email not found in system')
        return
      }

      const row = data as UserRow
      const hasPassword = !!row.password_hash && !!row.password_salt

      // If password exists, require it
      if (hasPassword) {
        if (!password) {
          setError('Incorrect password')
          return
        }

        const saltBytes = base64ToBytes(row.password_salt!)
        const attemptedHash = await hashPasswordPBKDF2(password, saltBytes)

        if (attemptedHash !== row.password_hash) {
          setError('Incorrect password')
          return
        }

        if (keepSignedIn) {
          localStorage.setItem(STORAGE_KEY, row.email)
        } else {
          localStorage.removeItem(STORAGE_KEY)
        }


        // success login
        setNeedsPasswordSetup(false)
        setUser(row)
        setView('pass')
        setArea('menu')
        return
      }

      // No password set yet → go to creation screen
      setNeedsPasswordSetup(true)
      setUser(row)
      setError('')
    }


  const signOut = () => {
    setUser(null)
    setEmail('')
    setError('')
    setNeedsPasswordSetup(false)
    setPassword('')
    setConfirmPassword('')
    setArea('menu')
    setView('pass')
    setAdminTab('passCount')
    setUsers([])
    setDraftPasses({})
    setUsersError('')
    setSavingEmail(null)
    localStorage.removeItem(STORAGE_KEY)
    setDraftProbation({})


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
      .select('name, email, passes, cdnas, on_probation')
      .order('name', { ascending: true })

    setUsersLoading(false)

    if (error) {
      console.error(error)
      setUsersError(`Failed to load users: ${error.message}`)
      return
    }

    const rows = (data ?? []) as UserListRow[]

    rows.sort((a, b) => {
      const al = lastNameKey(a.name)
      const bl = lastNameKey(b.name)
      if (al !== bl) return al.localeCompare(bl)
      // tie-breaker: first+middle names
      return (a.name ?? '').localeCompare(b.name ?? '')
    })

setUsers(rows)


    const nextPassDraft: Record<string, string> = {}
    const nextCdnaDraft: Record<string, string> = {}
    const nextProbationDraft: Record<string, boolean> = {}

    for (const r of rows) {
      nextPassDraft[r.email] = String(r.passes ?? 0)
      nextCdnaDraft[r.email] = String((r as any).cdnas ?? 0)
      nextProbationDraft[r.email] = r.on_probation === true
    }

    setDraftPasses(nextPassDraft)
    setDraftCdnas(nextCdnaDraft)
    setDraftProbation(nextProbationDraft)

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

  useEffect(() => {
    if (user?.email) {
      void loadMyPendingCdnaTransfer(user.email)
    } else {
      setCdnaPendingTransfer(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email])

  useEffect(() => {
    const savedEmail = localStorage.getItem(STORAGE_KEY)
    if (!savedEmail) return
    if (user) return // already logged in

    const autoLogin = async () => {
      const { data, error } = await supabase
        .from('users')
        .select('name, email, passes, cdnas, is_admin, on_probation, password_hash, password_salt')
        .eq('email', savedEmail)
        .maybeSingle()

      if (error || !data) {
        localStorage.removeItem(STORAGE_KEY)
        return
      }

      setKeepSignedIn(true)
      setNeedsPasswordSetup(false)
      setUser(data as UserRow)
      setView('pass')
      setArea('menu')
    }

    void autoLogin()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])



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

  const saveCdnas = async (rowEmail: string) => {
    setUsersError('')
    setSavingEmail(rowEmail)

    const raw = (draftCdnas[rowEmail] ?? '').trim()
    const parsed = Number(raw)

    if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
      setSavingEmail(null)
      setUsersError('CDNAs must be a whole number (0 or more).')
      return
    }

    const { error } = await supabase
      .from('users')
      .update({ cdnas: parsed })
      .eq('email', rowEmail)

    setSavingEmail(null)

    if (error) {
      console.error(error)
      setUsersError(`Failed to update CDNAs for ${rowEmail}: ${error.message}`)
      return
    }

    setUsers((prev) =>
      prev.map((u) => (u.email === rowEmail ? { ...u, cdnas: parsed } : u))
    )
  }

  const saveProbation = async (email: string) => {
    setUsersError('')
    setSavingEmail(email)

    const nextVal = !!draftProbation[email]

    const { error } = await supabase
      .from('users')
      .update({ on_probation: nextVal })
      .eq('email', email)

    setSavingEmail(null)

    if (error) {
      console.error(error)
      setUsersError(`Failed to save probation: ${error.message}`)
      return
    }

    // update local list so the UI reflects immediately
    setUsers((prev) =>
      prev.map((u) => (u.email === email ? { ...u, on_probation: nextVal } : u))
    )
  }

  const normalizedAdminQuery = adminUserSearch.trim().toLowerCase()

  const filteredUsers =
    normalizedAdminQuery.length === 0
      ? users
      : users.filter((u) => {
          const name = (u.name ?? '').toLowerCase()
          const email = (u.email ?? '').toLowerCase()
          return name.includes(normalizedAdminQuery) || email.includes(normalizedAdminQuery)
        })




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
              <input
                className="input"
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />

              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>
                <input
                  type="checkbox"
                  checked={keepSignedIn}
                  onChange={(e) => setKeepSignedIn(e.target.checked)}
                />
                Keep me signed in
              </label>



              <button className="btn btnGold" type="submit" disabled={loading}>
                {loading ? 'Checking…' : 'Continue'}
              </button>

              {error && <div className="error">{error}</div>}
            </form>
          </div>
        ) : needsPasswordSetup ? (
          // CREATE PASSWORD SCREEN
          <div className="loginPanel">
            <h2 className="loginTitle">Create a password</h2>
            <p className="loginSub">First time login for {user.email}. Create a password to continue.</p>

            <div className="login">
              <input
                className="input"
                type="password"
                placeholder="New password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />

              <input
                className="input"
                type="password"
                placeholder="Confirm password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />

              <button className="btn btnGold" type="button" onClick={submitCreatePassword}>
                Save Password
              </button>

              <button className="btn" type="button" onClick={signOut}>
                Cancel
              </button>

              {error && <div className="error">{error}</div>}
            </div>
          </div>
        ) : view === 'admin' ? (
          // ADMIN
          <div className="adminShell">
            <aside className="adminNav">
              <div className="adminNavTitle">Admin</div>


              <button
                className={`btn btnBlueMetal adminTabBtn ${adminTab === 'probationStatus' ? 'active' : ''}`}

                type="button"
                onClick={() => {
                  setAdminTab('probationStatus')
                  loadUsers()
                }}
              >
                Probation Status
              </button>

              <button
                className={`btn btnRedMetal adminTabBtn ${adminTab === 'cdnaCount' ? 'active' : ''}`}
                type="button"
                onClick={() => {
                  setAdminTab('cdnaCount')
                  loadUsers()
                }}
              >
                CDNA Count
              </button>


              <button
                className={`btn btnRedMetal adminTabBtn ${adminTab === 'cdnaTransferRequests' ? 'active' : ''}`}
                type="button"
                onClick={() => {
                  setAdminTab('cdnaTransferRequests')
                  loadCdnaTransferRequests()
                }}
              >
                Requests to Use CDNAs

              </button>

              <button
                className={`btn btnRedMetal adminTabBtn ${adminTab === 'cdnaIncentiveRequests' ? 'active' : ''}`}
                type="button"
                onClick={() => {
                  setAdminTab('cdnaIncentiveRequests')
                  loadCdnaIncentiveRequests()
                }}
              >
                Incentive CDNA Requests
              </button>




              <button
                className={`btn btnSilver adminTabBtn ${adminTab === 'passCount' ? 'active' : ''}`}
                type="button"
                onClick={() => setAdminTab('passCount')}
              >
                Pass Count
              </button>

              <button
                className={`btn btnSilver adminTabBtn ${adminTab === 'passTransferRequests' ? 'active' : ''}`}
                type="button"
                onClick={() => setAdminTab('passTransferRequests')}
              >
                FN Pass Transfer Requests

              </button>

              <button
                className={`btn btnSilver adminTabBtn ${adminTab === 'incentivePassRequests' ? 'active' : ''}`}
                type="button"
                onClick={() => setAdminTab('incentivePassRequests')}
              >
                Incentive Pass Requests
              </button>



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
                    <div className="adminSub">Adjust pass balances and click Save.</div>
                  </div>

                  <input
                    className="adminPassInput adminSearchInput"
                    type="text"
                    placeholder="Search name or email…"
                    value={adminUserSearch}
                    onChange={(e) => setAdminUserSearch(e.target.value)}
                  />


                  <button className="btn btnSmall" type="button" onClick={loadUsers} disabled={usersLoading}>
                    {usersLoading ? 'Refreshing…' : 'Refresh'}
                  </button>
                </div>

                <div className="adminList">
                  {usersLoading ? (
                    <div className="adminEmpty">Loading users…</div>
                  ) : filteredUsers.length === 0 ? (
                    <div className="adminEmpty">No matching users.</div>
                  ) : (
                    filteredUsers.map((u) => (
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
          

            ): adminTab === 'probationStatus' ? (
                <>
                  <div className="adminTopRow">
                    <div>
                      <div className="adminTitle">Probation Status</div>
                      <div className="adminSub">Toggle probation on/off and click Save.</div>
                    </div>

                    {/* SEARCH BAR */}
                    <input
                      className="adminPassInput adminSearchInput"
                      type="text"
                      placeholder="Search name or email…"
                      value={adminUserSearch}
                      onChange={(e) => setAdminUserSearch(e.target.value)}
                    />


                    <button className="btn btnSmall" type="button" onClick={loadUsers} disabled={usersLoading}>
                      {usersLoading ? 'Refreshing…' : 'Refresh'}
                    </button>
                  </div>


                  {usersError && (
                    <div className="error" style={{ marginTop: 10 }}>
                      {usersError}
                    </div>
                  )}

                   <div className="adminList">
                    {usersLoading ? (
                      <div className="adminEmpty">Loading users…</div>
                    ) : filteredUsers.length === 0 ? (
                      <div className="adminEmpty">No matching users.</div>
                    ) : (
                      filteredUsers.map((u) => (
                        <div className="adminRow" key={u.email}>
                          <div className="adminRowLeft">
                            <div className="adminRowName">{u.name}</div>
                            <div className="adminRowEmail">{u.email}</div>
                          </div>

                          <div className="adminRowRight">
                            <div className="adminRowLabel">Probation</div>

                            <select
                              className="adminPassInput"
                              value={draftProbation[u.email] ? 'yes' : 'no'}
                              onChange={(e) =>
                                setDraftProbation((prev) => ({
                                  ...prev,
                                  [u.email]: e.target.value === 'yes',
                                }))
                              }
                            >
                              <option value="no">No</option>
                              <option value="yes">Yes</option>
                            </select>

                            <button
                              className="btn btnGold btnSmall"
                              type="button"
                              onClick={() => saveProbation(u.email)}
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
                    <div className="adminTitle">Falcon Net Pass Transfer Requests</div>
                    <div className="adminSub">Approve removes passes from this system.</div>
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
                          <div style={{ fontWeight: 800, color: 'rgba(201,162,74,0.95)' }}>{r.amount}</div>

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
            ) : adminTab === 'incentivePassRequests' ? (
              <>
                <div className="adminTopRow">
                  <div>
                    <div className="adminTitle">Incentive Pass Requests</div>
                    <div className="adminSub">Approve adds passes to Passes Left.</div>
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
                          <div style={{ fontWeight: 800, color: 'rgba(201,162,74,0.95)' }}>{r.amount}</div>

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
            ) : adminTab === 'cdnaCount' ? (
              <>
                <div className="adminTopRow">
                  <div>
                    <div className="adminTitle">CDNA Count</div>
                    <div className="adminSub">Adjust CDNA balances and click Save.</div>
                  </div>

                  {/* SEARCH BAR */}
                  <input
                    className="adminPassInput adminSearchInput"
                    type="text"
                    placeholder="Search name or email…"
                    value={adminUserSearch}
                    onChange={(e) => setAdminUserSearch(e.target.value)}
                  />



                  <button className="btn btnSmall" type="button" onClick={loadUsers} disabled={usersLoading}>
                    {usersLoading ? 'Refreshing…' : 'Refresh'}
                  </button>
                </div>


                {usersError && (
                  <div className="error" style={{ marginTop: 10 }}>
                    {usersError}
                  </div>
                )}

                <div className="adminList">
                  {usersLoading ? (
                    <div className="adminEmpty">Loading users…</div>
                  ) : filteredUsers.length === 0 ? (
                    <div className="adminEmpty">No users found.</div>
                  ) : (
                    filteredUsers.map((u) => (
                      <div className="adminRow" key={u.email}>
                        <div className="adminRowLeft">
                          <div className="adminRowName">{u.name}</div>
                          <div className="adminRowEmail">{u.email}</div>
                        </div>

                        <div className="adminRowRight">
                          <div className="adminRowLabel">CDNAs</div>

                          <input
                            className="adminPassInput"
                            type="number"
                            min={0}
                            step={1}
                            value={draftCdnas[u.email] ?? String(u.cdnas ?? 0)}
                            onChange={(e) =>
                              setDraftCdnas((prev) => ({
                                ...prev,
                                [u.email]: e.target.value,
                              }))
                            }
                          />

                          <button
                            className="btn btnGold btnSmall"
                            type="button"
                            onClick={() => saveCdnas(u.email)}
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
            ) : adminTab === 'cdnaTransferRequests' ? (
              <>
                <div className="adminTopRow">
                  <div>
                    <div className="adminTitle">Requests to Use CDNAs</div>
                    <div className="adminSub">Approve removes CDNAs from this system.</div>
                  </div>

                  <button
                    className="btn btnSmall"
                    type="button"
                    onClick={loadCdnaTransferRequests}
                    disabled={cdnaTransferReqsLoading}
                  >
                    {cdnaTransferReqsLoading ? 'Refreshing…' : 'Refresh'}
                  </button>
                </div>

                {cdnaTransferReqsError && (
                  <div className="error" style={{ marginTop: 10 }}>
                    {cdnaTransferReqsError}
                  </div>
                )}

                <div className="adminList">
                  {cdnaTransferReqsLoading ? (
                    <div className="adminEmpty">Loading requests…</div>
                  ) : cdnaTransferReqs.length === 0 ? (
                    <div className="adminEmpty">No pending transfer requests.</div>
                  ) : (
                    cdnaTransferReqs.map((r) => (
                      <div className="adminRow" key={r.id}>
                        <div className="adminRowLeft">
                          <div className="adminRowName">{r.name ?? 'Unknown name'}</div>
                          <div className="adminRowEmail">{r.email}</div>
                        </div>

                        <div className="adminRowRight">
                          <div className="adminRowLabel">Requested</div>
                          <div style={{ fontWeight: 800, color: 'rgba(201,162,74,0.95)' }}>{r.amount}</div>

                          <button
                            className="btn btnGold btnSmall"
                            type="button"
                            onClick={() => approveCdnaTransferRequest(r)}
                            disabled={cdnaTransferActionId === r.id}
                          >
                            {cdnaTransferActionId === r.id ? 'Working…' : 'Approve'}
                          </button>

                          <button
                            className="btn btnSmall"
                            type="button"
                            onClick={() => denyCdnaTransferRequest(r)}
                            disabled={cdnaTransferActionId === r.id}
                          >
                            Deny
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            ) : adminTab === 'cdnaIncentiveRequests' ? (
              <>
                <div className="adminTopRow">
                  <div>
                    <div className="adminTitle">Incentive CDNA Requests</div>
                    <div className="adminSub">Approve adds CDNAs to CDNAs Left.</div>
                  </div>

                  <button
                    className="btn btnSmall"
                    type="button"
                    onClick={loadCdnaIncentiveRequests}
                    disabled={cdnaIncentiveReqsLoading}
                  >
                    {cdnaIncentiveReqsLoading ? 'Refreshing…' : 'Refresh'}
                  </button>
                </div>

                {cdnaIncentiveReqsError && (
                  <div className="error" style={{ marginTop: 10 }}>
                    {cdnaIncentiveReqsError}
                  </div>
                )}

                <div className="adminList">
                  {cdnaIncentiveReqsLoading ? (
                    <div className="adminEmpty">Loading requests…</div>
                  ) : cdnaIncentiveReqs.length === 0 ? (
                    <div className="adminEmpty">No incentive requests.</div>
                  ) : (
                    cdnaIncentiveReqs.map((r) => (
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
                          <div style={{ fontWeight: 800, color: 'rgba(201,162,74,0.95)' }}>{r.amount}</div>

                          <button
                            className="btn btnGold btnSmall"
                            type="button"
                            onClick={() => approveCdnaIncentiveRequest(r)}
                            disabled={cdnaIncentiveActionId === r.id}
                          >
                            {cdnaIncentiveActionId === r.id ? 'Working…' : 'Approve'}
                          </button>

                          <button
                            className="btn btnSmall"
                            type="button"
                            onClick={() => denyCdnaIncentiveRequest(r)}
                            disabled={cdnaIncentiveActionId === r.id}
                          >
                            Deny
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            ) : null }
          
          </section>


            </div>

        ) : (
          // PASS PAGE
          <div className="card">
            {area === 'menu' && (
              <>
                <div className="cardHeader">
                  <img src="/fightingLogo.png" className="logo" alt="Fighting Fourth" />

                  <div className="titleBlock">
                    <h1 className="name">{user.name}</h1>
                    <p className="email">{user.email}</p>
                  </div>
                </div>

                <div className="hr" />

                <div className="hr" />

                <div className="actions">
                  <button
                    className="btn btnGold"
                    type="button"
                    onClick={() => {
                      setArea('passes')
                      setShowTransferUI(false)
                      setShowIncentiveUI(false)
                    }}
                  >
                    Passes
                  </button>

                  <button
                    className="btn btnGold"
                    type="button"
                    onClick={() => {
                      setArea('cdna')
                      setShowCdnaTransferUI(false)
                      setShowCdnaIncentiveUI(false)
                    }}
                  >
                    CDNAs
                  </button>

                  <button className="btn" type="button" onClick={signOut}>
                    Sign out
                  </button>
                </div>
              </>
            )}


          {area === 'passes' && (
            <>
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
                disabled={!!pendingTransfer || user.on_probation}
                onClick={() => {
                  setTransferAmount(1)
                  setShowTransferUI((prev) => {
                    const next = !prev
                    if (next) setShowIncentiveUI(false)
                    return next
                  })
                }}
              >
                Request Transfer to Falcon Net

              </button>

              <button
                className="btn btnGold"
                type="button"
                onClick={() => {
                  setIncentiveMsg('')
                  setIncentiveAmount(1)
                  setIncentiveReason('')
                  setShowIncentiveUI((prev) => {
                    const next = !prev
                    if (next) setShowTransferUI(false)
                    return next
                  })
                }}
              >
                Request Incentive Passes
              </button>

              {/* NEW: Back to menu */}
              <button
                className="btn"
                type="button"
                onClick={() => {
                  setArea('menu')
                  setShowTransferUI(false)
                  setShowIncentiveUI(false)
                }}
              >
                Back
              </button>

              <button className="btn" type="button" onClick={signOut}>
                Sign out
              </button>
            </div>


            {user.on_probation && (
              <div className="loginSub" style={{ marginTop: 10 }}>
                You are currently on probation and cannot request a pass transfer.
              </div>
            )}

{showIncentiveUI && (
  <div
    style={{
      marginTop: 14,
      display: 'flex',
      gap: 20,
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
    }}
  >
    {/* LEFT SIDE: form */}
    <div style={{ display: 'grid', gap: 10, maxWidth: 520 }}>
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

    {/* RIGHT SIDE: helper text */}
    <div
      style={{
        maxWidth: 360,
        fontSize: 12,
        lineHeight: 1.5,
        color: 'rgba(255,255,255,0.6)',
      }}
    >
      If you have any pictures you would like to submit to aid in verification
      for an incentivized pass, please Teams it to Cadet NULL.
    </div>
  </div>
)}


{showTransferUI && (
  <div
    style={{
      marginTop: 14,
      display: 'flex',
      gap: 20,
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
    }}
  >
    {/* LEFT SIDE: form */}
    <div style={{ display: 'grid', gap: 10, maxWidth: 520 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 13 }}>Amount:</div>

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
    </div>

    {/* RIGHT SIDE: helper text */}
    <div
      style={{
        maxWidth: 360,
        fontSize: 12,
        lineHeight: 1.5,
        color: 'rgba(255,255,255,0.6)',
      }}
    >
      Pass transfer requests are reviewed by permanent party every Thursday.
      If you need a pass transfer request to be approved before then please
      reach directly to permanent party.
    </div>
  </div>
)}

</>
          )}
          {area === 'cdna' && (
            <>
              <div className="cardHeader">
                <img src="/fightingLogo.png" className="logo" alt="Fighting Fourth" />

                <div className="titleBlock">
                  <h1 className="name">{user.name}</h1>
                  <p className="email">{user.email}</p>
                </div>
              </div>

              <div className="hr" />

              <div className="statsRow">
                <div className="label">CDNAs Left</div>
                <div className="passes">{user.cdnas}</div>
              </div>

              <div className="actions">
                <button
                  className="btn btnGold"
                  type="button"
                  disabled={!!cdnaPendingTransfer}
                  onClick={() => {
                    setCdnaTransferAmount(1)
                    setShowCdnaTransferUI((prev) => {
                      const next = !prev
                      if (next) setShowCdnaIncentiveUI(false)
                      return next
                    })
                  }}
                >
                  Request to Use CDNA
                </button>

                <button
                  className="btn btnGold"
                  type="button"
                  onClick={() => {
                    setCdnaIncentiveMsg('')
                    setCdnaIncentiveAmount(1)
                    setCdnaIncentiveReason('')
                    setShowCdnaIncentiveUI((prev) => {
                      const next = !prev
                      if (next) setShowCdnaTransferUI(false)
                      return next
                    })
                  }}
                >
                  Request Incentive CDNAs
                </button>

                <button
                  className="btn"
                  type="button"
                  onClick={() => {
                    setArea('menu')
                    setShowCdnaTransferUI(false)
                    setShowCdnaIncentiveUI(false)
                  }}
                >
                  Back
                </button>

                <button className="btn" type="button" onClick={signOut}>
                  Sign out
                </button>
              </div>


              {showCdnaIncentiveUI && (
                <div
                  style={{
                    marginTop: 14,
                    display: 'flex',
                    gap: 20,
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ display: 'grid', gap: 10, maxWidth: 520 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 13 }}>CDNAs to add:</div>

                      <input
                        className="input"
                        style={{ width: 160, padding: '10px 12px' }}
                        type="number"
                        min={1}
                        step={1}
                        value={cdnaIncentiveAmount}
                        onChange={(e) => setCdnaIncentiveAmount(Number(e.target.value))}
                      />

                      <button
                        className="btn btnGold btnSmall"
                        type="button"
                        onClick={submitCdnaIncentiveRequest}
                        disabled={cdnaIncentiveLoading}
                      >
                        {cdnaIncentiveLoading ? 'Submitting…' : 'Submit'}
                      </button>

                      <button
                        className="btn btnSmall"
                        type="button"
                        onClick={() => setShowCdnaIncentiveUI(false)}
                        disabled={cdnaIncentiveLoading}
                      >
                        Cancel
                      </button>
                    </div>

                    <textarea
                      className="input"
                      style={{ minHeight: 90, resize: 'vertical' }}
                      placeholder="Reason / description..."
                      value={cdnaIncentiveReason}
                      onChange={(e) => setCdnaIncentiveReason(e.target.value)}
                    />

                    {cdnaIncentiveMsg && <div className="loginSub">{cdnaIncentiveMsg}</div>}
                  </div>

                  <div
                    style={{
                      maxWidth: 360,
                      fontSize: 12,
                      lineHeight: 1.5,
                      color: 'rgba(255,255,255,0.6)',
                    }}
                  >
                    If you have any pictures you would like to submit to aid in verification for an
                    incentivized CDNA, please Teams it to Cadet NULL.
                  </div>
                </div>
              )}

              {showCdnaTransferUI && (
                <div
                  style={{
                    marginTop: 14,
                    display: 'flex',
                    gap: 20,
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 13 }}>Amount:</div>

                    <select
                      className="input"
                      style={{ width: 160, padding: '10px 12px' }}
                      value={cdnaTransferAmount}
                      onChange={(e) => setCdnaTransferAmount(Number(e.target.value))}
                    >
                      {Array.from({ length: Math.max(0, user.cdnas) }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>

                    <button
                      className="btn btnGold btnSmall"
                      type="button"
                      onClick={submitCdnaTransferRequest}
                      disabled={cdnaTransferLoading}
                    >
                      {cdnaTransferLoading ? 'Submitting…' : 'Submit'}
                    </button>

                    <button
                      className="btn btnSmall"
                      type="button"
                      onClick={() => setShowCdnaTransferUI(false)}
                      disabled={cdnaTransferLoading}
                    >
                      Cancel
                    </button>
                  </div>

                  <div
                    style={{
                      maxWidth: 360,
                      fontSize: 12,
                      lineHeight: 1.5,
                      color: 'rgba(255,255,255,0.6)',
                    }}
                  >
                    CDNA transfer requests are reviewed by permanent party every Thursday. If you need a CDNA
                    transfer request to be approved before then please reach directly to permanent party.
                  </div>
                </div>
              )}

              {cdnaPendingTransfer && (
                <div className="loginSub" style={{ marginTop: 10 }}>
                  CDNA transfer request pending for <b>{cdnaPendingTransfer.amount}</b> CDNAs.
                </div>
              )}
            </>
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
