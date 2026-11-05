import { Hono } from 'hono'

const app = new Hono<{ Bindings: Env }>()
app.onError((error, c) => {
  console.error('API error:', error)
  return c.json({ error: 'Internal server error' }, 500)
})

app.get('/api/health', (c) => c.json({ status: 'ok' }))

app.post('/api/homes', async (c) => {
  let body: unknown

  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body) || !('name' in body)) {
    return c.json({ error: 'Home name is required' }, 400)
  }

  const name = body.name

  if (typeof name !== 'string' || name.trim() === '') {
    return c.json({ error: 'Home name is required' }, 400)
  }

  const id = crypto.randomUUID()
  const trimmedName = name.trim()

  await c.env.DB.prepare('INSERT INTO homes (id, name) VALUES (?, ?)').bind(id, trimmedName).run()

  return c.json({ id, name: trimmedName }, 201)
})

app.post('/api/homes/:homeId/members', async (c) => {
  const homeId = c.req.param('homeId')

  let body: unknown

  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body) || !('name' in body)) {
    return c.json({ error: 'Member name is required' }, 400)
  }

  const name = body.name

  if (typeof name !== 'string' || name.trim() === '') {
    return c.json({ error: 'Member name is required' }, 400)
  }

  const home = await c.env.DB.prepare('SELECT id FROM homes WHERE id = ?').bind(homeId).first()

  if (!home) {
    return c.json({ error: 'Home not found' }, 404)
  }

  const id = crypto.randomUUID()
  const trimmedName = name.trim()

  await c.env.DB.prepare(`
    INSERT INTO members (id, home_id, name, member_order)
    VALUES (
      ?, ?, ?,
      (
        SELECT COALESCE(MAX(member_order), 0) + 1
        FROM members
        WHERE home_id = ?
      )
    )
  `)
    .bind(id, homeId, trimmedName, homeId)
    .run()

  return c.json({ id, homeId, name: trimmedName }, 201)
})

