"""エンジニア集会の LT を録画 → LT ごとに分割 → YouTube へアップロードする（gaming-laptop 側）。

Bot からは Request-Recorder.ps1 経由で呼ばれ、結果を JSON 1 行で標準出力に返す。

  start  {"event": "...", "location": "wrld_...:..."}   OSC で移動 → 録画開始
  mark   {"lt_id": "...", "title": "...", "speaker": "...", "archive_policy": "public|unlisted|none"}
  end    {}                                             区切り（ここから次の mark までは捨てる）
  stop   {}                                             録画停止（編集・アップロードは pipeline タスクが続ける）
  status {}                                             最新セッションの状態

手で使うもの:
  pipeline <セッション>   編集 → アップロード（タスク LT-Recorder-Pipeline から呼ばれる）
  move [world]            OSC ルートだけ実行（位置の調整用）
  auth                    YouTube の OAuth 認可（初回のみ）
"""
import argparse, base64, datetime as dt, io, json, math, os, re, subprocess, sys, time, tomllib, traceback
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CFG = tomllib.loads((ROOT / "config.toml").read_text(encoding="utf-8"))
OUT = Path(os.path.expandvars(CFG["output"]["dir"]))
LATEST = OUT / "latest.json"
VRC_LOGS = Path(os.environ["USERPROFILE"]) / "AppData/LocalLow/VRChat/VRChat"
ARCHIVE_POLICIES = ("public", "unlisted", "none")
LOCATION_PATTERN = re.compile(r"^wrld_[0-9a-f-]{36}:[A-Za-z0-9]+(~[A-Za-z]+\([A-Za-z0-9_.-]+\))*$")


class UserError(Exception):
    """Bot にそのまま見せてよい失敗"""


def log(msg):
    line = f"{dt.datetime.now():%Y-%m-%d %H:%M:%S} {msg}"
    with open(OUT / "recorder.log", "a", encoding="utf-8") as f:
        f.write(line + "\n")
    print(line, file=sys.stderr, flush=True)  # Bot は stdout の JSON だけを読む


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def save(path, data):
    tmp = Path(path).with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def latest_session():
    if not LATEST.exists():
        raise UserError("録画セッションがありません")
    sdir = Path(load(LATEST)["dir"])
    return sdir, load(sdir / "session.json")


def recording_session():
    sdir, s = latest_session()
    if s["state"] != "recording":
        raise UserError("録画中ではありません")
    return sdir, s


# ---------- OBS ----------

def obs():
    import obsws_python as obsws
    conf = load(Path(os.environ["APPDATA"]) / "obs-studio/plugin_config/obs-websocket/config.json")

    def connect():
        return obsws.ReqClient(host="localhost", port=conf["server_port"], password=conf["server_password"], timeout=10)

    try:
        return connect()
    except Exception:
        pass
    # OBS が起動していなければ、タスク LT-Recorder-OBS でログイン中のデスクトップに起動して、WebSocket が開くのを待つ
    log("OBS に接続できないので起動します")
    subprocess.run(["schtasks", "/run", "/tn", "LT-Recorder-OBS"], capture_output=True)
    deadline = time.time() + 60
    while True:
        time.sleep(2)
        try:
            return connect()
        except Exception as ex:
            if time.time() > deadline:
                raise UserError(f"OBS に接続できません（起動していて WebSocket が有効か確認してください）: {ex}")


def ensure_scene(c):
    scene = CFG["obs"]["scene"]
    window = "VRChat:UnityWndClass:VRChat.exe"
    if scene not in [s["sceneName"] for s in c.get_scene_list().scenes]:
        c.create_scene(scene)
        c.create_input(scene, f"{scene} 映像", "game_capture",
                       {"capture_mode": "window", "window": window, "priority": 2, "capture_cursor": False}, True)
        c.create_input(scene, f"{scene} 音声", "wasapi_process_output_capture",
                       {"window": window, "priority": 2}, True)
        log(f"OBS にシーン「{scene}」を作成")
    c.set_current_program_scene(scene)


def record_seconds(c):
    st = c.get_record_status()
    if not st.output_active:
        raise UserError("OBS が録画していません")
    return st.output_duration / 1000


# ---------- VRChat ----------

def current_location():
    """いま VRChat が入っているインスタンス（最新ログの最後の Joining 行）"""
    logs = sorted(VRC_LOGS.glob("output_log_*.txt"), key=lambda p: p.stat().st_mtime)
    if not logs:
        return None
    joins = re.findall(r"\[Behaviour\] Joining (wrld_\S+)", logs[-1].read_text(encoding="utf-8", errors="replace"))
    return joins[-1] if joins else None


