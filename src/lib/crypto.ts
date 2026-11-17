// Real Web Crypto API End-to-End Encryption (ECDH P-256 + AES-GCM 256)

const STORAGE_PRIV_PREFIX = 'sc_e2e_priv_';
const STORAGE_PUB_PREFIX = 'sc_e2e_pub_';

function toBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function ensureUserE2EKeys(
  userId: number,
  serverPublicKey?: string | null
): Promise<{ publicKeyJwk: string; needsUpload: boolean }> {
  const privKeyStr = localStorage.getItem(`${STORAGE_PRIV_PREFIX}${userId}`);
  const pubKeyStr = localStorage.getItem(`${STORAGE_PUB_PREFIX}${userId}`);

  if (privKeyStr && pubKeyStr) {
    return {
      publicKeyJwk: pubKeyStr,
      needsUpload: serverPublicKey !== pubKeyStr,
    };
  }

  const keyPair = await window.crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey']
  );

  const pubJwk = JSON.stringify(
    await window.crypto.subtle.exportKey('jwk', keyPair.publicKey)
  );
  const privJwk = JSON.stringify(
    await window.crypto.subtle.exportKey('jwk', keyPair.privateKey)
  );

  localStorage.setItem(`${STORAGE_PRIV_PREFIX}${userId}`, privJwk);
  localStorage.setItem(`${STORAGE_PUB_PREFIX}${userId}`, pubJwk);

  return { publicKeyJwk: pubJwk, needsUpload: true };
}

async function deriveSharedAesKey(
  myUserId: number,
  peerPublicKeyJwk: string
): Promise<CryptoKey | null> {
  try {
    const privStr = localStorage.getItem(`${STORAGE_PRIV_PREFIX}${myUserId}`);
    if (!privStr) return null;

    const myPrivateKey = await window.crypto.subtle.importKey(
      'jwk',
      JSON.parse(privStr),
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveKey']
    );

    const peerPublicKey = await window.crypto.subtle.importKey(
      'jwk',
      JSON.parse(peerPublicKeyJwk),
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      []
    );

    return await window.crypto.subtle.deriveKey(
      { name: 'ECDH', public: peerPublicKey },
      myPrivateKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  } catch {
    return null;
  }
}

export async function encryptForPeer(
  myUserId: number,
  peerPublicKeyJwk: string,
  plaintext: string
): Promise<string | null> {
  const aesKey = await deriveSharedAesKey(myUserId, peerPublicKeyJwk);
  if (!aesKey) return null;

  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    encoded
  );

  return JSON.stringify({
    v: 1,
    iv: toBase64(iv),
    ct: toBase64(ciphertext),
  });
}

export async function decryptFromPeer(
  myUserId: number,
  peerPublicKeyJwk: string,
  payloadStr: string
): Promise<string | null> {
  try {
    const aesKey = await deriveSharedAesKey(myUserId, peerPublicKeyJwk);
    if (!aesKey) return null;

    const parsed = JSON.parse(payloadStr) as { v: number; iv: string; ct: string };
    const iv = fromBase64(parsed.iv);
    const ct = fromBase64(parsed.ct);

    const decrypted = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
      aesKey,
      ct.buffer as ArrayBuffer
    );

    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
}
