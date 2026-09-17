// =========================================================================
//  اختبار طبقة نوافذ التأكيد والإدخال (بديل confirm / prompt)
// =========================================================================
//  لماذا هذا الاختبار موجود:
//  استبدال نوافذ المتصفّح بوعود (Promises) ينقل خطراً جديداً إلى البرنامج:
//  **وعدٌ لا يُحسم**. نافذة المتصفّح كانت تُجبر المستخدم على جواب، أما الوعد
//  فإن ضاع حلّاله (resolver) بقيت الدالة المنتظِرة معلّقة إلى الأبد بلا خطأ
//  في الطرفية ولا شيء على الشاشة — الكاشير يرى زراً ضغطه ولم يحدث شيء.
//  فما يُفحص هنا ليس شكل النافذة بل **عقدها**: أن كل طلب يُحسم مرة واحدة،
//  وبنفس دلالة الدالة التي حلّ محلّها (true/false للتأكيد، نصّ/null للإدخال).
//
//  النمط: استخراج نصّ الدوال **حرفياً** من `AppContext.jsx` وتنفيذه بخطّافات
//  وهمية (المستعمل في `pin_setup_gate` و `expected_cash`). ميزته أن الاختبار
//  لا يمكن أن ينجح على نسخة منسوخة متخلّفة عن الملف الحقيقي.
// =========================================================================

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..', 'src', 'context', 'AppContext.jsx');

let passed = 0;
let failed = 0;

const ok = (label, cond) => {
  if (cond) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; console.log(`  ❌ ${label}`); }
};

// ---------------------------------------------------------------- الاستخراج
const source = readFileSync(SRC, 'utf8');
const START = 'const [dialogQueue, setDialogQueue] = useState([]);';
const startIdx = source.indexOf(START);
if (startIdx === -1) {
  console.error('❌ لم يُعثر على كتلة نوافذ الحوار في AppContext.jsx — غُيّر اسمها أو حُذفت.');
  process.exit(1);
}
const promptIdx = source.indexOf('const promptDialog = useCallback(', startIdx);
const endIdx = source.indexOf('}, [openDialog]);', promptIdx);
if (promptIdx === -1 || endIdx === -1) {
  console.error('❌ لم تُعثر نهاية كتلة نوافذ الحوار.');
  process.exit(1);
}
const region = source.slice(startIdx, endIdx + '}, [openDialog]);'.length);

// ------------------------------------------------------------ خطّافات وهمية
const makeHarness = () => {
  let queue = [];
  let unmount = null;

  const useState = (init) => {
    const value = typeof init === 'function' ? init() : init;
    queue = value;
    return [queue, (updater) => {
      queue = typeof updater === 'function' ? updater(queue) : updater;
    }];
  };
  const useRef = (init) => ({ current: init });
  const useCallback = (fn) => fn;
  const useEffect = (fn) => { unmount = fn(); };

  const build = new Function('useState', 'useRef', 'useCallback', 'useEffect', `
    ${region}
    return { openDialog, resolveDialog, confirmDialog, promptDialog };
  `);

  const api = build(useState, useRef, useCallback, useEffect);
  return {
    ...api,
    getQueue: () => queue,
    unmountProvider: () => { if (typeof unmount === 'function') unmount(); }
  };
};

// ------------------------------------------------------------------ الفحوص
console.log('\n— التأكيد يُرجع منطقياً لا أي قيمة أخرى —');
{
  const h = makeHarness();
  const p1 = h.confirmDialog({ message: 'حذف؟' });
  const id1 = h.getQueue()[0].id;
  h.resolveDialog(id1, true);

  const p2 = h.confirmDialog('نصّ مباشر بلا كائن');
  const id2 = h.getQueue()[0].id;
  h.resolveDialog(id2, false);

  const p3 = h.confirmDialog({ message: 'أُغلقت بلا جواب' });
  const id3 = h.getQueue()[0].id;
  h.resolveDialog(id3, null);

  const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
  ok('الموافقة → true', r1 === true);
  ok('الإلغاء → false', r2 === false);
  ok('الإغلاق بلا جواب → false (لا null ولا undefined)', r3 === false);
  ok('النصّ المجرّد يُقبل كرسالة', typeof r2 === 'boolean');
}

