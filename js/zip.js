// Minimal ZIP reader for content packs. Reads the central directory and then
// slices single entries out of the File, so a pack is never loaded whole.
// Deflate entries are inflated with the browser's DecompressionStream.

const SIG_EOCD = 0x06054b50;
const SIG_CD = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

async function readView(blob, start, length) {
  return new DataView(await blob.slice(start, start + length).arrayBuffer());
}

export async function listEntries(file) {
  const tailLength = Math.min(file.size, 65557);
  const tailStart = file.size - tailLength;
  const tail = await readView(file, tailStart, tailLength);
  let eocd = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === SIG_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a ZIP file (no end-of-central-directory record).");
  const diskEntries = tail.getUint16(eocd + 10, true);
  const cdSize = tail.getUint32(eocd + 12, true);
  const cdOffset = tail.getUint32(eocd + 16, true);
  if (diskEntries === 0xffff) throw new Error("ZIP64 packs are not supported.");

  const cd = await readView(file, cdOffset, cdSize);
  const entries = new Map();
  let p = 0;
  for (let i = 0; i < diskEntries; i++) {
    if (cd.getUint32(p, true) !== SIG_CD) throw new Error("Corrupt ZIP central directory.");
    const method = cd.getUint16(p + 10, true);
    const compSize = cd.getUint32(p + 20, true);
    const uncompSize = cd.getUint32(p + 24, true);
    const nameLen = cd.getUint16(p + 28, true);
    const extraLen = cd.getUint16(p + 30, true);
    const commentLen = cd.getUint16(p + 32, true);
    const localOffset = cd.getUint32(p + 42, true);
    const name = new TextDecoder("utf-8").decode(
      new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nameLen),
    );
    entries.set(name, { name, method, compSize, uncompSize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function localDataStart(file, entry) {
  const header = await readView(file, entry.localOffset, 30);
  if (header.getUint32(0, true) !== SIG_LOCAL) throw new Error(`Corrupt ZIP entry: ${entry.name}`);
  const nameLen = header.getUint16(26, true);
  const extraLen = header.getUint16(28, true);
  return entry.localOffset + 30 + nameLen + extraLen;
}

/** Return an ArrayBuffer of the uncompressed entry bytes. */
export async function readEntry(file, entry) {
  const start = await localDataStart(file, entry);
  const data = file.slice(start, start + entry.compSize);
  if (entry.method === 0) {
    const buf = await data.arrayBuffer();
    if (buf.byteLength !== entry.uncompSize) throw new Error(`Size mismatch: ${entry.name}`);
    return buf;
  }
  if (entry.method !== 8) throw new Error(`Unsupported ZIP compression for ${entry.name}.`);
  const stream = data.stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const buf = await new Response(stream).arrayBuffer();
  if (buf.byteLength !== entry.uncompSize) throw new Error(`Size mismatch: ${entry.name}`);
  return buf;
}

/** For STORED entries return a Blob without copying through memory. */
export async function entryBlob(file, entry) {
  const start = await localDataStart(file, entry);
  return file.slice(start, start + entry.compSize);
}

export async function sha256Hex(buffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function bytesToText(buffer) {
  return new TextDecoder("utf-8").decode(buffer);
}