def vrchat_running():
    out = subprocess.run(["tasklist", "/fi", "imagename eq VRChat.exe", "/fo", "csv", "/nh"],
                         capture_output=True, text=True).stdout
    return "VRChat.exe" in out


# ワールドが人流解析のために 1 秒ごとに出す自分の位置。「協力する」を選んだときだけ出る
POSE_PATTERN = re.compile(r"^(\S+ \S+) .*\[Player Position\]\d+,\"[^\"]*\",([-\d.]+),([-\d.]+),([-\d.]+),[-\d.]+,([-\d.]+)")


def read_pose():
    """最新ログの末尾から、自分の (時刻, x, y, z, 向き) を返す。向きは +z が 0°、右回りに増える"""
    logs = sorted(VRC_LOGS.glob("output_log_*.txt"), key=lambda p: p.stat().st_mtime)
    if not logs:
        return None
    with open(logs[-1], "rb") as f:
        f.seek(max(0, f.seek(0, 2) - 65536))
        tail = f.read().decode("utf-8", errors="replace").splitlines()
    for line in reversed(tail):
        if m := POSE_PATTERN.match(line):
            t = dt.datetime.strptime(m.group(1), "%Y.%m.%d %H:%M:%S")
            return t, *map(float, m.group(2, 3, 4, 5))
    return None


def fresh_pose(after, timeout=4.0):
    """after より後に記録された位置を待つ（ログは 1 秒刻み）"""
    deadline = time.time() + timeout
    while time.time() < deadline:
        pose = read_pose()
        if pose and pose[0] > after:
            return pose
        time.sleep(0.2)
    raise UserError("VRChat のログに位置が出ていません（入室時のダイアログで「協力する」を選べているか確認してください）")


def angle_diff(target, current):
    return (target - current + 540) % 360 - 180


def desktop_input(dx=0, dy=0, click=False, keys=""):
    """マウス・キーボード入力はデスクトップのセッションでないと VRChat に届かないので、タスク経由で送る"""
    click_log = ROOT / "click.log"
    before = click_log.stat().st_mtime if click_log.exists() else 0
    (ROOT / "click.txt").write_text(f"{dx} {dy} {int(click)} {keys}".strip(), encoding="ascii")
    subprocess.run(["schtasks", "/run", "/tn", "LT-Recorder-Click"], capture_output=True, check=True)
    deadline = time.time() + 30
    while time.time() < deadline:
        time.sleep(0.3)
        if click_log.exists() and click_log.stat().st_mtime != before:
            last = click_log.read_text(encoding="utf-8-sig").splitlines()[-1]
            if "失敗" in last:
                raise UserError(f"デスクトップ入力に失敗しました: {last}")
            return
    raise UserError("デスクトップ入力のタスクが応答しません")


def screenshot(c):
    """録画シーン（VRChat の画面）を 960x540 で撮る"""
    from PIL import Image
    r = c.get_source_screenshot(CFG["obs"]["scene"], "png", 960, 540, -1)
    return Image.open(io.BytesIO(base64.b64decode(r.image_data.split(",", 1)[1]))).convert("RGB")


