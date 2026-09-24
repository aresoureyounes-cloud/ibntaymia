import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const PASSWORD = "younes";

// Staff plan: 10 accounts (barbon1..barbon10)
const STAFF = [
  { full_name: "المدير العام", roles: ["admin", "director"] },
  { full_name: "الناظر", roles: ["supervisor"] },
  { full_name: "المستشار التربوي", roles: ["supervisor"] },
  { full_name: "البواب", roles: ["gate_monitor"] },
  { full_name: "الأستاذ الأول", roles: ["teacher"] },
  { full_name: "الأستاذ الثاني", roles: ["teacher"] },
  { full_name: "الأستاذ الثالث", roles: ["teacher"] },
  { full_name: "الأستاذة الرابعة", roles: ["teacher"] },
  { full_name: "موظف الإدارة", roles: ["admin"] },
  { full_name: "أمين المكتبة", roles: ["supervisor"] },
];

async function deleteAuthUser(uid) {
  if (!uid) return;
  try { await admin.auth.admin.deleteUser(uid); } catch (e) { /* ignore */ }
}

async function findUserByEmail(email) {
  // paginate through users to find by email (admin list doesn't support filter in v2 cleanly)
  let page = 1;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const u = data.users.find((x) => (x.email || "").toLowerCase() === email.toLowerCase());
    if (u) return u;
    if (data.users.length < 200) return null;
    page++;
  }
}

async function upsertUser(email, full_name) {
  const existing = await findUserByEmail(email);
  if (existing) {
    await admin.auth.admin.updateUserById(existing.id, {
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name },
    });
    return existing.id;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name },
  });
  if (error) throw new Error(`${email}: ${error.message}`);
  return data.user.id;
}

async function setRoles(userId, roles) {
  await admin.from("user_roles").delete().eq("user_id", userId);
  if (roles.length) {
    const rows = roles.map((r) => ({ user_id: userId, role: r }));
    const { error } = await admin.from("user_roles").insert(rows);
    if (error) throw error;
  }
}

async function setProfile(userId, full_name) {
  await admin.from("profiles").upsert({ id: userId, full_name, preferred_language: "ar" });
}

async function main() {
  // 1. Fetch students (for renumbering after staff)
  const { data: students, error: sErr } = await admin
    .from("students")
    .select("id, full_name, user_id")
    .order("full_name", { ascending: true });
  if (sErr) throw sErr;

  console.log(`Students: ${students.length}, Staff: ${STAFF.length}`);

  // 2. Delete existing student auth users (clean slate so emails are predictable)
  for (const s of students) {
    if (s.user_id) {
      await deleteAuthUser(s.user_id);
    }
  }
  // detach
  await admin.from("students").update({ user_id: null }).not("id", "is", null);

  // 3. Create staff barbon1..barbon10
  const summary = [];
  for (let i = 0; i < STAFF.length; i++) {
    const idx = i + 1;
    const email = `barbon${idx}@gmail.com`;
    const { full_name, roles } = STAFF[i];
    const uid = await upsertUser(email, full_name);
    await setProfile(uid, full_name);
    await setRoles(uid, roles);
    summary.push({ email, password: PASSWORD, full_name, roles: roles.join("+") });
    console.log(`✓ Staff ${email} -> ${full_name} [${roles.join(",")}]`);
  }

  // 4. Create students barbon11..barbon(10+N)
  for (let i = 0; i < students.length; i++) {
    const idx = 11 + i;
    const email = `barbon${idx}@gmail.com`;
    const s = students[i];
    const uid = await upsertUser(email, s.full_name);
    await setProfile(uid, s.full_name);
    await setRoles(uid, ["student"]);
    const { error: uErr } = await admin
      .from("students")
      .update({ user_id: uid, fake_email: email })
      .eq("id", s.id);
    if (uErr) throw uErr;
    summary.push({ email, password: PASSWORD, full_name: s.full_name, roles: "student" });
    if (i % 10 === 0) console.log(`  ...student ${idx} ${s.full_name}`);
  }

  console.log(`\nDONE. Total accounts: ${summary.length}`);
  console.log(`All passwords: ${PASSWORD}`);
  console.log(`Range: barbon1..barbon${10 + students.length}@gmail.com`);
}

main().catch((e) => { console.error(e); process.exit(1); });
