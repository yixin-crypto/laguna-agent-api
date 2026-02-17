/**
 * URL Shortener
 * Generates short codes for affiliate links
 */

import { config } from './config.js'

// Characters for short codes (URL-safe, no ambiguous chars like 0/O, 1/l)
const CHARS = '23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ'

/**
 * Generate a random short code
 * Default 7 chars = 55^7 = ~1.5 trillion combinations
 */
export function generateShortCode(length: number = 7): string {
  let code = ''
  for (let i = 0; i < length; i++) {
    code += CHARS[Math.floor(Math.random() * CHARS.length)]
  }
  return code
}

/**
 * Build the full short URL
 */
export function buildShortUrl(shortCode: string, baseUrl?: string): string {
  const base = baseUrl || config.SHORT_URL_BASE
  return `${base}/${shortCode}`
}