def canvas_state(img):
    """Streamer Mode の配信用画面の状態。"off" / "simple"（簡易版）/ "quad"（4 アングル）
    配信用画面は映すものがない枠が地のグレー (204,204,204) になる。簡易版は左上も左下もグレー、
    4 アングルは左上にカメラ映像が入り左下がグレー。LT 中に全部の枠が埋まると見分けられないので、録画前に使う"""
    small = img.resize((96, 54))

    def gray_ratio(box):
        d = small.crop(box).tobytes()
        return sum(1 for i in range(0, len(d), 3) if all(abs(d[i + k] - 204) <= 8 for k in range(3))) / (len(d) // 3)

    if gray_ratio((0, 33, 38, 54)) > 0.8:
        return "simple" if gray_ratio((0, 0, 38, 21)) > 0.8 else "quad"
    return "off"


def osc_move(world_id):
    """route の steps を順に実行する。歩くときは毎回ログで現在地と向きを見て、向き直してから歩く"""
    from pythonosc.udp_client import SimpleUDPClient
    route = CFG.get("routes", {}).get(world_id)
    if not route:
        return None
    v = CFG["vrchat"]
    osc = SimpleUDPClient("127.0.0.1", v["osc_port"])

    def hold(axis, value, sec):
        osc.send_message("/input/" + axis, float(value))
        time.sleep(sec)
        osc.send_message("/input/" + axis, 0.0)

    def turn(err):
        # 1.0 未満の入力では回らない（実測）ので、常に 1.0 で回して時間で角度を決める
        hold("LookHorizontal", 1.0 if err > 0 else -1.0, abs(err) / v["turn_deg_per_sec"])

    def settled_pose():
        # ログは 1 秒刻み。動き終えた秒より後の記録でないと、動く前の位置を読んでしまう
        return fresh_pose(dt.datetime.now().replace(microsecond=0))

    def walk(points):
        for i, (tx, ty, tz) in enumerate(points):
            tolerance = route.get("final_tolerance", 0.5) if i == len(points) - 1 else route.get("tolerance", 1.5)
            for _ in range(25):
                _, x, y, z, yaw = settled_pose()
                dist = math.hypot(tx - x, tz - z)
                err = angle_diff(math.degrees(math.atan2(tx - x, tz - z)), yaw)
                log(f"  -> ({tx},{tz}) pos=({x:.1f},{y:.1f},{z:.1f}) yaw={yaw:.0f} dist={dist:.1f} err={err:.0f}")
                if dist < tolerance and abs(ty - y) < 1.5:
                    break
                if abs(err) > 10:
                    turn(err)
                    time.sleep(0.2)
                if abs(err) < 60:
                    hold("Vertical", 1.0, min(dist / v["walk_m_per_sec"], 1.5))
            else:
                raise UserError(f"経由地点 ({tx}, {tz}) に着けませんでした（引っかかっている可能性があります）")

    def face(target):
        for _ in range(10):
            err = angle_diff(target, settled_pose()[4])
            log(f"  向き合わせ {target}° err={err:.0f}")
            if abs(err) < 5:
                return
            turn(err)

    def set_canvas(step):
        """配信用画面を目的のモードにする。キーは押すたびに切り替わるので、毎回画面で今の状態を確かめてから押す"""
        target = step["canvas"]
        for _ in range(4):
            state = canvas_state(screenshot(c))
            log(f"  配信用画面: {state}")
            if state == target:
                return
            # オフなら表示キー、表示中でモード違いならモード切替キー
            desktop_input(keys=step["toggle"] if state == "off" else step["mode"])
            time.sleep(2.5)  # 切り替わって描画されるまで待たないと、まだ前の状態に見えて押しすぎる
        raise UserError(f"配信用画面を {target} にできませんでした（Streamer Mode がオンか確認してください）")

    c = obs()
    ensure_scene(c)
    time.sleep(4)  # シーンを切り替えた直後はキャプチャが真っ白

    for step in route["steps"]:
        log(f"ステップ: {step.get('note', step)}")
        if "wait_pose" in step:
            # ワールドが入室時のダイアログに自動で答えると、位置がログに出始める
            fresh_pose(dt.datetime.now().replace(microsecond=0), timeout=step["wait_pose"])
        elif "canvas" in step:
            set_canvas(step)
        elif "walk" in step:
            walk(step["walk"])
        elif "face" in step:
            face(step["face"])
        elif "aim_from_floor" in step:
            # 視線の上下はログに出ないので、一度真下（そこで止まる）に向けてから決まった量だけ上げる
            desktop_input(dy=3000)
            desktop_input(dy=-step["aim_from_floor"])
        elif "click" in step:
            desktop_input(click=True)
            time.sleep(1)
        elif "keys" in step:
            desktop_input(keys=step["keys"])
            time.sleep(step.get("then_wait", 1))
    return route.get("name", world_id)


# ---------- bot から呼ぶコマンド ----------

def cmd_start(p):
    location = p.get("location")
    if location and not LOCATION_PATTERN.match(location):
        raise UserError("インスタンスの形式が不正です")
    if LATEST.exists() and load(Path(load(LATEST)["dir"]) / "session.json")["state"] == "recording":
        raise UserError("すでに録画中です")
    if not vrchat_running():
        raise UserError("VRChat が起動していません（先に「サブアカウントで入る」を押してください）")
    here = current_location()
    if not here:
        raise UserError("VRChat がまだインスタンスに入っていません")
    if location and here != location:
        raise UserError("サブアカウントが別のインスタンスにいます（最新の「サブアカウントで入る」を押してください）")

    c = obs()
    if c.get_record_status().output_active:
        raise UserError("OBS がすでに録画中です")

    world_id = here.split(":")[0]
    moved = osc_move(world_id)
    ensure_scene(c)
    c.start_record()

    sdir = OUT / dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    sdir.mkdir(parents=True)
    session = {"state": "recording", "event": str(p.get("event", ""))[:80], "location": here,
               "started": dt.datetime.now().isoformat(timespec="seconds"),
               "marks": [], "record_file": None, "clips": [], "error": None}
    save(sdir / "session.json", session)
    save(LATEST, {"dir": str(sdir)})
    log(f"録画開始 {sdir.name} {here}")
    return {"session": sdir.name, "moved": moved}


def cmd_mark(p):
    for key in ("lt_id", "title"):
        if not isinstance(p.get(key), str) or not p[key].strip():
            raise UserError(f"{key} がありません")
    policy = p.get("archive_policy")
    if policy not in ARCHIVE_POLICIES:
        raise UserError("archive_policy が不正です")
    sdir, s = recording_session()
    c = obs()
    t = record_seconds(c)
    mark = {"t": round(t, 2), "lt_id": p["lt_id"][:40], "title": p["title"][:100],
            "speaker": str(p.get("speaker", ""))[:50], "archive_policy": policy}
    s["marks"].append(mark)
    save(sdir / "session.json", s)
    try:
        c.send("CreateRecordChapter", {"chapterName": f"{mark['title']} / {mark['speaker']}"})
    except Exception:
        pass  # チャプターは補助。区切りの正は session.json の時刻
    log(f"mark {fmt(t)} {mark['title']}")
    return {"index": len(s["marks"]), "t": fmt(t)}


def cmd_end(p):
    sdir, s = recording_session()
    t = record_seconds(obs())
    s["marks"].append({"t": round(t, 2), "lt_id": None})
    save(sdir / "session.json", s)
    return {"t": fmt(t)}


def cmd_stop(p):
    sdir, s = recording_session()
    c = obs()
    dur = record_seconds(c)
    res = c.stop_record()
    s.update(state="processing", record_file=res.output_path, duration=round(dur, 2))
    save(sdir / "session.json", s)
    log(f"録画停止 {res.output_path}")
    return {"session": sdir.name, "duration": fmt(dur), "lts": sum(1 for m in s["marks"] if m.get("lt_id"))}


def cmd_status(p):
    sdir, s = latest_session()
    return {"session": sdir.name, "state": s["state"], "event": s["event"], "error": s.get("error"),
            "marks": [{"t": fmt(m["t"]), "lt_id": m.get("lt_id"), "title": m.get("title")} for m in s["marks"]],
            "clips": [{**{k: c.get(k) for k in ("lt_id", "title", "speaker", "archive_policy", "video_id", "privacy",
                                                 "skipped")},
                       "file": Path(c["file"]).name if c.get("file") else None}
                      for c in s.get("clips", [])]}


BOT_COMMANDS = {"start": cmd_start, "mark": cmd_mark, "end": cmd_end, "stop": cmd_stop, "status": cmd_status}


# ---------- 編集 ----------
# 過去の LT 動画（YouTube の @engineer-meetup）と同じ作りにする。
#   オープニング: ロゴ → 日付カード（音は LT 直前の会場の音）
#   本編: スライドを大きく。右の帯にロゴ・QR（X と Discord を交互）・登壇者カメラ、下の帯に LT タイトルと登壇者名
#   エンディング: 会場の引きの画を全面に、エンディング曲を重ねる
# 録画は配信用画面の 4 アングル。どの枠を何に使うかは config.toml の [edit] panes で決める。

ASSETS = ROOT / "assets"
W, H = 1920, 1080
MAIN_W, MAIN_H = 1576, 888       # スライドを置く左上の領域。右と下は白い帯
SPEAKER_Y = 639                  # 右の帯のうち、ここから下が登壇者カメラ
PANE_OFFSET = {"tl": (0, 0), "tr": (1, 0), "bl": (0, 1), "br": (1, 1)}


def fmt(t):
    return f"{int(t // 3600)}:{int(t % 3600 // 60):02d}:{int(t % 60):02d}"


def safe(name):
    return re.sub(r'[\\/:*?"<>|]', "_", name)[:60]


def pane(name):
    """4 アングルの録画から 1 枠を切り出す ffmpeg のフィルタ"""
    px, py = PANE_OFFSET[CFG["edit"]["panes"][name]]
    return f"crop=iw/2:ih/2:{px}*iw/2:{py}*ih/2"


def font(size, weight="Black"):
    from PIL import ImageFont
    f = ImageFont.truetype(str(ASSETS / "NotoSansJP-VF.ttf"), size)
    names = {n.decode() if isinstance(n, bytes) else n: n for n in f.get_variation_names()}
    f.set_variation_by_name(names[weight])
    return f


def outlined(draw, center, lines, size, stroke, max_width):
    """白い文字に黒いふち（タイトル・日付カードの書式）。幅に収まるまで文字を小さくする"""
    while True:
        f = font(size)
        if max(draw.textlength(line, font=f) for line in lines) <= max_width or size <= 24:
            break
        size -= 2
    line_h = size * 1.2
    top = center[1] - line_h * len(lines) / 2
    for i, line in enumerate(lines):
        draw.text((center[0], top + line_h * (i + 0.5)), line, font=f, anchor="mm",
                  fill="white", stroke_width=stroke, stroke_fill="black")


BREAK_AFTER = set(" 　、。・：:／/」』）)ーをにのはがでとへもや")


def split_title(title, f, draw, max_width):
    """1 行に収まらないタイトルを、左右の幅がそろう位置で 2 行に分ける（区切りやすい文字の後ろを優先）"""
    if draw.textlength(title, font=f) <= max_width:
        return [title]
    cands = [i for i in range(1, len(title)) if title[i - 1] in BREAK_AFTER] or list(range(1, len(title)))
    best = min(cands, key=lambda i: max(draw.textlength(title[:i].strip(), font=f),
                                        draw.textlength(title[i:].strip(), font=f)))
    return [title[:best].strip(), title[best:].strip()]


def make_cards(work, event, date):
    from PIL import Image, ImageDraw
    logo = Image.open(ASSETS / "logo_tate.png").convert("RGBA")
    lw = 882
    logo = logo.resize((lw, round(logo.height * lw / logo.width)), Image.LANCZOS)
    card = Image.new("RGBA", (W, H), "white")
    card.alpha_composite(logo, ((W - lw) // 2, (H - logo.height) // 2))
    card.convert("RGB").save(work / "card_logo.png")

    card = Image.new("RGB", (W, H), "white")
    outlined(ImageDraw.Draw(card), (W / 2, H / 2), [event, date], 160, 11, 1700)
    card.save(work / "card_date.png")


def make_bar(work, title, speaker):
    """本編に重ねる下の帯（LT タイトルと登壇者名）。帯以外は透明"""
    from PIL import Image, ImageDraw
    bar = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(bar)
    d.rectangle([0, MAIN_H, MAIN_W, H], fill="white")
    cy = (MAIN_H + H) / 2
    lines = split_title(title, font(64), d, 1050)
    outlined(d, (560, cy), lines, 64 if len(lines) == 1 else 60, 5, 1080)
    size = 52
    while size > 24 and d.textlength(speaker, font=font(size, "Medium")) > 400:
        size -= 2
    d.text((1370, cy), speaker, font=font(size, "Medium"), anchor="mm", fill="black")
    bar.save(work / "bar.png")


def loudness(src, start=None, dur=None):
    """平均ラウドネス（LUFS）。音量をそろえるのに使う"""
    cut = ["-ss", f"{start:.2f}", "-t", f"{dur:.2f}"] if start is not None else []
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", *cut, "-i", str(src), "-vn",
                        "-af", "loudnorm=print_format=json", "-f", "null", "-"],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    m = re.search(r'"input_i"\s*:\s*"(-?[\d.]+|-inf)"', r.stderr)
    return float(m.group(1)) if m and m.group(1) != "-inf" else None


def gain_to(target, measured):
    return 0.0 if measured is None else max(-15.0, min(20.0, target - measured))


ENCODERS = {
    "nvenc": ["-c:v", "h264_nvenc", "-preset", "p5", "-cq", "{q}"],
    "x264": ["-c:v", "libx264", "-preset", "veryfast", "-crf", "{q}"],
}
_nvenc_ok = None


def render(args, out, duration):
    """ffmpeg で 1 区間を書き出す。全区間を同じ形式にそろえ、最後に再エンコードせずにつなぐ"""
    global _nvenc_ok
    e = CFG["edit"]
    tail = ["-t", f"{duration:.3f}", "-r", str(e["fps"]), "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2"]
    order = ["x264"] if _nvenc_ok is False or e.get("encoder") == "x264" else ["nvenc", "x264"]
    for name in order:
        enc = [a.format(q=e["cq"]) for a in ENCODERS[name]]
        r = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args, *enc, *tail, str(out)],
                           capture_output=True, text=True, encoding="utf-8", errors="replace")
        if r.returncode == 0:
            return
        if name == "nvenc":
            _nvenc_ok = False
            log("NVENC が使えないので libx264 に切り替え")
    raise RuntimeError(f"書き出しに失敗しました: {out.name}: {r.stderr.strip()[-300:]}")


