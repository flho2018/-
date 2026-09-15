// =========================================================================
//  audit.js — سجل التدقيق
// =========================================================================
//  المبدأ: كل عملية تُخرج نقداً أو تغيّر رقماً مالياً تترك أثراً لا يُمحى.
//  قاعدة firestore تمنع update و delete على pos_audit_logs — حتى على
//  المدير. هذا ما يحوّل السجل من قائمة قابلة للتنظيف إلى دليل يُعتد به.
//
//  لماذا هويّتان في كل قيد:
//
//    userEmail  ← من حساب Firebase. يفرضه الخادم ولا يمكن تزويره،
//                 لكنه اليوم مشترك بين الأجهزة فلا يميّز الأشخاص.
//    userId     ← سجل الموظف الداخلي (currentUser). يميّز الكاشير
//                 فعلياً، لكنه يأتي من المتصفح فيمكن العبث به.
//
//  الأول يثبت أن القيد من جهاز معتمد. الثاني يقول من كان يعمل.
//  حين تنشئ حساباً مستقلاً لكل موظف يصبح الأول كافياً وحده.
//
//  ⚠️ الحقلان userEmail و at إلزاميان — الخادم يرفض القيد بدونهما.
// =========================================================================

import { db, auth } from './firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

const COLLECTION = 'pos_audit_logs';

/** أنواع العمليات. أضف هنا ولا تكتب نصاً حرفياً في الشاشات. */
export const AUDIT = {
  INVOICE_REFUND:    'invoice_refund',
  INVOICE_DELETE:    'invoice_delete',
  CREDIT_SETTLE:     'credit_settle',
  PRODUCT_PRICE:     'product_price_change',
  PRODUCT_COST:      'product_cost_change',
  PRODUCT_DELETE:    'product_delete',
  STOCK_ADJUST:      'stock_adjust',
  SHIFT_CLOSE:       'shift_close',
  SHIFT_EDIT:        'shift_edit',
  SHIFT_DELETE:      'shift_delete',
  DRAWER_MOVEMENT:   'drawer_cash_movement',
  TREASURY_MOVEMENT: 'treasury_movement',
  EXPENSE_DELETE:    'expense_delete',
  SUPPLIER_PAYMENT:  'supplier_payment',
  USER_PERMISSIONS:  'user_permissions_change',
  SETTINGS_CHANGE:   'settings_change',
  ACCOUNTS_RESET:    'accounts_reset',
  BACKUP_RESTORE:    'backup_restore',
  FLOWER_SPOILAGE:   'flower_spoilage',
};

export const AUDIT_LABELS = {
  [AUDIT.FLOWER_SPOILAGE]:   'تسجيل تالف وهالك ورد',
  [AUDIT.INVOICE_REFUND]:    'إصدار مرتجع',
  [AUDIT.INVOICE_DELETE]:    'حذف فاتورة',
  [AUDIT.CREDIT_SETTLE]:     'سداد فاتورة آجلة',
  [AUDIT.PRODUCT_PRICE]:     'تعديل سعر بيع',
  [AUDIT.PRODUCT_COST]:      'تعديل سعر تكلفة',
  [AUDIT.PRODUCT_DELETE]:    'حذف منتج',
  [AUDIT.STOCK_ADJUST]:      'تسوية مخزون',
  [AUDIT.SHIFT_CLOSE]:       'إغلاق وردية',
  [AUDIT.SHIFT_EDIT]:        'تعديل وردية',
  [AUDIT.SHIFT_DELETE]:      'حذف وردية',
  [AUDIT.DRAWER_MOVEMENT]:   'حركة نقدية في الدرج',
  [AUDIT.TREASURY_MOVEMENT]: 'حركة في خزينة المدير',
  [AUDIT.EXPENSE_DELETE]:    'حذف مصروف',
  [AUDIT.SUPPLIER_PAYMENT]:  'سند صرف لمورد',
  [AUDIT.USER_PERMISSIONS]:  'تغيير صلاحيات مستخدم',
  [AUDIT.SETTINGS_CHANGE]:   'تعديل الإعدادات',
  [AUDIT.ACCOUNTS_RESET]:    'تصفير محاسبي',
  [AUDIT.BACKUP_RESTORE]:    'استعادة نسخة احتياطية',
};

const DEVICE_KEY = 'bw_device_id';

function getDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = 'dev_' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch (e) {
    return 'unknown';
  }
}

/** يختصر الكائن: القيود تُقرأ بالمئات، والمستند الضخم يُبطئ الشاشة */
function sanitize(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const out = {};
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v === undefined || typeof v === 'function') continue;
    if (Array.isArray(v)) { out[k] = '[' + v.length + ' عنصر]'; continue; }
    if (v && typeof v === 'object') { out[k] = '[كائن]'; continue; }
    out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * يقيّد عملية في السجل.
 *
 * لا يرمي استثناءً أبداً: فشل التقييد يجب ألّا يمنع بيعاً أو مرتجعاً.
 * لكنه يسجّل الفشل في الكونسول — تكراره يعني خللاً يستحق الفحص.
 *
 * @param {object} entry
 * @param {string} entry.action        من AUDIT
 * @param {string} [entry.targetId]    معرّف السجل المتأثر
 * @param {string} [entry.targetName]  وصف بشري (رقم الفاتورة، اسم الصنف)
 * @param {number} [entry.amount]      المبلغ المتأثر
 * @param {string} [entry.reason]      السبب المُدخَل من المستخدم
 * @param {object} [entry.before]      القيم قبل التغيير
 * @param {object} [entry.after]       القيم بعد التغيير
 * @param {object} [posUser]           currentUser — سجل الموظف الداخلي
 * @returns {Promise<string|null>} معرّف القيد أو null
 */
export async function logAudit(entry, posUser) {
  const email = auth?.currentUser?.email;

  if (!email) {
    console.warn('[audit] لا توجد جلسة Firebase — لم يُكتب القيد');
    return null;
  }
  if (!entry || !entry.action) {
    console.warn('[audit] قيد بلا action — أُهمل');
    return null;
  }

  try {
    const ref = await addDoc(collection(db, COLLECTION), {
      // يفرضهما الخادم
      userEmail: email,
      at: serverTimestamp(),

      // من كان يعمل فعلاً
      userId:   posUser?.id   || null,
      userName: posUser?.name || '',
      userRole: posUser?.role || '',
      deviceId: getDeviceId(),

      // ماذا فعل
      action:     entry.action,
      actionLabel: AUDIT_LABELS[entry.action] || entry.action,
      targetId:   entry.targetId   || null,
      targetName: entry.targetName || null,
      amount:     Number.isFinite(entry.amount) ? entry.amount : null,
      reason:     entry.reason || null,
      before:     sanitize(entry.before),
      after:      sanitize(entry.after),
      result:     entry.result || 'success',

      // وقت الجهاز للمقارنة: اختلافه الكبير عن at يعني ساعة مغلوطة
      clientAt: new Date().toISOString(),
    });
    return ref.id;
  } catch (err) {
    console.error('[audit] فشل تقييد العملية:', err?.code || err?.message || err);
    return null;
  }
}
