import { CookieOptions } from 'express';
import { env } from '../config/env';

const BASE: CookieOptions = {
  path: '/',
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax',
};

export const COOKIE_NAME = 'access_token';

export function cookieOptions(maxAgeMs: number): CookieOptions {
  return { ...BASE, maxAge: maxAgeMs };
}

export function clearCookieOptions(): CookieOptions {
  return BASE;
}
