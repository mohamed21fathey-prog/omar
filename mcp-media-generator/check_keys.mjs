// فحص سريع: هل فيه مفاتيح نشطة في القاعدة؟ (بدون طباعة أي مفاتيح)
import { createClient } from '@libsql/client';
const url = process.env.TURSO_DATABASE_URL, tok = process.env.TURSO_AUTH_TOKEN;
const db = createClient({ url, authToken: tok });
try {
  const r = await db.execute(`SELECT id, provider, status, COALESCE(role,'?') AS role, length(api_key_encrypted) AS klen, credit_balance FROM provider_keys`);
  console.log('keys:', JSON.stringify(r.rows));
} catch (e) { console.log('ERR provider_keys:', e.message); }
try {
  const s = await db.execute(`SELECT COUNT(*) AS n FROM site_ratings`);
  console.log('ratings:', JSON.stringify(s.rows));
} catch (e) { console.log('ERR ratings:', e.message); }
