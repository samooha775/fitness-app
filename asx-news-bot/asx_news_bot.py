#!/usr/bin/env python3
"""ASX news bot: sends new ASX announcements and headlines for your tickers to Telegram.

Designed to run on a schedule (GitHub Actions, cron, etc.). Each run:
  1. Fetches recent ASX company announcements (official ASX feed) and
     Yahoo Finance headlines for every ticker in ASX_TICKERS.
  2. Skips anything already sent (tracked in a small JSON state file).
  3. Sends the new items to your Telegram chat.

On the very first run (no state file yet) it records what's already out
there without sending it, so you don't get flooded with old news.

Environment variables:
  TELEGRAM_BOT_TOKEN  token from BotFather
  TELEGRAM_CHAT_ID    chat to send to (your user id, or a group/channel id)
  ASX_TICKERS         comma/space separated codes, e.g. "BHP, CBA, PLS"
  STATE_FILE          optional, defaults to seen.json next to this script
  INCLUDE_HEADLINES   optional, "false" to send only official ASX announcements
  PRICE_SENSITIVE_ONLY optional, "true" to only send price-sensitive announcements

Uses only the Python standard library.
"""

import argparse
import html
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

USER_AGENT = "Mozilla/5.0 (compatible; asx-news-bot/1.0)"
ASX_ANNOUNCEMENTS_URL = "https://asx.api.markitdigital.com/asx-research/1.0/companies/{code}/announcements"
YAHOO_RSS_URL = "https://feeds.finance.yahoo.com/rss/2.0/headline?s={code}.AX&region=AU&lang=en-AU"
ASX_COMPANY_PAGE = "https://www.asx.com.au/markets/company/{code}"

MAX_AGE = timedelta(days=3)      # ignore anything older than this
MAX_SEEN = 2000                  # cap on remembered item ids
MAX_MESSAGES_PER_RUN = 25        # guard against floods (Telegram rate limits)
AEST = timezone(timedelta(hours=10))


# ─── Helpers ──────────────────────────────────────────────────────────────────

def parse_tickers(raw):
    codes = [c.strip().upper().removesuffix(".AX") for c in re.split(r"[,\s]+", raw or "")]
    return list(dict.fromkeys(c for c in codes if re.fullmatch(r"[A-Z0-9]{2,6}", c)))