def edit_clip(src, rec_end, lt_start, lt_end, title, speaker, event, date, out):
    """1 本の LT を、オープニング・本編・エンディングの 3 区間に書き出してつなぐ"""
    e = CFG["edit"]
    work = out.with_suffix("")
    work.mkdir(exist_ok=True)
    make_cards(work, event, date)
    make_bar(work, title, speaker)
    gain = gain_to(e["loudness"], loudness(src, lt_start, lt_end - lt_start))
    music = ASSETS / e["ending_music"]
    music_gain = gain_to(e["ending_music_loudness"], loudness(music))

    # オープニング: カードの裏で LT 直前の会場の音（司会の紹介など）を流す
    intro, card1 = e["intro_sec"], e["intro_logo_sec"]
    pre = min(intro, lt_start)
    audio_in = (["-ss", f"{lt_start - pre:.2f}", "-t", f"{pre:.2f}", "-i", str(src)] if pre > 0.1
                else ["-f", "lavfi", "-t", "1", "-i", "anullsrc=r=48000:cl=stereo"])
    render(["-loop", "1", "-t", f"{card1}", "-i", str(work / "card_logo.png"),
            "-loop", "1", "-t", f"{intro - card1}", "-i", str(work / "card_date.png"),
            *audio_in,
            "-filter_complex",
            f"[0:v]fade=in:0:d=0.5:color=white,fade=out:st={card1 - 0.4}:d=0.4:color=white,setsar=1[a];"
            f"[1:v]fade=in:0:d=0.4:color=white,setsar=1[b];[a][b]concat=n=2:v=1[v];"
            f"[2:a]volume={gain:.2f}dB,adelay={int((intro - pre) * 1000)}:all=1,afade=in:0:d=1,apad[au]",
            "-map", "[v]", "-map", "[au]"], work / "1_intro.mp4", intro)

    # 本編
    q = e["qr_switch_sec"]
    render(["-ss", f"{lt_start:.2f}", "-t", f"{lt_end - lt_start:.2f}", "-i", str(src),
            "-loop", "1", "-i", str(work / "bar.png"),
            "-loop", "1", "-i", str(ASSETS / "side_x.png"),
            "-loop", "1", "-i", str(ASSETS / "side_discord.png"),
            "-filter_complex",
            f"[0:v]split=2[s][p];"
            f"[s]{pane('slide')},scale={MAIN_W}:{MAIN_H}:flags=lanczos[slide];"
            f"[p]{pane('speaker')},crop=ih*{W - MAIN_W}/{H - SPEAKER_Y}:ih,"
            f"scale={W - MAIN_W}:{H - SPEAKER_Y}:flags=lanczos[spk];"
            f"color=black:s={W}x{H}:r={e['fps']}[bg];"
            f"[bg][slide]overlay=0:0:shortest=1[v1];[v1][spk]overlay={MAIN_W}:{SPEAKER_Y}[v2];[v2][1:v]overlay=0:0[v3];"
            f"[v3][2:v]overlay={MAIN_W}:0:enable='lt(mod(t,{2 * q}),{q})'[v4];"
            f"[v4][3:v]overlay={MAIN_W}:0:enable='gte(mod(t,{2 * q}),{q})',fade=in:0:d=0.5[v];"
            f"[0:a]volume={gain:.2f}dB,alimiter=limit=0.95[au]",
            "-map", "[v]", "-map", "[au]"], work / "2_main.mp4", lt_end - lt_start)

    # エンディング: 区切りのあとの会場（拍手・記念撮影）にエンディング曲を重ねる。録画が足りなければ最後の画で止める
    end_sec = e["ending_sec"]
    avail = max(0.5, min(end_sec, rec_end - lt_end))
    render(["-ss", f"{min(lt_end, rec_end - avail):.2f}", "-t", f"{avail:.2f}", "-i", str(src), "-i", str(music),
            "-filter_complex",
            f"[0:v]{pane('wide')},scale={W}:{H}:flags=lanczos,tpad=stop_mode=clone:stop_duration={end_sec},"
            f"fade=in:0:d=0.7,fade=out:st={end_sec - 1.5}:d=1.5[v];"
            f"[0:a]volume={gain - e['ending_venue_duck']:.2f}dB,apad[venue];"
            f"[1:a]volume={music_gain:.2f}dB,afade=in:0:d=2[m];"
            f"[venue][m]amix=inputs=2:duration=longest:normalize=0,afade=out:st={end_sec - 3}:d=3[au]",
            "-map", "[v]", "-map", "[au]"], work / "3_ending.mp4", end_sec)

    parts = work / "parts.txt"
    parts.write_text("".join(f"file '{p}.mp4'\n" for p in ("1_intro", "2_main", "3_ending")), encoding="utf-8")
    tmp = out.with_name(out.stem + ".part.mp4")
    r = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0",
                        "-i", str(parts), "-c", "copy", "-movflags", "+faststart", str(tmp)],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        tmp.unlink(missing_ok=True)
        raise RuntimeError(f"つなぎ合わせに失敗しました: {r.stderr.strip()[-300:]}")
    tmp.replace(out)
    for p in work.iterdir():
        p.unlink()
    work.rmdir()


