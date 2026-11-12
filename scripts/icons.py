"""Render the original bar-chart/arrow icon using only Python's standard library."""
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def inside_polygon(x, y, points):
    inside = False
    for (x1, y1), (x2, y2) in zip(points, points[1:] + points[:1]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def color(x, y):
    # 16px transparent inset at 128px; original artwork, no Discord branding.
    dx, dy = max(28 - x, 0, x - 100), max(28 - y, 0, y - 100)
    if not (16 <= x <= 112 and 16 <= y <= 112 and dx * dx + dy * dy <= 144):
        return (0, 0, 0, 0)
    for bottom, width in [(44, 43), (66, 31), (88, 19)]:
        if 32 <= x <= 32 + width and bottom - 9 <= y <= bottom:
            return (244, 247, 255, 255)
    if inside_polygon(x, y, [(88, 35), (96, 35), (96, 75), (103, 75), (92, 91), (81, 75), (88, 75)]):
        return (151, 232, 213, 255)
    return (69, 79, 176, 255)


def png(size):
    rows = bytearray()
    samples = 4
    for row in range(size):
        rows.append(0)
        for col in range(size):
            values = [color((col + (sx + .5) / samples) * 128 / size,
                            (row + (sy + .5) / samples) * 128 / size)
                      for sy in range(samples) for sx in range(samples)]
            alpha = sum(v[3] for v in values)
            channels = [round(sum(v[c] * v[3] for v in values) / alpha) if alpha else 0 for c in range(3)]
            rows.extend([*channels, round(alpha / len(values))])
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(rows, 9)) + chunk(b"IEND", b"")


if __name__ == "__main__":
    for size in (16, 32, 48, 128):
        target = ROOT / f"icons/icon-{size}.png"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(png(size))
        print(f"Rendered {target.relative_to(ROOT)}")
