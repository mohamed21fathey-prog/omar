// فحص حالة المشهد بعد الاختبار + تنظيف بيانات الاختبار الآلي
// (نحذف التقييم والمستخدم التجريبي علشان الموقع يفضل بأرقام حقيقية 0 تقييمات)
import { createClient } from '@libsql/client';
import { readFileSync } from 'fs';
const src = readFileSync(new URL('/home/z/my-project/mcp-media-generator/src/lib/turso.ts', import.meta.url), 'utf8');
const url = (src.match(/"libsql:\/\/[^"]+"/) || [])[0]?.slice(1, -1);
const tok = (src.match(/"eyJ[^"]+"/) || [])[0]?.slice(1, -1);
const db = createClient({ url, authToken: tok });
const q = async (label, sql, args = []) => {
  try { const r = await db.execute({ sql, args }); console.log(label + ': ' + JSON.stringify(r.rows)); }
  catch (e) { console.log(label + ' ERR: ' + e.message); }
};
const UID = "مؤقت"; // نلقاه من اسم المستخدم
const u = await db.execute({ sql: `SELECT id, credits FROM users WHERE username = ?`, args: ['tstgen' + (process.argv[2] || '')] });
const uid = u.rows[0]?.id;
if (!uid) { console.log('ما لقيتش المستخدم التجريبي'); process.exit(0); }
console.log('المستخدم التجريبي:', uid, 'رصيده:', u.rows[0]?.credits);
await q('حالة المشاهد (قبل التنظيف)', `SELECT id, status, error_message FROM studio_scenes WHERE project_id = '5e587d17-68f4-471c-9e17-510553c2edaa'`);
await q('حالة المشروع', `SELECT id, status FROM studio_projects WHERE id = '5e587d17-68f4-471c-9e17-510553c2edaa'`);
// تنظيف
await db.execute({ sql: `DELETE FROM site_ratings WHERE user_id = ?`, args: [uid] });
await db.execute({ sql: `DELETE FROM studio_scenes WHERE project_id IN (SELECT id FROM studio_projects WHERE user_id = ?)`, args: [uid] });
await db.execute({ sql: `DELETE FROM studio_projects WHERE user_id = ?`, args: [uid] });
await db.execute({ sql: `DELETE FROM users WHERE id = ?`, args: [uid] });
await q('بعد التنظيف — تقييمات', `SELECT COUNT(*) AS n, COALESCE(AVG(rating),0) AS avg FROM site_ratings`);
await q('بعد التنظيف — المستخدم التجريبي اتشال', `SELECT COUNT(*) AS n FROM users WHERE username LIKE 'tstgen%'`);
