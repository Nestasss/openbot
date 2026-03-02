import json
import os
import sqlite3
import subprocess
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from io import BytesIO
from typing import Optional

import qrcode
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.constants import ParseMode
from telegram.ext import Application, CallbackQueryHandler, CommandHandler, ContextTypes

DB_PATH = os.environ.get("XUI_DB_PATH", "/data/x-ui.db")
INBOUND_TAG = os.environ.get("XUI_INBOUND_TAG", "vless-ws-10000")
PUBLIC_HOST = os.environ.get("XUI_PUBLIC_HOST", "vpn.securitybots.ru")
PUBLIC_PORT = int(os.environ.get("XUI_PUBLIC_PORT", "443"))
WS_PATH = os.environ.get("XUI_WS_PATH", "/vws")
ADMIN_CHAT_ID = os.environ.get("ADMIN_CHAT_ID")
TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN_3X_UI") or os.environ.get("TELEGRAM_BOT_TOKEN_3X-UI")


def require_admin(func):
    async def wrapper(update: Update, context: ContextTypes.DEFAULT_TYPE):
        if ADMIN_CHAT_ID is None:
            await update.effective_message.reply_text(
                "ADMIN_CHAT_ID is not set. Set it and restart the bot."
            )
            return
        if update.effective_chat is None or str(update.effective_chat.id) != str(ADMIN_CHAT_ID):
            await update.effective_message.reply_text("Not authorized.")
            return
        return await func(update, context)

    return wrapper


@dataclass
class Client:
    email: str
    uuid: str


def db() -> sqlite3.Connection:
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con


def get_inbound(con: sqlite3.Connection) -> sqlite3.Row:
    row = con.execute("select * from inbounds where tag = ?", (INBOUND_TAG,)).fetchone()
    if not row:
        raise RuntimeError(f"Inbound with tag '{INBOUND_TAG}' not found")
    return row


def parse_clients(inbound_settings: str) -> list[Client]:
    obj = json.loads(inbound_settings)
    clients = []
    for c in obj.get("clients", []):
        clients.append(Client(email=c.get("email", ""), uuid=c.get("id", "")))
    return clients


def load_settings(con: sqlite3.Connection) -> tuple[sqlite3.Row, dict]:
    inbound = get_inbound(con)
    settings = json.loads(inbound["settings"])
    return inbound, settings


def save_settings(con: sqlite3.Connection, inbound_id: int, settings: dict):
    con.execute(
        "update inbounds set settings = ? where id = ?",
        (json.dumps(settings, ensure_ascii=False), inbound_id),
    )


def build_vless_link(uuid: str, label: str) -> str:
    # vless://UUID@host:port?encryption=none&security=tls&type=ws&host=HOST&path=%2Fvws#label
    from urllib.parse import quote

    host = PUBLIC_HOST
    path = quote(WS_PATH, safe="")
    label_q = quote(label)
    return (
        f"vless://{uuid}@{host}:{PUBLIC_PORT}"
        f"?encryption=none&security=tls&type=ws&host={host}&path={path}#{label_q}"
    )


def bytes_human(n: int) -> str:
    n = int(n or 0)
    units = ["B", "KB", "MB", "GB", "TB"]
    v = float(n)
    i = 0
    while v >= 1024 and i < len(units) - 1:
        v /= 1024
        i += 1
    if i == 0:
        return f"{int(v)} {units[i]}"
    return f"{v:.2f} {units[i]}"


def ts_human(ts: int) -> str:
    """Convert timestamp to human-readable UTC.

    x-ui sometimes stores last_online in milliseconds; also handle garbage/overflow safely.
    """
    ts = int(ts or 0)
    if ts <= 0:
        return "never"

    # Heuristic: treat very large values as milliseconds
    if ts > 10_000_000_000:  # ~2286-11-20 in seconds
        ts //= 1000

    try:
        return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    except (OverflowError, OSError, ValueError):
        return f"invalid({ts})"


def keyboard_for_clients(clients: list[Client], prefix: str) -> InlineKeyboardMarkup:
    # prefix is callback prefix, e.g. "get" or "qr"
    rows = []
    row = []
    for c in clients:
        if not c.email:
            continue
        row.append(InlineKeyboardButton(c.email, callback_data=f"{prefix}:{c.email}"))
        if len(row) == 4:
            rows.append(row)
            row = []
    if row:
        rows.append(row)
    return InlineKeyboardMarkup(rows)


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.effective_message.reply_text(
        "Команды: /help, /id\n"
        "После allowlist: /list /get /qr /new /rotate /revoke /enable /stats"
    )


