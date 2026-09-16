// =========================================================================
// محرك المزامنة السحابية — بيت الورد
// النسخة 2: مستند مستقل لكل سجل بدل مصفوفة كاملة في مستند واحد
//
// الواجهة الخارجية لم تتغير إطلاقاً، لذلك AppContext يعمل كما هو:
//   saveKey(key, data, immediate, customTs, isReset)
//   onRemoteChange(cb)  →  cb(key, data, payload)
//   onStatusChange(cb) / onActivity(cb) / broadcastActivity(a)
//   pushAllLocal(snapshot, isReset) / pullAllRemote()
//
// ما تغيّر بالداخل:
//   قبل:  pos_sync_v1/products = { data: [500 منتج] }   ← مستند واحد ضخم
//   بعد:  pos_products/<id>    = { ...المنتج }          ← مستند لكل منتج
//
// الفوائد: لا حد 1 ميجا، وكل بيعة تكتب المتغيّر فقط، ولا يكتب جهاز فوق آخر.
// =========================================================================

import { db, auth } from './firebase';
import { doc, collection, setDoc, getDoc, getDocs, onSnapshot, writeBatch, updateDoc, increment } from 'firebase/firestore';

// ملاحظة: البادئة pos_ تتجنّب الاصطدام بالمجموعات القديمة المهجورة
// (products / customers / sales ... ) الموجودة في نفس القاعدة.
const PREFIX = 'pos_';
const META_COLLECTION = 'pos_meta';
// مستند واحد مشترك يحمل تاريخ آخر تصفير لكل قسم — يراه كل الأجهزة
const RESET_MARKS_DOC = 'reset_marks';

// تاريخ السجل مهما اختلف اسم الحقل بين الأقسام
const recordTime = (item) => {
  if (!item || typeof item !== 'object') return 0;
  const raw = item.date || item.closedAt || item.openedAt || item.createdAt || item.timestamp || item.at || 0;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
};

// مستند واحد يحمل كائناً كاملاً
const SINGLETON_KEYS = ['store_info', 'active_shift'];
// كائن مفاتيحه معرّفات (مثل { userId: shift })
const MAP_KEYS = ['user_shifts'];

export const SYNC_KEYS = [
  'store_info',
  'categories',
  'products',
  'customers',
  'suppliers',
  'users',
  'user_shifts',
  'active_shift',      // كان يُكتب ولا يُقرأ — أُضيف
  'invoices',
  'purchases',
  'expenses',
  'drawer_tx',
  'receipts',
  'held_bills',
  'shifts_history',
  'treasury_ledger',   // كان يُكتب ولا يُقرأ — أُضيف
  'spoilage_logs'      // سجل تالف وهالك الورد الطبيعي
];

// login_logs سجل تدقيق: يقرأه المدير فقط حسب القواعد، فلا معنى
// لمزامنته في كل جهاز. يُكتب مباشرة ولا يُستمع إليه.
const AUDIT_ONLY_KEYS = ['login_logs', 'audit_logs'];

// حقول تُدار حصراً عبر increment (الكمية/الرصيد). عند تحديث مستند قائم لا
// تُكتب قيمتها المطلقة ضمن الكتابة الكاملة (تُجرَّد وتُكتب البقية بـ merge)،
// كي لا تدهس نسخةٌ قديمة خصمَ بيعٍ متزامن على جهاز آخر. تُكتب فقط عند إنشاء
// المستند أول مرة. مصدرها الوحيد بعد الإنشاء: adjustFields/adjustStock.
const INCREMENT_OWNED = { products: ['stock'], customers: ['balance'], suppliers: ['balance'] };

// تاريخ تصفير الفواتير (2026-09-04) — منقول كما هو من النسخة السابقة
const INVOICES_RESET_FLOOR = 1788480000000;

const MAX_BATCH = 450; // الحد الفعلي 500، نترك هامشاً

// مهلة اعتبار الكتابة المحلية "معلّقة": بعدها نثق باللقطة وحدها
const PENDING_TTL = 60000;

const collectionFor = (key) => PREFIX + key;

