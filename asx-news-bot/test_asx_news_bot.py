import json
import os
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import asx_news_bot as bot  # noqa: E402

NOW = datetime.now(timezone.utc)

ASX_JSON = json.dumps({"data": {"items": [
    {"documentKey": "2924-1", "headline": "Quarterly Activities Report", "date": (NOW - timedelta(hours=2)).isoformat(),
     "isPriceSensitive": True},
    {"documentKey": "2924-2", "headline": "Change of Director's Interest <Notice>", "date": (NOW - timedelta(hours=1)).isoformat(),
     "isPriceSensitive": False},
    {"documentKey": "2924-0", "headline": "Old news", "date": (NOW - timedelta(days=10)).isoformat()},
    {"documentKey": "", "headline": "No key"},
]}}).encode()

YAHOO_RSS = f"""<?xml version="1.0"?><rss><channel>
<item><title>BHP shares rise on copper</title><link>https://example.com/a</link><guid>g-a</guid>
<pubDate>{(NOW - timedelta(minutes=30)).strftime('%a, %d %b %Y %H:%M:%S +0000')}</pubDate></item>
</channel></rss>""".encode()


def fake_get(url, timeout=20):
    if "markitdigital" in url:
        return ASX_JSON
    if "yahoo" in url:
        return YAHOO_RSS
    raise AssertionError(url)


class ParsingTests(unittest.TestCase):
    def test_parse_tickers(self):
        self.assertEqual(bot.parse_tickers("bhp, CBA.AX  pls,,bhp x"), ["BHP", "CBA", "PLS"])

    def test_parse_asx(self):
        items = bot.parse_asx_announcements("BHP", ASX_JSON)
        self.assertEqual([i["id"] for i in items], ["asx:2924-1", "asx:2924-2", "asx:2924-0"])
        self.assertTrue(items[0]["price_sensitive"])
        self.assertEqual(items[0]["url"], "https://www.asx.com.au/markets/company/BHP")

    def test_parse_yahoo(self):
        items = bot.parse_yahoo_rss("BHP", YAHOO_RSS)
        self.assertEqual(items[0]["id"], "yahoo:g-a")
        self.assertIsNotNone(items[0]["time"])

    def test_select_new_filters_seen_old_and_sorts(self):
        items = bot.parse_asx_announcements("BHP", ASX_JSON) + bot.parse_yahoo_rss("BHP", YAHOO_RSS)
        fresh = bot.select_new(items, {"asx:2924-2"}, NOW)
        self.assertEqual([i["id"] for i in fresh], ["asx:2924-1", "yahoo:g-a"])

    def test_price_sensitive_only(self):
        items = bot.parse_asx_announcements("BHP", ASX_JSON)
        fresh = bot.select_new(items, set(), NOW, price_sensitive_only=True)
        self.assertEqual([i["id"] for i in fresh], ["asx:2924-1"])

    def test_format_escapes_html(self):
        item = bot.parse_asx_announcements("BHP", ASX_JSON)[1]
        msg = bot.format_message(item)
        self.assertIn("&lt;Notice&gt;", msg)
        self.assertNotIn("PRICE SENSITIVE", msg)


class MainTests(unittest.TestCase):
    def run_main(self, state_file, argv=()):
        env = {"TELEGRAM_BOT_TOKEN": "t", "TELEGRAM_CHAT_ID": "1", "ASX_TICKERS": "BHP", "STATE_FILE": state_file}
        sent = []
        with mock.patch.dict(os.environ, env), \
                mock.patch.object(bot, "http_get", fake_get), \
                mock.patch.object(bot, "send_telegram", lambda t, c, msg: sent.append(msg) or True), \
                mock.patch.object(bot.time, "sleep", lambda s: None), \
                mock.patch.object(sys, "argv", ["bot", *argv]):
            bot.main()
        return sent

    def test_first_run_seeds_then_only_new_items_are_sent(self):
        with tempfile.TemporaryDirectory() as d:
            state = os.path.join(d, "seen.json")
            sent = self.run_main(state)
            self.assertEqual(len(sent), 1)
            self.assertIn("started", sent[0])

            self.assertEqual(self.run_main(state), [])  # nothing new

            global ASX_JSON
            original = ASX_JSON
            data = json.loads(original)
            data["data"]["items"].append({"documentKey": "2924-9", "headline": "Trading Halt",
                                          "date": NOW.isoformat(), "isPriceSensitive": True})
            ASX_JSON = json.dumps(data).encode()
            try:
                sent = self.run_main(state)
            finally:
                ASX_JSON = original
            self.assertEqual(len(sent), 1)
            self.assertIn("Trading Halt", sent[0])
            self.assertIn("PRICE SENSITIVE", sent[0])
            self.assertEqual(self.run_main(state), [])

    def test_dry_run_does_not_write_state(self):
        with tempfile.TemporaryDirectory() as d:
            state = os.path.join(d, "seen.json")
            self.run_main(state, ["--dry-run"])
            self.assertFalse(os.path.exists(state))


if __name__ == "__main__":
    unittest.main()
