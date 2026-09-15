---
name: flower-house-npm-powershell
description: سياسة PowerShell على جهاز المستخدم تمنع npm.ps1 — استعمل npm.cmd و npx.cmd دائماً
metadata: 
  node_type: memory
  type: feedback
  originSessionId: bf836111-d1aa-48e8-b4cf-cb180e8da60c
  modified: 2026-09-13T17:24:15.467Z
---

على جهاز المستخدم (Windows 11، PowerShell 5.1) تمنع سياسة التنفيذ تشغيل `npm.ps1`
و `npx.ps1`. استعمل دائماً امتداد `.cmd`:

```
cd D:\FL-HO2018; npm.cmd run build
cd D:\FL-HO2018; npx.cmd firebase deploy --only hosting
```

**Why:** `npm` و `npx` المجرّدان يُحلّان إلى سكربتات PowerShell فتفشل فوراً بخطأ سياسة
التنفيذ، لا بخطأ في المشروع — فيضيع الوقت في تشخيص الشيء الخطأ.

**How to apply:** في أي أمر Node/npm على هذا الجهاز اكتب `npm.cmd` / `npx.cmd`.
ينطبق أيضاً على `.claude/launch.json`: اضبط `runtimeExecutable` على `npm.cmd`.

انظر [[flower-house-pos-project]].
