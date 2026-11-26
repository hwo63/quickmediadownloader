import os
from PIL import Image, ImageDraw

sizes = [16, 32, 48, 128]
os.makedirs("icons", exist_ok=True)

for size in sizes:
    # Scale factor for anti-aliasing
    scale = 4
    canvas_size = size * scale
    img = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    pad = canvas_size * 0.06
    r = canvas_size * 0.28
    
    # Modern gradient background simulation (blue/indigo to teal)
    # Draw rounded rect
    draw.rounded_rectangle(
        [pad, pad, canvas_size - pad, canvas_size - pad],
        radius=int(r),
        fill="#1e40af" # Deep indigo/blue base
    )
    
    # Inner gradient effect with an overlay
    overlay = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    ov_draw = ImageDraw.Draw(overlay)
    ov_draw.rounded_rectangle(
        [pad, pad, canvas_size - pad, canvas_size - pad],
        radius=int(r),
        fill="#0284c7" # Sky blue
    )
    # Blend
    img = Image.blend(img, overlay, 0.4)
    draw = ImageDraw.Draw(img)

    # Draw download arrow and tray
    cx = canvas_size / 2.0
    cy = canvas_size / 2.0
    
    # Stem of arrow
    stem_w = canvas_size * 0.14
    stem_top = canvas_size * 0.22
    stem_bottom = canvas_size * 0.52
    
    draw.rounded_rectangle(
        [cx - stem_w / 2, stem_top, cx + stem_w / 2, stem_bottom],
        radius=int(stem_w * 0.3),
        fill="#ffffff"
    )

    # Arrowhead
    head_w = canvas_size * 0.46
    head_tip_y = canvas_size * 0.65
    head_base_y = canvas_size * 0.45
    
    draw.polygon(
        [
            (cx, head_tip_y),
            (cx - head_w / 2, head_base_y),
            (cx + head_w / 2, head_base_y)
        ],
        fill="#ffffff"
    )

    # Bottom tray/bracket
    tray_y = canvas_size * 0.74
    tray_h = canvas_size * 0.11
    tray_w = canvas_size * 0.56
    tray_r = int(tray_h * 0.35)
    
    # Horizontal bar of tray
    draw.rounded_rectangle(
        [cx - tray_w / 2, tray_y, cx + tray_w / 2, tray_y + tray_h],
        radius=tray_r,
        fill="#38bdf8" # Cyan glow
    )

    # Downsample with high quality Lanczos
    final_img = img.resize((size, size), Image.Resampling.LANCZOS)
    final_img.save(f"icons/icon-{size}.png", "PNG")
    print(f"Generated icons/icon-{size}.png")

print("All icons generated successfully!")