def grab(src, at, vf):
    from PIL import Image
    r = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-ss", f"{at:.2f}", "-i", str(src),
                        "-frames:v", "1", "-vf", vf, "-f", "image2pipe", "-vcodec", "png", "-"], capture_output=True)
    return Image.open(io.BytesIO(r.stdout)) if r.returncode == 0 and r.stdout else None


def make_thumbs(src, start, end, title, out):
    """過去の LT 動画のサムネイル（手作り）に寄せたたたき台を 2 案作る（thumbgen.py）。
    A: 白地にオレンジの帯 + 切り抜いたアバター + タイトル（アップロードに使う） / B: スライドを背景に"""
    import thumbgen
    from PIL import Image
    e = CFG["edit"]
    os.environ.setdefault("U2NET_HOME", str(ROOT / "models"))
    n = e["thumb_candidates"]
    times = [start + 10 + (end - start - 20) * (i + 0.5) / n for i in range(n)]
    frames = [f for t in times if (f := grab(src, t, pane("speaker")))]
    avatar = None
    try:
        from rembg import new_session, remove
        session = new_session(e["thumb_model"])
        avatar = thumbgen.best_cutout(frames, [remove(f.convert("RGB"), session=session) for f in frames])
    except Exception as ex:
        log(f"アバターの切り抜きに失敗（アバターなしで作ります）: {ex}")
    slide = grab(src, start + e["thumb_at"], pane("slide"))
    logo = Image.open(ASSETS / "logo_tate.png").convert("RGBA")
    fp = str(ASSETS / "NotoSansJP-VF.ttf")
    thumbgen.compose("A", title, avatar, slide, logo, fp).save(out, quality=92)
    if slide:
        thumbgen.compose("B", title, avatar, slide, logo, fp).save(out.with_name(out.stem + "_B.jpg"), quality=92)


