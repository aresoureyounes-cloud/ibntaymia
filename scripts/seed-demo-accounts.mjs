// Seeds rich demo accounts for every role with realistic but fake data.
// Run: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-demo-accounts.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const PASSWORD = "Demo@2026";
const DOMAIN = "demo.idarroom.dz";

// Each entry: email, role(s) (staff only; students stay 'student' by default), full_name, phone, extra
const STAFF = [
  { email: `admin@${DOMAIN}`,      role: "admin",        full_name: "أحمد بن علي (مدير النظام)", phone: "+213551000001" },
  { email: `director@${DOMAIN}`,   role: "director",     full_name: "خديجة العمراني (المديرة)",   phone: "+213551000002" },
  { email: `supervisor@${DOMAIN}`, role: "supervisor",   full_name: "يوسف الطاهري (الناظر)",      phone: "+213551000003" },
  { email: `counselor@${DOMAIN}`,  role: "supervisor",   full_name: "فاطمة الزهراء (مستشارة تربوية)", phone: "+213551000004" },
  { email: `teacher.math@${DOMAIN}`,    role: "teacher", full_name: "محمد العربي (أستاذ رياضيات)", phone: "+213551000010" },
  { email: `teacher.physics@${DOMAIN}`, role: "teacher", full_name: "نورية بلقاسم (أستاذة فيزياء)", phone: "+213551000011" },
  { email: `teacher.arabic@${DOMAIN}`,  role: "teacher", full_name: "صالح بومدين (أستاذ عربية)",   phone: "+213551000012" },
  { email: `teacher.english@${DOMAIN}`, role: "teacher", full_name: "أمينة شريف (أستاذة إنجليزية)", phone: "+213551000013" },
  { email: `gate@${DOMAIN}`,       role: "gate_monitor", full_name: "عبد الرحمن (حارس البوابة)",  phone: "+213551000020" },
  { email: `parent1@${DOMAIN}`,    role: "parent",       full_name: "كريم الحسني (والد)",          phone: "+213551000030" },
  { email: `parent2@${DOMAIN}`,    role: "parent",       full_name: "ليلى مرابط (والدة)",          phone: "+213551000031" },
];

const STUDENTS_DEMO = [
  { email: `student1@${DOMAIN}`, full_name: "آدم الحسني",   gender: "M", dob: "2008-03-12", class: "ثانية ثانوي - رياضيات" },
  { email: `student2@${DOMAIN}`, full_name: "سارة مرابط",   gender: "F", dob: "2008-07-25", class: "ثانية ثانوي - رياضيات" },
  { email: `student3@${DOMAIN}`, full_name: "ياسين قاسمي",  gender: "M", dob: "2009-01-04", class: "أولى ثانوي - علوم" },
  { email: `student4@${DOMAIN}`, full_name: "ريم بوزيد",    gender: "F", dob: "2009-11-18", class: "أولى ثانوي - علوم" },
  { email: `student5@${DOMAIN}`, full_name: "إلياس بن صالح", gender: "M", dob: "2007-05-30", class: "ثالثة ثانوي - آداب" },
];

async function findUserByEmail(email) {
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

async function upsertUser(email, full_name, phone) {
  const existing = await findUserByEmail(email);
  if (existing) {
    await admin.auth.admin.updateUserById(existing.id, {
      password: PASSWORD, email_confirm: true,
      user_metadata: { full_name, phone },
    });
    return existing.id;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true,
    user_metadata: { full_name, phone },
  });
  if (error) throw new Error(`${email}: ${error.message}`);
  return data.user.id;
}

async function setRole(userId, role) {
  await admin.from("user_roles").delete().eq("user_id", userId);
  const { error } = await admin.from("user_roles").insert({ user_id: userId, role });
  if (error) throw error;
}

async function setProfile(userId, full_name, phone) {
  await admin.from("profiles").upsert({ id: userId, full_name, phone, preferred_language: "ar" });
}

async function ensureClass(name) {
  const { data: existing } = await admin.from("classes").select("id").eq("name", name).maybeSingle();
  if (existing) return existing.id;
  const { data, error } = await admin.from("classes").insert({ name, level: "ثانوي", branch: name.split(" - ")[1] ?? null }).select("id").single();
  if (error) throw error;
  return data.id;
}

async function ensureStudent({ full_name, gender, dob, classId, email, userId }) {
  const { data: existing } = await admin.from("students").select("id").eq("full_name", full_name).maybeSingle();
  if (existing) {
    await admin.from("students").update({
      gender, date_of_birth: dob, class_id: classId, fake_email: email, user_id: userId,
    }).eq("id", existing.id);
    return existing.id;
  }
  const { data, error } = await admin.from("students").insert({
    full_name, gender, date_of_birth: dob, class_id: classId, fake_email: email, user_id: userId,
  }).select("id").single();
  if (error) throw error;
  return data.id;
}

async function ensureCard(studentId, uid) {
  const { data: existing } = await admin.from("rfid_cards").select("id").eq("card_uid", uid).maybeSingle();
  if (existing) {
    await admin.from("rfid_cards").update({ student_id: studentId, status: "active" }).eq("id", existing.id);
    return existing.id;
  }
  const { data, error } = await admin.from("rfid_cards").insert({
    card_uid: uid, student_id: studentId, status: "active", assigned_at: new Date().toISOString(),
  }).select("id").single();
  if (error) throw error;
  return data.id;
}

async function whitelist(email, role) {
  // staff_whitelist now uses email (immutable) per the security fix
  const { data: existing } = await admin.from("staff_whitelist").select("id").ilike("email", email).maybeSingle();
  if (existing) {
    await admin.from("staff_whitelist").update({ role, full_name: email }).eq("id", existing.id);
  } else {
    await admin.from("staff_whitelist").insert({ email, role, full_name: email, note: "demo seed" });
  }
}

async function main() {
  console.log("== Whitelisting staff emails ==");
  for (const s of STAFF) await whitelist(s.email, s.role);

  console.log("== Creating staff accounts ==");
  for (const s of STAFF) {
    const uid = await upsertUser(s.email, s.full_name, s.phone);
    await setProfile(uid, s.full_name, s.phone);
    await setRole(uid, s.role);
    console.log(`  ✓ ${s.email.padEnd(35)} [${s.role}] ${s.full_name}`);
  }

  console.log("== Creating demo students (auth + linked student records + RFID) ==");
  for (let i = 0; i < STUDENTS_DEMO.length; i++) {
    const s = STUDENTS_DEMO[i];
    const classId = await ensureClass(s.class);
    const uid = await upsertUser(s.email, s.full_name, null);
    await setProfile(uid, s.full_name, null);
    await setRole(uid, "student");
    const sid = await ensureStudent({ ...s, classId, userId: uid, dob: s.dob });
    const cardUid = `04A1B2C${(100 + i).toString(16).toUpperCase()}`;
    await ensureCard(sid, cardUid);
    console.log(`  ✓ ${s.email.padEnd(35)} → ${s.full_name}  [class: ${s.class}, card: ${cardUid}]`);
  }

  console.log("\n=== ALL DEMO ACCOUNTS ===");
  console.log(`Password for ALL accounts: ${PASSWORD}`);
  console.log("Staff:");
  for (const s of STAFF) console.log(`  ${s.email}  [${s.role}]`);
  console.log("Students:");
  for (const s of STUDENTS_DEMO) console.log(`  ${s.email}  [${s.full_name}]`);
}

main().catch((e) => { console.error(e); process.exit(1); });
