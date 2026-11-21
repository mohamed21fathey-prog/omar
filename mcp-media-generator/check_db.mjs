// فحص سريع للقاعدة: هل فيه مفاتيح نشطة؟ + آخر المستخدمين/الطلبات
// لا يطبع أي أسرار — يقرأ قيم Turso الافتراضية من src/lib/turso.ts
import { createClient } from '@libsql/client';
import { readFileSync } from 'fs';

const src = readFileSync(new URL('./src/lib/turso.ts', import.meta.url), 'utf8');
const url = (src.match(/"libsql:\/\/[^"]+"/) || [])[0]?.slice(1, -1);
const tok = (src.match(/"eyJ[^"]+"/) || [])[0]?.slice(1, -1);
if (!url || !tok) { console.log('ERR: ما لقيتش قيم الاتصال'); process.exit(1); }
const db = createClient({ url, authToken: tok });

async function q(label, sql) {
  try {
    const r = await db.execute(sql);
    console.log(label + ': ' + JSON.stringify(r.rows));
  } catch (e) { console.log(label + ' ERR: ' + e.message); }
}

await q('المفاتيح (بدون كشف المفتاح)', `SELECT id, provider, status, COALESCE(role,'-') AS role, status FROM api_keys`);
await q('عدد المستخدمين', `SELECT COUNT(*) AS n FROM users`);
await q('آخر مستخدمين', `SELECT id, username, credits FROM users ORDER BY rowid DESC LIMIT 5`);
await q('مشروعات الاستوديو الأخيرة', `SELECT p.id, p.user_id, p.status, (SELECT COUNT(*) FROM studio_scenes s WHERE s.project_id = p.id) AS total, p.created_at FROM studio_projects p ORDER BY rowid DESC LIMIT 5`);
await q('طلبات الشحن الأخيرة', `SELECT id, user_id, package_key, status, created_at FROM payments ORDER BY rowid DESC LIMIT 5`);
await q('التقييمات', `SELECT COUNT(*) AS n, COALESCE(AVG(rating),0) AS avg FROM site_ratings`);
