import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.error('⛔ إعدادات Firebase غير موجودة — تأكد من وجود ملف .env');
}

export const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// =========================================================================
//  الذاكرة المحلية الرسمية لـ Firestore (Persistent Local Cache)
// =========================================================================
//  هذا هو حجر الأساس في الحل النهائي لمشكلة اختلاف الأرقام بين الأجهزة.
//
//  ما كان يحدث: البرنامج يحتفظ بنسخته الخاصة في localStorage ويحاول دمجها
//  مع السحابة بقواعد مكتوبة يدوياً. أي خطأ في قاعدة دمج = رقمان مختلفان
//  على جهازين، أو سجل يُمحى.
//
//  ما يحدث الآن: Firestore نفسها تتكفّل بالذاكرة المحلية:
//   • القراءة تعمل بلا إنترنت من ذاكرة Firestore، لا من نسختنا اليدوية.
//   • الكتابة بلا إنترنت تُصفّ وتُرسَل تلقائياً عند عودة الاتصال.
//   • الكتابة المحلية تظهر فوراً في اللقطة (تعويض زمن الشبكة) فلا يحتاج
//     البرنامج لأي دمج يدوي.
//   • persistentMultipleTabManager ينسّق بين تبويبات المتصفح نفسه.
//
//  النتيجة: لقطة Firestore تصبح المرجع الوحيد للحقيقة، وتختفي قواعد
//  الدمج اليدوية التي كانت مصدر كل اختلاف.
//
//  إن رفض المتصفح التخزين الدائم (تصفح خفي، أو متصفح قديم) نرجع تلقائياً
//  للوضع العادي بدل أن يتعطّل البرنامج.
// =========================================================================
let _db;
try {
  _db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
  });
  console.log('[Firebase] الذاكرة المحلية الدائمة مفعّلة ✅');
} catch (err) {
  console.warn('[Firebase] تعذّر تفعيل الذاكرة المحلية الدائمة، سيعمل البرنامج بالوضع العادي:', err?.message);
  try {
    _db = getFirestore(app);
  } catch (e) {
    _db = getFirestore(app);
  }
}

export const db = _db;
export const auth = getAuth(app);
