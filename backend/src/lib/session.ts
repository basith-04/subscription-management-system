import type { CookieOptions, Response } from 'express'
import { SignJWT, jwtVerify } from 'jose'
import type { Config } from '../config.js'

export interface SessionPayload {
  user_id: number
  role: string
}

const ALGORITHM = 'HS256'

function secretKey(config: Config): Uint8Array {
  return new TextEncoder().encode(config.jwtSecret)
}

export async function signSessionToken(
  payload: SessionPayload,
  config: Config,
): Promise<string> {
  const expiresAt = Math.floor((Date.now() + config.cookie.maxAgeMs) / 1000)

  return new SignJWT({ role: payload.role })
    .setProtectedHeader({ alg: ALGORITHM })
    .setSubject(String(payload.user_id))
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(secretKey(config))
}

export async function verifySessionToken(
  token: string,
  config: Config,
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(config), {
      algorithms: [ALGORITHM],
      requiredClaims: ['sub', 'iat', 'exp'],
    })

    const userId = Number(payload.sub)
    if (
      !Number.isSafeInteger(userId) ||
      userId <= 0 ||
      typeof payload.role !== 'string'
    ) {
      return null
    }

    return { user_id: userId, role: payload.role }
  } catch {
    return null
  }
}

function baseCookieOptions(config: Config): CookieOptions {
  return {
    httpOnly: true,
    sameSite: config.cookie.sameSite,
    secure: config.cookie.secure,
    path: '/',
    ...(config.cookie.domain ? { domain: config.cookie.domain } : {}),
  }
}

export function setSessionCookie(
  res: Response,
  token: string,
  config: Config,
): void {
  res.cookie(config.cookie.name, token, {
    ...baseCookieOptions(config),
    maxAge: config.cookie.maxAgeMs,
  })
}

/**
 * Clear with the same name, path, domain and security attributes used to set
 * the cookie. A stateless JWT cannot be revoked server-side; only the browser
 * copy is removed (D-04).
 */
export function clearSessionCookie(res: Response, config: Config): void {
  res.clearCookie(config.cookie.name, {
    ...baseCookieOptions(config),
    expires: new Date(0),
  })
}
