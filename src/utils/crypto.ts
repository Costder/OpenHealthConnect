import { createHash } from 'node:crypto';
import sodium from 'libsodium-wrappers-sumo';

export function sha256Hex(input: Uint8Array): string {
  return createHash('sha256').update(input).digest('hex');
}

export async function decryptPayload(
  ciphertext: Uint8Array,
  nonceB64: string,
  keyB64: string
): Promise<Uint8Array> {
  await sodium.ready;
  const nonce = sodium.from_base64(nonceB64, sodium.base64_variants.ORIGINAL);
  const key = sodium.from_base64(keyB64, sodium.base64_variants.ORIGINAL);
  return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
    null,
    ciphertext,
    null,
    nonce,
    key
  );
}

export async function encryptPayload(
  plaintext: Uint8Array,
  nonceB64: string,
  keyB64: string
): Promise<Uint8Array> {
  await sodium.ready;
  const nonce = sodium.from_base64(nonceB64, sodium.base64_variants.ORIGINAL);
  const key = sodium.from_base64(keyB64, sodium.base64_variants.ORIGINAL);
  return sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    plaintext,
    null,
    null,
    nonce,
    key
  );
}

export async function randomKeyB64(): Promise<string> {
  await sodium.ready;
  return sodium.to_base64(sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES), sodium.base64_variants.ORIGINAL);
}
