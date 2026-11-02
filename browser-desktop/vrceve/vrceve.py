"""VRChat イベントカレンダー（vrceve.com）の登録フォームを、ログイン済みの Chrome で送る。

Bot から request.sh 経由で呼ばれ、結果を JSON 1 行で標準出力に返す（日本語は \\uXXXX）。

  register {"fields": {...}, "dry_run": false}   入力して送信し、編集用 URL を返す
  delete   {"edit_url": "..."}                   編集用 URL から「イベントを削除する」で送り直す
  check    {}                                    Chrome が動いていて、集会用アカウントでログインしているか

フォームは送る人が Google にログインしている必要がある（「返信に自分のメールアドレスを記録する」）。
自動操作用の Chrome はデスクトップで普通に起動しておき（autostart）、ここからは DevTools のポートで外からつなぐ。
Playwright で起動した Chrome より、Google に自動操作として弾かれにくい。
"""
import base64
import json
import os
import re
import subprocess
import sys
import time
import tomllib
from pathlib import Path
from urllib.parse import urlencode

ROOT = Path(__file__).resolve().parent
CFG = tomllib.loads((ROOT / "config.toml").read_text(encoding="utf-8"))
SHOTS = Path.home() / ".local/state/vrceve"


class UserError(Exception):
    pass


def ensure_chrome():
    """自動操作用の Chrome が動いていなければ、ログイン中のデスクトップ（:0）に起動する"""
    import urllib.request
    url = f"http://127.0.0.1:{CFG['chrome']['port']}/json/version"
    for attempt in range(30):
        try:
            urllib.request.urlopen(url, timeout=2).read()
            return
        except OSError:
            if attempt == 0:
                env = {**os.environ, "DISPLAY": ":0", "XAUTHORITY": str(Path.home() / ".Xauthority")}
                subprocess.Popen(chrome_command(), env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                 start_new_session=True)
            time.sleep(1)
    raise UserError("自動操作用の Chrome を起動できません（VM のデスクトップにログインしているか確認してください）")


def chrome_command():
    c = CFG["chrome"]
    return ["google-chrome", f"--user-data-dir={Path(c['profile']).expanduser()}",
            f"--remote-debugging-port={c['port']}", "--remote-debugging-address=127.0.0.1",
            "--no-first-run", "--no-default-browser-check"]


def open_page(pw):
    ensure_chrome()
    browser = pw.chromium.connect_over_cdp(f"http://127.0.0.1:{CFG['chrome']['port']}")
    page = browser.contexts[0].new_page()
    page.set_default_timeout(20_000)
    return page


def require_login(page):
    """フォームの上に出るアカウント名で、集会用アカウントでログインしているかを確かめる"""
    from playwright.sync_api import TimeoutError as PlaywrightTimeout
    account = CFG["form"]["account"]
    try:
        page.get_by_text(account, exact=False).first.wait_for(timeout=15_000)
    except PlaywrightTimeout:
        raise UserError(f"Google に {account} でログインしていません（VM の Chrome でログインし直してください）")


def prefill_url(fields):
    """事前入力の URL。日時は「YYYY-MM-DD HH:MM」、複数選択は同じ entry を並べる"""
    entries = CFG["form"]["entries"]
    params = [("usp", "pp_url")]
    for key, value in fields.items():
        if key not in entries:
            raise UserError(f"フォームにない項目です: {key}")
        for v in (value if isinstance(value, list) else [value]):
            if v not in (None, ""):
                params.append((f"entry.{entries[key]}", str(v)))
    return f"{CFG['form']['url']}?{urlencode(params)}"


def open_prefilled(page, fields):
    """事前入力した状態でフォームを開く。ログイン中は入力途中の内容が下書きとして残り、下書きがあると
    事前入力の URL を開いても下書きのほうが出る（URL の事前入力が外される）。先に「フォームをクリア」で消してから開き、
    イベント名が送るつもりの値になっているかを確かめる"""
    page.goto(CFG["form"]["url"])
    require_login(page)
    clear = page.get_by_role("button", name="フォームをクリア")
    if clear.count():
        clear.first.click()
        page.get_by_role("dialog").get_by_role("button", name="フォームをクリア").click()
        page.wait_for_timeout(1500)
    page.goto(prefill_url(fields))
    require_login(page)
    name = page.get_by_role("textbox").first
    name.wait_for()
    if name.input_value() != fields.get("name"):
        raise UserError(f"事前入力が反映されませんでした（{screenshot(page, 'prefill')}）")


