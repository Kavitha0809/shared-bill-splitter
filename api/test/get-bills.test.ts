import { describe, expect, it } from 'vitest'
import { call, createBill, createHome } from './helpers'

describe('get bills', () => {
  it('returns bills with their shares and payment status', async () => {
    const { homeId, members } = await createHome(['Asha', 'Ben'])

    await createBill(homeId, 1000)

    const result = await call<{
      bills: {
        shares: {
          memberId: string
          memberName: string
          amountCents: number
          paidAt: string | null
        }[]
      }[]
    }>('GET', `/api/homes/${homeId}/bills`)

    expect(result.status).toBe(200)
    expect(result.body.bills).toHaveLength(1)

    const bill = result.body.bills[0]

    if (!bill) {
      throw new Error('Expected a bill to exist')
    }

    expect(bill.shares).toHaveLength(2)

    const firstShare = bill.shares[0]
    const firstMember = members[0]

    if (!firstShare || !firstMember) {
      throw new Error('Expected first share and first member to exist')
    }

    expect(firstShare.memberId).toBe(firstMember.id)
    expect(firstShare.memberName).toBe('Asha')
    expect(firstShare.amountCents).toBe(500)
    expect(firstShare.paidAt).toBeNull()
  })

  it('returns 404 for a home that does not exist', async () => {
    const result = await call('GET', '/api/homes/nonexistent-home/bills')

    expect(result.status).toBe(404)
  })
})
