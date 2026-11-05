import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

type Home = {
  id: string
  name: string
}

type Member = {
  id: string
  homeId: string
  name: string
}
type Share = {
  id: string
  memberId: string
  memberName: string
  amountCents: number
  paidAt: string | null
}

type Bill = {
  id: string
  homeId: string
  title: string
  totalCents: number
  shares: Share[]
}

type Balance = {
  memberId: string
  name: string
  outstandingCents: number
}
async function getResponseData(response: Response) {
  try {
    return await response.json()
  } catch {
    throw new Error('Server returned an invalid response. Please try again.')
  }
}
export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  const [payingShareId, setPayingShareId] = useState<string | null>(null)
  const [paymentKeys, setPaymentKeys] = useState<Record<string, string>>({})
  const [billTitle, setBillTitle] = useState('')
  const [billAmount, setBillAmount] = useState('')
  const [bills, setBills] = useState<Bill[]>([])
  const [balances, setBalances] = useState<Balance[]>([])
  const [billLoading, setBillLoading] = useState(false)
  const [homeName, setHomeName] = useState('')
  const [home, setHome] = useState<Home | null>(null)
  const [memberName, setMemberName] = useState('')
  const [members, setMembers] = useState<Member[]>([])
  const [homeLoading, setHomeLoading] = useState(false)
  const [memberLoading, setMemberLoading] = useState(false)
  const [error, setError] = useState('')

  async function loadBalances(homeId: string) {
    try {
      const response = await fetch(`/api/homes/${homeId}/balances`)

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Could not load balances.')
      }

      setBalances(data.balances)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load balances.')
    }
  }
  async function createHome() {
    if (!homeName.trim()) {
      setError('Please enter a home name.')
      return
    }

    setHomeLoading(true)
    setError('')

    try {
      const response = await fetch('/api/homes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: homeName }),
      })

      const data = await getResponseData(response)

      if (!response.ok) {
        throw new Error(data.error || 'Could not create home.')
      }

      setHome(data)
      setHomeName('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setHomeLoading(false)
    }
  }

  async function addMember() {
    if (!home || !memberName.trim()) {
      setError('Please enter a member name.')
      return
    }

    setMemberLoading(true)
    setError('')

    try {
      const response = await fetch(`/api/homes/${home.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: memberName }),
      })

      const data = await getResponseData(response)

      if (!response.ok) {
        throw new Error(data.error || 'Could not add member.')
      }

      setMembers((previousMembers) => [...previousMembers, data])
      await loadBalances(home.id)
      setMemberName('')

      setMemberName('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setMemberLoading(false)
    }
  }
  async function createBill() {
    if (!home || !billTitle.trim() || !billAmount.trim()) {
      setError('Please enter a bill title and amount.')
      return
    }

    const amountInCents = Math.round(Number(billAmount) * 100)

    if (!Number.isSafeInteger(amountInCents) || amountInCents <= 0) {
      setError('Please enter a valid positive amount.')
      return
    }

    if (members.length === 0) {
      setError('Add at least one member before creating a bill.')
      return
    }

    setBillLoading(true)
    setError('')

    try {
      const response = await fetch(`/api/homes/${home.id}/bills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: billTitle,
          totalCents: amountInCents,
        }),
      })

      const data = await getResponseData(response)

      if (!response.ok) {
        throw new Error(data.error || 'Could not create bill.')
      }

      const newBill: Bill = {
        ...data,
        shares: data.shares.map((share: Omit<Share, 'memberName'>) => ({
          ...share,
          memberName: members.find((member) => member.id === share.memberId)?.name ?? 'Unknown',
        })),
      }

      setBills((previousBills) => [...previousBills, newBill])
      await loadBalances(home.id)
      setBillTitle('')
      setBillAmount('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBillLoading(false)
    }
  }
  async function payShare(billId: string, shareId: string) {
    const key = paymentKeys[shareId] ?? crypto.randomUUID()

    setPaymentKeys((previous) => ({
      ...previous,
      [shareId]: key,
    }))

    setPayingShareId(shareId)
    setError('')

    try {
      const response = await fetch(`/api/bills/${billId}/shares/${shareId}/pay`, {
        method: 'POST',
        headers: {
          'Idempotency-Key': key,
        },
      })

      const data = await getResponseData(response)

      if (!response.ok) {
        throw new Error(data.error || 'Payment failed.')
      }

      setBills((previousBills) =>
        previousBills.map((bill) =>
          bill.id === billId
            ? {
                ...bill,
                shares: bill.shares.map((share) =>
                  share.id === shareId ? { ...share, paidAt: data.paidAt } : share,
                ),
              }
            : bill,
        ),
      )
      if (home) {
        await loadBalances(home.id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed.')
    } finally {
      setPayingShareId(null)
    }
  }

  return (
    <main style={{ padding: 32, fontFamily: 'system-ui, sans-serif' }}>
      <h1>Shared Bill Splitter</h1>
      <p>Create a home and add members to start splitting expenses.</p>

      {!home ? (
        <section>
          <h2>Create Home</h2>
          <input
            value={homeName}
            onChange={(event) => setHomeName(event.target.value)}
            placeholder="Enter home name"
          />
          <button type="button" onClick={createHome} disabled={homeLoading}>
            {homeLoading ? 'Creating...' : 'Create Home'}
          </button>
        </section>
      ) : (
        <section>
          <h2>{home.name}</h2>
          <p>Home ID: {home.id}</p>

          <h3>Add Members</h3>
          <input
            value={memberName}
            onChange={(event) => setMemberName(event.target.value)}
            placeholder="Enter member name"
          />
          <button type="button" onClick={addMember} disabled={memberLoading}>
            {memberLoading ? 'Adding...' : 'Add Member'}
          </button>

          <h3>Members ({members.length})</h3>

          {members.length === 0 ? (
            <p>No members added yet.</p>
          ) : (
            <ul>
              {members.map((member) => (
                <li key={member.id}>{member.name}</li>
              ))}
            </ul>
          )}
          {/* ADD BALANCES SECTION HERE */}
          <h3>Outstanding Balances</h3>

          {balances.length === 0 ? (
            <p>No balances available yet.</p>
          ) : (
            <ul>
              {balances.map((balance) => (
                <li key={balance.memberId}>
                  {balance.name}: ₹{(balance.outstandingCents / 100).toFixed(2)}
                </li>
              ))}
            </ul>
          )}

          <h3>Create Bill</h3>

          <input
            value={billTitle}
            onChange={(event) => setBillTitle(event.target.value)}
            placeholder="Bill title"
          />

          <input
            type="number"
            min="0.01"
            step="0.01"
            value={billAmount}
            onChange={(event) => setBillAmount(event.target.value)}
            placeholder="Amount in ₹"
          />

          <button type="button" onClick={createBill} disabled={billLoading}>
            {billLoading ? 'Creating...' : 'Create Bill'}
          </button>

          <h3>Bills ({bills.length})</h3>

          {bills.length === 0 ? (
            <p>No bills yet. Create your first bill to get started.</p>
          ) : (
            bills.map((bill) => (
              <section key={bill.id}>
                <h4>{bill.title}</h4>
                <p>Total: ₹{(bill.totalCents / 100).toFixed(2)}</p>

                <ul>
                  {bill.shares.map((share) => (
                    <li key={share.id}>
                      {share.memberName}: ₹{(share.amountCents / 100).toFixed(2)}
                      {share.paidAt ? (
                        <span> — Paid ✓</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => payShare(bill.id, share.id)}
                          disabled={payingShareId !== null}
                        >
                          {payingShareId === share.id ? 'Paying...' : 'Pay'}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </section>
      )}

      {error && <p role="alert">{error}</p>}
    </main>
  )
}