def process(sdir, s):
    e = CFG["edit"]
    src = s["record_file"]
    if not src or not Path(src).exists():
        raise RuntimeError("録画ファイルが見つかりません")
    event = e.get("event_name") or s["event"]
    date = s["started"][:10].replace("-", "/")
    marks, rec_end = s["marks"], s["duration"]
    old = {c["lt_id"]: c for c in s.get("clips", [])}
    clips = []
    for i, m in enumerate(marks):
        if not m.get("lt_id"):
            continue
        start = max(0, m["t"] - e["pad_before"])
        end = min(rec_end, (marks[i + 1]["t"] if i + 1 < len(marks) else rec_end) + e["pad_after"])
        clip = old.get(m["lt_id"]) or {k: m[k] for k in ("lt_id", "title", "speaker", "archive_policy")}
        clip.update(start=start, end=end)
        clips.append(clip)
        if m["archive_policy"] == "none":
            continue  # 公開しない LT は切り出さない
        if end - start < e["min_sec"]:
            clip["skipped"] = f"短すぎる（{end - start:.0f}秒）"
            continue
        out = sdir / f"{len(clips):02d}_{safe(m['title'])}.mp4"
        if not out.exists():
            log(f"編集 {m['title']} {fmt(start)}-{fmt(end)}")
            edit_clip(src, rec_end, start, end, m["title"], m["speaker"], event, date, out)
        thumb = out.with_suffix(".jpg")
        if not thumb.exists():
            log(f"サムネイル {m['title']}")
            make_thumbs(src, start, end, m["title"], thumb)
        # 手でアップロードするとき用に、タイトル・説明欄・タグを書き出しておく（テンプレートを変えたら次の pipeline で書き直す）
        meta = video_meta(clip, s)
        out.with_suffix(".txt").write_text(
            f"{meta['title']}\n\n{meta['description']}\n\nタグ: {','.join(meta['tags'])}\n", encoding="utf-8-sig")
        clip.update(file=str(out), thumb=str(thumb))
    s["clips"] = clips


