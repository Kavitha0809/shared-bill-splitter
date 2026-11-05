import { describe, expect, it } from 'vitest'
import { type Balance, call, createHome, type Member } from './helpers'

describe('concurrent member creation', () => {
  it('creates two members with distinct member orders', async () => {
    const { homeId } = await createHome([])

    const [first, second] = await Promise.all([
      call<Member>('POST', `/api/homes/${homeId}/members`, {
        body: { name: 'Asha' },
      }),
      call<Member>('POST', `/api/homes/${homeId}/members`, {
        body: { name: 'Ben' },
      }),
    ])

    expect(first.status).toBe(201)
    expect(second.status).toBe(201)

    const result = await call<{ balances: Balance[] }>('GET', `/api/homes/${homeId}/balances`)

    expect(result.status).toBe(200)
    expect(result.body.balances).toHaveLength(2)
    expect(result.body.balances.map((member) => member.name)).toEqual(['Asha', 'Ben'])
  })
})
