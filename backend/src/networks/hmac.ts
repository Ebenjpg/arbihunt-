import { createHmac } from 'node:crypto';

/** HMAC-SHA256 hex digest, used for exchange-request signing (MEXC, Bybit…). */
export function hmacSha256(secret: string, message: string): string {
  return createHmac('sha256', secret).update(message, 'utf8').digest('hex');
}

/** HMAC-SHA512 hex digest (used by some exchanges). */
export function hmacSha512(secret: string, message: string): string {
  return createHmac('sha512', secret).update(message, 'utf8').digest('hex');
}

/** HMAC-SHA256 base64 digest (OKX signs requests with base64 output). */
export function hmacSha256Base64(secret: string, message: string): string {
  return createHmac('sha256', secret).update(message, 'utf8').digest('base64');
}