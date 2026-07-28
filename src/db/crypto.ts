/**
 * Token encryption at rest (US-A2, NFR-S1).
 *
 * US-A2 requires OAuth access tokens be stored encrypted. This uses Web Crypto
 * AES-GCM, which is available in both the Worker runtime and Node — no
 * dependency, and the same code path in production and tests.
 *
 * What this protects against: a database dump or a leaked backup. It does *not*
 * protect against an attacker who already has the running environment, since
 * the key lives there — no at-rest scheme does. The honest framing is
 * "compromising the database is not sufficient", not "tokens are safe".
 *
 * The key comes from `TOKEN_ENCRYPTION_KEY` (base64, 32 bytes). It is never
 * committed, never logged, and never sent anywhere.
 */

const ALGORITHM = "AES-GCM";
const IV_BYTES = 12; // AES-GCM standard nonce length

export type EncryptedValue = {
  /** base64 ciphertext (includes the GCM auth tag). */
  readonly ciphertext: string;
  /** base64 IV, unique per record. */
  readonly iv: string;
};

export class MissingEncryptionKeyError extends Error {
  constructor() {
    super("TOKEN_ENCRYPTION_KEY is not configured. Refusing to store OAuth tokens in plaintext.");
    this.name = "MissingEncryptionKeyError";
  }
}

async function importKey(rawBase64: string): Promise<CryptoKey> {
  const raw = base64ToBytes(rawBase64);
  if (raw.byteLength !== 32) {
    throw new Error(`TOKEN_ENCRYPTION_KEY must decode to 32 bytes, got ${raw.byteLength}`);
  }
  return crypto.subtle.importKey("raw", raw, ALGORITHM, false, ["encrypt", "decrypt"]);
}

export function readKeyMaterial(env: Record<string, string | undefined> = process.env): string {
  const key = env.TOKEN_ENCRYPTION_KEY;
  // Fail loudly rather than silently degrading to plaintext. A missing key is a
  // deployment error, and the correct response is to refuse to run.
  if (!key) throw new MissingEncryptionKeyError();
  return key;
}

export async function encryptToken(plaintext: string, keyBase64: string): Promise<EncryptedValue> {
  const key = await importKey(keyBase64);
  // Fresh IV per record: reusing a nonce under the same key breaks GCM
  // catastrophically, so it is generated here rather than passed in.
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const encoded = new TextEncoder().encode(plaintext) as Uint8Array<ArrayBuffer>;
  const ciphertext = await crypto.subtle.encrypt({ name: ALGORITHM, iv }, key, encoded);
  return { ciphertext: bytesToBase64(new Uint8Array(ciphertext)), iv: bytesToBase64(iv) };
}

export async function decryptToken(value: EncryptedValue, keyBase64: string): Promise<string> {
  const key = await importKey(keyBase64);
  const plaintext = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv: base64ToBytes(value.iv) },
    key,
    base64ToBytes(value.ciphertext),
  );
  return new TextDecoder().decode(plaintext);
}

/** Generate a key. Operational helper — `npm run gen:key`. */
export function generateKeyBase64(): string {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(32)));
}

function bytesToBase64(bytes: Uint8Array<ArrayBufferLike>): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * Returns `Uint8Array<ArrayBuffer>` rather than the default
 * `Uint8Array<ArrayBufferLike>`: since TS 5.7 typed arrays are generic over
 * their buffer, and Web Crypto's `BufferSource` will not accept a view that
 * might be backed by a SharedArrayBuffer. Allocating the buffer explicitly
 * pins the type.
 */
function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
