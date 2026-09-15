// =========================================================
// ربط حسابات Firebase بأدوار النظام
// لإضافة موظف جديد: أنشئ حسابه في Firebase ثم أضف سطراً هنا
// =========================================================

export const AUTH_ROLE_MAP = {
  'fl.ho2018@gmail.com': { role: 'admin',      label: 'المدير العام' },
  'f1@flower-house.com': { role: 'supervisor', label: 'مشرف الفرع' },
  'f2@flower-house.com': { role: 'accountant', label: 'المشرف المالي' },
  'f3@flower-house.com': { role: 'cashier',    label: 'كاشير 1' },
  'f4@flower-house.com': { role: 'cashier',    label: 'كاشير 2' }
};

// إرجاع بيانات الدور من الإيميل
export const getRoleByEmail = (email) => {
  if (!email) return null;
  return AUTH_ROLE_MAP[String(email).trim().toLowerCase()] || null;
};