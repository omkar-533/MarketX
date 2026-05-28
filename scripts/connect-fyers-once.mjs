/** One-off: node scripts/connect-fyers-once.mjs "<auth_code>" */
const code = process.argv[2]?.trim();
if (!code) {
  console.error('Usage: node scripts/connect-fyers-once.mjs "<auth_code>"');
  process.exit(1);
}
const clean = code.includes('&state=') && code.startsWith('eyJ')
  ? code.slice(0, code.indexOf('&state='))
  : code;

const res = await fetch('http://127.0.0.1:5000/api/fyers/connect', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ auth_code: clean }),
});
const text = await res.text();
console.log(res.status, text);
process.exit(res.ok ? 0 : 1);
