# 📢 ASX News Bot (Telegram)

Sends new **ASX company announcements** (from the official ASX feed, with
price-sensitive ones flagged 🔴) and **news headlines** (Yahoo Finance) for your
chosen tickers to a Telegram chat. GitHub Actions runs it every 15 minutes on
weekdays, from about 7am to 8pm Sydney time, which covers ASX announcement hours.

On its first run it sends a "bot started" message and remembers what's already
out there, so you only get *new* items after that.

## Setup

### 1. Get your bot token
In Telegram, open **@BotFather** → `/mybots` → pick your ASX bot → **API Token**.
It looks like `123456789:AAH...`.

### 2. Get your chat ID
1. Open a chat with your bot and send it any message (e.g. `hi`).
2. In a browser, open
   `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates`
3. Find `"chat":{"id":123456789` — that number is your chat ID.
   (For a group, add the bot to the group first; group IDs start with `-`.)

### 3. Add three repository secrets
GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Name | Example |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | `123456789:AAH...` |
| `TELEGRAM_CHAT_ID` | `123456789` |
| `ASX_TICKERS` | `BHP, CBA, CSL, PLS, WDS` |

### 4. Test it
**Actions** tab → **ASX news bot** → **Run workflow** → tick *Only send a test
message* → Run. You should get a ✅ message in Telegram. Then run it again with
the box unticked to start it for real.

> GitHub only runs scheduled workflows from the repo's **default branch**, so
> `.github/workflows/asx-news.yml` has to be on that branch for the 15-minute
> schedule to kick in.

## Options

Optional environment variables (add them under `env:` in the workflow):

- `INCLUDE_HEADLINES: "false"` sends only official ASX announcements and skips Yahoo headlines.
- `PRICE_SENSITIVE_ONLY: "true"` sends only price-sensitive ASX announcements.

## Run locally

```bash
export TELEGRAM_BOT_TOKEN=... TELEGRAM_CHAT_ID=... ASX_TICKERS="BHP,CBA"
python3 asx-news-bot/asx_news_bot.py --test      # send a test message
python3 asx-news-bot/asx_news_bot.py --dry-run   # print instead of sending
python3 -m unittest discover asx-news-bot         # run the tests
```

No dependencies. It uses only the Python standard library.