def http_get(url, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def parse_time(value):
    """Parse ISO-8601 or RFC-822 timestamps into aware UTC datetimes."""
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        try:
            dt = parsedate_to_datetime(value)
        except (TypeError, ValueError):
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


# ─── Sources ──────────────────────────────────────────────────────────────────

def parse_asx_announcements(code, payload):
    """Parse the ASX (Markit Digital) announcements JSON into news items."""
    data = json.loads(payload)
    items = (data.get("data") or {}).get("items") or []
    out = []
    for a in items:
        headline = (a.get("headline") or "").strip()
        key = a.get("documentKey") or a.get("id")
        if not headline or not key:
            continue
        out.append({
            "id": f"asx:{key}",
            "code": code,
            "source": "ASX",
            "title": headline,
            "url": a.get("url") or ASX_COMPANY_PAGE.format(code=code),
            "time": parse_time(a.get("date")),
            "price_sensitive": bool(a.get("isPriceSensitive")),
        })
    return out


def parse_yahoo_rss(code, payload):
    """Parse a Yahoo Finance RSS headline feed into news items."""
    root = ET.fromstring(payload)
    out = []
    for item in root.iter("item"):
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        guid = (item.findtext("guid") or link).strip()
        if not title or not guid:
            continue
        out.append({
            "id": f"yahoo:{guid}",
            "code": code,
            "source": "News",
            "title": title,
            "url": link,
            "time": parse_time(item.findtext("pubDate")),
            "price_sensitive": False,
        })
    return out


def fetch_ticker(code, include_headlines):
    items, errors = [], []
    try:
        url = ASX_ANNOUNCEMENTS_URL.format(code=code.lower()) + "?count=20"
        items += parse_asx_announcements(code, http_get(url))
    except Exception as e:  # keep going if one source fails
        errors.append(f"{code} ASX: {e}")
    if include_headlines:
        try:
            items += parse_yahoo_rss(code, http_get(YAHOO_RSS_URL.format(code=code)))
        except Exception as e:
            errors.append(f"{code} Yahoo: {e}")
    return items, errors


# ─── State ────────────────────────────────────────────────────────────────────

def load_state(path):
    try:
        with open(path) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def save_state(path, seen_ids):
    with open(path, "w") as f:
        json.dump({"seen": seen_ids[-MAX_SEEN:], "updated": datetime.now(timezone.utc).isoformat()}, f)


def select_new(items, seen, now, price_sensitive_only=False):
    """Items not yet sent, recent enough, oldest first, one per id."""
    fresh, ids = [], set()
    for it in items:
        if it["id"] in seen or it["id"] in ids:
            continue
        if it["time"] and now - it["time"] > MAX_AGE:
            continue
        if price_sensitive_only and it["source"] == "ASX" and not it["price_sensitive"]:
            continue
        ids.add(it["id"])
        fresh.append(it)
    fresh.sort(key=lambda it: it["time"] or now)
    return fresh


# ─── Telegram ─────────────────────────────────────────────────────────────────

def format_message(it):
    flag = "🔴 PRICE SENSITIVE\n" if it["price_sensitive"] else ""
    icon = "📢" if it["source"] == "ASX" else "📰"
    when = it["time"].astimezone(AEST).strftime("%a %d %b %H:%M AEST") if it["time"] else ""
    lines = [
        f"{icon} <b>{html.escape(it['code'])}</b> · {html.escape(it['source'])}",
        flag + html.escape(it["title"]),
    ]
    if when:
        lines.append(f"<i>{when}</i>")
    if it["url"]:
        lines.append(f'<a href="{html.escape(it["url"], quote=True)}">Open</a>')
    return "\n".join(lines)


def send_telegram(token, chat_id, text, retries=3):
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    body = urllib.parse.urlencode({
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": "true",
    }).encode()
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, data=body, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=20) as resp:
                return json.loads(resp.read()).get("ok", False)
        except urllib.error.HTTPError as e:
            detail = e.read().decode(errors="replace")
            if e.code == 429 and attempt < retries - 1:
                retry_after = json.loads(detail).get("parameters", {}).get("retry_after", 5)
                time.sleep(int(retry_after) + 1)
                continue
            raise RuntimeError(f"Telegram error {e.code}: {detail}") from None
    return False


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="print messages instead of sending them")
    parser.add_argument("--test", action="store_true", help="send a test message to check the token and chat id")
    args = parser.parse_args()

    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    chat_id = os.environ.get("TELEGRAM_CHAT_ID", "").strip()
    tickers = parse_tickers(os.environ.get("ASX_TICKERS", ""))
    state_file = os.environ.get("STATE_FILE") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "seen.json")
    include_headlines = os.environ.get("INCLUDE_HEADLINES", "true").lower() != "false"
    price_sensitive_only = os.environ.get("PRICE_SENSITIVE_ONLY", "false").lower() == "true"

    if not args.dry_run and (not token or not chat_id):
        sys.exit("TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set (or use --dry-run)")

    if args.test:
        send_telegram(token, chat_id, f"✅ ASX news bot is connected.\nWatching: {', '.join(tickers) or '(no tickers set)'}")
        print("Test message sent.")
        return

    if not tickers:
        sys.exit("ASX_TICKERS is empty, e.g. ASX_TICKERS='BHP, CBA, PLS'")

    all_items, all_errors = [], []
    for code in tickers:
        items, errors = fetch_ticker(code, include_headlines)
        all_items += items
        all_errors += errors
    for err in all_errors:
        print(f"warning: {err}", file=sys.stderr)
    if not all_items and len(all_errors) >= len(tickers):
        sys.exit("Every source failed; not updating state.")

    state = load_state(state_file)
    first_run = state is None
    seen_list = (state or {}).get("seen", [])
    now = datetime.now(timezone.utc)
    new_items = select_new(all_items, set(seen_list), now, price_sensitive_only)

    if first_run:
        print(f"First run: remembering {len(new_items)} existing items without sending them.")
        if not args.dry_run:
            send_telegram(token, chat_id,
                          f"✅ ASX news bot started.\nWatching: {', '.join(tickers)}\n"
                          "You'll get new announcements and headlines from now on.")
            save_state(state_file, seen_list + [it["id"] for it in new_items])
        return

    to_send = new_items[-MAX_MESSAGES_PER_RUN:]
    skipped = new_items[:-MAX_MESSAGES_PER_RUN] if len(new_items) > MAX_MESSAGES_PER_RUN else []
    sent_ids = [it["id"] for it in skipped]
    try:
        for it in to_send:
            msg = format_message(it)
            if args.dry_run:
                print(msg, end="\n\n")
            else:
                send_telegram(token, chat_id, msg)
                time.sleep(1)  # stay well under Telegram's rate limit
            sent_ids.append(it["id"])
    finally:
        # Save progress even if a send failed part-way, so nothing is sent twice.
        if not args.dry_run:
            save_state(state_file, seen_list + sent_ids)
    print(f"Checked {len(tickers)} tickers, sent {len(to_send)} new items"
          + (f", skipped {len(skipped)} older ones" if skipped else "") + ".")


if __name__ == "__main__":
    main()