# ---------- YouTube ----------

SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]


def youtube():
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request
    from googleapiclient.discovery import build
    token = ROOT / "token.json"
    if not token.exists():
        raise RuntimeError("YouTube が未認可です（gaming-laptop で lt.py auth を実行してください）")
    creds = Credentials.from_authorized_user_file(str(token), SCOPES)
    if not creds.valid:
        creds.refresh(Request())
        token.write_text(creds.to_json(), encoding="utf-8")
    return build("youtube", "v3", credentials=creds)


def video_meta(c, s):
    """過去の動画と同じタイトル・説明欄。チャプターの LT 開始はオープニングの長さ"""
    y = CFG["youtube"]
    day = dt.date.fromisoformat(s["started"][:10])
    ctx = {"title": c["title"], "speaker": c["speaker"], "event": CFG["edit"].get("event_name") or s["event"],
           "date": f"{day:%Y/%m/%d}", "date_ja": f"{day:%Y年%m月%d日}",
           "chapter": f"0:{CFG['edit']['intro_sec']:02d}"}
    return {"title": y["title_template"].format(**ctx)[:100], "description": y["description_template"].format(**ctx),
            "tags": y.get("tags", [])}


def upload(sdir, s):
    from googleapiclient.http import MediaFileUpload
    y = CFG["youtube"]
    targets = [c for c in s["clips"] if c.get("file") and not c.get("video_id")]
    if not targets:
        return
    yt = youtube()
    for c in targets:
        body = {
            "snippet": {**video_meta(c, s), "categoryId": y["category"]},
            "status": {"privacyStatus": y["privacy"], "selfDeclaredMadeForKids": False},
        }
        log(f"アップロード {body['snippet']['title']}")
        req = yt.videos().insert(part="snippet,status", body=body,
                                 media_body=MediaFileUpload(c["file"], chunksize=16 << 20, resumable=True))
        res = None
        while res is None:
            _, res = req.next_chunk()
        c.update(video_id=res["id"], privacy=y["privacy"])
        save(sdir / "session.json", s)
        try:
            yt.thumbnails().set(videoId=res["id"], media_body=MediaFileUpload(c["thumb"])).execute()
        except Exception as ex:
            log(f"サムネ設定に失敗: {ex}")


