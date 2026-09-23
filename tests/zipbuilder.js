const path = require('path');
const fs = require('fs');
const zlib = require('zlib');

// Build a minimal valid ZIP with one stored (uncompressed) entry having
// the given entryName and content. Used only by tests to craft hostile
// archives that exercise path-traversal rejection.
function makeRawZip(entryName, content) {
  const data = Buffer.isBuffer(content) ? content : Buffer.from(content);
  const nameBuf = Buffer.from(entryName, 'utf8');
  const crc = zlib.crc32 ? zlib.crc32(data) : require('buffer').Buffer.from(data).reduce((a, b) => ((a >>> 8) ^ require('crc-32').buf(data)) >>> 0, 0);

  // CRC-32 fallback (zlib.crc32 exists in Node 20+)
  const crcVal = typeof zlib.crc32 === 'function' ? zlib.crc32(data) : crc32fallback(data);

  // Local file header
  const lfh = Buffer.alloc(30);
  lfh.writeUInt32LE(0x04034b50, 0); // signature
  lfh.writeUInt16LE(20, 4);         // version needed
  lfh.writeUInt16LE(0, 6);          // flags
  lfh.writeUInt16LE(0, 8);          // compression method: stored
  lfh.writeUInt16LE(0, 10);         // last mod time
  lfh.writeUInt16LE(0, 12);         // last mod date
  lfh.writeUInt32LE(crcVal, 14);    // crc32
  lfh.writeUInt32LE(data.length, 18);  // compressed size
  lfh.writeUInt32LE(data.length, 22);  // uncompressed size
  lfh.writeUInt16LE(nameBuf.length, 26); // file name length
  lfh.writeUInt16LE(0, 28);         // extra field length
  const localPart = Buffer.concat([lfh, nameBuf, data]);

  // Central directory file header
  const cdh = Buffer.alloc(46);
  cdh.writeUInt32LE(0x02014b50, 0); // signature
  cdh.writeUInt16LE(20, 4);         // version made by
  cdh.writeUInt16LE(20, 6);         // version needed
  cdh.writeUInt16LE(0, 8);          // flags
  cdh.writeUInt16LE(0, 10);         // compression
  cdh.writeUInt16LE(0, 12);         // last mod time
  cdh.writeUInt16LE(0, 14);         // last mod date
  cdh.writeUInt32LE(crcVal, 16);    // crc32
  cdh.writeUInt32LE(data.length, 20);  // compressed size
  cdh.writeUInt32LE(data.length, 24);  // uncompressed size
  cdh.writeUInt16LE(nameBuf.length, 28); // file name length
  cdh.writeUInt16LE(0, 30);         // extra field length
  cdh.writeUInt16LE(0, 32);         // comment length
  cdh.writeUInt16LE(0, 34);         // disk number start
  cdh.writeUInt16LE(0, 36);         // internal file attrs
  cdh.writeUInt32LE(0, 38);         // external file attrs
  cdh.writeUInt32LE(0, 42);         // relative offset of local header
  const cdPart = Buffer.concat([cdh, nameBuf]);

  // End of central directory record
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // signature
  eocd.writeUInt16LE(0, 4);          // disk number
  eocd.writeUInt16LE(0, 6);          // disk where CD starts
  eocd.writeUInt16LE(1, 8);          // entries in CD on this disk
  eocd.writeUInt16LE(1, 10);         // total entries in CD
  eocd.writeUInt32LE(cdPart.length, 12);  // size of CD
  eocd.writeUInt32LE(localPart.length, 16);  // offset of CD
  eocd.writeUInt16LE(0, 18);         // comment length

  return Buffer.concat([localPart, cdPart, eocd]);
}

function crc32fallback(buf) {
  // CRC-32 IEEE 802.3
  let table = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c;
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

module.exports = { makeRawZip };