// تحويل أي معرّف إلى معرّف مستند صالح في Firestore
const toDocId = (raw, fallbackIndex) => {
  let id = raw === undefined || raw === null ? '' : String(raw);
  id = id.trim().replace(/[/\\.#$[\]]/g, '_');
  if (!id || id === '__proto__') id = 'item_' + fallbackIndex;
  if (id.length > 380) id = id.slice(0, 380);
  return id;
};

const idOf = (item, index) => {
  if (!item || typeof item !== 'object') return toDocId(null, index);
  return toDocId(item.id ?? item.invoiceNumber ?? item.key ?? index, index);
};

const isInvoiceKept = (i, floor) => {
  if (!i || String(i.id).startsWith('inv-rec-')) return false;
  const t = new Date(i.date || i.createdAt || 0).getTime();
  return t >= floor;
};

const invoiceFloor = () => {
  const local = Number(localStorage.getItem('naif_pos_v3_invoices_reset_at') || 0);
  return Math.max(local, INVOICES_RESET_FLOOR);
};

const stripMeta = (obj) => {
  if (!obj || typeof obj !== 'object') return obj;
  const { _src, _ts, _idx, ...rest } = obj;
  return rest;
};

class SyncEngine {
  constructor() {
    this.isListening = false;
    this.isApplyingRemote = false;
    this.subscribers = [];
    this.statusSubscribers = [];
    this.activitySubscribers = [];
    this.status = 'connected';
    this.lastSyncedAt = localStorage.getItem('naif_pos_last_sync_time') || null;
    this.clientId = this.getOrCreateClientId();
    this.pendingSaves = {};
    // مؤقّت تأجيل **لكل مفتاح** لا مؤقّت واحد مشترك — انظر التعليق عند saveKey
    this.saveDebounceTimers = {};
    this.unsubscribers = [];
    // آخر نسخة كُتبت لكل مفتاح: Map(docId → نص JSON) لحساب الفروق
    this.written = {};
    // المفاتيح التي وصلت لقطتها الأولى — لتمييز التحميل الأول عن التحديثات
    this.firstLoadDone = {};
    // الكتابات والحذوفات المحلية التي لم تُؤكَّد بعد في اللقطة القادمة.
    // تُستخدم لتغطية الفجوة القصيرة بين الحفظ محلياً ووصول اللقطة، حتى
    // تصبح اللقطة مرجعاً وحيداً بلا أن يختفي سجل للحظة من الشاشة.
    this.pendingLocal = {};    // key → Map(docId → { item, at })
    this.pendingDeletes = {};  // key → Map(docId → at)
    // علامات التصفير المشتركة: { key: timestamp } — أي سجل أقدم منها مُصفَّر
    this.resetMarks = {};
    try {
      const cached = localStorage.getItem('naif_pos_v3_reset_marks');
      if (cached) this.resetMarks = JSON.parse(cached) || {};
    } catch (e) { this.resetMarks = {}; }
  }

  getOrCreateClientId() {
    let id = localStorage.getItem('naif_pos_client_id');
    if (!id) {
      id = 'client_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
      localStorage.setItem('naif_pos_client_id', id);
    }
    return id;
  }

  setStatus(newStatus) {
    if (this.status === newStatus) return;
    this.status = newStatus;
    this.statusSubscribers.forEach(cb => {
      try { cb(this.status, this.lastSyncedAt); } catch (e) { console.error(e); }
    });
  }

  onStatusChange(callback) {
    this.statusSubscribers.push(callback);
    callback(this.status, this.lastSyncedAt);
    return () => {
      this.statusSubscribers = this.statusSubscribers.filter(s => s !== callback);
    };
  }

  onActivity(callback) {
    this.activitySubscribers.push(callback);
    return () => {
      this.activitySubscribers = this.activitySubscribers.filter(s => s !== callback);
    };
  }

  onRemoteChange(callback) {
    this.subscribers.push(callback);
    return () => {
      this.subscribers = this.subscribers.filter(s => s !== callback);
    };
  }

  async broadcastActivity(activity) {
    try {
      await setDoc(doc(db, META_COLLECTION, 'latest_activity'), {
        ...activity,
        _syncedAt: Date.now(),
        _sourceClientId: this.clientId
      });
    } catch (err) {
      console.warn('[SyncEngine] تعذر بث النشاط:', err?.message);
    }
  }

  markSynced() {
    this.lastSyncedAt = new Date().toISOString();
    localStorage.setItem('naif_pos_last_sync_time', this.lastSyncedAt);
    this.setStatus('connected');
  }

  notify(key, data, payload) {
    this.isApplyingRemote = true;
    try {
      this.subscribers.forEach(cb => {
        try { cb(key, data, payload || {}); } catch (e) { console.error(e); }
      });
    } finally {
      setTimeout(() => { this.isApplyingRemote = false; }, 200);
    }
  }

  // ---------------------------------------------------------------
  //  الاستماع اللحظي
  // ---------------------------------------------------------------
  startRealtimeSync() {
    if (!auth?.currentUser) return;
    if (this.isListening) return;
    this.isListening = true;
    this.setStatus('connected');

    // علامات التصفير أولاً حتى تُطبَّق على أول لقطة تصل
    try { this.listenResetMarks(); } catch (err) {
      console.warn('[SyncEngine] تعذّر ربط مستمع علامات التصفير:', err?.message);
    }

    SYNC_KEYS.forEach(key => {
      try {
        if (SINGLETON_KEYS.includes(key)) {
          this.listenSingleton(key);
        } else {
          this.listenCollection(key);
        }
      } catch (err) {
        console.warn('[SyncEngine] تعذر ربط المستمع لـ ' + key + ':', err?.message);
      }
    });
  }

  listenSingleton(key) {
    const ref = doc(db, META_COLLECTION, key);
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) return;
      const payload = snap.data();
      if (payload._src === this.clientId) return;
      this.markSynced();
      this.notify(key, stripMeta(payload), payload);
    }, (error) => {
      console.warn('[SyncEngine] تنبيه المستمع على ' + key + ':', error?.message);
      this.setStatus('error');
    });
    this.unsubscribers.push(unsub);
  }

  listenCollection(key) {
    const ref = collection(db, collectionFor(key));
    const unsub = onSnapshot(ref, (snap) => {
      // حماية حاسمة: مجموعة سحابية فارغة لا تعني "احذف كل شيء محلياً".
      // قد تكون ببساطة لم تُملأ بعد. بدون هذا الشرط تُمسح البيانات المحلية.
      if (snap.empty) {
        this.markSynced();
        return;
      }

      // اللقطة الأولى = تحميل أولي، تُسلَّم دائماً.
      // بدون هذا الاستثناء، البيانات التي كتبها هذا الجهاز نفسه تُعتبر
      // "صدى" فلا تصل للشاشة أبداً بعد إعادة التشغيل.
      const isFirst = !this.firstLoadDone[key];
      this.firstLoadDone[key] = true;

      // تجاهل الصدى: إن كانت كل التغييرات صادرة من هذا الجهاز
      const changes = snap.docChanges();
      if (!isFirst && changes.length > 0 && changes.every(c => c.doc.data()?._src === this.clientId)) {
        this.rememberFromSnapshot(key, snap);
        this.markSynced();
        return;
      }

      // أول لقطة: نصالح السجلات المحلية اليتيمة قبل اعتماد السحابة مرجعاً
      if (isFirst && !MAP_KEYS.includes(key)) {
        const plain = [];
        snap.forEach(d => plain.push(stripMeta(d.data())));
        this.reconcileOnce(key, plain);
      }

      const data = this.buildFromSnapshot(key, snap);
      this.rememberFromSnapshot(key, snap);
      this.markSynced();
      this.notify(key, data, {});
    }, (error) => {
      console.warn('[SyncEngine] تنبيه المستمع على ' + key + ':', error?.message);
      this.setStatus('error');
    });
    this.unsubscribers.push(unsub);
  }

  // =================================================================
  //  مصالحة انتقالية تُنفَّذ مرة واحدة فقط
  // =================================================================
  //  عند التحول إلى "السحابة هي المرجع"، أي سجل موجود في هذا الجهاز
  //  وغير موجود في السحابة كان سيختفي من الشاشة. وهذا وارد فعلاً بسبب
  //  الخلل القديم الذي كان يحذف سجلات الأجهزة الأخرى من السحابة.
  //  لذلك: في أول لقطة لكل قسم، نرفع السجلات المحلية اليتيمة للسحابة
  //  بدل إسقاطها — ثم نضع علامة دائمة فلا تتكرر العملية أبداً.
  //  التنفيذ مرة واحدة مقصود: لو تكرر، لأعاد كل جهاز إحياء سجلات
  //  حذفها جهاز آخر عمداً.
  // =================================================================
  reconcileOnce(key, remoteItems) {
    const FLAG = 'naif_pos_v3_reconciled_' + key;
    try {
      if (localStorage.getItem(FLAG) === 'done') return;
      localStorage.setItem(FLAG, 'done');

      const raw = localStorage.getItem('naif_pos_v3_' + key);
      if (!raw) return;
      const local = JSON.parse(raw);
      if (!Array.isArray(local) || local.length === 0) return;

      const remoteIds = new Set((remoteItems || []).map(r => toDocId(r?.id, 0)));
      const orphans = local.filter(i =>
        i && i.id && !remoteIds.has(toDocId(i.id, 0)) && !this.isPurged(key, i)
      );
      if (orphans.length === 0) return;

      console.warn('[SyncEngine] ⤴ مصالحة: رفع ' + orphans.length + ' سجل محلي مفقود من السحابة في "' + key + '"');
      const colName = collectionFor(key);
      orphans.forEach(item => {
        const id = toDocId(item.id, 0);
        this.markPendingWrite(key, id, item);
        setDoc(doc(db, colName, id), { ...item, _src: this.clientId, _ts: Date.now() })
          .then(() => this.clearPendingWrite(key, id))
          .catch(err => console.warn('[SyncEngine] تعذّر رفع سجل يتيم:', err?.message));
      });
    } catch (e) {
      console.warn('[SyncEngine] تعذّرت المصالحة على ' + key + ':', e?.message);
    }
  }

  // =================================================================
  //  علامات التصفير المشتركة (Reset Marks)
  // =================================================================
  //  المشكلة التي تحلّها: بعد منع الحذف الضمني، صار "التصفير" على جهاز
  //  يمحو السحابة، ثم يأتي جهاز آخر ما زالت نسخته القديمة في ذاكرته
  //  فيعيد رفع كل ما مُسح — فتعود الورديات المصفّرة من الموت.
  //  الحل: التصفير يُسجَّل كحقيقة مشتركة في السحابة (pos_meta/reset_marks)،
  //  وكل جهاز يحترمها: لا يعرض ولا يرفع أي سجل أقدم من تاريخ التصفير.
  // =================================================================
  isPurged(key, item) {
    const mark = Number(this.resetMarks?.[key]) || 0;
    if (!mark) return false;
    const t = recordTime(item);
    if (!t) return false;          // سجل بلا تاريخ: لا نحكم عليه
    return t < mark;
  }

  async setResetMark(key, ts) {
    const stamp = Number(ts) || Date.now();
    this.resetMarks = { ...(this.resetMarks || {}), [key]: stamp };
    try { localStorage.setItem('naif_pos_v3_reset_marks', JSON.stringify(this.resetMarks)); } catch (e) {}
    try {
      await setDoc(doc(db, META_COLLECTION, RESET_MARKS_DOC), { [key]: stamp, _src: this.clientId, _ts: Date.now() }, { merge: true });
      console.log('[SyncEngine] ✂ سُجّل تصفير "' + key + '" في السحابة — كل الأجهزة ستحترمه');
    } catch (err) {
      console.warn('[SyncEngine] تعذّر تسجيل علامة التصفير:', err?.message);
    }
  }

  listenResetMarks() {
    const ref = doc(db, META_COLLECTION, RESET_MARKS_DOC);
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) return;
      const { _src, _ts, ...marks } = snap.data() || {};
      const changedKeys = Object.keys(marks).filter(
        k => Number(marks[k]) !== Number(this.resetMarks?.[k] || 0)
      );
      this.resetMarks = { ...(this.resetMarks || {}), ...marks };
      try { localStorage.setItem('naif_pos_v3_reset_marks', JSON.stringify(this.resetMarks)); } catch (e) {}

      // تطبيق فوري: نُعيد بثّ القائمة المفلترة لكل قسم تغيّرت علامته
      changedKeys.forEach(k => {
        const map = this.written[k];
        if (!map) return;
        const rows = [];
        map.forEach(json => { try { rows.push(JSON.parse(json)); } catch (e) {} });
        const kept = rows.filter(r => !this.isPurged(k, r));
        if (this.pendingLocal[k]) this.pendingLocal[k].clear();
        console.log('[SyncEngine] ✂ طُبّق تصفير "' + k + '": بقي ' + kept.length + ' من ' + rows.length);
        this.notify(k, kept, {});
      });
    }, (error) => {
      console.warn('[SyncEngine] تنبيه مستمع علامات التصفير:', error?.message);
    });
    this.unsubscribers.push(unsub);
  }

  // --- تتبّع الكتابات المحلية غير المؤكَّدة ---
  markPendingWrite(key, id, item) {
    if (!this.pendingLocal[key]) this.pendingLocal[key] = new Map();
    this.pendingLocal[key].set(id, { item, at: Date.now() });
  }

  clearPendingWrite(key, id) {
    if (this.pendingLocal[key]) this.pendingLocal[key].delete(id);
  }

  markPendingDelete(key, id) {
    if (!this.pendingDeletes[key]) this.pendingDeletes[key] = new Map();
    this.pendingDeletes[key].set(id, Date.now());
    if (this.pendingLocal[key]) this.pendingLocal[key].delete(id);
  }

  clearPendingDelete(key, id) {
    if (this.pendingDeletes[key]) this.pendingDeletes[key].delete(id);
  }

  // تغطية اللقطة بالكتابات المحلية التي لم تصل بعد.
  // ملاحظة: هذه ليست "قاعدة دمج" — لا تُفضّل نسخة على أخرى ولا تحكم على
  // الأحدث. هي فقط تمنع اختفاء سجل كتبناه قبل ثوانٍ ولم يُؤكَّد بعد.
  overlayPending(key, rows) {
    const now = Date.now();
    const TTL = PENDING_TTL;
    let out = Array.isArray(rows) ? rows.slice() : [];

    const del = this.pendingDeletes[key];
    if (del && del.size > 0) {
      del.forEach((at, id) => { if (now - at > TTL) del.delete(id); });
      if (del.size > 0) out = out.filter(r => !del.has(toDocId(r?.id, 0)));
    }

    const pend = this.pendingLocal[key];
    if (pend && pend.size > 0) {
      // ثغرة كانت هنا: كنا نضيف السجل المعلّق فقط إن كان غائباً عن اللقطة.
      // أما لو كان موجوداً بنسخة أقدم — مثل فاتورة كتبنا عليها "مرتجعة"
      // ولم تصل بعد — فاللقطة القديمة تعيدها "مكتملة" أمام المستخدم،
      // فيضغط "استرجاع" مرة ثانية فتُرتجع مرتين وتعود الكمية للمخزون
      // مرتين. الآن: نسختنا المعلّقة تغلب حتى تُؤكَّد من السحابة.
      const byId = new Map(out.map(r => [toDocId(r?.id, 0), r]));
      pend.forEach((v, id) => {
        if (now - v.at > TTL) { pend.delete(id); return; }
        byId.set(id, v.item);
      });
      out = Array.from(byId.values());
    }
    return out;
  }

  buildFromSnapshot(key, snap) {
    if (MAP_KEYS.includes(key)) {
      const out = {};
      snap.forEach(d => { out[d.id] = stripMeta(d.data()); });
      return out;
    }

    const rows = [];
    snap.forEach(d => rows.push({ _idx: d.data()?._idx ?? 0, item: stripMeta(d.data()) }));

    if (key === 'invoices') {
      const floor = invoiceFloor();
      const list = this.overlayPending(key, rows.map(r => r.item));
      return list
        .filter(i => isInvoiceKept(i, floor) && !this.isPurged(key, i))
        .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    }

    return this.overlayPending(key, rows.sort((a, b) => a._idx - b._idx).map(r => r.item))
      .filter(item => !this.isPurged(key, item));
  }

  rememberFromSnapshot(key, snap) {
    const map = new Map();
    snap.forEach(d => map.set(d.id, JSON.stringify(stripMeta(d.data()))));
    this.written[key] = map;
  }

  // ---------------------------------------------------------------
  //  التعديل التراكمي (increment) — للكميات والأرصدة
  // ---------------------------------------------------------------
  // المشكلة التي يحلّها: عند البيع كان الجهاز يكتب قيمة المخزون النهائية من
  // ذاكرته (مثلاً "الرصيد صار ٤")، فلو باع جهازان نفس الصنف في نفس اللحظة
  // كتب كل واحد رقمه فيضيع خصم الآخر. الحل: نرسل "أنقص ٣" بدل "اجعله ٤"،
  // فيجمع Firestore الخصمين معاً مهما تزامنا.
  async adjustFields(key, docId, deltas = {}, sets = {}, keepWritten = false) {
    const id = toDocId(docId, 0);
    const colName = collectionFor(key);
    const payload = { _src: this.clientId, _ts: Date.now() };
    let hasDelta = false;
    Object.entries(deltas).forEach(([field, delta]) => {
      const n = Number(delta) || 0;
      if (n === 0) return;
      payload[field] = increment(n);
      hasDelta = true;
    });
    // قيم مطلقة تُكتب كما هي مع نفس العملية (مثل سعر التكلفة عند الشراء)
    Object.entries(sets || {}).forEach(([field, value]) => {
      if (value === undefined) return;
      payload[field] = value;
      hasDelta = true;
    });
    if (!hasDelta) return { success: true, skipped: true };

    try {
      await updateDoc(doc(db, colName, id), payload);
      // المستند تغيّر في السحابة بقيمة لا نعرفها يقيناً، فنُسقطه من ذاكرة
      // الفروق حتى لا يُعاد كتابته بقيمة قديمة في أول مزامنة كاملة قادمة.
      // استثناء: حين تكون الحقول محميّةً بالتجريد عند التحديث (INCREMENT_OWNED)
      // نُبقي المستند في الذاكرة كي يبقى تحديثه لاحقاً مُصنَّفاً "تحديثاً"
      // فتُجرَّد كميته ولا تُكتب مطلقةً بعد بيعٍ على نفس الجهاز.
      if (!keepWritten && this.written[key]) this.written[key].delete(id);
      this.markSynced();
      return { success: true };
    } catch (err) {
      console.error('[SyncEngine] ✖ فشل التعديل التراكمي على "' + key + '/' + id + '":', err?.code || '', err?.message || err);
      this.setStatus('error');
      return { success: false, error: err };
    }
  }

  // ---------------------------------------------------------------
  //  الحذف الصريح — الطريقة الوحيدة لحذف سجل من السحابة
  // ---------------------------------------------------------------
  //  تُستدعى من دوال الحذف الحقيقية في البرنامج فقط. لا يُستنتج الحذف
  //  أبداً من غياب السجل في مصفوفة جهاز ما.
  async deleteRecords(key, ids = []) {
    const list = (Array.isArray(ids) ? ids : [ids])
      .filter(x => x !== undefined && x !== null && x !== '')
      .map(x => toDocId(x, 0));
    if (list.length === 0) return { success: true, skipped: true };
    const colName = collectionFor(key);
    list.forEach(id => this.markPendingDelete(key, id));
    try {
      for (let i = 0; i < list.length; i += MAX_BATCH) {
        const batch = writeBatch(db);
        list.slice(i, i + MAX_BATCH).forEach(id => batch.delete(doc(db, colName, id)));
        await batch.commit();
      }
      if (this.written[key]) list.forEach(id => this.written[key].delete(id));
      list.forEach(id => this.clearPendingDelete(key, id));
      this.markSynced();
      return { success: true, count: list.length };
    } catch (err) {
      console.error('[SyncEngine] ✖ فشل الحذف الصريح من "' + key + '":', err?.code || '', err?.message || err);
      this.setStatus('error');
      return { success: false, error: err };
    }
  }

  async deleteRecord(key, id) {
    return this.deleteRecords(key, [id]);
  }

  // خصم/إضافة كميات عدة أصناف دفعة واحدة
  async adjustStock(items = []) {
    const results = await Promise.all(
      (items || [])
        .filter(it => it && it.id && Number(it.delta))
        .map(it => this.adjustFields('products', it.id, { stock: Number(it.delta) }, {}, true))
    );
    return { success: results.every(r => r.success !== false) };
  }

  // ---------------------------------------------------------------
  //  الحفظ
  // ---------------------------------------------------------------
  async saveKey(key, data, immediate = false, customTs = null, isReset = false) {
    if (!auth?.currentUser) return;
    // أثناء تطبيق تحديث قادم من جهاز آخر (نافذة ٢٠٠ مللي ثانية) كان أي تغيير محلي
    // يُلغى نهائياً فلا يصل للأجهزة الأخرى إلا مع التغيير التالي — وهذا سبب رئيسي
    // لتأخر المزامنة. الآن نؤجّله بدل أن نُسقطه.
    if (this.isApplyingRemote && !immediate && !isReset) {
      setTimeout(() => {
        this.saveKey(key, data, false, customTs, false)
          .catch(err => console.warn('[SyncEngine] تعذّر الحفظ المؤجل لـ ' + key + ':', err?.message));
      }, 250);
      return;
    }
    const ts = customTs || Date.now();

    if (key === 'invoices' && Array.isArray(data)) {
      const floor = invoiceFloor();
      data = data.filter(i => isInvoiceKept(i, floor));
      localStorage.setItem('naif_pos_v3_invoices_reset_at', String(floor));
    }

    if (immediate || isReset) {
      delete this.pendingSaves[key];
      // لا نرمي الخطأ للخارج: AppContext يستدعي saveKey في مواضع كثيرة
      // بلا try/catch، ورمي الخطأ يقطع سلاسل عمليات أخرى (مثل تحميل
      // المنتجات عند الدخول). نسجّله بوضوح ونكمل.
      try {
        await this.flushKey(key, data, ts, isReset);
      } catch (err) {
        // =================================================================
        //  التصفير وحده يُبلِّغ عن فشله
        // =================================================================
        //  ابتلاع الخطأ صحيح للحفظ العادي (يُعاد مع التغيير التالي)، لكنه
        //  كارثي مع التصفير: الشاشة كانت تقول «تم التصفير سحابياً ومحلياً
        //  بنجاح 🌸» بينما السحابة لم تُمسّ — والمحلي مُسح فعلاً. فيظن
        //  المالك أن البيانات ذهبت، وترجع كلها عند أول مزامنة من جهاز آخر.
        //  يحدث فعلاً عند التصفير من جهاز داخل ببريد غير بريد المدير،
        //  لأن قواعد الحذف `isAdmin()`.
        // =================================================================
        if (isReset) {
          this.setStatus('error');
          // دوال التصفير في AppContext لا تنتظر نتيجة saveKey (ولا تستطيع:
          // بعضها يُصفّر عدة مفاتيح تباعاً)، فنُبلّغ عبر مُعالِج مسجَّل.
          try { if (typeof this.resetErrorHandler === 'function') this.resetErrorHandler(key, err); } catch (e) {}
          return { success: false, error: err, code: err?.code || '' };
        }
        // سُجّل بالفعل داخل flushKey
      }
      return { success: true };
    }

    // =====================================================================
    //  تأجيل لكل مفتاح على حدة — لا مؤقّت واحد مشترك
    // =====================================================================
    //  كان هناك مؤقّت واحد لكل المفاتيح، وكل حفظ جديد يُلغيه ويبدأه من
    //  الصفر. فمتجر مزدحم (بيع ← فاتورة + منتجات + وردية + حركة درج
    //  متتابعة، ثم بيعة تالية قبل أن تمرّ ٤٠٠ مللي ثانية) **لا يُفرَّغ فيه
    //  شيء إطلاقاً** ما دامت الحركة مستمرة: المؤقّت يُعاد ضبطه قبل أن يعمل
    //  في كل مرة. أي أن أكثر اللحظات حاجةً للمزامنة هي أقلّها مزامنةً.
    //  الآن: لكل مفتاح مؤقّته، فتأجيل المنتجات لا يؤخّر الفواتير، وحدّ
    //  أقصى للتأجيل يضمن الإرسال ولو استمرّ الضغط.
    // =====================================================================
    this.pendingSaves[key] = { data, ts };

    const timers = this.saveDebounceTimers;
    const existing = timers[key];
    // سقف التأجيل: مهما تتابعت التعديلات لا يتأخّر الإرسال أكثر من ثانيتين
    const firstQueuedAt = existing?.firstQueuedAt || Date.now();
    if (existing?.id) clearTimeout(existing.id);
    if (Date.now() - firstQueuedAt >= 2000) {
      delete timers[key];
      const entry = this.pendingSaves[key];
      delete this.pendingSaves[key];
      this.flushKey(key, entry.data, entry.ts, false)
        .catch(err => console.warn('[SyncEngine] تنبيه حفظ خلفي على ' + key + ':', err?.message));
      return;
    }

    timers[key] = {
      firstQueuedAt,
      id: setTimeout(() => {
        delete timers[key];
        const entry = this.pendingSaves[key];
        if (!entry) return;
        delete this.pendingSaves[key];
        this.flushKey(key, entry.data, entry.ts, false)
          .catch(err => console.warn('[SyncEngine] تنبيه حفظ خلفي على ' + key + ':', err?.message));
      }, 400)
    };
  }

  async flushKey(key, data, ts, isReset) {
    if (!auth?.currentUser) return;
    try {
      if (SINGLETON_KEYS.includes(key) || (!Array.isArray(data) && !MAP_KEYS.includes(key))) {
        await setDoc(doc(db, META_COLLECTION, key), {
          ...(data && typeof data === 'object' ? data : { value: data }),
          _src: this.clientId,
          _ts: ts
        });
        this.markSynced();
        return;
      }

      const colName = collectionFor(key);

      // سجل تدقيق: نضيف الجديد فقط، بلا قراءة ولا حذف
      if (AUDIT_ONLY_KEYS.includes(key)) {
        const seen = this.written[key] || new Map();
        const fresh = (Array.isArray(data) ? data : [])
          .map((item, i) => ({ id: idOf(item, i), item }))
          .filter(r => !seen.has(r.id));
        if (fresh.length === 0) return;
        for (let i = 0; i < fresh.length; i += MAX_BATCH) {
          const batch = writeBatch(db);
          fresh.slice(i, i + MAX_BATCH).forEach(r => {
            batch.set(doc(db, colName, r.id), { ...r.item, _src: this.clientId, _ts: ts });
          });
          await batch.commit();
        }
        fresh.forEach(r => seen.set(r.id, '1'));
        this.written[key] = seen;
        return;
      }

      const prev = isReset ? new Map() : (this.written[key] || new Map());
      const next = new Map();

      if (MAP_KEYS.includes(key)) {
        Object.entries(data || {}).forEach(([k, v]) => {
          if (this.isPurged(key, v)) return;   // وردية مُصفَّرة لا تُرفع ثانية
          next.set(toDocId(k, 0), { ...v });
        });
      } else {
        (Array.isArray(data) ? data : []).forEach((item, i) => {
          if (!item || typeof item !== 'object') return;
          // سجل أقدم من تاريخ التصفير المشترك لا يُرفع أبداً — وإلا أعاد
          // جهازٌ متأخّر إحياء كل ما مسحه التصفير على جهاز آخر.
          if (this.isPurged(key, item)) return;
          next.set(idOf(item, i), { ...item, _idx: i });
        });
      }

      const ops = [];

      // إضافة أو تعديل — فقط ما تغيّر فعلاً
      // ===================================================================
      //  قاعدة حاسمة: لا نكتب نسخة أقدم فوق نسخة أحدث
      // ===================================================================
      //  السيناريو الذي كان يكسر الاسترجاع: المدير يسترجع فاتورة على
      //  جهازه فتصبح "مرتجعة" في السحابة. الجهاز الآخر ما زالت في ذاكرته
      //  نسخة "مكتملة" من نفس الفاتورة، فعند أول حفظ عنده لأي سبب يرى أن
      //  نسخته "مختلفة" عن السحابة فيكتبها فوقها — فترتدّ الفاتورة إلى
      //  "مكتملة" أمام المدير، فيضغط استرجاع مرة ثانية وتُرتجع مرتين.
      //  الحل: نقارن ختم الوقت (updatedAt). النسخة الأقدم لا تُكتب أبداً
      //  فوق الأحدث، والنسخة بلا ختم لا تُكتب فوق نسخة مختومة.
      const stamp = (o) => {
        const t = new Date(o?.updatedAt || 0).getTime();
        return Number.isFinite(t) ? t : 0;
      };
      const owned = INCREMENT_OWNED[key] || null;
      next.forEach((value, id) => {
        const serialized = JSON.stringify(stripMeta(value));
        const remoteRaw = prev.get(id);
        if (remoteRaw === serialized) return;   // لا تغيير

        const isUpdate = Boolean(remoteRaw);
        if (isUpdate) {
          try {
            const remoteObj = JSON.parse(remoteRaw);
            const rT = stamp(remoteObj);
            const lT = stamp(value);
            if (rT > 0 && (lT === 0 || rT > lT)) {
              // السحابة أحدث — نتجاهل نسختنا القديمة ولا نرفعها
              return;
            }
          } catch (e) { /* نص غير صالح: نكمل بالسلوك المعتاد */ }
        }
        // عند تحديث مستند قائم: نُجرِّد الحقول التراكمية (مثل stock) ونكتب
        // البقية بـ merge، فلا تُمحى قيمتها السحابية ولا تُدهس بنسخة أقدم.
        // عند الإنشاء أول مرة نكتبها كاملةً (استبدال) لتأسيس القيمة الابتدائية.
        if (owned && isUpdate) {
          const writeVal = { ...value };
          owned.forEach(f => { delete writeVal[f]; });
          // pendingValue يحمل القيمة الكاملة (بالمخزون) لتغطية الشاشة محلياً،
          // بينما value المُرسَل للسحابة مجرَّد ويُكتب بـ merge.
          ops.push({ type: 'set', id, value: writeVal, merge: true, pendingValue: value });
        } else {
          ops.push({ type: 'set', id, value });
        }
      });

      // ===================================================================
      //  لا حذف ضمني — إطلاقاً
      // ===================================================================
      //  الخلل القاتل الذي كان هنا: الحذف كان يُستنتج من "السجل غير موجود
      //  في مصفوفتي المحلية". وهذا خطأ جذري في نظام متعدد الأجهزة، لأن
      //  غياب السجل عندي له أسباب كثيرة بريئة:
      //    • جهازي لم يستقبل السجل بعد (فتحته قبل قليل / كان مغلقاً)
      //    • سباق زمني: حفظتُ نسختي قبل أن تصل لقطة الجهاز الآخر للحالة
      //    • تصفير سابق على جهازي خزّن "تاريخ تصفير" في متصفحي وحده،
      //      فصار يُخفي سجلات الأجهزة الأخرى ثم يحذفها من السحابة
      //  النتيجة كانت: جهاز متأخّر يمسح عمل جهاز آخر، فتختلف الأرقام
      //  بين متصفحين في نفس اللحظة.
      //
      //  القاعدة الجديدة: الحذف لا يحدث إلا بأمر صريح من دالة حذف فعلية
      //  (deleteRecord/deleteRecords) أو من عملية تصفير مقصودة (isReset).
      //  الحفظ العادي = إضافة وتحديث فقط، ولا يحذف شيئاً أبداً.
      // ===================================================================
      const isMergeOnly = !isReset;

      if (isReset) {
        // نسجّل التصفير كحقيقة مشتركة قبل الحذف، فتحترمها كل الأجهزة فوراً
        this.setResetMark(key, ts);
        const existing = await getDocs(collection(db, colName));
        existing.forEach(d => {
          if (!next.has(d.id)) ops.push({ type: 'delete', id: d.id });
        });
        localStorage.setItem('naif_pos_v3_' + key + '_reset_at', String(ts));
      }

      if (ops.length === 0) {
        this.markSynced();
        return;
      }

      // نعلّم السجلات كـ"كتابة محلية غير مؤكَّدة" قبل الإرسال، فإن وصلت
      // لقطة من جهاز آخر في هذه اللحظة لا يختفي ما كتبناه من الشاشة.
      ops.forEach(op => {
        if (op.type === 'set') this.markPendingWrite(key, op.id, stripMeta(op.pendingValue || op.value));
      });

      for (let i = 0; i < ops.length; i += MAX_BATCH) {
        const batch = writeBatch(db);
        ops.slice(i, i + MAX_BATCH).forEach(op => {
          const ref = doc(db, colName, op.id);
          if (op.type === 'delete') batch.delete(ref);
          else if (op.merge) batch.set(ref, { ...op.value, _src: this.clientId, _ts: ts }, { merge: true });
          else batch.set(ref, { ...op.value, _src: this.clientId, _ts: ts });
        });
        await batch.commit();
      }

      // وصلت للسحابة: لم تعد معلّقة، اللقطة وحدها هي المرجع من الآن
      ops.forEach(op => { if (op.type === 'set') this.clearPendingWrite(key, op.id); });

      // تحديث الذاكرة المرجعية بعد نجاح الكتابة
      const remembered = new Map(isMergeOnly ? prev : []);
      next.forEach((value, id) => remembered.set(id, JSON.stringify(stripMeta(value))));
      if (!isMergeOnly) {
        prev.forEach((_v, id) => { if (!next.has(id)) remembered.delete(id); });
      }
      this.written[key] = remembered;

      this.markSynced();
    } catch (err) {
      // لم نعد نبتلع الأخطاء بصمت — تظهر بوضوح في الكونسول
      console.error('[SyncEngine] ✖ فشل حفظ "' + key + '":', err?.code || '', err?.message || err);
      this.setStatus('error');
      throw err;
    }
  }

  // ---------------------------------------------------------------
  //  جلب سجل التدقيق من السحابة (للمدير)
  // ---------------------------------------------------------------
  //  سجل التدقيق يُكتب في السحابة من كل جهاز، لكنه لم يكن يُقرأ منها
  //  إطلاقاً — فكان المدير يرى عمليات جهازه هو فقط، بينما الغرض كله
  //  أن يرى ما فعله الكاشيرون على أجهزتهم.
  //  لا نضعه في المزامنة اللحظية عمداً: سجل قد يبلغ آلاف القيود ولا
  //  داعي لبثّه لكل جهاز باستمرار. يُجلب عند فتح شاشة السجل فقط.
  async fetchAuditLogs(limitCount = 1000) {
    try {
      const snap = await getDocs(collection(db, 'pos_audit_logs'));
      const rows = [];
      snap.forEach(d => rows.push(stripMeta(d.data())));
      rows.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
      return { success: true, rows: rows.slice(0, limitCount) };
    } catch (err) {
      // القواعد تسمح بالقراءة للمدير وحده — الرفض هنا سلوك صحيح
      console.warn('[SyncEngine] تعذّر جلب سجل التدقيق:', err?.message);
      return { success: false, rows: [] };
    }
  }

  // ---------------------------------------------------------------
  //  النسخ الاحتياطية السحابية (pos_backups)
  // ---------------------------------------------------------------
  //  كانت اللقطات تُحفظ في localStorage فقط: أي في متصفح واحد. فكل
  //  متصفح يرى قائمة مختلفة، والأسوأ أن "نسخة احتياطية" تعيش داخل نفس
  //  المتصفح الذي تحميها ليست نسخة احتياطية أصلاً — تُمسح معه.
  //  الآن تُحفظ في السحابة: يراها كل الأجهزة وتنجو من مسح المتصفح.
  //
  //  ═══════════════════════════════════════════════════════════════
  //  التجزئة: لماذا لا يُكتب كل شيء في مستند واحد
  //  ═══════════════════════════════════════════════════════════════
  //  حدّ مستند Firestore **١ ميجابايت صلب**. وكانت النسخة كلها تُكتب في
  //  مستند واحد، فوُضع حارس يرفض الرفع فوق ٨٠٠ ك.ب. الحارس يمنع الانهيار
  //  لكنه يحوّل المشكلة إلى أسوأ منها: متجر يكبر ← النسخة تتجاوز الحدّ ←
  //  **تتوقّف النسخ نهائياً وصامتةً** والمالك يظنّ نفسه محمياً.
  //
  //  الآن: مستند صغير للبيانات الوصفية، و`data` مقسّمة على **مجموعة
  //  فرعية** `chunks`. والمجموعة الفرعية اختيار مقصود لا تفصيل: قراءة
  //  `pos_backups` لا تجلب المجموعات الفرعية، فقائمة النسخ صارت خفيفة
  //  فعلاً بدل أن تُنزّل كل نسخة بكامل بياناتها لعرض أسمائها.
  // ---------------------------------------------------------------
  static BACKUP_CHUNK_BYTES = 700 * 1024;   // دون المليون بهامش أمان
  static BACKUP_KEEP = 30;                  // كم نسخة تبقى قبل تنظيف الأقدم

  async saveBackup(record) {
    const id = toDocId(record?.id || ('bkp-' + Date.now()), 0);
    try {
      const { data, ...meta } = record || {};
      const str = typeof data === 'string' ? data : JSON.stringify(data ?? null);
      const size = SyncEngine.BACKUP_CHUNK_BYTES;
      const parts = [];
      for (let i = 0; i < str.length; i += size) parts.push(str.slice(i, i + size));
      if (parts.length === 0) parts.push('');

      // القطع أولاً ثم المستند الوصفي: فلو انقطع الاتصال في المنتصف لا
      // تظهر في القائمة نسخةٌ بيانُها ناقص ويُظنّ أنها صالحة للاسترجاع.
      for (let i = 0; i < parts.length; i++) {
        await setDoc(doc(db, 'pos_backups', id, 'chunks', String(i)), {
          i, data: parts[i], _src: this.clientId, _ts: Date.now()
        });
      }
      await setDoc(doc(db, 'pos_backups', id), {
        ...meta, id,
        chunkCount: parts.length,
        bytes: str.length,
        _src: this.clientId,
        _ts: Date.now()
      });

      this.markSynced();
      this.pruneBackups().catch(() => {});   // التنظيف لا يُفشل الرفع
      return { success: true, id, chunks: parts.length };
    } catch (err) {
      console.error('[SyncEngine] ✖ فشل رفع النسخة الاحتياطية:', err?.code || '', err?.message || err);
      return { success: false, error: err, code: err?.code || '' };
    }
  }

  // قائمة اللقطات بدون بيانات — خفيفة فعلاً لأن `data` في مجموعة فرعية
  async listBackups() {
    try {
      const snap = await getDocs(collection(db, 'pos_backups'));
      const rows = [];
      snap.forEach(d => {
        const { data, _src, _ts, ...meta } = d.data() || {};
        rows.push({ ...meta, id: d.id, hasData: Boolean(data) || Number(meta.chunkCount) > 0 });
      });
      rows.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
      return { success: true, rows };
    } catch (err) {
      console.warn('[SyncEngine] تعذّر جلب قائمة النسخ:', err?.message);
      return { success: false, rows: [], error: err };
    }
  }

  // جلب بيانات لقطة محددة (النص الكامل مُجمَّعاً من قطعه)
  async getBackup(id) {
    try {
      const docId = toDocId(id, 0);
      const snap = await getDoc(doc(db, 'pos_backups', docId));
      if (!snap.exists()) return { success: false, data: null };
      const meta = snap.data() || {};

      // النسخ القديمة (قبل التجزئة) تحمل البيانات في المستند نفسه
      if (typeof meta.data === 'string' && meta.data.length > 0) {
        return { success: true, data: meta.data };
      }

      const chunksSnap = await getDocs(collection(db, 'pos_backups', docId, 'chunks'));
      const parts = [];
      chunksSnap.forEach(c => { const v = c.data() || {}; parts[Number(v.i) || 0] = v.data || ''; });
      const expected = Number(meta.chunkCount) || parts.length;
      if (parts.filter(x => typeof x === 'string').length < expected) {
        // نسخة ناقصة أخطر من نسخة غائبة: استرجاعها يكتب بيانات مبتورة
        return { success: false, data: null, incomplete: true, error: new Error('النسخة ناقصة القطع') };
      }
      return { success: true, data: parts.join('') };
    } catch (err) {
      console.warn('[SyncEngine] تعذّر جلب النسخة:', err?.message);
      return { success: false, data: null, error: err };
    }
  }

  async deleteBackup(id) {
    try {
      const docId = toDocId(id, 0);
      const chunksSnap = await getDocs(collection(db, 'pos_backups', docId, 'chunks'));
      const batch = writeBatch(db);
      chunksSnap.forEach(c => batch.delete(c.ref));
      batch.delete(doc(db, 'pos_backups', docId));
      await batch.commit();
      return { success: true };
    } catch (err) {
      console.warn('[SyncEngine] تعذّر حذف النسخة:', err?.message);
      return { success: false, error: err };
    }
  }

  // ---------------------------------------------------------------
  //  تنظيف النسخ الأقدم — سياسة استبقاء
  // ---------------------------------------------------------------
  //  بلا سياسة، نسخة يومية تعني آلاف المستندات خلال سنوات، وتكلفة قراءة
  //  تتضخّم مع كل فتح لشاشة النسخ. نُبقي الأحدث ونحذف ما بعدها.
  // ---------------------------------------------------------------
  async pruneBackups(keep = SyncEngine.BACKUP_KEEP) {
    const { success, rows } = await this.listBackups();
    if (!success || rows.length <= keep) return { success: true, deleted: 0 };
    const old = rows.slice(keep);
    for (const r of old) await this.deleteBackup(r.id);
    return { success: true, deleted: old.length };
  }

  // ---------------------------------------------------------------
  //  الرفع والسحب الكاملان
  // ---------------------------------------------------------------
  async pushAllLocal(stateSnapshot, isReset = false) {
    if (!auth?.currentUser) {
      return { success: false, message: 'يرجى تسجيل الدخول أولاً بالبريد وكلمة المرور لتفعيل المزامنة السحابية 🔒' };
    }
    this.setStatus('syncing');
    const failed = [];

    for (const key of SYNC_KEYS) {
      if (stateSnapshot[key] === undefined) continue;
      try {
        await this.flushKey(key, stateSnapshot[key], Date.now(), isReset);
      } catch (err) {
        failed.push(key);
      }
    }

    this.markSynced();
    if (failed.length > 0) {
      return {
        success: false,
        message: 'تعذر رفع بعض الأقسام: ' + failed.join('، ') + ' — راجع الكونسول للتفاصيل'
      };
    }
    return { success: true, message: 'تمت المزامنة وحفظ البيانات سحابياً بنجاح 🌸' };
  }

  async pullAllRemote() {
    if (!auth?.currentUser) {
      return { success: false, data: null, message: 'يرجى تسجيل الدخول أولاً بالبريد وكلمة المرور لسحب البيانات من السحابة 🔒' };
    }
    this.setStatus('syncing');
    const results = {};
    let found = 0;
    const failed = [];

    for (const key of SYNC_KEYS) {
      try {
        if (SINGLETON_KEYS.includes(key)) {
          const snap = await getDoc(doc(db, META_COLLECTION, key));
          if (snap.exists()) {
            results[key] = stripMeta(snap.data());
            found++;
          }
          continue;
        }

        const snap = await getDocs(collection(db, collectionFor(key)));
        if (snap.empty) continue;

        results[key] = this.buildFromSnapshot(key, snap);
        this.rememberFromSnapshot(key, snap);
        localStorage.setItem('naif_pos_v3_' + key, JSON.stringify(results[key]));
        found++;
      } catch (err) {
        console.error('[SyncEngine] ✖ فشل سحب "' + key + '":', err?.code || '', err?.message || err);
        failed.push(key);
      }
    }

    this.markSynced();

    if (failed.length > 0 && found === 0) {
      return { success: false, data: null, message: 'فشل سحب البيانات — راجع الكونسول' };
    }
    if (found === 0) {
      return { success: false, data: null, message: 'لا توجد بيانات سحابية محفوظة بعد. يمكنك رفع بياناتك أولاً.' };
    }
    return { success: true, data: results, message: 'تم سحب ' + found + ' قسم بنجاح وتحديث الشاشة 🌸' };
  }

  stopRealtimeSync() {
    this.unsubscribers.forEach(u => { try { u(); } catch (e) {} });
    this.unsubscribers = [];
    this.isListening = false;
  }
}

export const syncEngine = new SyncEngine();
