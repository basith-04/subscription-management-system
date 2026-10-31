// F11 real-transport email test. Mailpit is not available in CI/dev containers, so a tiny in-process SMTP sink
// receives the message from the REAL lib/mailer (nodemailer) through the REAL app wiring (no stub mailer).
import net from 'node:net'
import type { AddressInfo } from 'node:net'
import type { Pool } from 'pg'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createInvoice, createSubscriptionStandIn } from '../../factories/invoice.factory.js'
import { createUser } from '../../factories/user.factory.js'
import { createTestApp } from '../../helpers/app.js'
import { cookiePair } from '../../helpers/cookies.js'
import { canConnect } from '../../helpers/db.js'
import { createInvoiceTestDb, type InvoiceTestDb } from '../../helpers/invoices-test-db.js'

const dbAvailable = await canConnect()

interface Captured { from: string; to: string[]; data: string }

function startSmtpSink() {
  const messages: Captured[] = []
  const server = net.createServer((socket) => {
    let current: Captured = { from: '', to: [], data: '' }
    let inData = false
    let buffer = ''
    socket.write('220 sink ESMTP\r\n')
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8')
      for (;;) {
        if (inData) {
          const end = buffer.indexOf('\r\n.\r\n')
          if (end === -1) return
          current.data = buffer.slice(0, end)
          buffer = buffer.slice(end + 5)
          inData = false
          messages.push(current)
          current = { from: '', to: [], data: '' }
          socket.write('250 queued\r\n')
          continue
        }
        const eol = buffer.indexOf('\r\n')
        if (eol === -1) return
        const line = buffer.slice(0, eol)
        buffer = buffer.slice(eol + 2)
        const upper = line.toUpperCase()
        if (upper.startsWith('EHLO') || upper.startsWith('HELO')) socket.write('250 sink\r\n')
        else if (upper.startsWith('MAIL FROM')) { current.from = line; socket.write('250 ok\r\n') }
        else if (upper.startsWith('RCPT TO')) { current.to.push(line); socket.write('250 ok\r\n') }
        else if (upper === 'DATA') { inData = true; socket.write('354 go\r\n') }
        else if (upper === 'QUIT') { socket.write('221 bye\r\n'); socket.end() }
        else socket.write('250 ok\r\n')
      }
    })
  })
  return new Promise<{ port: number; messages: Captured[]; close: () => Promise<void> }>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({
      port: (server.address() as AddressInfo).port,
      messages,
      close: () => new Promise((r) => server.close(() => r())),
    }))
  })
}

/** Undo quoted-printable soft line breaks and =XX escapes so assertions read the real content. */
const decodeQp = (s: string) =>
  Buffer.from(s.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, (_m, h: string) => String.fromCharCode(parseInt(h, 16))), 'latin1').toString('utf8')

describe.skipIf(!dbAvailable)('F11 invoice email over real SMTP', () => {
  let fixture: InvoiceTestDb
  let pool: Pool
  let sink: Awaited<ReturnType<typeof startSmtpSink>>

  beforeAll(async () => {
    sink = await startSmtpSink()
    fixture = await createInvoiceTestDb()
    pool = fixture.pool
  })
  afterAll(async () => {
    await fixture.teardown()
    await sink.close()
  })

  it('delivers the invoice with correct recipient, subject and totals, and sets sent_at', async () => {
    await createUser(pool, { email: 'staff@example.com', role: 'staff' })
    const cust = await createUser(pool, { email: 'buyer@example.com', role: 'customer', fullName: 'Buyer & Sons' })
    const sub = await createSubscriptionStandIn(pool, cust.customer_id!)
    const id = await createInvoice(pool, {
      customerId: cust.customer_id!, subscriptionId: sub.id, status: 'confirmed',
      lines: [{ description: 'Platform – Brand: Odoo', quantity: 5, unit_price: '1560.00', discount: '780.00' }],
    })

    const app = createTestApp(pool, { SMTP_HOST: '127.0.0.1', SMTP_PORT: String(sink.port), MAIL_FROM: 'billing@brightloop.test' })
    const login = await request(app).post('/api/v1/auth/login').send({ email: 'staff@example.com', password: 'Example!Pass123' })
    const cookie = cookiePair(login)

    const res = await request(app).post(`/api/v1/invoices/${id}/send`).set({ Cookie: cookie }).send({ message: 'Thank you' })
    expect(res.status).toBe(200)
    expect(res.body.data.sent_at).toEqual(expect.any(String))

    expect(sink.messages).toHaveLength(1)
    const mail = sink.messages[0]!
    expect(mail.from).toContain('billing@brightloop.test')
    expect(mail.to.join(' ')).toContain('buyer@example.com')
    const body = decodeQp(mail.data)
    expect(body).toContain('Subject: Invoice INV-000001')
    expect(body).toContain('Content-Type: text/html')
    for (const text of ['INV-000001', 'Buyer &amp; Sons', 'Platform', '7800.00', '780.00', '1263.60', '8283.60', 'Thank you']) {
      expect(body, text).toContain(text)
    }
  })

  it('returns 502 EMAIL_FAILED and leaves the invoice untouched when SMTP is unreachable', async () => {
    const cust = (await pool.query<{ id: string }>('SELECT id FROM customers LIMIT 1')).rows[0]!
    const sub = await createSubscriptionStandIn(pool, Number(cust.id))
    const id = await createInvoice(pool, { customerId: Number(cust.id), subscriptionId: sub.id, status: 'confirmed' })
    // port 1 on loopback refuses connections
    const app = createTestApp(pool, { SMTP_HOST: '127.0.0.1', SMTP_PORT: '1' })
    const login = await request(app).post('/api/v1/auth/login').send({ email: 'staff@example.com', password: 'Example!Pass123' })
    const res = await request(app).post(`/api/v1/invoices/${id}/send`).set({ Cookie: cookiePair(login) }).send({})
    expect(res.status).toBe(502)
    expect(res.body.error.code).toBe('EMAIL_FAILED')
    const row = (await pool.query('SELECT sent_at FROM invoices WHERE id=$1', [id])).rows[0]
    expect(row.sent_at).toBeNull()
  })
})