def tick_email(page):
    """メールアドレスを記録する欄に印を付ける（荒らし対策で必須）。文言はログインの有無で変わる:
    「返信に自分のメールアドレスを記録する」/「返信に表示するメールアドレスとして <アカウント> を記録する」"""
    from playwright.sync_api import TimeoutError as PlaywrightTimeout
    box = page.get_by_role("checkbox", name=re.compile("メールアドレス"))
    try:
        box.first.wait_for(timeout=15_000)  # ページを開いた直後はまだ描かれていないことがある
    except PlaywrightTimeout:
        raise UserError(f"メールアドレスを記録する欄が見つかりません（{screenshot(page, 'no-email')}）")
    if box.first.get_attribute("aria-checked") != "true":
        box.first.click()


def next_page(page):
    """フォームは 2 ページ（日時など → 主催者・内容など）。必須の項目が空などで進めなければ、その画面を撮って止める"""
    next_button = page.get_by_role("button", name="次へ")
    if next_button.count():
        next_button.click()
        if page.get_by_role("button", name="送信").count() == 0:
            page.wait_for_timeout(1500)
    if page.get_by_role("button", name="送信").count() == 0:
        raise UserError(f"次のページに進めませんでした（入力に不足がないか確認してください: {screenshot(page, 'failed')}）")


def submit(page):
    """送信して、完了画面の「回答を編集」の URL を返す"""
    from playwright.sync_api import TimeoutError as PlaywrightTimeout
    page.get_by_role("button", name="送信").click()
    try:
        page.wait_for_url(re.compile(r"formResponse"), timeout=30_000)
    except PlaywrightTimeout:
        raise UserError(f"送信できませんでした（入力に不足がないか確認してください: {screenshot(page, 'failed')}）")
    link = page.get_by_role("link", name=re.compile("回答を編集"))
    return link.get_attribute("href") if link.count() else None


def screenshot(page, name):
    SHOTS.mkdir(parents=True, exist_ok=True)
    path = SHOTS / f"{time.strftime('%Y%m%d-%H%M%S')}-{name}.png"
    page.screenshot(path=str(path), full_page=True)
    return str(path)


def jpeg(page):
    """試し入力の画面を Bot に返すための JPEG（base64）。Discord に添付する"""
    return base64.b64encode(page.screenshot(type="jpeg", quality=60, full_page=True)).decode("ascii")


def cmd_register(p):
    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        page = open_page(pw)
        try:
            open_prefilled(page, p["fields"])
            tick_email(page)
            first = jpeg(page) if p.get("dry_run") else None
            next_page(page)
            shot = screenshot(page, "register")
            if p.get("dry_run"):
                # 送らずに、1 ページ目（名前・日時）と 2 ページ目（内容など）の画面を返す
                return {"dry_run": True, "screenshot": shot, "images": [first, jpeg(page)]}
            edit_url = submit(page)
            if not edit_url:
                raise UserError(f"送信後の画面に編集用 URL がありません（{screenshot(page, 'after')}）")
            return {"edit_url": edit_url}
        finally:
            page.close()


def cmd_delete(p):
    from playwright.sync_api import sync_playwright
    edit_url = p.get("edit_url", "")
    if not edit_url.startswith(CFG["form"]["url"].rsplit("/", 1)[0]):
        raise UserError("編集用 URL が不正です")
    with sync_playwright() as pw:
        page = open_page(pw)
        try:
            page.goto(edit_url)
            require_login(page)
            # 「イベントを登録しますか」はプルダウン
            page.get_by_role("listbox").filter(has=page.get_by_text("イベントを登録する")).click()
            page.get_by_role("option", name="イベントを削除する").click()
            tick_email(page)
            next_page(page)
            shot = screenshot(page, "delete")
            if p.get("dry_run"):
                return {"dry_run": True, "screenshot": shot}
            submit(page)
            return {"deleted": True}
        finally:
            page.close()


def cmd_check(p):
    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        page = open_page(pw)
        try:
            page.goto(CFG["form"]["url"])
            require_login(page)
            return {"account": CFG["form"]["account"]}
        finally:
            page.close()


COMMANDS = {"register": cmd_register, "delete": cmd_delete, "check": cmd_check}


def main():
    verb = sys.argv[1] if len(sys.argv) > 1 else ""
    if verb == "launch-chrome":
        # デスクトップの autostart から呼ぶ（request.sh からは呼べない）
        os.execvp("google-chrome", chrome_command())
    try:
        if verb not in COMMANDS:
            raise UserError("不明な指示です")
        payload = json.loads(base64.urlsafe_b64decode(sys.argv[2] + "==").decode("utf-8")) if len(sys.argv) > 2 else {}
        if not isinstance(payload, dict):
            raise UserError("引数が不正です")
        print(json.dumps({"ok": True, **COMMANDS[verb](payload)}))
    except UserError as ex:
        print(json.dumps({"ok": False, "error": str(ex)}))
        sys.exit(1)
    except Exception as ex:
        print(json.dumps({"ok": False, "error": f"{type(ex).__name__}: {ex}"[:300]}))
        sys.exit(1)


if __name__ == "__main__":
    main()
