"""OSC ルートを調整するための試し打ち。動かしたあと OBS で撮る。

  python osc_try.py <保存名> [動き...]
    動き: V=前後 / H=左右 / L=回転 + 値(-1〜1) + ":" + 秒数   例: V1:1.5  L0.5:0.4  H-1:0.8
          U=Use（照準の先をクリック）                         例: U
録画シーンに切り替えたまま終わるので、調整が済んだら restore で元のシーンに戻す。
  python osc_try.py restore <シーン名>
"""
import base64, sys, time
from pythonosc.udp_client import SimpleUDPClient
import lt

AXES = {"V": "Vertical", "H": "Horizontal", "L": "LookHorizontal"}
c = lt.obs()
if sys.argv[1] == "restore":
    c.set_current_program_scene(sys.argv[2])
    sys.exit()

scene = lt.CFG["obs"]["scene"]
if c.get_current_program_scene().current_program_scene_name != scene:
    print("previous scene:", c.get_current_program_scene().current_program_scene_name)
    lt.ensure_scene(c)
    time.sleep(4)  # シーンを切り替えた直後はキャプチャが真っ白

osc = SimpleUDPClient("127.0.0.1", lt.CFG["vrchat"]["osc_port"])
for move in sys.argv[2:]:
    if move == "U":
        # ボタン入力は 0 → 1 → 0 の変化で 1 回の押下になる
        for v in (0, 1, 0):
            osc.send_message("/input/UseRight", v)
            time.sleep(0.2)
        time.sleep(0.5)
        continue
    axis, rest = move[0], move[1:]
    value, sec = rest.split(":")
    addr = "/input/" + AXES[axis]
    osc.send_message(addr, float(value))
    time.sleep(float(sec))
    osc.send_message(addr, 0.0)
    time.sleep(0.7)

r = c.get_source_screenshot(scene, "png", 960, 540, -1)
out = lt.OUT / "osc_check" / f"{sys.argv[1]}.png"
out.parent.mkdir(exist_ok=True)
out.write_bytes(base64.b64decode(r.image_data.split(",", 1)[1]))
print("saved", out.name)
