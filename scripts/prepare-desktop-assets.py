"""Select lossless 32px CUR frames and complete Tauri's multi-size Windows ICO."""
from pathlib import Path
import struct
root = Path(__file__).resolve().parents[1]
compact = root / 'public/cursors/compact'
compact.mkdir(exist_ok=True)
for source in (root / 'public/cursors').glob('*.cur'):
    data = source.read_bytes()
    _, kind, count = struct.unpack_from('<HHH', data)
    assert kind == 2 and count
    frames = []
    for n in range(count):
        entry = data[6 + n * 16:22 + n * 16]
        size, offset = struct.unpack_from('<II', entry, 8)
        frames.append((entry[0] or 256, entry, data[offset:offset + size]))
    width, entry, pixels = min(frames, key=lambda frame: frame[0])
    assert width == 32, source
    hot_x, hot_y = struct.unpack_from('<HH', entry, 4)
    assert hot_x < width and hot_y < (entry[1] or 256)
    entry = bytearray(entry)
    struct.pack_into('<I', entry, 12, 22)
    (compact / source.name).write_bytes(struct.pack('<HHH', 0, 2, 1) + entry + pixels)
icon = root / 'src-tauri/icons/icon.ico'
data = icon.read_bytes()
count = struct.unpack_from('<H', data, 4)[0]
frames = {}
for n in range(count):
    entry = data[6 + n * 16:22 + n * 16]
    size, offset = struct.unpack_from('<II', entry, 8)
    frames[entry[0] or 256] = (entry, data[offset:offset + size])
png = (root / 'src-tauri/icons/128x128.png').read_bytes()
frames[128] = (struct.pack('<BBBBHHII', 128, 128, 0, 0, 1, 32, len(png), 0), png)
assert {16, 24, 32, 48, 64, 128, 256} <= frames.keys()
header = bytearray(struct.pack('<HHH', 0, 1, len(frames)))
payload = bytearray()
offset = 6 + len(frames) * 16
for width in sorted(frames):
    entry, pixels = frames[width]
    entry = bytearray(entry)
    struct.pack_into('<I', entry, 12, offset)
    header += entry
    payload += pixels
    offset += len(pixels)
icon.write_bytes(header + payload)
print('Desktop ICO sizes:', ', '.join(map(str, sorted(frames))))
print('Compact CUR files:', len(list(compact.glob('*.cur'))))