console.log('\n— الإدخال يُرجع نصّاً أو null بنفس دلالة prompt —');
{
  const h = makeHarness();
  const p1 = h.promptDialog({ message: 'السبب؟' });
  h.resolveDialog(h.getQueue()[0].id, 'جرد فعلي');

  const p2 = h.promptDialog({ message: 'السبب؟' });
  h.resolveDialog(h.getQueue()[0].id, null);

  const p3 = h.promptDialog({ message: 'نصّ فارغ مقبول' });
  h.resolveDialog(h.getQueue()[0].id, '');

  const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
  ok('الحفظ يُرجع النصّ كما كُتب', r1 === 'جرد فعلي');
  ok('الإلغاء يُرجع null', r2 === null);
  ok('النصّ الفارغ يُرجع "" لا null (فرقٌ يعتمد عليه المستدعي)', r3 === '');
}

console.log('\n— الطابور: نافذتان في وقت واحد لا تُضيّع إحداهما الأخرى —');
{
  const h = makeHarness();
  const pA = h.confirmDialog({ message: 'الأولى' });
  const pB = h.promptDialog({ message: 'الثانية' });
  ok('الطلبان موجودان في الطابور', h.getQueue().length === 2);

  const [first, second] = h.getQueue();
  ok('لكل طلب معرّف مختلف', first.id !== second.id);

  // تُحسم الثانية أولاً (هي المعروضة فعلاً فوق الأولى)
  h.resolveDialog(second.id, 'نصّ الثانية');
  ok('حسم الثانية لا يُزيل الأولى من الطابور', h.getQueue().length === 1 && h.getQueue()[0].id === first.id);

  h.resolveDialog(first.id, true);
  const [rA, rB] = await Promise.all([pA, pB]);
  ok('كلا الوعدين حُسم بقيمته الصحيحة', rA === true && rB === 'نصّ الثانية');
  ok('الطابور فرغ بعد حسم الاثنين', h.getQueue().length === 0);
}

console.log('\n— لا وعد معلّق عند إزالة المزوّد (إغلاق التطبيق أو إعادة تحميل) —');
{
  const h = makeHarness();
  const pC = h.confirmDialog({ message: 'معلّقة' });
  const pP = h.promptDialog({ message: 'معلّقة' });
  h.unmountProvider();
  const [rC, rP] = await Promise.all([pC, pP]);
  ok('التأكيد المعلّق يُحسم false لا يبقى منتظراً', rC === false);
  ok('الإدخال المعلّق يُحسم null لا يبقى منتظراً', rP === null);
}

console.log('\n— حالات حافة —');
{
  const h = makeHarness();
  let threw = false;
  try { h.resolveDialog(9999, true); } catch (e) { threw = true; }
  ok('حسم معرّف غير موجود لا يرمي خطأ', threw === false);

  const p = h.confirmDialog({ message: 'مرة واحدة' });
  const id = h.getQueue()[0].id;
  h.resolveDialog(id, true);
  let threwTwice = false;
  try { h.resolveDialog(id, false); } catch (e) { threwTwice = true; }
  ok('الحسم مرتين لا يرمي ولا يغيّر النتيجة', threwTwice === false && (await p) === true);

  // النوع محفوظ: الكائن الممرَّر يصل للنافذة كما هو (العنوان والنبرة)
  const h2 = makeHarness();
  h2.confirmDialog({ message: 'م', title: 'حذف', tone: 'danger', confirmText: 'احذف' });
  const req = h2.getQueue()[0];
  ok('خصائص النافذة تمرّ كما هي (العنوان والنبرة ونصّ الزر)',
    req.title === 'حذف' && req.tone === 'danger' && req.confirmText === 'احذف');
  ok('نوع النافذة يُضاف تلقائياً', req.kind === 'confirm');
}

console.log(`\n${passed}/${passed + failed} اختباراً ناجحاً`);
if (failed > 0) process.exit(1);