async def help_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.effective_message.reply_text(
        "Команды:\n"
        "/id — показать chat_id\n"
        "/list — список клиентов\n"
        "/get u5 — конфиг (vless://)\n"
        "/get — выбрать клиента кнопкой\n"
        "/qr u5 — QR-код\n"
        "/qr — выбрать клиента кнопкой\n"
        "/new [label] — создать нового клиента\n"
        "/rotate u5 — заменить UUID (если конфиг утёк)\n"
        "/revoke u5 — отключить\n"
        "/enable u5 — включить\n"
        "/stats u5 — статистика/последний онлайн"
    )


async def id_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.effective_message.reply_text(f"chat_id: {update.effective_chat.id}")


@require_admin
async def list_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    with db() as con:
        inbound = get_inbound(con)
        clients = parse_clients(inbound["settings"])
    lines = [f"Inbound: {INBOUND_TAG}", ""]
    for c in clients:
        if c.email:
            lines.append(c.email)
    await update.effective_message.reply_text("\n".join(lines))


async def _send_link(update: Update, email: str):
    with db() as con:
        inbound = get_inbound(con)
        clients = parse_clients(inbound["settings"])
        c = next((x for x in clients if x.email == email), None)
        if not c:
            await update.effective_message.reply_text("Client not found")
            return
    link = build_vless_link(c.uuid, email)
    await update.effective_message.reply_text(link, disable_web_page_preview=True)


async def _send_qr(update: Update, email: str):
    with db() as con:
        inbound = get_inbound(con)
        clients = parse_clients(inbound["settings"])
        c = next((x for x in clients if x.email == email), None)
        if not c:
            await update.effective_message.reply_text("Client not found")
            return

    link = build_vless_link(c.uuid, email)
    img = qrcode.make(link)
    bio = BytesIO()
    bio.name = f"{email}.png"
    img.save(bio, format="PNG")
    bio.seek(0)

    await update.effective_message.reply_photo(photo=bio, caption=f"{email}\n{link}")


@require_admin
async def get_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    # /get [uX]
    if not context.args:
        with db() as con:
            inbound = get_inbound(con)
            clients = parse_clients(inbound["settings"])
        await update.effective_message.reply_text(
            "Выбери клиента:", reply_markup=keyboard_for_clients(clients, "get")
        )
        return
    await _send_link(update, context.args[0])


@require_admin
async def qr_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    # /qr [uX]
    if not context.args:
        with db() as con:
            inbound = get_inbound(con)
            clients = parse_clients(inbound["settings"])
        await update.effective_message.reply_text(
            "Выбери клиента для QR:", reply_markup=keyboard_for_clients(clients, "qr")
        )
        return
    await _send_qr(update, context.args[0])


