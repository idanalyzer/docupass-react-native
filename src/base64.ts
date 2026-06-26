const BASE64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let output = '';
  let index = 0;

  for (; index + 2 < bytes.length; index += 3) {
    const value = (bytes[index] << 16) | (bytes[index + 1] << 8) | bytes[index + 2];
    output +=
      BASE64_ALPHABET[(value >> 18) & 63] +
      BASE64_ALPHABET[(value >> 12) & 63] +
      BASE64_ALPHABET[(value >> 6) & 63] +
      BASE64_ALPHABET[value & 63];
  }

  if (index < bytes.length) {
    const first = bytes[index];
    const second = index + 1 < bytes.length ? bytes[index + 1] : 0;
    const value = (first << 16) | (second << 8);

    output += BASE64_ALPHABET[(value >> 18) & 63];
    output += BASE64_ALPHABET[(value >> 12) & 63];
    output += index + 1 < bytes.length ? BASE64_ALPHABET[(value >> 6) & 63] : '=';
    output += '=';
  }

  return output;
}

export function stripDataUrlPrefix(value: string): string {
  const commaIndex = value.indexOf(',');
  return value.startsWith('data:') && commaIndex >= 0 ? value.slice(commaIndex + 1) : value;
}
