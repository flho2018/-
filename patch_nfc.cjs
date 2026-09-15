/* =========================================================================
 *  patch_nfc.cjs — تحويل مسار بطاقات NFC إلى التجزئة
 * =========================================================================
 *  يعدّل ثلاثة مواضع في AppContext.jsx:
 *
 *   1) الاستيراد: يضيف hashNfcCard و verifyNfcCard
 *   2) addUser:   يحفظ nfcCardHash بدل nfcCardId النصي
 *   3) loginWithNfc: يقارن بالتجزئة بدل المقارنة النصية
 *
 *  يكتب بترميز UTF-8 بلا BOM — لهذا نستخدم node لا PowerShell،
 *  فـ PowerShell أفسد النصوص العربية في محاولة سابقة.
 *
 *  لا يعدّل شيئاً إن لم يجد النص المتوقع بالضبط، ويخبرك بما وجد.
 * ========================================================================= */

const fs = require('fs');
const path = require('path');

const FILE = path.join('src', 'context', 'AppContext.jsx');

if (!fs.existsSync(FILE)) {
  console.log('❌ لم يُعثر على ' + FILE);
  console.log('   شغّل الأمر من داخل D:\\FL-HO2018');
  process.exit(1);
}

let s = fs.readFileSync(FILE, 'utf8');
const before = s.length;
const done = [];
const failed = [];

function swap(label, oldText, newText) {
  const n = s.split(oldText).length - 1;
  if (n === 0) { failed.push(label + '  (لم يُعثر عليه)'); return; }
  if (n > 1)   { failed.push(label + '  (وُجد ' + n + ' مرات — متوقع 1)'); return; }
  s = s.replace(oldText, newText);
  done.push(label);
}

// ---------------------------------------------------------------- 1
swap(
  '1. الاستيراد',
  "import { hashPin, verifyPin } from '../utils/security';",
  "import { hashPin, verifyPin, hashNfcCard, verifyNfcCard } from '../utils/security';"
);

// ---------------------------------------------------------------- 2
//  البطاقة تُخزَّن مجزّأة. الحقل القديم nfcCardId لم يعد يُكتب إطلاقاً.
swap(
  '2. حفظ البطاقة في addUser',
  "      nfcCardId: userData.nfcCardId || '',",
  "      // nfcCardId removed - card number is never stored in plain text\n" +
  "      nfcCardHash: userData.nfcCardHash || (userData.nfcCardId ? hashNfcCard(userData.nfcCardId) : ''),"
);

// ---------------------------------------------------------------- 3
//  المقارنة النصية المباشرة كانت تعني أن من يقرأ pos_users يصنع بطاقة.
swap(
  '3. التحقق في loginWithNfc',
  "    const foundUser = users.find(u => u.nfcCardId && String(u.nfcCardId).trim().toLowerCase() === cleanId && u.isActive !== false);",
  "    const foundUser = users.find(u => verifyNfcCard(cleanId, u));"
);

// ---------------------------------------------------------------- 4
//  updateUser كان ينشر ...userData كما هو، فتعديل موظف من شاشة
//  الإعدادات يعيد كتابة pin و nfcCardId نصاً صريحاً ويُلغي كل ما سبق.
//  الآن يُجزّآن ويُسقط الأصل قبل الدمج.
swap(
  '4. تنظيف updateUser',
  "    const pinHashUpdate = userData.pin ? { pinHash: hashPin(userData.pin) } : {};",
  "    const pinHashUpdate = userData.pin ? { pinHash: hashPin(userData.pin) } : {};\n" +
  "    const nfcHashUpdate = userData.nfcCardId ? { nfcCardHash: hashNfcCard(userData.nfcCardId) } : {};\n" +
  "    // plain-text secrets never reach the stored record\n" +
  "    const { pin: _pin, nfcCardId: _card, password: _pw, ...safeUserData } = userData;"
);

swap(
  '5. دمج آمن في updateUser',
  "      const updated = prev.map(u => u.id === userData.id ? { ...u, ...userData, ...pinHashUpdate, updatedAt: new Date().toISOString() } : u);",
  "      const updated = prev.map(u => u.id === userData.id ? { ...u, ...safeUserData, ...pinHashUpdate, ...nfcHashUpdate, updatedAt: new Date().toISOString() } : u);"
);

// ----------------------------------------------------------------
console.log('');
done.forEach(d => console.log('  ✅ ' + d));
failed.forEach(f => console.log('  ❌ ' + f));
console.log('');

if (failed.length) {
  console.log('⛔ لم يُكتب أي تعديل — الملف كما هو.');
  console.log('   أرسل هذه الرسالة كما هي.');
  process.exit(1);
}

fs.writeFileSync(FILE, s, 'utf8');
console.log('═══════════════════════════════════');
console.log('  ✅ تم التعديل بنجاح');
console.log('═══════════════════════════════════');
console.log('  الحجم: ' + before + ' ← ' + s.length + ' حرف\n');