async def callback_query(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if ADMIN_CHAT_ID is None:
        await update.callback_query.answer("Not configured")
        return
    if update.effective_chat is None or str(update.effective_chat.id) != str(ADMIN_CHAT_ID):
        await update.callback_query.answer("Not authorized")
        return

    data = update.callback_query.data or ""
    try:
        kind, email = data.split(":", 1)
    except ValueError:
        await update.callback_query.answer("Bad request")
        return

    await update.callback_query.answer()
    if kind == "get":
        await _send_link(update, email)
    elif kind == "qr":
        await _send_qr(update, email)
    else:
        await update.effective_message.reply_text("Unknown action")


def set_client_enabled(con: sqlite3.Connection, email: str, enabled: bool):
    inbound, settings = load_settings(con)
    # x-ui реально учитывает client_traffics.enable
    con.execute(
        "update client_traffics set enable = ? where inbound_id = ? and email = ?",
        (1 if enabled else 0, inbound["id"], email),
    )

    # на всякий сохраняем и в JSON, если там есть такие поля
    changed = False
    for c in settings.get("clients", []):
        if c.get("email") == email:
            c["enable"] = enabled
            changed = True
    if changed:
        save_settings(con, inbound["id"], settings)


@require_admin
async def revoke_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not context.args:
        await update.effective_message.reply_text("Usage: /revoke u5")
        return
    email = context.args[0]
    with db() as con:
        set_client_enabled(con, email, False)
        con.commit()
    await update.effective_message.reply_text(f"Disabled {email}")


@require_admin
async def enable_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not context.args:
        await update.effective_message.reply_text("Usage: /enable u5")
        return
    email = context.args[0]
    with db() as con:
        set_client_enabled(con, email, True)
        con.commit()
    await update.effective_message.reply_text(f"Enabled {email}")


@require_admin
async def new_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    label = context.args[0] if context.args else None

    with db() as con:
        inbound, settings = load_settings(con)
        clients = settings.get("clients", [])

        # pick next label
        used = set(c.get("email") for c in clients)
        if label and label in used:
            # if explicit label, make it unique
            base = label
            n = 2
            while f"{base}-{n}" in used:
                n += 1
            email = f"{base}-{n}"
        elif label:
            email = label
        else:
            n = 1
            while f"u{n}" in used:
                n += 1
            email = f"u{n}"

        uuid = subprocess.check_output(["uuidgen"]).decode().strip()
        clients.append({"id": uuid, "email": email, "flow": ""})
        settings["clients"] = clients
        save_settings(con, inbound["id"], settings)

        con.execute(
            "insert into client_traffics (inbound_id, enable, email, up, down, all_time, expiry_time, total, reset, last_online) values (?,?,?,?,?,?,?,?,?,?)",
            (inbound["id"], 1, email, 0, 0, 0, 0, 0, 0, 0),
        )
        con.commit()

    link = build_vless_link(uuid, email)
    await update.effective_message.reply_text(
        f"Created {email}\n{link}", disable_web_page_preview=True
    )


@require_admin
async def rotate_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not context.args:
        await update.effective_message.reply_text("Usage: /rotate u5")
        return
    email = context.args[0]

    with db() as con:
        inbound, settings = load_settings(con)
        clients = settings.get("clients", [])
        target = next((c for c in clients if c.get("email") == email), None)
        if not target:
            await update.effective_message.reply_text("Client not found")
            return
        new_uuid = subprocess.check_output(["uuidgen"]).decode().strip()
        target["id"] = new_uuid
        save_settings(con, inbound["id"], settings)
        con.commit()

    link = build_vless_link(new_uuid, email)
    await update.effective_message.reply_text(
        f"Rotated {email}\n{link}", disable_web_page_preview=True
    )


@require_admin
async def stats_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not context.args:
        await update.effective_message.reply_text("Usage: /stats u5")
        return
    email = context.args[0]

    with db() as con:
        inbound = get_inbound(con)
        row = con.execute(
            "select enable, up, down, all_time, total, expiry_time, last_online from client_traffics where inbound_id = ? and email = ?",
            (inbound["id"], email),
        ).fetchone()
        if not row:
            await update.effective_message.reply_text("Client not found in stats")
            return

    text = (
        f"{email}\n"
        f"enabled: {bool(row['enable'])}\n"
        f"up: {bytes_human(row['up'])}\n"
        f"down: {bytes_human(row['down'])}\n"
        f"all_time: {bytes_human(row['all_time'])}\n"
        f"last_online: {ts_human(row['last_online'])}"
    )
    await update.effective_message.reply_text(text)


def main():
    if not TOKEN:
        raise SystemExit("TELEGRAM_BOT_TOKEN_3X_UI (or TELEGRAM_BOT_TOKEN_3X-UI) is not set")

    app = Application.builder().token(TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("help", help_cmd))
    app.add_handler(CommandHandler("id", id_cmd))

    app.add_handler(CommandHandler("list", list_cmd))
    app.add_handler(CommandHandler("get", get_cmd))
    app.add_handler(CommandHandler("qr", qr_cmd))
    app.add_handler(CommandHandler("new", new_cmd))
    app.add_handler(CommandHandler("rotate", rotate_cmd))
    app.add_handler(CommandHandler("revoke", revoke_cmd))
    app.add_handler(CommandHandler("enable", enable_cmd))
    app.add_handler(CommandHandler("stats", stats_cmd))

    app.add_handler(CallbackQueryHandler(callback_query))

    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
