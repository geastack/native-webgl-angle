#!/usr/bin/env python3
# WOFF (v1) -> TTF/OTF converter. WOFF v1 is an SFNT container whose tables are
# individually zlib-compressed (RFC: W3C WOFF 1.0). Reconstructs the SFNT byte
# stream stb_truetype can parse. No dependencies beyond the stdlib.
import struct
import sys
import zlib


def woff_to_ttf(data: bytes) -> bytes:
    (signature, flavor, _length, num_tables, _reserved, _total_sfnt_size) = struct.unpack('>IIIHHI', data[:20])
    if signature != 0x774F4646:  # 'wOFF'
        raise SystemExit('not a WOFF v1 file')
    entries = []
    off = 44  # 20 + metaOffset/metaLength/metaOrigLength/privOffset/privLength (24 bytes)
    for _ in range(num_tables):
        tag, table_offset, comp_length, orig_length, orig_checksum = struct.unpack('>4sIIII', data[off:off + 20])
        off += 20
        raw = data[table_offset:table_offset + comp_length]
        table = zlib.decompress(raw) if comp_length < orig_length else raw
        if len(table) != orig_length:
            raise SystemExit(f'table {tag!r} decompressed to {len(table)}, expected {orig_length}')
        entries.append((tag, orig_checksum, table))
    entries.sort(key=lambda e: e[0])
    n = len(entries)
    search_range = 1
    entry_selector = 0
    while search_range * 2 <= n:
        search_range *= 2
        entry_selector += 1
    search_range *= 16
    range_shift = n * 16 - search_range
    out = bytearray(struct.pack('>IHHHH', flavor, n, search_range, entry_selector, range_shift))
    data_offset = 12 + n * 16
    tables_blob = bytearray()
    for tag, checksum, table in entries:
        padded = table + b'\0' * ((4 - len(table) % 4) % 4)
        out += struct.pack('>4sIII', tag, checksum, data_offset + len(tables_blob), len(table))
        tables_blob += padded
    return bytes(out) + bytes(tables_blob)


if __name__ == '__main__':
    src, dst = sys.argv[1], sys.argv[2]
    with open(src, 'rb') as f:
        woff = f.read()
    ttf = woff_to_ttf(woff)
    with open(dst, 'wb') as f:
        f.write(ttf)
    print(f'{dst}: {len(ttf)} bytes')
