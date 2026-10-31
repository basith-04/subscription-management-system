import type { Response } from 'supertest'

export function setCookieHeader(response: Response): string {
  const header = response.headers['set-cookie']
  const cookie = Array.isArray(header) ? header[0] : header
  if (!cookie) throw new Error('response did not set a cookie')
  return cookie
}

export function cookiePair(response: Response): string {
  return setCookieHeader(response).split(';')[0] ?? ''
}
