// =========================================================================
//  usePermission.js — الصلاحيات في الواجهة
// =========================================================================
//  ثلاث أدوات لثلاث حالات، لا تخلط بينها:
//
//   can(P.X)          ← إظهار/إخفاء زر
//   <Can perm={P.X}>  ← إخفاء قسم كامل من الشاشة
//   guard(P.X, fn)    ← منع الإجراء نفسه عند النقر
//
//  الثالثة هي الحماية الفعلية. الأولى والثانية تحسينان لتجربة
//  المستخدم — إخفاء زر ليس منعاً، فمن يعرف أدوات المطور يستدعي
//  الدالة مباشرة. لذلك: **كل إجراء حسّاس يمر عبر guard، دائماً**،
//  حتى لو كان زره مخفياً أصلاً.
// =========================================================================

import { useCallback, useMemo } from 'react';
import {
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  checkUserPermission,
  resolvePermissions,
  PERMISSION_LABELS,
} from '../utils/permissions.js';

/**
 * @param {object|null} currentUser  من buildSessionUser
 * @param {(msg: string, type?: string) => void} [notify]  دالة التنبيه عندك
 */
export function usePermission(currentUser, notify) {
  const can = useCallback(
    (perm) => hasPermission(currentUser, perm),
    [currentUser]
  );

  const canAny = useCallback(
    (perms) => hasAnyPermission(currentUser, perms),
    [currentUser]
  );

  const canAll = useCallback(
    (perms) => hasAllPermissions(currentUser, perms),
    [currentUser]
  );

  /**
   * يغلّف دالة إجراء بفحص الصلاحية.
   * إن لم يملكها المستخدم، لا تُنفَّذ الدالة ويظهر سبب واضح.
   *
   *   const onRefund = guard(P.INVOICES_REFUND, async (inv) => { ... });
   *   <button onClick={() => onRefund(invoice)}>مرتجع</button>
   */
  const guard = useCallback(
    (perm, fn) => (...args) => {
      if (!checkUserPermission(currentUser, perm, { notify })) return undefined;
      return fn(...args);
    },
    [currentUser, notify]
  );

  /**
   * للإجراءات التي تحتاج فحصاً وسط دالة أطول.
   *   if (!require(P.POS_DISCOUNT)) return;
   */
  const requirePerm = useCallback(
    (perm) => checkUserPermission(currentUser, perm, { notify }),
    [currentUser, notify]
  );

  const isAdmin = currentUser?.role === 'admin';

  const permissions = useMemo(
    () => resolvePermissions(currentUser),
    [currentUser]
  );

  return { can, canAny, canAll, guard, requirePerm, isAdmin, permissions };
}

/**
 * مكوّن إخفاء. لا يعرض أطفاله إلا لمن يملك الصلاحية.
 *
 *   <Can user={currentUser} perm={P.PRODUCTS_VIEW_COST}>
 *     <span>التكلفة: {product.cost}</span>
 *   </Can>
 *
 *   <Can user={currentUser} perm={P.REPORTS_VIEW_PROFITS} fallback={<Locked />}>
 *     <ProfitsPanel />
 *   </Can>
 *
 * ⚠️ هذا إخفاء بصري فقط. البيانات ما زالت في الذاكرة ويقرأها من يفتح
 *    أدوات المطور. لإخفاء التكلفة فعلياً يلزم ألّا تصل للجهاز أصلاً
 *    (مجموعة عرض منفصلة على الخادم).
 */
export function Can({ user, perm, perms, mode = 'any', fallback = null, children }) {
  let allowed;

  if (perm) {
    allowed = hasPermission(user, perm);
  } else if (Array.isArray(perms)) {
    allowed = mode === 'all'
      ? hasAllPermissions(user, perms)
      : hasAnyPermission(user, perms);
  } else {
    allowed = false;
  }

  return allowed ? children : fallback;
}

/**
 * حارس شاشة كاملة. يُستخدم في App.jsx قبل عرض التبويب.
 *
 *   <ScreenGuard user={currentUser} perm={P.REPORTS_VIEW_SALES}>
 *     <ReportsScreen />
 *   </ScreenGuard>
 */
export function ScreenGuard({ user, perm, children, renderDenied }) {
  if (hasPermission(user, perm)) return children;

  if (typeof renderDenied === 'function') {
    return renderDenied(PERMISSION_LABELS[perm] || perm);
  }

  return null;
}
