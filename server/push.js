const webpush = require('web-push');

const publicKey = process.env.VAPID_PUBLIC_KEY || '';
const privateKey = process.env.VAPID_PRIVATE_KEY || '';
const subject = process.env.VAPID_SUBJECT || 'mailto:example@example.com';

let configured = false;
if (publicKey && privateKey) {
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
} else {
  // eslint-disable-next-line no-console
  console.warn(
    '[push] VAPID keys are not set. Run "npm run generate-vapid-keys" and ' +
      'put the values in your .env file to enable real push notifications.'
  );
}

function isConfigured() {
  return configured;
}

function getVapidPublicKey() {
  return publicKey;
}

/**
 * Sends a push payload to every stored subscription. Any subscription that
 * the push service reports as gone (404/410) is dropped from `db.subscriptions`
 * so the caller should persist `db` afterwards.
 */
async function sendNotificationToAll(db, payload) {
  if (!configured) {
    // eslint-disable-next-line no-console
    console.warn('[push] Skipping send: VAPID keys not configured.');
    return { sent: 0, removed: 0 };
  }

  const body = JSON.stringify(payload);
  let sent = 0;
  const stillValid = [];

  for (const sub of db.subscriptions) {
    try {
      await webpush.sendNotification(sub, body);
      sent += 1;
      stillValid.push(sub);
    } catch (err) {
      const statusCode = err && err.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        // Subscription expired or was revoked by the browser; drop it.
      } else {
        // eslint-disable-next-line no-console
        console.error('[push] Failed to send notification:', statusCode || err.message);
        stillValid.push(sub); // keep it, might be a transient failure
      }
    }
  }

  const removed = db.subscriptions.length - stillValid.length;
  db.subscriptions = stillValid;
  return { sent, removed };
}

module.exports = { isConfigured, getVapidPublicKey, sendNotificationToAll };
