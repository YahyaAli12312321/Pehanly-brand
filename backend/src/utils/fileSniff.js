'use strict';

/*
 * Detects the real file type from the first bytes. The client-sent MIME type
 * and file extension are NOT trusted.
 *
 * Deliberately unsupported: SVG (can carry scripts), HTML, executables.
 */

function startsWith(buffer, bytes, offset = 0) {
  if (buffer.length < offset + bytes.length) return false;
  return bytes.every((byte, index) => buffer[offset + index] === byte);
}

function sniffFileType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) {
    return null;
  }

  if (startsWith(buffer, [0xff, 0xd8, 0xff])) {
    return { mime: 'image/jpeg', ext: 'jpg', kind: 'image' };
  }

  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { mime: 'image/png', ext: 'png', kind: 'image' };
  }

  // RIFF....WEBP
  if (
    startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(buffer, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return { mime: 'image/webp', ext: 'webp', kind: 'image' };
  }

  // %PDF-
  if (startsWith(buffer, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    return { mime: 'application/pdf', ext: 'pdf', kind: 'document' };
  }

  return null;
}

module.exports = { sniffFileType };