def cmd_pipeline(a):
    sdir = Path(a.session) if a.session else latest_session()[0]
    s = load(sdir / "session.json")
    try:
        s.update(state="processing", error=None)
        save(sdir / "session.json", s)
        process(sdir, s)
        save(sdir / "session.json", s)
        if not CFG["youtube"].get("auto_upload") or not (ROOT / "token.json").exists():
            # API の監査が通るまでは編集までで止める（未審査のプロジェクトからアップした動画は非公開にロックされ、
            # あとから公開に切り替えられない）。auto_upload を有効にしたあと pipeline をもう一度流せばアップロードだけ進む
            s["state"] = "edited"
            log("自動アップロードが無効か YouTube が未認可なので、アップロードせずに終了")
        else:
            s["state"] = "uploading"
            save(sdir / "session.json", s)
            upload(sdir, s)
            s["state"] = "done"
    except Exception as ex:
        s.update(state="error", error=str(ex)[:500])
        log(traceback.format_exc())
    save(sdir / "session.json", s)


def cmd_auth(a):
    from google_auth_oauthlib.flow import InstalledAppFlow
    secret = ROOT / "client_secret.json"
    if not secret.exists():
        sys.exit(f"{secret} を置いてください（Google Cloud の OAuth クライアント: デスクトップアプリ）")
    flow = InstalledAppFlow.from_client_secrets_file(str(secret), SCOPES)
    creds = flow.run_local_server(port=a.port, open_browser=False,
                                  authorization_prompt_message="このURLをブラウザで開いて許可してください:\n{url}\n")
    (ROOT / "token.json").write_text(creds.to_json(), encoding="utf-8")
    print("YouTube の認可を保存しました")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    if len(sys.argv) >= 2 and sys.argv[1] in BOT_COMMANDS:
        verb = sys.argv[1]
        # 返事は SSH 越しにコンソールの文字コードを通るので、日本語も \uXXXX にして ASCII だけで返す
        try:
            payload = json.loads(base64.urlsafe_b64decode(sys.argv[2] + "==").decode("utf-8")) if len(sys.argv) > 2 else {}
            if not isinstance(payload, dict):
                raise UserError("引数が不正です")
            print(json.dumps({"ok": True, **BOT_COMMANDS[verb](payload)}))
        except UserError as ex:
            print(json.dumps({"ok": False, "error": str(ex)}))
            sys.exit(1)
        except Exception as ex:
            log(traceback.format_exc())
            print(json.dumps({"ok": False, "error": f"{type(ex).__name__}: {ex}"[:300]}))
            sys.exit(1)
        return

    p = argparse.ArgumentParser(prog="lt.py")
    sp = p.add_subparsers(dest="cmd", required=True)
    sp.add_parser("pipeline").add_argument("session", nargs="?")
    sp.add_parser("move").add_argument("world", nargs="?")
    sp.add_parser("auth").add_argument("--port", type=int, default=8765)
    a = p.parse_args()
    if a.cmd == "move":
        world = a.world or (current_location() or "").split(":")[0]
        try:
            print(osc_move(world) or f"OSC ルートが未登録です: {world}")
        except UserError as ex:
            sys.exit(str(ex))
    else:
        {"pipeline": cmd_pipeline, "auth": cmd_auth}[a.cmd](a)


if __name__ == "__main__":
    main()
