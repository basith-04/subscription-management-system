import { describe, expect, it, vi } from 'vitest'
import { loadConfig } from '../config.js'
import { createMailer } from './mailer.js'

describe('mailer', () => {
  const config = loadConfig({ SMTP_HOST: 'mailpit', SMTP_PORT: '1025', MAIL_FROM: 'sender@example.com' } as NodeJS.ProcessEnv).mail
  const message = { to: 'recipient@example.com', subject: 'Subject', text: 'Plain text', html: '<p>HTML</p>' }

  it('sends text and HTML via the configured sender', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    expect(await createMailer(config, send).sendMail(message)).toEqual({ ok: true })
    expect(send).toHaveBeenCalledWith({ from: 'sender@example.com', ...message })
  })

  it('returns a sanitized result instead of leaking SMTP failures', async () => {
    const send = vi.fn().mockRejectedValue(new Error('sensitive SMTP error'))
    expect(await createMailer(config, send).sendMail(message)).toEqual({ ok: false, code: 'MAIL_DELIVERY_FAILED' })
  })

  it('rejects incomplete SMTP credentials at startup', () => {
    expect(() => loadConfig({ SMTP_USER: 'user' } as NodeJS.ProcessEnv)).toThrow(/SMTP_USER and SMTP_PASS/)
    expect(() => loadConfig({ SMTP_PORT: '1025invalid' } as NodeJS.ProcessEnv)).toThrow(/SMTP_PORT/)
  })
})
