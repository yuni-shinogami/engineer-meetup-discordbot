"""過去の LT 動画のサムネイル（手作り）に寄せた、自動のたたき台。

  - 登壇者のアバターを切り抜いて右に大きく（白いふち付き）
  - タイトルを大きく、グラデーションの文字に白と濃紺の二重のふち
  - 背景は白地にオレンジの斜めの帯（A）か、スライド（B）
  - 角にロゴ
"""
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageChops
import numpy as np

TW, TH = 1280, 720
ORANGE = (243, 152, 0)
NAVY = (20, 30, 70)
BREAK_AFTER = set(" 　、。・：:／/」』）)ーをにのはがでとへもや")


def font(path, size, weight="Black"):
    f = ImageFont.truetype(path, size)
    names = {n.decode() if isinstance(n, bytes) else n: n for n in f.get_variation_names()}
    f.set_variation_by_name(names[weight])
    return f


# ---------- アバターの切り抜き ----------

def largest_component(alpha):
    """切り抜きに混ざった小さな破片（浮いている看板など）を落とし、いちばん大きい塊だけ残す"""
    import cv2
    solid = (alpha > 128).astype("uint8")
    n, labels, stats, _ = cv2.connectedComponentsWithStats(solid, 8)
    if n <= 1:
        return alpha
    keep = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    mask = cv2.dilate((labels == keep).astype("uint8"), np.ones((5, 5), "uint8"))
    return (alpha * mask).astype("uint8")


def best_cutout(frames, cutouts):
    """切り抜いた候補から、いちばん「正面で大きく写っている」ものを選ぶ。
    正面のほうが顔や服の細部が見えて輪郭が多いので、切り抜いた範囲の輪郭の密度で比べる
    （色の鮮やかさは床の赤が混ざって正面と背面で差が出なかった）。"""
    best, best_score = None, -1
    for frame, cut in zip(frames, cutouts):
        alpha = largest_component(np.asarray(cut.getchannel("A")))
        alpha = np.where(alpha >= 128, alpha, 0).astype("uint8")  # 半透明の残りは白ふちで目立つので落とす
        inside = alpha > 0
        if inside.sum() < 500:
            continue
        ys, xs = np.nonzero(inside)
        # 枠の端で切れているアバターは使いにくい
        touches = int(xs.min() <= 1) + int(xs.max() >= alpha.shape[1] - 2) + int(ys.min() <= 1)
        edges = np.asarray(frame.convert("L").filter(ImageFilter.FIND_EDGES)) / 255
        score = inside.mean() * edges[inside].mean() * (0.5 ** touches)
        if score > best_score:
            cut = cut.copy()
            cut.putalpha(Image.fromarray(alpha))
            best, best_score = cut.crop(cut.getbbox()), score
    return best


def sticker(cut, height, border=10):
    """切り抜きを高さに合わせて拡大し、白いふちと影を付ける"""
    w = round(cut.width * height / cut.height)
    cut = cut.resize((w, height), Image.LANCZOS).filter(ImageFilter.UnsharpMask(2, 80, 2))
    pad = border * 3
    canvas = Image.new("RGBA", (w + pad * 2, height + pad * 2), (0, 0, 0, 0))
    alpha = Image.new("L", canvas.size, 0)
    alpha.paste(cut.getchannel("A"), (pad, pad))
    outline = alpha.filter(ImageFilter.MaxFilter(border * 2 + 1))
    shadow = outline.filter(ImageFilter.GaussianBlur(12))
    canvas.paste((0, 0, 0, 110), (8, 10), ImageChops.multiply(shadow, Image.new("L", shadow.size, 255)))
    canvas.alpha_composite(Image.merge("RGBA", (*Image.new("RGB", canvas.size, "white").split(), outline)))
    canvas.alpha_composite(cut, (pad, pad))
    return canvas


# ---------- タイトル ----------

def break_costs(title):
    """改行位置ごとの不自然さ。文節の切れ目（BudouX）は 0、文節の中は避け、英単語・カタカナ語の途中では改行しない"""
    import budoux
    bounds, pos = set(), 0
    for phrase in budoux.load_default_japanese_parser().parse(title)[:-1]:
        pos += len(phrase)
        bounds.add(pos)

    def word_char(c):
        return (c.isascii() and c.isalnum()) or "゠" <= c <= "ヿ"

    costs = {}
    for i in range(1, len(title)):
        a, b = title[i - 1], title[i]
        if word_char(a) and word_char(b) and a.isascii() == b.isascii():
            continue
        costs[i] = 0.0 if i in bounds else 0.5
    return costs


