import nodemailer, { type SendMailOptions } from 'nodemailer'
import type { MailConfig } from '../config.js'

export interface EmailMessage {
  to: string
  subject: string
  text: string
  html: string
}

export type MailResult = { ok: true } | { ok: false; code: 'MAIL_DELIVERY_FAILED' }

/** SMTP transport is injectable for tests. Transport errors never escape or log content. */
export function createMailer(
  config: MailConfig,
  send?: (message: SendMailOptions) => Promise<unknown>,
): { sendMail(message: EmailMessage): Promise<MailResult> } {
  const transport = send ? undefined : nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    // Authenticated SMTP must not send credentials over an unencrypted link.
    requireTLS: Boolean(config.user) && !config.secure,
    ...(config.user && config.password ? { auth: { user: config.user, pass: config.password } } : {}),
  })
  const deliver = send ?? ((message: SendMailOptions) => transport!.sendMail(message))
  return {
    async sendMail(message) {
      try {
        await deliver({ from: config.from, ...message })
        return { ok: true }
      } catch {
        return { ok: false, code: 'MAIL_DELIVERY_FAILED' }
      }
    },
  }
}
