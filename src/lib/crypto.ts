// Cryptographic and formatting utilities for Secure One-Time QR Pass

/**
 * Generate a cryptographically strong, opaque random token for entry pass
 */
export function generatePassToken(): string {
  const randomBytes = new Uint8Array(24);
  if (typeof window !== 'undefined' && window.crypto) {
    window.crypto.getRandomValues(randomBytes);
  } else {
    // Node.js environment fallback
    // eslint-disable-next-import
    const nodeCrypto = globalThis.crypto;
    nodeCrypto.getRandomValues(randomBytes);
  }
  
  const hex = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
    
  return `PREDIWALI_PASS_${hex}`;
}

/**
 * Computes SHA-256 hash of pass token (Web Crypto API compatible)
 */
export async function hashToken(token: string): Promise<string> {
  const normalized = token.trim();
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  
  const cryptoObj = typeof window !== 'undefined' ? window.crypto : globalThis.crypto;
  const hashBuffer = await cryptoObj.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  
  return hashHex;
}

/**
 * Mask Indian contact number for privacy: e.g. "9876543210" -> "XXXXXX3210"
 */
export function maskContactNumber(phone: string): string {
  const clean = phone.replace(/\s+/g, '');
  if (clean.length < 6) return '******';
  const lastFour = clean.slice(-4);
  return '******' + lastFour;
}

/**
 * Format INR currency from integer minor units (e.g. 25000 -> ₹250)
 */
export function formatINR(minorUnits: number, currency: string = 'INR'): string {
  const rupees = minorUnits / 100;
  if (currency === 'INR') {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: rupees % 1 === 0 ? 0 : 2,
    }).format(rupees);
  }
  return `${currency} ${rupees.toFixed(2)}`;
}

/**
 * Format Date to Indian Timezone (Asia/Kolkata)
 */
export function formatKolkataDateTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  } catch {
    return isoString;
  }
}