def fit_title(title, font_path, box_w, box_h, max_size=150, max_lines=3):
    """1〜3 行の分け方をすべて試し、「箱に収まる文字サイズ × 改行位置の自然さ」がいちばん良いものを選ぶ"""
    import itertools
    draw = ImageDraw.Draw(Image.new("L", (1, 1)))
    unit = font(font_path, 100)
    costs = break_costs(title)
    best, best_score = (40, [title]), -1
    for n in range(1, max_lines + 1):
        for cut in itertools.combinations(sorted(costs), n - 1):
            parts = [title[a:b].strip() for a, b in zip((0, *cut), (*cut, len(title)))]
            if any(not p for p in parts):
                continue
            width = max(draw.textlength(p, font=unit) for p in parts) / 100
            size = int(min(max_size, box_w / width, box_h / (1.15 * n)))
            # 1〜2 文字だけの行（「法」など）は文節の切れ目と判定されても不自然なので避ける
            short = sum(0.4 for p in parts if len(p) <= 2) if n > 1 else 0
            score = size * (1 - sum(costs[i] for i in cut) - short)
            if score > best_score:
                best, best_score = (size, parts), score
    return best


def gradient(size, top, bottom):
    g = np.linspace(0, 1, size[1])[:, None, None]
    arr = (np.array(top) * (1 - g) + np.array(bottom) * g).astype("uint8")
    return Image.fromarray(np.repeat(arr, size[0], axis=1), "RGB")


def draw_title(canvas, lines, font_path, size, origin, colors):
    """グラデーションの文字に白いふち、その外に濃紺のふちと影（過去のサムネの書式）"""
    f = font(font_path, size)
    line_h = round(size * 1.15)
    w = max(round(ImageDraw.Draw(canvas).textlength(l, font=f)) for l in lines) + 60
    h = line_h * len(lines) + 60
    fill_mask = Image.new("L", (w, h), 0)
    white_mask = Image.new("L", (w, h), 0)
    navy_mask = Image.new("L", (w, h), 0)
    s_white, s_navy = max(6, size // 10), max(9, size // 7)
    for i, line in enumerate(lines):
        xy = (30, 30 + i * line_h)
        ImageDraw.Draw(navy_mask).text(xy, line, font=f, fill=255, stroke_width=s_navy, stroke_fill=255)
        ImageDraw.Draw(white_mask).text(xy, line, font=f, fill=255, stroke_width=s_white, stroke_fill=255)
        ImageDraw.Draw(fill_mask).text(xy, line, font=f, fill=255)
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    layer.paste((0, 0, 0, 120), (6, 8), navy_mask.filter(ImageFilter.GaussianBlur(6)))
    layer.paste(NAVY + (255,), (0, 0), navy_mask)
    layer.paste((255, 255, 255, 255), (0, 0), white_mask)
    layer.paste(gradient((w, h), *colors), (0, 0), fill_mask)
    canvas.alpha_composite(layer, (origin[0] - 30, origin[1] - 30))


# ---------- 組み立て ----------

def logo_plate(logo, width):
    logo = logo.resize((width, round(logo.height * width / logo.width)), Image.LANCZOS)
    plate = Image.new("RGBA", (logo.width + 28, logo.height + 28), (0, 0, 0, 0))
    ImageDraw.Draw(plate).rounded_rectangle([0, 0, plate.width - 1, plate.height - 1], radius=22, fill="white")
    plate.alpha_composite(logo, (14, 14))
    return plate


def compose(variant, title, avatar, slide, logo, font_path):
    if variant == "A":
        # 白地にオレンジの斜めの帯（アバターの後ろ）
        bg = Image.new("RGBA", (TW, TH), "white")
        ImageDraw.Draw(bg).polygon([(700, 0), (1050, 0), (820, TH), (470, TH)], fill=ORANGE)
        ImageDraw.Draw(bg).polygon([(1120, 0), (TW, 0), (TW, TH), (900, TH)], fill=ORANGE)
        colors = ((120, 200, 255), (20, 90, 220))
    else:
        # スライドを背景に（少し暗くして文字を立てる）
        bg = slide.convert("RGB").resize((TW, TH), Image.LANCZOS).filter(ImageFilter.GaussianBlur(1.5)).convert("RGBA")
        bg = Image.alpha_composite(bg, Image.new("RGBA", (TW, TH), (0, 0, 0, 70)))
        colors = ((255, 240, 120), (255, 150, 30))
    if avatar is not None:
        st = sticker(avatar, 600)
        bg.alpha_composite(st, (TW - st.width + 40, TH - st.height + 50))
    # 文字はロゴと重ならない範囲に収める（A はロゴが左下、B は右上でアバターの頭の上）
    top, bottom = 40, (TH - 200 if variant == "A" else TH - 40)
    size, lines = fit_title(title, font_path, 940, bottom - top, max_size=170, max_lines=4)
    text_h = round(size * 1.15) * len(lines)
    draw_title(bg, lines, font_path, size, (50, top + (bottom - top - text_h) // 2), colors)
    plate = logo_plate(logo, 150)
    bg.alpha_composite(plate, (24, TH - plate.height - 24) if variant == "A" else (TW - plate.width - 24, 24))
    return bg.convert("RGB")
