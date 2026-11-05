import { describe, expect, it } from 'vitest'
import { call, createBill, createHome, type Share } from './helpers'

describe('concurrent payments', () => {
  it('allows only one request to pay the same share', async () => {
    const { homeId } = await createHome(['Asha', 'Ben'])
    const bill = await createBill(homeId, 1000)

    const firstShare = bill.body.shares[0]
    if (!firstShare) throw new Error('bill has no shares')

    const [first, second] = await Promise.all([
      call<Share>('POST', `/api/bills/${bill.body.id}/shares/${firstShare.id}/pay`, {
        headers: { 'Idempotency-Key': 'payment-one' },
      }),
      call<Share>('POST', `/api/bills/${bill.body.id}/shares/${firstShare.id}/pay`, {
        headers: { 'Idempotency-Key': 'payment-two' },
      }),
    ])

    expect([first.status, second.status].sort()).toEqual([200, 409])
  })
})
