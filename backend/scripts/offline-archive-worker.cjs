'use strict';

// Packaging never runs in the HTTP event loop. One worker at a time uses
// bounded buffers, streaming compression, and verified immutable copies.
const { parentPort, workerData } = require('node:worker_threads');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { Transform, Writable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}

async function createPackage({ gamesDir, packageRoot, manifest }) {
  if (!/^[a-z0-9-]+$/.test(manifest.gameId) || !/^[a-f0-9]{32}$/.test(manifest.buildId) ||
      !/^\d+\.\d+\.\d+$/.test(manifest.version) || manifest.files.length > 65535 ||
      manifest.totalBytes > 512 * 1024 * 1024) throw Error('Unsupported bundle archive');
  const sourceRoot = fs.realpathSync(path.join(gamesDir, manifest.gameId, manifest.version));
  const gameRoot = path.resolve(packageRoot, manifest.gameId);
  fs.mkdirSync(gameRoot, { recursive: true });
  const space = fs.statfsSync(gameRoot);
  if (manifest.totalBytes * 2 + 128 * 1024 * 1024 > space.bavail * space.bsize) {
    throw Error('Insufficient disk space for an immutable game package');
  }
  const target = path.join(gameRoot, manifest.buildId);
  const staging = fs.mkdtempSync(path.join(gameRoot, '.package-'));
  const archivePath = path.join(staging, '.payload.zip');
  let archiveFd;
  try {
    archiveFd = fs.openSync(archivePath, 'wx');
    let offset = 0;
    const central = [];
    const names = new Set();
    const write = buffer => {
      let written = 0;
      while (written < buffer.length) written += fs.writeSync(archiveFd, buffer, written, buffer.length - written);
      offset += buffer.length;
      if (offset > 0xffffffff) throw Error('ZIP64 is not supported');
    };
    for (const file of manifest.files) {
      if (!file.path || file.path.includes('\\') || file.path.split('/').some(part => !part || part === '.' || part === '..' || part.startsWith('.')) ||
          names.has(file.path) || !Number.isSafeInteger(file.bytes) || file.bytes < 0) throw Error('Unsafe archive file');
      names.add(file.path);
      const source = fs.realpathSync(path.resolve(sourceRoot, file.path));
      if (!source.startsWith(sourceRoot + path.sep) || !fs.statSync(source).isFile()) throw Error('File escapes build directory');
      const copy = path.resolve(staging, file.path);
      if (!copy.startsWith(staging + path.sep)) throw Error('File escapes package directory');
      fs.mkdirSync(path.dirname(copy), { recursive: true });
      // Copies, not hard links: a later force deploy cannot mutate cached bytes.
      fs.copyFileSync(source, copy, fs.constants.COPYFILE_EXCL);
      const filename = Buffer.from(file.path, 'utf8');
      if (filename.length > 65535) throw Error('Archive filename too long');
      const start = offset;
      const header = Buffer.alloc(30);
      header.writeUInt32LE(0x04034b50, 0);
      header.writeUInt16LE(20, 4);
      header.writeUInt16LE(0x808, 6); // UTF-8 + streaming data descriptor
      header.writeUInt16LE(8, 8);
      header.writeUInt16LE(0x21, 12); // 1980-01-01, deterministic archive bytes
      header.writeUInt16LE(filename.length, 26);
      write(header);
      write(filename);
      const dataStart = offset;
      const hash = crypto.createHash('sha256');
      let crc = 0xffffffff;
      let bytes = 0;
      const check = new Transform({ transform(chunk, _encoding, done) {
        bytes += chunk.length;
        if (bytes > file.bytes) return done(Error('Source changed while packaging'));
        hash.update(chunk);
        for (const byte of chunk) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
        done(null, chunk);
      } });
      const compress = zlib.createDeflateRaw({ level: 1, chunkSize: 64 * 1024 });
      const sink = new Writable({ write(chunk, _encoding, done) {
        try { write(chunk); done(); } catch (error) { done(error); }
      } });
      await pipeline(fs.createReadStream(copy, { highWaterMark: 64 * 1024 }), check, compress, sink);
      if (bytes !== file.bytes || hash.digest('hex') !== file.sha256) throw Error('Source changed while packaging');
      // Windows FlushFileBuffers requires a writable file handle.
      const copyFd = fs.openSync(copy, 'r+');
      try { fs.fsyncSync(copyFd); } finally { fs.closeSync(copyFd); }
      crc = (crc ^ 0xffffffff) >>> 0;
      const compressed = offset - dataStart;
      const descriptor = Buffer.alloc(16);
      descriptor.writeUInt32LE(0x08074b50, 0);
      descriptor.writeUInt32LE(crc, 4);
      descriptor.writeUInt32LE(compressed, 8);
      descriptor.writeUInt32LE(bytes, 12);
      write(descriptor);
      const record = Buffer.alloc(46);
      record.writeUInt32LE(0x02014b50, 0);
      record.writeUInt16LE(20, 4);
      record.writeUInt16LE(20, 6);
      record.writeUInt16LE(0x808, 8);
      record.writeUInt16LE(8, 10);
      record.writeUInt16LE(0x21, 14);
      record.writeUInt32LE(crc, 16);
      record.writeUInt32LE(compressed, 20);
      record.writeUInt32LE(bytes, 24);
      record.writeUInt16LE(filename.length, 28);
      record.writeUInt32LE(start, 42);
      central.push(record, filename);
    }
    const centralStart = offset;
    for (const buffer of central) write(buffer);
    const centralBytes = offset - centralStart;
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(manifest.files.length, 8);
    end.writeUInt16LE(manifest.files.length, 10);
    end.writeUInt32LE(centralBytes, 12);
    end.writeUInt32LE(centralStart, 16);
    write(end);
    fs.fsyncSync(archiveFd);
    fs.closeSync(archiveFd);
    archiveFd = undefined;
    const archiveHash = crypto.createHash('sha256');
    for await (const chunk of fs.createReadStream(archivePath)) archiveHash.update(chunk);
    let archiveName = 'bundle.zip';
    let attempt = 0;
    while (names.has(archiveName)) archiveName = `bundle-${manifest.buildId}-${++attempt}.zip`;
    const archive = { path: archiveName, bytes: offset, sha256: archiveHash.digest('hex') };
    const metadata = fs.openSync(path.join(staging, '.package.json'), 'wx');
    try { fs.writeFileSync(metadata, JSON.stringify({ ...manifest, archive })); fs.fsyncSync(metadata); }
    finally { fs.closeSync(metadata); }
    try { fs.renameSync(staging, target); }
    catch (error) {
      // Multiple backend instances keep the winner's frozen bytes unchanged.
      const winner = JSON.parse(fs.readFileSync(path.join(target, '.package.json'), 'utf8'));
      if (winner.buildId === manifest.buildId && winner.gameId === manifest.gameId && winner.version === manifest.version && winner.archive) return winner.archive;
      throw error;
    }
    try {
      const directoryFd = fs.openSync(gameRoot, 'r');
      try { fs.fsyncSync(directoryFd); } finally { fs.closeSync(directoryFd); }
    } catch { /* directory fsync is unavailable on some Windows filesystems */ }
    return archive;
  } finally {
    if (archiveFd !== undefined) fs.closeSync(archiveFd);
    // Only the exact temporary directory we created inside the package root.
    if (path.dirname(staging) === gameRoot && path.basename(staging).startsWith('.package-')) {
      fs.rmSync(staging, { recursive: true, force: true });
    }
  }
}

createPackage(workerData).then(
  archive => parentPort.postMessage({ archive }),
  error => parentPort.postMessage({ error: error.message }),
);
