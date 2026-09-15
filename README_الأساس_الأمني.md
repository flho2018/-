# الأساس الأمني — دليل التركيب

بُني هذا الأساس ليكون طبقة تحتية تبني عليها بقية الشاشات. ركّبه الآن قبل أن تكتب ميزات جديدة، لأن ربط ٤٩ صلاحية بشاشات موجودة أسهل بكثير من ربطها بشاشات لم تُكتب بعد.

---

## الملفات وأماكنها

```
firestore.rules                    ← جذر المشروع (بديل الحالي)
firebase.json                      ← جذر المشروع (بديل الحالي، أُضيف قسم emulators)
src/utils/permissions.js           ← بديل الملف الحالي
src/utils/authUsers.js             ← بديل الملف الحالي
src/utils/security.js              ← بديل الملف الحالي
src/utils/audit.js                 ← جديد
src/hooks/usePermission.js         ← جديد
tests/firestore.rules.test.cjs     ← جديد
```

---

## ١. التثبيت

```bash
npm i -D @firebase/rules-unit-testing
```

أضف إلى `package.json` في `scripts`:

```json
"emu":       "firebase emulators:start --only firestore,auth",
"test:rules": "firebase emulators:exec --only firestore \"node tests/firestore.rules.test.cjs\""
```

يتطلب المحاكي **Java** مثبّتاً. إن لم يكن موجوداً: [adoptium.net](https://adoptium.net).

---

## ٢. تشغيل الاختبارات أولاً

```bash
npm run test:rules
```

٢٧ اختباراً تثبت أن القواعد تمنع ما تدّعي منعه. **لا تنشر القواعد قبل أن تصبح كلها خضراء.**

أهمها ثلاثة:

| الاختبار | ما يمنعه |
|---|---|
| الكاشير لا يصفّر إجمالي فاتورة قديمة | إخراج نقد بلا أثر |
| الكاشير لا يعدّل وردية مغلقة | تغطية عجز بأثر رجعي |
| الكاشير لا يكتب قيداً باسم زميله | تزوير سجل التدقيق |

هذه ليست اختبارات تجميلية. قاعدة Firestore مكتوبة غلطاً **لا تُخطئ بصوت مسموع** — البرنامج يعمل، لا رسالة خطأ، ولا أحد يلاحظ. يُكتشف الخلل يوم يُخرج أحدهم نقداً من الدرج.

---

## ٣. التطوير على المحاكي

شغّل المحاكي في نافذة مستقلة:

```bash
npm run emu
```

ثم في تهيئة Firebase عندك، اربط بالمحاكي أثناء التطوير فقط:

```js
import { connectFirestoreEmulator } from 'firebase/firestore';
import { connectAuthEmulator } from 'firebase/auth';

if (import.meta.env.DEV) {
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099');
  console.log('🧪 متصل بالمحاكي — لا شيء يُكتب في قاعدة الإنتاج');
}
```

**فائدتان:** تطوّر بلا إنترنت، ولا تلوّث قاعدة الإنتاج ببيانات تجريبية تُنسى فيها.

حساب `dev@flower-house.com` يعمل كمدير في وضع التطوير وحده — في نسخة الإنتاج يرجع `null` تلقائياً.

---

## ٤. ربط الصلاحيات بالشاشات

### الخطوة أ: بناء المستخدم بعد تسجيل الدخول

```js
import { buildSessionUser } from './utils/authUsers.js';

onAuthStateChanged(auth, async (fbUser) => {
  if (!fbUser) return setCurrentUser(null);

  const posUser = await loadPosUser(fbUser.email);
  const session = buildSessionUser(fbUser, posUser);

  if (!session) {
    // حساب مصادَق لكنه غير معتمد — الخروج فوراً
    await signOut(auth);
    notify('هذا الحساب غير مصرّح له بالدخول', 'error');
    return;
  }
  setCurrentUser(session);
});
```

`buildSessionUser` يرجع `null` لأي بريد خارج `AUTH_ROLE_MAP`. الرفض افتراضي، والسماح استثناء صريح.

### الخطوة ب: في أي شاشة

```jsx
import { usePermission, Can } from '../../hooks/usePermission.js';
import { P } from '../../utils/permissions.js';

function InvoicesScreen() {
  const { currentUser, notify } = useApp();
  const { can, guard } = usePermission(currentUser, notify);

  // الحماية الفعلية — الإجراء نفسه
  const onRefund = guard(P.INVOICES_REFUND, async (inv) => {
    await refundInvoice(inv);
  });

  return (
    <>
      {can(P.INVOICES_REFUND) && (
        <button onClick={() => onRefund(invoice)}>مرتجع</button>
      )}

      <Can user={currentUser} perm={P.PRODUCTS_VIEW_COST}>
        <td>التكلفة: {item.cost}</td>
      </Can>
    </>
  );
}
```

**القاعدة التي لا تُكسر:** كل إجراء حسّاس يمر عبر `guard`، **حتى لو كان زره مخفياً**. إخفاء زر ليس منعاً — من يعرف أدوات المطور يستدعي الدالة مباشرة.

`can()` للإظهار والإخفاء (تجربة مستخدم). `guard()` للمنع (حماية).

### الخطوة ج: تقييد العمليات الخطرة

```js
import { withAudit, AUDIT } from '../utils/audit.js';

const onRefund = guard(P.INVOICES_REFUND, async (inv) => {
  const reason = await promptReason();   // اجعل السبب إلزامياً
  if (!reason) return;

  await withAudit(db, currentUser, {
    action: AUDIT.INVOICE_REFUND,
    targetId: inv.id,
    targetName: inv.invoiceNumber,
    before: { total: inv.total, isRefunded: false },
    after:  { isRefunded: true },
    amount: inv.total,
    reason,
  }, () => refundInvoice(inv));
});
```

القيد يُكتب بـ `serverTimestamp()` وببريد الحساب الحقيقي — الخادم يرفض غير ذلك. ولا يمكن تعديله ولا حذفه لاحقاً، **ولا حتى من حسابك أنت**. هذا ما يجعله دليلاً لا قائمة قابلة للتنظيف.

---

## ٥. قوالب الأدوار الجاهزة

| الدور | الصلاحيات | الفكرة |
|---|---:|---|
| مدير عام | ٤٩ (الكل) | تجاوز كامل، لا قائمة |
| مشرف | ٢٨ | يرتجع ويدير المخزون — **لا يرى الأرباح ولا التكلفة** |
| كاشير | ١٠ | يبيع ويحصّل فقط — لا خصم، لا مرتجع، لا تكلفة |
| مطّلع | ٣ | قراءة فقط (للمحاسب الخارجي) |

`admin` ليس قائمة صلاحيات بل `all: true`. مقصود: لو كان قائمة، لنسيت يوماً صلاحية جديدة ووجدت نفسك ممنوعاً من ميزتك.

الصلاحيات المخصّصة لمستخدم تغلب قالب دوره — لحالة الكاشير الذي تثق به في المرتجع وحده.

---

## ٦. رقم PIN — ما تغيّر

| | قبل | بعد |
|---|---|---|
| التجزئة | SHA-256 مرة واحدة، بلا ملح | PBKDF2، ١٥٠٬٠٠٠ تكرار، ملح لكل مستخدم |
| التوافق العكسي | يقبل النص الصريح | **محذوف عمداً** |
| المحاولات | بلا حد | تأخير يتضاعف، ثم قفل ربع ساعة |
| الأرقام الضعيفة | مقبولة | `1234` و`0000` مرفوضة |

الرقم غير المجزَّأ مرفوض الآن صراحةً. حُذف التوافق العكسي لأن البرنامج قيد البناء ولا توجد بيانات قديمة تستحق حمل هذا العبء — وإبقاؤه كان يعني بقاء أرقام نصاً صريحاً في `localStorage` وفي Firestore إلى الأبد.

**بصراحة عن الحد:** رقم من أربع خانات له ١٠٬٠٠٠ احتمال. التجزئة الجديدة تجعل تجربتها كلها تستغرق دقائق بدل أجزاء من الثانية، والتأخير التصاعدي يجعل ذلك مستحيلاً من الواجهة. لكن PIN يبقى حاجزاً تشغيلياً ضد الزميل الفضولي، لا حماية تشفيرية. الحماية الحقيقية أن الخادم يعرف *من* سجّل الدخول بحساب Firebase.

---

## ٧. ما زال مفتوحاً — لا تنسه

**سعر التكلفة يصل إلى جهاز الكاشير.**

Firestore لا يحمي حقلاً بعينه عند القراءة. طالما مستند المنتج مقروء، فحقل `cost` مقروء معه من أدوات المطور — و`<Can>` تخفيه بصرياً فقط.

الحل الوحيد الحقيقي مجموعة عرض منفصلة:

```
pos_products         ← فيها cost، القراءة للمدير وحده
pos_products_public  ← بلا cost، القراءة للجميع
```

تُحدَّث الثانية من الأولى بـ Cloud Function عند كل كتابة. يتطلب خطة Blaze — مجانية عملياً بحجمك، لكن **اضبط تنبيه ميزانية بـ ٥ ريال فور الترقية**.

قرّر هذا قبل أن تكتب شاشة المنتجات نهائياً: تغيير مصدر قراءة المنتجات لاحقاً يمس عشرات المواضع.

---

## الترتيب المقترح

1. ركّب الملفات وشغّل `npm run test:rules` حتى تخضرّ كلها
2. اربط `buildSessionUser` بتسجيل الدخول
3. مرّر `guard` على كل إجراء في شاشة الفواتير (الأخطر: المرتجع)
4. ثم شاشة المنتجات، ثم التقارير، ثم الخزينة
5. أنشئ الحسابات الفعلية **في آخر يوم قبل التشغيل** — لا قبله
6. فعّل `pos_products_public` قبل أن يدخل أول موظف

---

**ملاحظة على العدد:** الكتالوج هنا ٤٩ صلاحية، وتقريرك ذكر ٤٦. الفرق أنني أضفت `settings_reset_accounts` وفصلت بعض المفاتيح. قارنه بملفك الحالي قبل الاستبدال — أي مفتاح عندك وليس هنا سيسقط صامتاً عبر `sanitizePermissions`.
