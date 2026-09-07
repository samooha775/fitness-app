const webpush = require('web-push');

const keys = webpush.generateVAPIDKeys();

console.log('\nVAPID keys generated. Copy these into your .env file:\n');
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log('VAPID_SUBJECT=mailto:you@example.com\n');