app.post('/api/homes/:homeId/bills', async (c) => {
  const homeId = c.req.param('homeId')

  let body: unknown

  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    Array.isArray(body) ||
    !('title' in body) ||
    !('totalCents' in body)
  ) {
    return c.json({ error: 'Title and totalCents are required' }, 422)
  }

  const title = body.title
  const totalCents = body.totalCents

  if (
    typeof title !== 'string' ||
    title.trim() === '' ||
    typeof totalCents !== 'number' ||
    !Number.isSafeInteger(totalCents) ||
    totalCents <= 0
  ) {
    return c.json({ error: 'Invalid bill title or amount' }, 422)
  }

  const home = await c.env.DB.prepare('SELECT id FROM homes WHERE id = ?').bind(homeId).first()

  if (!home) {
    return c.json({ error: 'Home not found' }, 404)
  }

  const members = await c.env.DB.prepare(`
    SELECT id
    FROM members
    WHERE home_id = ?
    ORDER BY member_order ASC
  `)
    .bind(homeId)
    .all<{ id: string }>()

  if (members.results.length === 0) {
    return c.json({ error: 'Home has no members' }, 422)
  }

  const billId = crypto.randomUUID()
  const trimmedTitle = title.trim()

  const baseAmount = Math.floor(totalCents / members.results.length)
  const remainder = totalCents % members.results.length

  const shares = members.results.map((member, index) => ({
    id: crypto.randomUUID(),
    memberId: member.id,
    amountCents: baseAmount + (index < remainder ? 1 : 0),
    paidAt: null as string | null,
  }))

  const statements = [
    c.env.DB.prepare(`
      INSERT INTO bills (id, home_id, title, total_cents)
      VALUES (?, ?, ?, ?)
    `).bind(billId, homeId, trimmedTitle, totalCents),

    ...shares.map((share) =>
      c.env.DB.prepare(`
        INSERT INTO shares (id, bill_id, member_id, amount_cents)
        VALUES (?, ?, ?, ?)
      `).bind(share.id, billId, share.memberId, share.amountCents),
    ),
  ]

  await c.env.DB.batch(statements)

  return c.json(
    {
      id: billId,
      homeId,
      title: trimmedTitle,
      totalCents,
      shares,
    },
    201,
  )
})
app.get('/api/homes/:homeId/bills', async (c) => {
  const homeId = c.req.param('homeId')

  const home = await c.env.DB.prepare('SELECT id FROM homes WHERE id = ?').bind(homeId).first()

  if (!home) {
    return c.json({ error: 'Home not found' }, 404)
  }

  const result = await c.env.DB.prepare(`
    SELECT
      b.id AS id,
      b.home_id AS homeId,
      b.title AS title,
      b.total_cents AS totalCents,
      s.id AS shareId,
      s.member_id AS memberId,
      m.name AS memberName,
      s.amount_cents AS amountCents,
      s.paid_at AS paidAt
    FROM bills b
    JOIN shares s ON s.bill_id = b.id
    JOIN members m ON m.id = s.member_id
    WHERE b.home_id = ?
    ORDER BY b.created_at DESC, m.member_order ASC
  `)
    .bind(homeId)
    .all<{
      id: string
      homeId: string
      title: string
      totalCents: number
      shareId: string
      memberId: string
      memberName: string
      amountCents: number
      paidAt: string | null
    }>()

  const bills = new Map()

  for (const row of result.results) {
    if (!bills.has(row.id)) {
      bills.set(row.id, {
        id: row.id,
        homeId: row.homeId,
        title: row.title,
        totalCents: row.totalCents,
        shares: [],
      })
    }

    bills.get(row.id).shares.push({
      id: row.shareId,
      memberId: row.memberId,
      memberName: row.memberName,
      amountCents: row.amountCents,
      paidAt: row.paidAt,
    })
  }

  return c.json({ bills: Array.from(bills.values()) }, 200)
})
app.post('/api/bills/:billId/shares/:shareId/pay', async (c) => {
  const billId = c.req.param('billId')
  const shareId = c.req.param('shareId')
  const idempotencyKey = c.req.header('Idempotency-Key')

  if (!idempotencyKey?.trim()) {
    return c.json({ error: 'Idempotency-Key header is required' }, 400)
  }

  const share = await c.env.DB.prepare(`
    SELECT id, member_id, amount_cents, paid_at, idempotency_key
    FROM shares
    WHERE id = ? AND bill_id = ?
  `)
    .bind(shareId, billId)
    .first<{
      id: string
      member_id: string
      amount_cents: number
      paid_at: string | null
      idempotency_key: string | null
    }>()

  if (!share) {
    return c.json({ error: 'Bill or share not found' }, 404)
  }

  if (share.paid_at !== null) {
    if (share.idempotency_key === idempotencyKey) {
      return c.json(
        {
          id: share.id,
          memberId: share.member_id,
          amountCents: share.amount_cents,
          paidAt: share.paid_at,
        },
        200,
      )
    }

    return c.json({ error: 'Share has already been paid' }, 409)
  }

  const paidAt = new Date().toISOString()

  try {
    await c.env.DB.prepare(`
      UPDATE shares
      SET paid_at = ?, idempotency_key = ?
      WHERE id = ? AND bill_id = ? AND paid_at IS NULL
    `)
      .bind(paidAt, idempotencyKey, shareId, billId)
      .run()
  } catch (error) {
    const keyOwner = await c.env.DB.prepare(`
      SELECT id FROM shares WHERE idempotency_key = ?
    `)
      .bind(idempotencyKey)
      .first<{ id: string }>()

    if (keyOwner && keyOwner.id !== shareId) {
      return c.json({ error: 'Idempotency-Key has already been used' }, 409)
    }

    throw error
  }

  const updatedShare = await c.env.DB.prepare(`
    SELECT id, member_id, amount_cents, paid_at, idempotency_key
    FROM shares
    WHERE id = ? AND bill_id = ?
  `)
    .bind(shareId, billId)
    .first<{
      id: string
      member_id: string
      amount_cents: number
      paid_at: string | null
      idempotency_key: string | null
    }>()

  if (!updatedShare) {
    return c.json({ error: 'Bill or share not found' }, 404)
  }

  if (updatedShare.idempotency_key !== idempotencyKey) {
    return c.json({ error: 'Share has already been paid' }, 409)
  }

  return c.json(
    {
      id: updatedShare.id,
      memberId: updatedShare.member_id,
      amountCents: updatedShare.amount_cents,
      paidAt: updatedShare.paid_at,
    },
    200,
  )
})

app.get('/api/homes/:homeId/balances', async (c) => {
  const homeId = c.req.param('homeId')

  const home = await c.env.DB.prepare('SELECT id FROM homes WHERE id = ?').bind(homeId).first()

  if (!home) {
    return c.json({ error: 'Home not found' }, 404)
  }

  const result = await c.env.DB.prepare(`
    SELECT
      m.id AS memberId,
      m.name AS name,
      COALESCE(
        SUM(
          CASE
            WHEN s.paid_at IS NULL AND b.id IS NOT NULL
            THEN s.amount_cents
            ELSE 0
          END
        ),
        0
      ) AS outstandingCents
    FROM members m
    LEFT JOIN shares s
      ON s.member_id = m.id
    LEFT JOIN bills b
      ON b.id = s.bill_id
      AND b.home_id = m.home_id
    WHERE m.home_id = ?
    GROUP BY m.id, m.name, m.member_order
    ORDER BY m.member_order ASC
  `)
    .bind(homeId)
    .all<{
      memberId: string
      name: string
      outstandingCents: number
    }>()

  return c.json({ balances: result.results }, 200)
})

export default app
