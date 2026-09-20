// Server-side magic-byte validation for uploaded files.
// The declared MIME type is client-controlled, so recognized binary types
// must match their actual leading bytes. Unknown types fail closed.
export function bytesMatchDeclaredType(buffer, declaredMimeType) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return false;
  const head = buffer.subarray(0, 12);
  switch (declaredMimeType) {
    case 'image/png':
      return head.length >= 8 && head[0]===0x89 && head[1]===0x50 && head[2]===0x4e && head[3]===0x47 &&
        head[4]===0x0d && head[5]===0x0a && head[6]===0x1a && head[7]===0x0a;
    case 'image/jpeg':
      return head[0]===0xff && head[1]===0xd8 && head[2]===0xff;
    case 'image/webp':
      return head.length >= 12 && head[0]===0x52 && head[1]===0x49 && head[2]===0x46 && head[3]===0x46 &&
        head[8]===0x57 && head[9]===0x45 && head[10]===0x42 && head[11]===0x50;
    case 'application/pdf':
      return head.length >= 5 && head[0]===0x25 && head[1]===0x50 && head[2]===0x44 && head[3]===0x46 && head[4]===0x2d;
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return head[0]===0x50 && head[1]===0x4b &&
        ((head[2]===0x03 && head[3]===0x04) || (head[2]===0x05 && head[3]===0x06) || (head[2]===0x07 && head[3]===0x08));
    case 'text/plain':
      return isPlausibleText(buffer);
    default:
      return false;
  }
}

export function isPlausibleText(buffer) {
  if (!Buffer.isBuffer(buffer)) return false;
  const sample = buffer.subarray(0, Math.min(buffer.length, 8192));
  if (sample.includes(0x00)) return false;
  let controls = 0;
  for (const byte of sample) {
    if (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d) controls++;
    else if (byte === 0x7f) controls++;
  }
  return controls / sample.length < 0.01;
}
