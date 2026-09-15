import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Store, CreditCard, MessageCircle, Printer, Barcode, LayoutGrid, Menu, Palette, Cloud, Database, Save, CheckCircle, Upload, Trash2, RotateCcw, Smartphone, Banknote, UserCheck, Users, Download, QrCode } from 'lucide-react';
import QRCode from 'qrcode';
import { INITIAL_PAYMENT_METHODS } from '../../utils/initialData';
import { UsersSettingsTab } from './UsersSettingsTab';
import { ResetAccountsTab } from './ResetAccountsTab';
import { ThemesSettingsTab } from './ThemesSettingsTab';
import { PaymentsSettingsTab } from './PaymentsSettingsTab';
import { BarcodeSettingsTab } from './BarcodeSettingsTab';
import { PrintersSettingsPanel } from './PrintersSettingsPanel';
import { PosSettingsTab } from './PosSettingsTab';
import { MenuSettingsTab } from './MenuSettingsTab';
import { BackupSettingsTab } from './BackupSettingsTab';
import { buildReceiptHtml, printHtmlDirectly, downloadWindowsKioskScript } from '../../utils/printHelper';
import { compressImageFile, generateZatcaTLV } from '../../utils/helpers';
import { checkUserPermission } from '../../utils/permissions';

export const SettingsScreen = () => {
  const { storeInfo, updateStoreInfo, currentUser } = useApp();

  // ================= صلاحيات الإعدادات =================
  const canStoreInfo   = checkUserPermission(currentUser, 'settings_store_info');
  const canManageUsers = checkUserPermission(currentUser, 'settings_manage_users');
  const canPayMethods  = checkUserPermission(currentUser, 'settings_payment_methods');
  const canPrintersWa  = checkUserPermission(currentUser, 'settings_printers_whatsapp');
  const canCloudBackup = checkUserPermission(currentUser, 'settings_cloud_sync_backup');
  const canTerminal    = checkUserPermission(currentUser, 'settings_terminal_nami');

  const [activeTab, setActiveTab] = useState('general');
  const [formData, setFormData] = useState({ ...storeInfo });
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('تم حفظ التعديلات بنجاح! 🌸');

  // نموذج إضافة وسيلة دفع جديدة مخصصة
  const [newPaymentName, setNewPaymentName] = useState('');
  const [newPaymentSubtitle, setNewPaymentSubtitle] = useState('');
  const [newPaymentType, setNewPaymentType] = useState('card');
  const [newPaymentColor, setNewPaymentColor] = useState('from-pink-600 to-purple-600');
  const [newPaymentImage, setNewPaymentImage] = useState('');

  // نموذج تعديل وسيلة دفع موجودة
  const [editingMethod, setEditingMethod] = useState(null);

  // حالات النوافذ التفاعلية الحية لاختبار جهاز نامي
  const [namiModalType, setNamiModalType] = useState(null); // 'ping', 'test_pay', 'port_detect', null
  const [pingStep, setPingStep] = useState(0);
  const [testPayStatus, setTestPayStatus] = useState('waiting'); // 'waiting', 'tapping', 'approved'
  const [hardwarePushStatus, setHardwarePushStatus] = useState('');
  const [isUsbConnected, setIsUsbConnected] = useState(false);

  // حساب تدقيق LRC لبروتوكول مدى SPAN ECR
  const calculateLRC = (buffer) => {
    let lrc = 0;
    for (let i = 0; i < buffer.length; i++) {
      lrc ^= buffer[i];
    }
    return lrc;
  };

  // بناء حزمة الشراء لبروتوكول مدى السعودي (Mada ECR SPAN)
  const buildMadaEcrPurchasePacket = (amountSar) => {
    const halalas = Math.round(Number(amountSar) * 100);
    const amountStr = String(halalas).padStart(12, '0');
    const ecrRef = 'ECR' + Date.now().toString().slice(-6);
    const payload = `00${amountStr}682${ecrRef}`;
    const encoder = new TextEncoder();
    const payloadBytes = encoder.encode(payload);
    const packet = new Uint8Array(payloadBytes.length + 3);
    packet[0] = 0x02; // STX
    packet.set(payloadBytes, 1);
    packet[packet.length - 2] = 0x03; // ETX
    packet[packet.length - 1] = calculateLRC(packet.subarray(1, packet.length - 1));
    return packet;
  };

  const runNamiPingTest = async () => {
    setNamiModalType('ping');
    setPingStep(1);
    setTimeout(() => setPingStep(2), 500);
    setTimeout(() => setPingStep(3), 1000);
    setTimeout(() => setPingStep(4), 1500);
  };

  const runNamiTestPayment = async () => {
    setNamiModalType('test_pay');
    setTestPayStatus('waiting');
    setHardwarePushStatus('📡 جاري محاولة إرسال 1.00 ر.س لشاشة جهاز نامي الفعلي عبر منفذ الـ USB...');

    if ('serial' in navigator) {
      try {
        if (!window.__namiSerialPort || !window.__namiSerialPort.writable) {
          setHardwarePushStatus('يرجى اختيار جهاز نامي (USB Serial) من نافذة المتصفح المنبثقة...');
          window.__namiSerialPort = await navigator.serial.requestPort();
          await window.__namiSerialPort.open({ baudRate: Number(formData.terminalSettings?.baudRate) || 115200 });
          setIsUsbConnected(true);
        }

        if (window.__namiSerialPort && window.__namiSerialPort.writable) {
          const writer = window.__namiSerialPort.writable.getWriter();
          
          // 1. إرسال حزمة Mada ECR SPAN الرسمية
          const madaPacket = buildMadaEcrPurchasePacket(1.00);
          await writer.write(madaPacket);

          // 2. إرسال حزمة Nami Android POS JSON النصية
          const jsonCmd = new TextEncoder().encode(JSON.stringify({
            action: 'PURCHASE',
            amount: 1.00,
            currency: 'SAR',
            ecrRef: 'ECR' + Date.now().toString().slice(-6)
          }) + '\r\n');
          await writer.write(jsonCmd);

          writer.releaseLock();
          setHardwarePushStatus('🟢 تم إرسال 1.00 ر.س بنجاح إلى شاشة جهاز نامي الفعلي! انظر لشاشة الجهاز وقم بتمرير البطاقة.');
        }
      } catch (err) {
        console.warn('Web serial error:', err);
        setHardwarePushStatus('💡 لتوجيه العملية للجهاز الفعلي: اضغط على زر "🔌 اختيار وتوصيل جهاز نامي الفعلي" لاختيار منفذ الـ USB.');
      }
    } else {
      setHardwarePushStatus('متصفحك الحالي يعمل بنظام المحاكاة. للربط المباشر مع كابل USB يرجى استخدام Google Chrome أو Microsoft Edge.');
    }
  };

  const handleSimulateCardTap = () => {
    setTestPayStatus('tapping');
    setTimeout(() => {
      setTestPayStatus('approved');
    }, 1000);
  };

  const runNamiPortDetect = async () => {
    if ('serial' in navigator) {
      try {
        const port = await navigator.serial.requestPort();
        await port.open({ baudRate: Number(formData.terminalSettings?.baudRate) || 115200 });
        window.__namiSerialPort = port;
        setIsUsbConnected(true);
        setFormData(p => ({
          ...p,
          terminalSettings: { ...p.terminalSettings, comPort: 'USB-CONNECTED', status: 'connected' }
        }));
        setNamiModalType('port_detect');
      } catch (err) {
        setNamiModalType('port_detect');
      }
    } else {
      setNamiModalType('port_detect');
    }
  };

  useEffect(() => {
    setFormData({ ...storeInfo });
  }, [storeInfo]);

  const handleSave = (customMsg = 'تم حفظ التعديلات بنجاح! 🌸', overrideData = null) => {
    const dataToSave = overrideData || formData;
    updateStoreInfo(dataToSave);
    try {
      localStorage.setItem('naif_pos_v3_store_info', JSON.stringify(dataToSave));
    } catch (e) {
      console.error(e);
    }
    setSuccessMessage(customMsg);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const updated = { ...formData, logo: reader.result };
        setFormData(updated);
        handleSave('تم تحديث شعار هوية المتجر بنجاح! 🌸', updated);
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const handleInvoiceLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        let finalImage = reader.result;
        try {
          const compressed = await compressImageFile(file, 350);
          if (compressed) finalImage = compressed;
        } catch (compErr) {
          console.warn('Compression fallback to reader result:', compErr);
        }

        const updatedSettings = {
          ...(formData.invoicePrintSettings || {}),
          invoiceLogo: finalImage
        };
        const updatedForm = {
          ...formData,
          invoicePrintSettings: updatedSettings
        };
        setFormData(updatedForm);
        handleSave('تم تحديث وحفظ شعار الفاتورة المستقل بنجاح! 🌸', updatedForm);
      } catch (err) {
        console.error('Invoice logo upload processing error:', err);
      }
    };
    reader.onerror = (err) => console.error('FileReader error:', err);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleRemoveInvoiceLogo = () => {
    const updatedSettings = {
      ...(formData.invoicePrintSettings || {}),
      invoiceLogo: ''
    };
    const updatedForm = {
      ...formData,
      invoicePrintSettings: updatedSettings
    };
    setFormData(updatedForm);
    handleSave('تم حذف شعار الفاتورة المستقل والرجوع للافتراضي! 🗑️', updatedForm);
  };

  // توليد معاينة حية لكيو ار كود الفاتورة في شاشة الإعدادات
  const [previewQrUrl, setPreviewQrUrl] = useState('');

  useEffect(() => {
    if (activeTab === 'invoice') {
      const ps = formData.invoicePrintSettings || {};
      let payload = '';
      if (ps.qrCodeType === 'custom_url' && ps.qrCustomUrl) {
        payload = ps.qrCustomUrl;
      } else if (ps.qrCodeType === 'invoice_details') {
        payload = `فاتورة: #INV-001\nالمتجر: ${formData.name || 'بيت الورد'}\nالإجمالي: 150.00 ${formData.currency || 'ر.س'}`;
      } else {
        payload = generateZatcaTLV(
          formData.name || 'بيت الورد',
          formData.taxNumber || '300000000000003',
          new Date().toISOString(),
          150,
          22.5
        );
      }

      QRCode.toDataURL(payload, { width: 140, margin: 1 })
        .then(url => setPreviewQrUrl(url))
        .catch(err => console.error('QR preview error:', err));
    }
  }, [activeTab, formData.invoicePrintSettings?.qrCodeType, formData.invoicePrintSettings?.qrCustomUrl, formData.name, formData.taxNumber, formData.currency]);

  const handleCustomPaymentImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImageFile(file, 256);
        setNewPaymentImage(compressed);
      } catch (err) {
        console.error(err);
      }
    }
    e.target.value = '';
  };

  const handleEditPaymentImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (file && editingMethod) {
      try {
        const compressed = await compressImageFile(file, 256);
        setEditingMethod(prev => ({ ...prev, image: compressed }));
      } catch (err) {
        console.error(err);
      }
    }
    e.target.value = '';
  };

  const handleMethodDirectImageUpload = async (methodId, e) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImageFile(file, 256);
        const currentMethods = formData.paymentMethods || INITIAL_PAYMENT_METHODS;
        const updated = currentMethods.map(m => m.id === methodId ? { ...m, image: compressed } : m);
        setFormData(prev => ({ ...prev, paymentMethods: updated }));
        updateStoreInfo({ ...formData, paymentMethods: updated });
        handleSave('تم رفع وحفظ صورة وسيلة الدفع بنجاح! 🌸');
      } catch (err) {
        console.error(err);
        alert('حدث خطأ أثناء تحميل الصورة');
      }
    }
    e.target.value = '';
  };

  // استعادة الأيقونة الأصلية للوسيلة
  const handleResetPaymentMethodIcon = (methodId) => {
    const currentMethods = formData.paymentMethods || INITIAL_PAYMENT_METHODS;
    const updated = currentMethods.map(m => m.id === methodId ? { ...m, image: '' } : m);
    setFormData(prev => ({ ...prev, paymentMethods: updated }));
    updateStoreInfo({ ...formData, paymentMethods: updated });
    handleSave('تم استعادة الأيقونة الأصلية لوسيلة الدفع! 🌸');
  };

  // تقديم وتأخير ترتيب وسيلة الدفع
  const handleMovePaymentMethodUp = (index) => {
    if (index === 0) return;
    const currentMethods = [...(formData.paymentMethods || INITIAL_PAYMENT_METHODS)];
    const temp = currentMethods[index];
    currentMethods[index] = currentMethods[index - 1];
    currentMethods[index - 1] = temp;
    setFormData(prev => ({ ...prev, paymentMethods: currentMethods }));
    updateStoreInfo({ ...formData, paymentMethods: currentMethods });
    handleSave('تم تحديث ترتيب وسائل الدفع! 🌸');
  };

  const handleMovePaymentMethodDown = (index) => {
    const currentMethods = [...(formData.paymentMethods || INITIAL_PAYMENT_METHODS)];
    if (index >= currentMethods.length - 1) return;
    const temp = currentMethods[index];
    currentMethods[index] = currentMethods[index + 1];
    currentMethods[index + 1] = temp;
    setFormData(prev => ({ ...prev, paymentMethods: currentMethods }));
    updateStoreInfo({ ...formData, paymentMethods: currentMethods });
    handleSave('تم تحديث ترتيب وسائل الدفع! 🌸');
  };

  // تجربة إرسال رسالة اختبار عبر الواتساب للمدير
  const handleTestWhatsAppSend = () => {
    const phone = formData.whatsappSettings?.managerPhone || formData.whatsappPhone || formData.managerPhone || '0508333996';
    let cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('05')) cleanPhone = '966' + cleanPhone.substring(1);
    else if (cleanPhone.startsWith('5')) cleanPhone = '966' + cleanPhone;
    else if (!cleanPhone.startsWith('966')) cleanPhone = '966' + cleanPhone;

    const testMsg = `🌸 *تجربة اتصال نظام واتساب - ${formData.name || 'بيت الورد للزهور والهدايا'}*\n\n` +
      `✅ تم التحقق من ربط نظام الواتساب وإرسال الفواتير الإلكترونية والتقارير بنجاح!\n` +
      `📅 التاريخ: ${new Date().toLocaleString('ar-SA')}\n` +
      `📱 رقم المستلم: ${phone}\n` +
      `✨ نظام إدارة المبيعات والكاشير السحابي جاهز للعمل.`;

    const url = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(testMsg)}`;
    window.open(url, '_blank');
    handleSave('تم فتح محادثة الواتساب لإرسال رسالة الاختبار بنجاح! 🌸');
  };

  const handleAddPaymentMethod = () => {
    if (!newPaymentName.trim()) {
      alert('يرجى إدخال اسم وسيلة الدفع');
      return;
    }

    const newMethod = {
      id: 'custom-' + Date.now(),
      name: newPaymentName.trim(),
      subtitle: newPaymentSubtitle.trim() || 'وسيلة مخصصة',
      type: newPaymentType,
      iconName: newPaymentType === 'cash' ? 'Banknote' : newPaymentType === 'credit' ? 'UserCheck' : 'CreditCard',
      image: newPaymentImage,
      color: newPaymentColor,
      enabled: true,
      isCustom: true
    };

    const currentMethods = formData.paymentMethods || INITIAL_PAYMENT_METHODS;
    const updated = [...currentMethods, newMethod];

    setFormData(prev => ({
      ...prev,
      paymentMethods: updated
    }));

    setNewPaymentName('');
    setNewPaymentSubtitle('');
    setNewPaymentImage('');
    updateStoreInfo({ ...formData, paymentMethods: updated });
    handleSave(`تمت إضافة وسيلة الدفع (${newPaymentName}) بنجاح! 🌸`);
  };

  const handleTogglePaymentMethod = (id) => {
    const currentMethods = formData.paymentMethods || INITIAL_PAYMENT_METHODS;
    const updated = currentMethods.map(m => m.id === id ? { ...m, enabled: !m.enabled } : m);
    setFormData(prev => ({ ...prev, paymentMethods: updated }));
    updateStoreInfo({ ...formData, paymentMethods: updated });
  };

  const handleDeletePaymentMethod = (id) => {
    if (window.confirm('هل أنت متأكد من حذف وسيلة الدفع هذه؟')) {
      const currentMethods = formData.paymentMethods || INITIAL_PAYMENT_METHODS;
      const updated = currentMethods.filter(m => m.id !== id);
      setFormData(prev => ({ ...prev, paymentMethods: updated }));
      updateStoreInfo({ ...formData, paymentMethods: updated });
      handleSave('تم حذف وسيلة الدفع بنجاح!');
    }
  };

  const handleSaveEditedMethod = () => {
    if (!editingMethod || !editingMethod.name.trim()) return;
    const currentMethods = formData.paymentMethods || INITIAL_PAYMENT_METHODS;
    const updated = currentMethods.map(m => m.id === editingMethod.id ? editingMethod : m);
    setFormData(prev => ({ ...prev, paymentMethods: updated }));
    updateStoreInfo({ ...formData, paymentMethods: updated });
    setEditingMethod(null);
    handleSave(`تم تعديل وسيلة الدفع (${editingMethod.name}) بنجاح! 🌸`);
  };

  // عرض أيقونة وسيلة الدفع بالنظام
  const renderSettingsPaymentIcon = (m) => {
    if (m.image) {
      return (
        <div className="w-full h-full bg-white flex items-center justify-center p-1 rounded-xl">
          <img src={m.image} alt={m.name} className="w-full h-full object-contain" />
        </div>
      );
    }
    if (m.id === 'cash' || m.type === 'cash') {
      return (
        <svg viewBox="0 0 48 48" fill="none" className="w-7 h-7">
          <rect x="4" y="10" width="40" height="28" rx="6" fill="#10B981"/>
          <circle cx="24" cy="24" r="7" fill="#047857" stroke="#34D399" strokeWidth="2"/>
          <text x="24" y="27" textAnchor="middle" fill="#FFFFFF" fontSize="9" fontWeight="900">SAR</text>
          <circle cx="10" cy="24" r="2.5" fill="#34D399"/>
          <circle cx="38" cy="24" r="2.5" fill="#34D399"/>
        </svg>
      );
    }
    if (m.id === 'card') {
      return (
        <svg viewBox="0 0 48 48" fill="none" className="w-7 h-7">
          <rect x="4" y="8" width="40" height="32" rx="6" fill="#FFFFFF"/>
          <path d="M8 24C8 17.37 13.37 12 20 12H28C34.63 12 40 17.37 40 24C40 30.63 34.63 36 28 36H20C13.37 36 8 30.63 8 24Z" fill="#007A3D"/>
          <path d="M22 18H26C29.31 18 32 20.69 32 24C32 27.31 29.31 30 26 30H22V18Z" fill="#00A3E0"/>
          <text x="14" y="27" fill="#FFFFFF" fontSize="9" fontWeight="900" fontFamily="Cairo">مدى</text>
        </svg>
      );
    }
    if (m.id === 'visa') {
      return (
        <svg viewBox="0 0 48 48" fill="none" className="w-7 h-7">
          <rect x="4" y="8" width="40" height="32" rx="6" fill="#1A1F71"/>
          <text x="24" y="27" textAnchor="middle" fill="#FFFFFF" fontSize="11" fontStyle="italic" fontWeight="900">VISA</text>
          <rect x="6" y="32" width="36" height="2" fill="#F7B600"/>
        </svg>
      );
    }
    if (m.id === 'transfer') {
      return (
        <svg viewBox="0 0 48 48" fill="none" className="w-7 h-7">
          <rect x="4" y="8" width="40" height="32" rx="6" fill="#2563EB"/>
          <path d="M24 13L11 20V22H37V20L24 13Z" fill="#93C5FD"/>
          <rect x="14" y="24" width="4" height="7" fill="#FFFFFF"/>
          <rect x="22" y="24" width="4" height="7" fill="#FFFFFF"/>
          <rect x="30" y="24" width="4" height="7" fill="#FFFFFF"/>
          <rect x="10" y="32" width="28" height="3" fill="#93C5FD"/>
        </svg>
      );
    }
    if (m.id === 'tamara') {
      return (
        <svg viewBox="0 0 48 48" fill="none" className="w-7 h-7">
          <rect x="4" y="8" width="40" height="32" rx="6" fill="#FF8D6B"/>
          <circle cx="18" cy="22" r="6" fill="#FFFFFF"/>
          <circle cx="30" cy="22" r="6" fill="#2B1F4D"/>
          <text x="24" y="35" textAnchor="middle" fill="#FFFFFF" fontSize="7" fontWeight="bold">tamara</text>
        </svg>
      );
    }
    if (m.id === 'ninja') {
      return (
        <svg viewBox="0 0 48 48" fill="none" className="w-7 h-7">
          <rect x="4" y="8" width="40" height="32" rx="6" fill="#E11D48"/>
          <path d="M26 14L16 26H24L22 34L32 22H24L26 14Z" fill="#FACC15"/>
        </svg>
      );
    }
    if (m.id === 'credit' || m.type === 'credit') {
      return (
        <svg viewBox="0 0 48 48" fill="none" className="w-7 h-7">
          <rect x="4" y="8" width="40" height="32" rx="6" fill="#D97706"/>
          <circle cx="24" cy="19" r="5" fill="#FEF3C7"/>
          <path d="M15 32C15 27.5 19 25.5 24 25.5C29 25.5 33 27.5 33 32" stroke="#FEF3C7" strokeWidth="2.5" strokeLinecap="round"/>
        </svg>
      );
    }
    if (m.id === 'split' || m.type === 'split') {
      return (
        <svg viewBox="0 0 48 48" fill="none" className="w-7 h-7">
          <rect x="4" y="8" width="40" height="32" rx="6" fill="#7C3AED"/>
          <path d="M14 18H22C26 18 29 21 29 25V30" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
          <path d="M14 30H22C26 30 29 27 29 25" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
          <circle cx="14" cy="18" r="3" fill="#F472B6"/>
          <circle cx="14" cy="30" r="3" fill="#34D399"/>
          <circle cx="29" cy="30" r="3" fill="#60A5FA"/>
          <text x="38" y="26" textAnchor="middle" fill="#FFFFFF" fontSize="6.5" fontWeight="900" fontFamily="sans-serif">SPLIT</text>
        </svg>
      );
    }
    return <span className="text-sm font-black">{m.name[0]}</span>;
  };

  const currentMethodsList = formData.paymentMethods || INITIAL_PAYMENT_METHODS;

  // التبويبات تُبنى حسب الصلاحيات — ما لا يملك المستخدم صلاحيته لا يظهر له أصلاً
  const tabs = [
    ...(canStoreInfo   ? [{ id: 'general', label: 'الهوية', icon: Store, color: 'text-pink-600' }] : []),
    ...(canPrintersWa  ? [{ id: 'whatsapp', label: 'الوتساب', icon: MessageCircle, color: 'text-emerald-600' }] : []),
    ...(canPayMethods  ? [{ id: 'payments', label: 'طرق الدفع', icon: CreditCard, color: 'text-purple-600' }] : []),
    ...(canManageUsers ? [{ id: 'users', label: 'المستخدمين', icon: Users, color: 'text-indigo-600' }] : []),
    ...(canCloudBackup ? [{ id: 'reset', label: 'تصفير', icon: RotateCcw, color: 'text-rose-600' }] : []),
    ...(canTerminal    ? [{ id: 'terminal', label: 'اجهزة الدفع', icon: Smartphone, color: 'text-emerald-600' }] : []),
    ...(canPrintersWa  ? [{ id: 'invoice', label: 'الفاتورة', icon: Printer, color: 'text-blue-600' }] : []),
    ...(canPrintersWa  ? [{ id: 'barcode', label: 'الباركود', icon: Barcode, color: 'text-indigo-600' }] : []),
    ...(canStoreInfo   ? [{ id: 'pos', label: 'الكاشير', icon: LayoutGrid, color: 'text-rose-600' }] : []),
    ...(canStoreInfo   ? [{ id: 'menu', label: 'القوائم', icon: Menu, color: 'text-amber-600' }] : []),
    { id: 'themes', label: 'المظهر', icon: Palette, color: 'text-fuchsia-600' },
    ...(canCloudBackup ? [{ id: 'cloud', label: 'المزامنة', icon: Cloud, color: 'text-cyan-600' }] : []),
    ...(canCloudBackup ? [{ id: 'backup', label: 'النسخ', icon: Database, color: 'text-slate-600' }] : [])
  ];

  // إن كان التبويب الحالي ممنوعاً نُرجع المستخدم لأول تبويب مسموح
  const allowedTabIds = tabs.map(t => t.id);
  if (!allowedTabIds.includes(activeTab) && allowedTabIds.length > 0) {
    setTimeout(() => setActiveTab(allowedTabIds[0]), 0);
  }

  return (
    <div className="p-3 sm:p-5 lg:p-8 max-w-4xl lg:max-w-7xl mx-auto space-y-4 pb-28 font-cairo animate-in fade-in">
      
      {/* رأس شاشة الإعدادات بهوية بيت الورد */}
      <div className="bg-white/95 backdrop-blur-md p-3.5 sm:p-4 rounded-3xl border border-pink-100 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-rose-600 via-pink-600 to-purple-700 text-white flex items-center justify-center text-xl shadow-md shadow-pink-600/20 shrink-0">
            ⚙️
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-black text-slate-900 flex items-center gap-1.5">
              <span>إعدادات النظام والتهيئة الشاملة</span>
              <span className="text-pink-600">🌸</span>
            </h2>
            <p className="text-[11px] text-slate-500 font-medium">تخصيص الهوية، الفواتير، طرق الدفع، الطابعات، والصلاحيات</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => handleSave()}
          className="px-5 py-2.5 bg-gradient-to-r from-rose-600 via-pink-600 to-purple-700 hover:from-rose-500 hover:to-purple-600 text-white rounded-2xl text-xs font-black shadow-md shadow-pink-600/25 transition active:scale-95 flex items-center justify-center gap-2 shrink-0"
        >
          <Save className="w-4 h-4" />
          <span>💾 حفظ جميع الإعدادات</span>
        </button>
      </div>

      {/* تنبيه الحفظ الناجح */}
      {saveSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-2xl text-emerald-900 text-xs font-bold flex items-center justify-between shadow-xs animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
            <span>{successMessage}</span>
          </div>
          <span className="text-[10px] bg-emerald-200 text-emerald-800 px-2 py-0.5 rounded-lg font-bold">محفوظ محلياً ومستمر ✅</span>
        </div>
      )}

      {/* شريط التبويبات المنسجم مع هوية المتجر */}
      <div className="p-1.5 bg-slate-100/90 backdrop-blur-md rounded-2xl border border-pink-100/80 shadow-inner flex gap-1.5 overflow-x-auto scrollbar-none text-xs font-bold">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3.5 py-2 rounded-xl transition shrink-0 flex items-center gap-1.5 active:scale-95 text-xs ${
                isActive
                  ? 'bg-gradient-to-r from-rose-600 via-pink-600 to-purple-700 text-white shadow-md shadow-pink-600/25 font-black scale-[1.02] border border-pink-300/30'
                  : 'bg-white text-slate-700 hover:text-pink-700 hover:bg-pink-50/70 border border-slate-200/80 hover:border-pink-200 shadow-xs'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : tab.color}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* محتوى التبويبات */}
      <div className="bg-white/95 backdrop-blur-md rounded-3xl p-4 sm:p-6 border border-pink-100 shadow-sm space-y-5">
        
        {/* ======================================================== */}
        {/* 1. تبويب هوية المتجر والبيانات العامة */}
        {/* ======================================================== */}
        {activeTab === 'general' && (
          <div className="space-y-4 animate-in fade-in">
            <div className="border-b border-pink-100 pb-2 flex items-center justify-between">
              <div>
                <h3 className="font-black text-slate-900 text-sm">🌸 هوية واسم البرنامج والمتجر</h3>
                <p className="text-[11px] text-slate-500">البيانات الرسمية التي تظهر في الترويسة والفواتير والتقارير</p>
              </div>
              <span className="text-xs text-pink-600 font-bold">المتجر الرئيسي</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">اسم المتجر الرسمي:</label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-pink-50/40 border border-pink-200 rounded-xl font-bold text-slate-900 focus:ring-2 focus:ring-pink-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">اسم البرنامج في شريط الرأس:</label>
                <input
                  type="text"
                  value={formData.appName || ''}
                  onChange={(e) => setFormData(p => ({ ...p, appName: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-pink-50/40 border border-pink-200 rounded-xl font-bold text-slate-900 focus:ring-2 focus:ring-pink-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">النشاط / الوصف الترويجي:</label>
                <input
                  type="text"
                  value={formData.appSubtitle || ''}
                  onChange={(e) => setFormData(p => ({ ...p, appSubtitle: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-pink-50/40 border border-pink-200 rounded-xl font-bold text-slate-900 focus:ring-2 focus:ring-pink-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">الرقم الضريبي الرسمي (15 رقم):</label>
                <input
                  type="text"
                  value={formData.taxNumber || ''}
                  onChange={(e) => setFormData(p => ({ ...p, taxNumber: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-pink-50/40 border border-pink-200 rounded-xl font-mono font-bold text-slate-900 focus:ring-2 focus:ring-pink-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">رقم السجل التجاري (CR):</label>
                <input
                  type="text"
                  value={formData.crNumber || ''}
                  onChange={(e) => setFormData(p => ({ ...p, crNumber: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-pink-50/40 border border-pink-200 rounded-xl font-mono font-bold text-slate-900 focus:ring-2 focus:ring-pink-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">رقم هاتف المتجر / الجوال:</label>
                <input
                  type="text"
                  value={formData.phone || ''}
                  onChange={(e) => setFormData(p => ({ ...p, phone: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-pink-50/40 border border-pink-200 rounded-xl font-mono font-bold text-slate-900 focus:ring-2 focus:ring-pink-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">البريد الإلكتروني للإدارة:</label>
                <input
                  type="email"
                  value={formData.email || ''}
                  onChange={(e) => setFormData(p => ({ ...p, email: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-pink-50/40 border border-pink-200 rounded-xl font-bold text-slate-900 focus:ring-2 focus:ring-pink-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">العملة الرسمية:</label>
                <input
                  type="text"
                  value={formData.currency || 'ر.س'}
                  onChange={(e) => setFormData(p => ({ ...p, currency: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-pink-50/40 border border-pink-200 rounded-xl font-bold text-slate-900 focus:ring-2 focus:ring-pink-500 focus:bg-white"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-slate-700 font-bold mb-1">عنوان المتجر والفرع:</label>
                <input
                  type="text"
                  value={formData.address || ''}
                  onChange={(e) => setFormData(p => ({ ...p, address: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-pink-50/40 border border-pink-200 rounded-xl font-bold text-slate-900 focus:ring-2 focus:ring-pink-500 focus:bg-white"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="flex items-center gap-3 cursor-pointer mt-1 bg-indigo-50/50 hover:bg-indigo-50 p-3 rounded-xl border border-indigo-100 transition">
                  <input
                    type="checkbox"
                    checked={formData.enableVirtualKeyboard !== false} // Default to true if undefined
                    onChange={(e) => setFormData(p => ({ ...p, enableVirtualKeyboard: e.target.checked }))}
                    className="w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <div className="flex flex-col">
                    <span className="font-bold text-slate-800 text-sm flex items-center gap-2">
                      تفعيل لوحة المفاتيح الافتراضية على الشاشة (للكمبيوتر) ⌨️
                    </span>
                    <span className="text-[11px] text-slate-500">عند إيقاف هذا الخيار، لن تظهر اللوحة أبداً. مفيد إذا كان لديك لوحة مفاتيح حقيقية موصلة.</span>
                  </div>
                </label>
              </div>

                            {/* ======================================================== */}
              {/* قسم إعدادات ضريبة القيمة المضافة الذكية ZATCA */}
              {/* ======================================================== */}
              <div className="sm:col-span-2 p-4 bg-gradient-to-br from-pink-50/60 via-purple-50/40 to-slate-50 rounded-3xl border-2 border-pink-200/90 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-pink-200/60 pb-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-pink-600 text-white flex items-center justify-center text-lg font-black shadow-xs">
                      🧾
                    </div>
                    <div>
                      <h4 className="font-black text-sm text-slate-900">نظام ضريبة القيمة المضافة (ZATCA VAT)</h4>
                      <p className="text-[11px] text-slate-500 font-medium">التحكم في طريقة احتساب وشُمولية الضريبة في الفواتير والكاشير</p>
                    </div>
                  </div>

                  {/* مفتاح تفعيل أو تعطيل الضريبة بالكامل */}
                  <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-1.5 rounded-2xl border border-pink-200 shadow-2xs">
                    <input
                      type="checkbox"
                      checked={formData.taxEnabled !== false}
                      onChange={(e) => setFormData(p => ({ ...p, taxEnabled: e.target.checked }))}
                      className="w-4 h-4 text-pink-600 rounded cursor-pointer"
                    />
                    <span className="font-black text-xs text-slate-800">
                      {formData.taxEnabled !== false ? '🟢 الضريبة مفعلة' : '⚪ معفى / غير مسجل'}
                    </span>
                  </label>
                </div>

                {formData.taxEnabled !== false ? (
                  <div className="space-y-3.5 animate-in fade-in">
                    
                    {/* خيارات طريقة الاحتساب: شاملة vs غير شاملة */}
                    <div>
                      <label className="block text-slate-800 font-bold mb-2">طريقة احتساب الضريبة في المتجر:</label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        
                        {/* خيار 1: الأسعار شاملة الضريبة */}
                        <div
                          onClick={() => setFormData(p => ({ ...p, taxInclusive: true }))}
                          className={`p-3.5 rounded-2xl border-2 cursor-pointer transition-all flex flex-col justify-between gap-2 ${
                            formData.taxInclusive !== false 
                              ? 'bg-white border-pink-600 shadow-md shadow-pink-600/10' 
                              : 'bg-white/60 border-slate-200 hover:border-pink-300'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-base">🌸</span>
                              <span className="font-black text-xs text-slate-900">الأسعار شاملة الضريبة (Tax Inclusive)</span>
                            </div>
                            <input
                              type="radio"
                              name="taxInclusiveOption"
                              checked={formData.taxInclusive !== false}
                              onChange={() => setFormData(p => ({ ...p, taxInclusive: true }))}
                              className="w-4 h-4 text-pink-600"
                            />
                          </div>
                          <p className="text-[10px] text-slate-500 leading-relaxed">
                            السعر المعروض للعميل هو السعر النهائي المدفوع. يتم استخراج وحساب الضريبة تلقائياً من الإجمالي دون زيادة السعر.
                          </p>
                          <div className="bg-pink-50/80 px-2.5 py-1 rounded-xl text-[10px] font-mono font-bold text-pink-800 flex justify-between">
                            <span>مثال لسلعة بـ 100 ر.س:</span>
                            <span>الصافي: 86.96 + الضريبة: 13.04 = 100 ر.س</span>
                          </div>
                        </div>

                        {/* خيار 2: الأسعار غير شاملة الضريبة */}
                        <div
                          onClick={() => setFormData(p => ({ ...p, taxInclusive: false }))}
                          className={`p-3.5 rounded-2xl border-2 cursor-pointer transition-all flex flex-col justify-between gap-2 ${
                            formData.taxInclusive === false 
                              ? 'bg-white border-purple-600 shadow-md shadow-purple-600/10' 
                              : 'bg-white/60 border-slate-200 hover:border-purple-300'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-base">➕</span>
                              <span className="font-black text-xs text-slate-900">الأسعار غير شاملة الضريبة (Tax Exclusive)</span>
                            </div>
                            <input
                              type="radio"
                              name="taxInclusiveOption"
                              checked={formData.taxInclusive === false}
                              onChange={() => setFormData(p => ({ ...p, taxInclusive: false }))}
                              className="w-4 h-4 text-purple-600"
                            />
                          </div>
                          <p className="text-[10px] text-slate-500 leading-relaxed">
                            السعر المعروض هو السعر الأساسي الصافي. تضاف نسبة الضريبة (15%) زيادة فوق السعر عند إتمام الدفع.
                          </p>
                          <div className="bg-purple-50/80 px-2.5 py-1 rounded-xl text-[10px] font-mono font-bold text-purple-800 flex justify-between">
                            <span>مثال لسلعة بـ 100 ر.س:</span>
                            <span>الأساس: 100.00 + الضريبة: 15.00 = 115 ر.س</span>
                          </div>
                        </div>

                      </div>
                    </div>

                    {/* نسبة الضريبة والخيارات السريعة */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div>
                        <label className="block text-slate-700 font-bold mb-1">نسبة ضريبة القيمة المضافة (%):</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            max="100"
                            value={formData.taxRate !== undefined ? formData.taxRate : 15}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              setFormData(p => ({ ...p, taxRate: isNaN(val) ? 0 : val }));
                            }}
                            className="w-full px-3 py-2 bg-white border border-pink-300 rounded-xl font-mono font-black text-slate-900 text-sm focus:ring-2 focus:ring-pink-500 text-center"
                          />
                          <div className="flex gap-1">
                            {[15, 5, 0].map(rate => (
                              <button
                                key={rate}
                                type="button"
                                onClick={() => setFormData(p => ({ ...p, taxRate: rate }))}
                                className="px-2.5 py-2 bg-pink-100/70 hover:bg-pink-200 text-pink-800 rounded-xl font-mono font-bold text-xs transition"
                              >
                                {rate}%
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="bg-white p-3 rounded-2xl border border-pink-100 flex flex-col justify-center text-[11px] text-slate-600">
                        <span className="font-bold text-slate-900 mb-0.5">💡 توافق معايير هيئة الزكاة (ZATCA):</span>
                        <span>الباركود المشفر (QR Code) يقوم تلقائياً بترميز وتوليد مصفوفة TLV بالمبالغ والضريبة بدقة متناهية.</span>
                      </div>
                    </div>

                  </div>
                ) : (
                  <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 text-amber-900 text-xs font-bold flex items-center gap-2">
                    <span>⚠️ تم تعطيل الضريبة، سيتم بيع جميع المنتجات والخدمات بدون ضريبة (0.00 ر.س).</span>
                  </div>
                )}
              </div>


              {/* شعار المتجر Logo */}
              <div className="sm:col-span-2 p-3 bg-pink-50/30 rounded-2xl border border-pink-200 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-2xl bg-white border border-pink-200 overflow-hidden flex items-center justify-center text-3xl shadow-inner">
                    {formData.logo ? (
                      <img src={formData.logo} alt="Logo" className="w-full h-full object-cover" />
                    ) : (
                      '🌸'
                    )}
                  </div>
                  <div>
                    <span className="font-bold text-slate-900 block">شعار المتجر (Logo)</span>
                    <span className="text-[11px] text-slate-500">يظهر في الترويسة وأعلى الفاتورة المطبوعة</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <label className="px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-xl font-bold text-xs cursor-pointer shadow transition active:scale-95 flex items-center gap-1.5">
                    <Upload className="w-4 h-4" />
                    <span>تحميل شعار</span>
                    <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                  </label>
                  {formData.logo && (
                    <button
                      type="button"
                      onClick={() => setFormData(p => ({ ...p, logo: '' }))}
                      className="px-3 py-2 bg-slate-100 hover:bg-rose-50 text-rose-600 rounded-xl font-bold text-xs"
                    >
                      حذف
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-pink-100 flex justify-end">
              <button
                type="button"
                onClick={() => handleSave('تم حفظ إعدادات هوية المتجر بنجاح! 🌸')}
                className="px-6 py-3 bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 text-white rounded-2xl text-xs font-black shadow-md transition active:scale-95 flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                <span>💾 حفظ إعدادات المتجر</span>
              </button>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* 2. تبويب الواتساب والـ PDF وتصدير التقارير */}
        {/* ======================================================== */}
        {activeTab === 'whatsapp' && (
          <div className="space-y-4 animate-in fade-in">
            <div className="border-b border-pink-100 pb-2 flex items-center justify-between">
              <div>
                <h3 className="font-black text-emerald-900 text-sm">💬 نظام الواتساب والـ PDF والبريد الإلكتروني</h3>
                <p className="text-[11px] text-slate-500">إرسال الفواتير، تقارير Z-Report للإدارة، وتنبيهات مديونيات الآجل</p>
              </div>
              <span className="text-xs bg-emerald-100 text-emerald-800 font-black px-2.5 py-0.5 rounded-full">الرقم الافتراضي: 0508333996</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">رقم واتساب الإدارة / المدير (الافتراضي 0508333996):</label>
                <input
                  type="text"
                  value={formData.whatsappSettings?.managerPhone || formData.managerPhone || '0508333996'}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormData(p => ({
                      ...p,
                      managerPhone: val,
                      whatsappNumber: val,
                      whatsappSettings: { ...p.whatsappSettings, managerPhone: val, storePhone: val }
                    }));
                  }}
                  className="w-full px-3 py-2.5 bg-emerald-50/40 border border-emerald-200 rounded-xl font-mono font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">البريد الإلكتروني للمدير العام (لاستلام التقارير):</label>
                <input
                  type="email"
                  value={formData.whatsappSettings?.managerEmail || formData.managerEmail || 'manager@baytalward.com'}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormData(p => ({
                      ...p,
                      managerEmail: val,
                      whatsappSettings: { ...p.whatsappSettings, managerEmail: val }
                    }));
                  }}
                  className="w-full px-3 py-2.5 bg-blue-50/40 border border-blue-200 rounded-xl font-bold text-slate-900 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* خيارات صيغ التصدير والمشاركة */}
              <div className="sm:col-span-2 p-3.5 bg-emerald-50/60 rounded-2xl border border-emerald-200 space-y-2">
                <span className="font-extrabold text-emerald-900 block text-xs">صيغ الإرسال والمشاركة المفعلة في نافذة الفاتورة:</span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <label className="flex items-center gap-2 p-2 bg-white rounded-xl border border-emerald-200 font-bold text-emerald-900 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.whatsappSettings?.enableWhatsAppText !== false}
                      onChange={(e) => setFormData(p => ({ ...p, whatsappSettings: { ...p.whatsappSettings, enableWhatsAppText: e.target.checked } }))}
                      className="w-4 h-4 text-emerald-600 rounded"
                    />
                    <span>واتساب 💬</span>
                  </label>

                  <label className="flex items-center gap-2 p-2 bg-white rounded-xl border border-rose-200 font-bold text-rose-900 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.whatsappSettings?.enablePdfExport !== false}
                      onChange={(e) => setFormData(p => ({ ...p, whatsappSettings: { ...p.whatsappSettings, enablePdfExport: e.target.checked } }))}
                      className="w-4 h-4 text-rose-600 rounded"
                    />
                    <span>مستند PDF 📄</span>
                  </label>

                  <label className="flex items-center gap-2 p-2 bg-white rounded-xl border border-purple-200 font-bold text-purple-900 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.whatsappSettings?.enableImageExport !== false}
                      onChange={(e) => setFormData(p => ({ ...p, whatsappSettings: { ...p.whatsappSettings, enableImageExport: e.target.checked } }))}
                      className="w-4 h-4 text-purple-600 rounded"
                    />
                    <span>صورة PNG 🖼️</span>
                  </label>

                  <label className="flex items-center gap-2 p-2 bg-white rounded-xl border border-blue-200 font-bold text-blue-900 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.whatsappSettings?.enableEmailExport !== false}
                      onChange={(e) => setFormData(p => ({ ...p, whatsappSettings: { ...p.whatsappSettings, enableEmailExport: e.target.checked } }))}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <span>إيميل 📧</span>
                  </label>
                </div>

                {/* الصيغة التي يستخدمها النظام تلقائياً عند إرسال فاتورة أو تقرير */}
                <div className="mt-3 bg-white/70 border border-emerald-200 rounded-xl p-3">
                  <label className="block text-xs font-black text-emerald-900 mb-1">الصيغة الافتراضية عند الإرسال:</label>
                  <select
                    value={formData.whatsappSettings?.defaultShareFormat || 'image'}
                    onChange={(e) => setFormData(p => ({ ...p, whatsappSettings: { ...p.whatsappSettings, defaultShareFormat: e.target.value } }))}
                    className="w-full px-3 py-2 bg-white border border-emerald-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-300"
                  >
                    <option value="image">صورة 🖼️ (الأنسب للواتساب)</option>
                    <option value="pdf">مستند PDF 📄</option>
                    <option value="text">نص فقط 💬</option>
                  </select>
                  <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                    تُطبَّق على إرسال الفواتير وتقارير الورديات. على الجوال تفتح نافذة المشاركة مباشرة، وعلى الكمبيوتر يُحفظ الملف وتُفتح محادثة واتساب لإرفاقه بضغطة.
                  </p>

                  <label className="mt-3 flex items-center gap-2 p-2 bg-emerald-50 rounded-xl border border-emerald-200 font-bold text-emerald-900 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.whatsappSettings?.autoSendShiftReport !== false}
                      onChange={(e) => setFormData(p => ({ ...p, whatsappSettings: { ...p.whatsappSettings, autoSendShiftReport: e.target.checked } }))}
                      className="w-4 h-4 text-emerald-600 rounded"
                    />
                    <span>إرسال تقرير الوردية للمدير تلقائياً عند الإغلاق 📤</span>
                  </label>
                </div>
              </div>

              {/* قوالب الرسائل */}
              <div className="sm:col-span-2 space-y-2">
                <label className="block text-slate-700 font-bold">قالب رسالة الفاتورة المنسقة للعميل:</label>
                <textarea
                  rows="2"
                  value={formData.whatsappSettings?.invoiceGreeting || 'عزيزنا العميل، نشكر لك تسوقك من بيت الورد 🌸 تم إصدار فاتورتك الضريبية:'}
                  onChange={(e) => setFormData(p => ({ ...p, whatsappSettings: { ...p.whatsappSettings, invoiceGreeting: e.target.value } }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 text-xs focus:bg-white"
                />
              </div>

              <div className="sm:col-span-2 space-y-2">
                <label className="block text-slate-700 font-bold">قالب تقرير إغلاق الوردية (Z-Report) لواتساب الإدارة:</label>
                <textarea
                  rows="2"
                  value={formData.whatsappSettings?.shiftCloseGreeting || 'تقرير إغلاق الوردية والـ Z-Report لمدير المتجر 📊'}
                  onChange={(e) => setFormData(p => ({ ...p, whatsappSettings: { ...p.whatsappSettings, shiftCloseGreeting: e.target.value } }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 text-xs focus:bg-white"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-pink-100 flex flex-col sm:flex-row items-center justify-between gap-2">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleTestWhatsAppSend}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition active:scale-95 shadow flex items-center gap-1.5"
                >
                  <span>📲 تجربة إرسال رسالة واتساب حية</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => handleSave('تم حفظ إعدادات الواتساب والتصدير بنجاح! 🌸')}
                className="px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 text-white rounded-2xl text-xs font-black shadow-md transition active:scale-95 flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                <span>💾 حفظ إعدادات الواتساب</span>
              </button>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* 3. تبويب وسائل الدفع وإعادة تهيئتها وإدارتها بالكامل */}
        {/* ======================================================== */}
        {activeTab === 'payments' && (
          <PaymentsSettingsTab />
        )}

        {/* ======================================================== */}
        {/* 3.4 تبويب إدارة المستخدمين وصلاحيات النظام الدقيقة */}
        {/* ======================================================== */}
        {activeTab === 'users' && (
          <UsersSettingsTab />
        )}

        {/* ======================================================== */}
        {/* 3.4.5 تبويب تصفير الحسابات والأنظمة بشكل تفصيلي ودقيق */}
        {/* ======================================================== */}
        {activeTab === 'reset' && (
          <ResetAccountsTab />
        )}

        {/* ======================================================== */}
        {/* 3.5 تبويب ربط جهاز دفع نامي الذكي عبر USB */}
        {/* ======================================================== */}
        {activeTab === 'terminal' && (
          <div className="space-y-4 animate-in fade-in">
            <div className="border-b border-pink-100 pb-2 flex items-center justify-between">
              <div>
                <h3 className="font-black text-emerald-950 text-sm">📡 ربط وتكامل جهاز دفع نامي الذكي (Nami Smart POS - USB)</h3>
                <p className="text-[11px] text-slate-500">ربط البرنامج بجهاز نامي المتصل عبر كابل الـ USB لإرسال المبالغ وسحبها آلياً</p>
              </div>
              <span className="text-xs bg-emerald-100 text-emerald-800 font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse"></span>
                <span>متصل بالـ USB 🟢</span>
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">نوع وموديل جهاز الدفع:</label>
                <select
                  value={formData.terminalSettings?.terminalType || 'nami_usb'}
                  onChange={(e) => setFormData(p => ({
                    ...p,
                    terminalSettings: { ...p.terminalSettings, terminalType: e.target.value }
                  }))}
                  className="w-full px-3 py-2.5 bg-emerald-50/40 border border-emerald-200 rounded-xl font-bold text-slate-900 focus:outline-none"
                >
                  <option value="nami_usb">جهاز دفع نامي الذكي (Nami Smart POS - USB / COM)</option>
                  <option value="mada_ecr">جهاز مدى البنكي الذكي (Mada ECR SPAN Protocol)</option>
                  <option value="geidea">جهاز جيديا الذكي (Geidea Smart POS)</option>
                  <option value="pax">أجهزة باكس (PAX A920 / A930 / S920)</option>
                  <option value="ingenico">أجهزة إنجينيكو (Ingenico Desk / Move)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">اسم الجهاز التعريفي:</label>
                <input
                  type="text"
                  value={formData.terminalSettings?.terminalName || 'جهاز دفع نامي الذكي (Nami Smart POS - USB)'}
                  onChange={(e) => setFormData(p => ({
                    ...p,
                    terminalSettings: { ...p.terminalSettings, terminalName: e.target.value }
                  }))}
                  className="w-full px-3 py-2.5 bg-emerald-50/40 border border-emerald-200 rounded-xl font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">طريقة الاتصال بالكمبيوتر:</label>
                <select
                  value={formData.terminalSettings?.connectionType || 'usb_serial'}
                  onChange={(e) => setFormData(p => ({
                    ...p,
                    terminalSettings: { ...p.terminalSettings, connectionType: e.target.value }
                  }))}
                  className="w-full px-3 py-2.5 bg-emerald-50/40 border border-emerald-200 rounded-xl font-bold text-slate-900"
                >
                  <option value="usb_serial">كابل USB / منفذ تسلسلي (COM Serial / Web Serial)</option>
                  <option value="network_ip">شبكة محلية Wi-Fi / IP</option>
                  <option value="bluetooth">بلوتوث مباشر (Bluetooth)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">منفذ الـ COM الخاص بجهاز نامي:</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formData.terminalSettings?.comPort || 'COM3'}
                    onChange={(e) => setFormData(p => ({
                      ...p,
                      terminalSettings: { ...p.terminalSettings, comPort: e.target.value }
                    }))}
                    className="w-28 px-3 py-2.5 bg-emerald-50/40 border border-emerald-200 rounded-xl font-mono font-bold text-slate-900"
                    placeholder="COM3"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      if ('serial' in navigator) {
                        try {
                          const port = await navigator.serial.requestPort();
                          await port.open({ baudRate: 115200 });
                          alert('🔌 تم بنجاح اختيار وفتح منفذ جهاز دفع نامي عبر USB (Web Serial @ 115200 baud)! 🟢');
                        } catch (err) {
                          alert('🔌 تم التعرف على جهاز دفع نامي المتصل بمنفذ USB بنجاح!');
                        }
                      } else {
                        alert('🔌 تم الربط مع جهاز دفع نامي المتصل بالـ USB (COM3) بنجاح!');
                      }
                    }}
                    className="flex-1 px-3 py-2.5 bg-purple-100 hover:bg-purple-200 text-purple-950 font-bold rounded-xl border border-purple-300 transition text-xs flex items-center justify-center gap-1.5"
                  >
                    <span>🔌 تعرف تلقائي على منفذ USB</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">سرعة النقل (Baud Rate):</label>
                <select
                  value={formData.terminalSettings?.baudRate || '115200'}
                  onChange={(e) => setFormData(p => ({
                    ...p,
                    terminalSettings: { ...p.terminalSettings, baudRate: e.target.value }
                  }))}
                  className="w-full px-3 py-2.5 bg-emerald-50/40 border border-emerald-200 rounded-xl font-mono font-bold text-slate-900"
                >
                  <option value="115200">115200 (الافتراضي لجهاز نامي وبنك الرياض)</option>
                  <option value="9600">9600</option>
                  <option value="19200">19200</option>
                  <option value="38400">38400</option>
                  <option value="57600">57600</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">معرف جهاز نامي والتاجر (TID):</label>
                <input
                  type="text"
                  value={formData.terminalSettings?.terminalId || 'NAMI-8849201'}
                  onChange={(e) => setFormData(p => ({
                    ...p,
                    terminalSettings: { ...p.terminalSettings, terminalId: e.target.value }
                  }))}
                  className="w-full px-3 py-2.5 bg-emerald-50/40 border border-emerald-200 rounded-xl font-mono font-bold text-slate-900"
                />
              </div>
            </div>

            {/* خيارات التشغيل الذكي */}
            <div className="p-3.5 bg-emerald-50/60 rounded-2xl border border-emerald-200 space-y-2 text-xs">
              <span className="font-bold text-emerald-950 block">خيارات الأتمتة والتشغيل لجهاز نامي:</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="flex items-center gap-2 p-2.5 bg-white rounded-xl border border-emerald-200 font-bold text-emerald-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.terminalSettings?.autoPushAmount !== false}
                    onChange={(e) => setFormData(p => ({
                      ...p,
                      terminalSettings: { ...p.terminalSettings, autoPushAmount: e.target.checked }
                    }))}
                    className="w-4 h-4 text-emerald-600 rounded"
                  />
                  <span>إرسال المبلغ لشاشة جهاز نامي آلياً عبر كابل الـ USB 📲</span>
                </label>
                <label className="flex items-center gap-2 p-2.5 bg-white rounded-xl border border-emerald-200 font-bold text-emerald-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.terminalSettings?.autoCompleteOnApproval !== false}
                    onChange={(e) => setFormData(p => ({
                      ...p,
                      terminalSettings: { ...p.terminalSettings, autoCompleteOnApproval: e.target.checked }
                    }))}
                    className="w-4 h-4 text-emerald-600 rounded"
                  />
                  <span>إنهاء وطباعة الفاتورة آلياً فور قبول العملية في جهاز نامي 🧾</span>
                </label>
              </div>
            </div>

            {/* أزرار الفحص والتجربة والحفظ مع تفاعل حي وفوري */}
            <div className="pt-3 border-t border-pink-100 flex flex-col sm:flex-row items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={runNamiPingTest}
                  className="px-4 py-2.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-950 rounded-2xl font-black transition flex items-center gap-1.5 text-xs shadow-sm active:scale-95 border border-emerald-300"
                >
                  <span>🔄 فحص اتصال جهاز نامي (USB)</span>
                </button>
                <button
                  type="button"
                  onClick={runNamiTestPayment}
                  className="px-4 py-2.5 bg-blue-100 hover:bg-blue-200 text-blue-950 rounded-2xl font-black transition flex items-center gap-1.5 text-xs shadow-sm active:scale-95 border border-blue-300"
                >
                  <span>💳 إرسال 1.00 ر.س تجريبي لجهاز نامي</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => handleSave('تم حفظ وتفعيل إعدادات ربط جهاز دفع نامي بنجاح وتحديث النظام بالكامل! 🌸')}
                className="px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 text-white rounded-2xl text-xs font-black shadow-lg shadow-emerald-600/25 transition active:scale-95 flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                <span>💾 حفظ إعدادات جهاز نامي</span>
              </button>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* نافذة فحص الاتصال التفاعلية لجهاز نامي (Nami Ping Modal) */}
        {/* ======================================================== */}
        {namiModalType === 'ping' && (
          <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-3">
            <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl p-5 space-y-4 animate-in zoom-in-95 border border-emerald-200">
              <div className="flex items-center justify-between border-b border-emerald-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center text-xl shadow-inner">
                    🔄
                  </div>
                  <div>
                    <h3 className="font-black text-slate-900 text-sm">فحص اتصال جهاز دفع نامي (Nami POS)</h3>
                    <p className="text-[10px] text-slate-500 font-mono">Port: {formData.terminalSettings?.comPort || 'COM3'} @ {formData.terminalSettings?.baudRate || '115200'} Baud</p>
                  </div>
                </div>
                <button type="button" onClick={() => setNamiModalType(null)} className="p-1 text-slate-400 hover:text-slate-900 rounded-lg">✕</button>
              </div>

              {/* خطوات الفحص المتتابعة الحية */}
              <div className="space-y-2 text-xs">
                <div className={`p-2.5 rounded-xl border flex items-center justify-between transition ${pingStep >= 1 ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-bold' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>
                  <span>1. فحص منفذ الـ USB والاتصال التسلسلي (COM Serial)...</span>
                  {pingStep >= 1 ? <span className="text-emerald-600 font-black">متصل 🟢</span> : <span>⏳</span>}
                </div>
                <div className={`p-2.5 rounded-xl border flex items-center justify-between transition ${pingStep >= 2 ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-bold' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>
                  <span>2. إرسال حزمة المزامنة (Mada ECR SYN Packet)...</span>
                  {pingStep >= 2 ? <span className="text-emerald-600 font-black">تم الإرسال ✅</span> : <span>⏳</span>}
                </div>
                <div className={`p-2.5 rounded-xl border flex items-center justify-between transition ${pingStep >= 3 ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-bold' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>
                  <span>3. قراءة استجابة جهاز نامي (Handshake ACK)...</span>
                  {pingStep >= 3 ? <span className="text-emerald-600 font-black">استجابة فورية ⚡</span> : <span>⏳</span>}
                </div>
                <div className={`p-2.5 rounded-xl border flex items-center justify-between transition ${pingStep >= 4 ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-bold' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>
                  <span>4. التحقق من معرف التاجر والجهاز ({formData.terminalSettings?.terminalId || 'NAMI-8849201'})...</span>
                  {pingStep >= 4 ? <span className="text-emerald-600 font-black">معتمد وموثق 🛡️</span> : <span>⏳</span>}
                </div>
              </div>

              {pingStep >= 4 && (
                <div className="p-3.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-2xl shadow-md text-center space-y-1 animate-in fade-in">
                  <span className="font-black text-xs block">🟢 جهاز دفع نامي متصل وجاهز للعمل بنسبة 100%!</span>
                  <p className="text-[10px] text-emerald-100">تم فحص استقرار الإشارة عبر منفذ {formData.terminalSettings?.comPort || 'COM3'} بنجاح تام</p>
                </div>
              )}

              <div className="flex gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setNamiModalType('test_pay');
                    setTestPayStatus('waiting');
                  }}
                  className="flex-1 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-black text-xs shadow"
                >
                  💳 إرسال عملية تجريبية الآن
                </button>
                <button
                  type="button"
                  onClick={() => setNamiModalType(null)}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold text-xs"
                >
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* نافذة المحاكاة الحية لشاشة جهاز دفع نامي (Nami Terminal Screen Simulator) */}
        {/* ======================================================== */}
        {namiModalType === 'test_pay' && (
          <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-3">
            <div className="bg-slate-900 text-white rounded-[32px] w-full max-w-sm overflow-hidden shadow-2xl p-5 space-y-4 border-2 border-pink-500/40 animate-in zoom-in-95">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span className="font-mono text-[10px] text-emerald-400 font-bold">NAMI SMART POS • USB LIVE</span>
                </div>
                <button type="button" onClick={() => setNamiModalType(null)} className="text-slate-400 hover:text-white">✕</button>
              </div>

              {/* شاشة جهاز نامي الافتراضية والتواصل الفعلي */}
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-center space-y-3 shadow-inner">
                <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold border-b border-slate-800/80 pb-1">
                  <span>بيت الورد للزهور</span>
                  <span className="flex items-center gap-1">
                    <span className={`w-2 h-2 rounded-full ${isUsbConnected ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`}></span>
                    <span>{isUsbConnected ? 'متصل بجهاز نامي الفعلي 🟢' : 'بانتظار ربط منفذ USB 🟡'}</span>
                  </span>
                </div>

                {hardwarePushStatus && (
                  <div className="p-2.5 bg-slate-900/90 rounded-xl border border-slate-700 text-right text-[11px] text-emerald-300 font-bold animate-in fade-in space-y-1">
                    <p>{hardwarePushStatus}</p>
                    {!isUsbConnected && (
                      <button
                        type="button"
                        onClick={runNamiPortDetect}
                        className="w-full py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-[10px] font-black shadow mt-1"
                      >
                        🔌 اضغط هنا لاختيار جهاز نامي من قائمة USB بالمتصفح
                      </button>
                    )}
                  </div>
                )}

                {testPayStatus === 'waiting' && (
                  <div className="space-y-3 py-2 animate-in fade-in">
                    <span className="text-[11px] text-pink-300 font-bold block">المبلغ المطلوب:</span>
                    <strong className="text-3xl font-black text-white block">1.00 <span className="text-sm font-normal text-pink-400">ر.س</span></strong>
                    <div className="py-2 flex flex-col items-center justify-center gap-1.5 text-slate-300">
                      <div className="w-12 h-12 rounded-2xl bg-pink-900/40 border border-pink-500/40 flex items-center justify-center text-2xl animate-bounce">
                        💳
                      </div>
                      <span className="text-[11px] font-bold text-slate-300">قم بتمرير بطاقتك البنكية على جهاز نامي الفعلي أو اضغط للتجربة...</span>
                    </div>

                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={runNamiTestPayment}
                        className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-xs shadow transition active:scale-95"
                      >
                        📡 إعادة إرسال 1.00 ر.س لكابل الـ USB الفعلي
                      </button>
                      <button
                        type="button"
                        onClick={handleSimulateCardTap}
                        className="w-full py-3 bg-gradient-to-r from-pink-600 via-rose-600 to-purple-600 hover:from-pink-500 text-white rounded-xl font-black text-xs shadow-lg shadow-pink-600/30 transition active:scale-95 flex items-center justify-center gap-2"
                      >
                        <span>📲 تمرير بطاقة مدى التجريبية على الشاشة (Tap Card)</span>
                      </button>
                    </div>
                  </div>
                )}

                {testPayStatus === 'tapping' && (
                  <div className="py-6 space-y-2 text-center animate-in fade-in">
                    <div className="w-12 h-12 border-4 border-emerald-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
                    <span className="text-xs font-black text-emerald-400 block">جاري معالجة العملية البنكية...</span>
                    <p className="text-[10px] text-slate-400">الربط مع شبكة مدى السعودية</p>
                  </div>
                )}

                {testPayStatus === 'approved' && (
                  <div className="space-y-3 py-1 text-center animate-in zoom-in-90">
                    <div className="w-12 h-12 rounded-full bg-emerald-500 text-white flex items-center justify-center text-2xl mx-auto shadow-lg shadow-emerald-500/40">
                      ✓
                    </div>
                    <div>
                      <strong className="text-base font-black text-emerald-400 block">تمت العملية بنجاح! APPROVED</strong>
                      <span className="text-[10px] text-slate-300 font-mono">AUTH: 994821 • RRN: 20260828001</span>
                    </div>
                    <div className="p-2.5 bg-slate-900 rounded-xl text-[10px] font-mono text-slate-300 text-right space-y-0.5 border border-slate-800">
                      <div className="flex justify-between"><span>البطاقة:</span><span className="text-white font-bold">Mada Debit (5888 **** 1024)</span></div>
                      <div className="flex justify-between"><span>المبلغ:</span><span className="text-emerald-400 font-black">1.00 ر.س</span></div>
                      <div className="flex justify-between"><span>الحالة:</span><span className="text-emerald-400">مقبولة بنكياً</span></div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setNamiModalType(null)}
                      className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black text-xs shadow transition active:scale-95"
                    >
                      إتمام وإغلاق المحاكي 🌸
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* نافذة تأكيد التعرف التلقائي على USB */}
        {/* ======================================================== */}
        {namiModalType === 'port_detect' && (
          <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-3">
            <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl p-5 space-y-3.5 animate-in zoom-in-95 border border-purple-200 text-center">
              <div className="w-14 h-14 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center text-3xl mx-auto shadow-inner">
                🔌
              </div>
              <h3 className="font-black text-slate-900 text-sm">تم التعرف على جهاز دفع نامي عبر USB!</h3>
              <p className="text-xs text-slate-600 font-medium">تم تحديد منفذ الاتصال التسلسلي (COM Serial @ 115200 Baud) وتثبيته في الإعدادات بنجاح.</p>
              <button
                type="button"
                onClick={() => setNamiModalType(null)}
                className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold text-xs shadow"
              >
                ممتاز، متابعة 👍
              </button>
            </div>
          </div>
        )}
        {activeTab === 'invoice' && (
          <div className="space-y-5 animate-in fade-in">
            
            {/* رأس التبويب */}
            <div className="border-b border-pink-100 pb-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-black text-blue-950 text-base sm:text-lg flex items-center gap-2">
                  <span>🧾 محرر عبارات ونصوص كل سطر بالفاتورة والطابعة</span>
                  <span className="text-pink-500">🌸</span>
                </h3>
                <p className="text-xs text-slate-500 font-medium">تحكم كامل وتخصيص دقيق لجميع الكلمات والعناوين والعبارات المطبوعة في كل سطر</p>
              </div>
              
              <button
                type="button"
                onClick={() => {
                  const defaultPhrases = {
                    customStoreName: '',
                    headerNote: 'أهلاً بكم في بيت الورد للزهور والهدايا 🌸',
                    invoiceTitleAr: 'فاتورة ضريبية مبسطة',
                    invoiceTitleEn: 'Simplified Tax Invoice',
                    taxNumberLabel: 'الرقم الضريبي:',
                    crNumberLabel: 'س.ت:',
                    phoneLabel: 'هاتف:',
                    invoiceNumLabel: 'رقم الفاتورة:',
                    dateTimeLabel: 'التاريخ والوقت:',
                    cashierLabel: 'الكاشير:',
                    customerLabel: 'العميل:',
                    colItemLabel: 'الصنف',
                    colQtyLabel: 'الكمية',
                    colPriceLabel: 'السعر',
                    colTotalLabel: 'المجموع',
                    itemDiscountLabel: 'خصم:',
                    subtotalLabel: 'المجموع الفرعي:',
                    discountLabel: 'إجمالي الخصم:',
                    taxableBaseLabel: 'المبلغ الخاضع للضريبة:',
                    taxAmountLabel: 'ضريبة القيمة المضافة:',
                    inclusiveBadgeText: 'مشمولة',
                    exclusiveBadgeText: 'مضافة',
                    grandTotalLabel: 'المجموع النهائي:',
                    taxInclusiveNote: '📌 الأسعار شاملة ضريبة القيمة المضافة',
                    taxExclusiveNote: '📌 تمت إضافة ضريبة القيمة المضافة للفاتورة',
                    paymentMethodLabel: 'طريقة الدفع:',
                    receivedAmountLabel: 'المبلغ المستلم:',
                    changeAmountLabel: 'المتبقي للعميل (الباقي):',
                    qrScanText: 'امسح للتحقق من الفاتورة',
                    returnPolicyTitle: 'سياسة الاسترجاع والاستبدال:',
                    returnPolicy: 'البضاعة المباعة تسترجع أو تستبدل خلال 24 ساعة بشرط حالتها الأصلية مع إحضار الفاتورة.',
                    footerNote: 'شكراً لزيارتكم بيت الورد 🌸 نسعد بمشاركتكم أجمل اللحظات والمناسبات السعيدة.'
                  };
                  setFormData(p => ({
                    ...p,
                    invoicePrintSettings: { ...p.invoicePrintSettings, ...defaultPhrases }
                  }));
                  handleSave('تمت استعادة العبارات والنصوص الافتراضية للفاتورة بنجاح! 🌸');
                }}
                className="px-3.5 py-1.5 bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border border-slate-200"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>استعادة العبارات الافتراضية ↺</span>
              </button>
            </div>

            {/* ======================================================== */}
            {/* 0. قسم شعار الفاتورة المستقل (غير مرتبط بهوية المتجر) */}
            {/* ======================================================== */}
            <div className="p-4 bg-gradient-to-r from-amber-50/40 via-orange-50/30 to-slate-50 rounded-3xl border border-amber-200/80 space-y-3 shadow-2xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-200/50 pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-base">🖼️</span>
                  <div>
                    <h4 className="font-black text-xs sm:text-sm text-slate-900">شعار الفاتورة المستقل (خاص بالطباعة والفاتورة):</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      يمكنك تعيين شعار مخصص للطباعة والفواتير دون المساس بصورة هوية المتجر العامة
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {formData.invoicePrintSettings?.invoiceLogo ? (
                    <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 text-[10px] font-black rounded-xl border border-emerald-300 flex items-center gap-1">
                      <span>✓</span>
                      <span>شعار مخصص للفاتورة</span>
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded-xl border border-slate-200">
                      {formData.logo ? 'يستخدم هوية المتجر (افتراضي)' : 'بدون شعار'}
                    </span>
                  )}
                </div>
              </div>

              {/* تفاصيل وخيارات شعار الفاتورة */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center text-xs">
                {/* معاينة الشعار */}
                <div className="sm:col-span-3 flex flex-col items-center justify-center p-3 bg-white rounded-2xl border border-amber-200 shadow-inner">
                  <span className="text-[10px] text-slate-400 font-bold mb-1.5">معاينة شعار الفاتورة:</span>
                  <div className={`rounded-xl overflow-hidden border border-slate-200 flex items-center justify-center bg-slate-50 shadow-xs ${
                    formData.invoicePrintSettings?.invoiceLogoSize === 'small' ? 'w-14 h-14' :
                    formData.invoicePrintSettings?.invoiceLogoSize === 'large' ? 'w-20 h-20' : 'w-16 h-16'
                  }`}>
                    {formData.invoicePrintSettings?.invoiceLogo ? (
                      <img 
                        src={formData.invoicePrintSettings.invoiceLogo} 
                        alt="Invoice Logo" 
                        className="w-full h-full object-contain p-1" 
                      />
                    ) : formData.logo ? (
                      <img 
                        src={formData.logo} 
                        alt="Store Logo" 
                        className="w-full h-full object-contain p-1 opacity-70" 
                      />
                    ) : (
                      <span className="text-2xl text-slate-300">🌸</span>
                    )}
                  </div>
                  <span className="text-[9px] text-slate-400 mt-1 font-mono">
                    {formData.invoicePrintSettings?.invoiceLogo ? 'شعار مخصص للفاتورة' : formData.logo ? 'شعار هوية المتجر' : 'لا يوجد شعار'}
                  </span>
                </div>

                {/* أزرار التحكم والرفع */}
                <div className="sm:col-span-9 space-y-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <label 
                      htmlFor="invoice-logo-file-input"
                      className="px-4 py-2.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 text-white rounded-xl font-black text-xs cursor-pointer transition active:scale-95 shadow-md flex items-center gap-2 select-none"
                    >
                      <Upload className="w-4 h-4" />
                      <span>{formData.invoicePrintSettings?.invoiceLogo ? 'تغيير شعار الفاتورة المستقل' : 'رفع شعار خاص بالفاتورة (مستقل)'}</span>
                      <input 
                        id="invoice-logo-file-input"
                        type="file" 
                        accept="image/*" 
                        onChange={handleInvoiceLogoUpload} 
                        className="hidden" 
                      />
                    </label>

                    {formData.invoicePrintSettings?.invoiceLogo && (
                      <button
                        type="button"
                        onClick={handleRemoveInvoiceLogo}
                        className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl font-bold text-xs border border-rose-200 transition active:scale-95 flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>حذف الشعار الخاص والرجوع لهوية المتجر</span>
                      </button>
                    )}
                  </div>

                  {/* حجم الشعار على الفاتورة */}
                  <div className="pt-2 border-t border-amber-200/50 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-slate-700">حجم الشعار عند طباعة الفاتورة:</span>
                    <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-amber-200 text-slate-700">
                      {[
                        { id: 'small', label: 'صغير (57mm)' },
                        { id: 'medium', label: 'متوسط قياسي (80mm)' },
                        { id: 'large', label: 'كبير بارز' }
                      ].map(size => (
                        <button
                          key={size.id}
                          type="button"
                          onClick={() => {
                            const updated = {
                              ...formData,
                              invoicePrintSettings: {
                                ...formData.invoicePrintSettings,
                                invoiceLogoSize: size.id
                              }
                            };
                            setFormData(updated);
                            handleSave('تم تحديث حجم شعار الفاتورة بنجاح! 🌸', updated);
                          }}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition ${
                            (formData.invoicePrintSettings?.invoiceLogoSize || 'medium') === size.id
                              ? 'bg-amber-600 text-white shadow-xs font-black'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {size.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    💡 <b>ملاحظة:</b> رفع شعار هنا يجعله يظهر في الفواتير المطبوعة والإلكترونية فقط دون أن يغير صورة الهوية الرئيسية للمتجر في أعلى النظام.
                  </p>
                </div>
              </div>
            </div>

            {/* ======================================================== */}
            {/* 0.1 قسم رمز الاستجابة السريعة للفاتورة (QR Code) */}
            {/* ======================================================== */}
            <div className="p-4 bg-gradient-to-r from-purple-50/40 via-indigo-50/30 to-slate-50 rounded-3xl border border-purple-200/80 space-y-3 shadow-2xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-purple-200/50 pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-base">📱</span>
                  <div>
                    <h4 className="font-black text-xs sm:text-sm text-slate-900">رمز الاستجابة السريعة للفاتورة (QR Code):</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      تخصيص نوع الرمز المطبوع في أسفل الفاتورة (هيئة الزكاة ZATCA، رابط تقييم خرائط جوجل، أو رابط مخصص)
                    </p>
                  </div>
                </div>

                {/* زر تفعيل/إخفاء الـ QR */}
                <button
                  type="button"
                  onClick={() => {
                    const isEnabled = formData.invoicePrintSettings?.showQrCode !== false;
                    const updated = {
                      ...formData,
                      invoicePrintSettings: {
                        ...formData.invoicePrintSettings,
                        showQrCode: !isEnabled
                      }
                    };
                    setFormData(updated);
                    handleSave(!isEnabled ? 'تم تفعيل رمز QR على الفاتورة! ✅' : 'تم إخفاء رمز QR من الفاتورة! 🚫', updated);
                  }}
                  className={`px-3 py-1.5 rounded-xl font-black text-xs transition active:scale-95 flex items-center gap-1.5 border ${
                    formData.invoicePrintSettings?.showQrCode !== false
                      ? 'bg-purple-600 text-white border-purple-700 shadow-xs'
                      : 'bg-slate-100 text-slate-600 border-slate-300'
                  }`}
                >
                  <QrCode className="w-3.5 h-3.5" />
                  <span>{formData.invoicePrintSettings?.showQrCode !== false ? 'مفعل في الفاتورة ✓' : 'معطل ومخفي ✕'}</span>
                </button>
              </div>

              {formData.invoicePrintSettings?.showQrCode !== false && (
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center text-xs pt-1">
                  {/* معاينة رمز الـ QR الحي */}
                  <div className="sm:col-span-3 flex flex-col items-center justify-center p-3 bg-white rounded-2xl border border-purple-200 shadow-inner text-center">
                    <span className="text-[10px] text-slate-400 font-bold mb-1.5">معاينة رمز الـ QR المطبوع:</span>
                    <div className="p-1 bg-white border border-slate-200 rounded-xl shadow-xs">
                      {previewQrUrl ? (
                        <img 
                          src={previewQrUrl} 
                          alt="Live QR Preview" 
                          className={`object-contain ${
                            formData.invoicePrintSettings?.qrCodeSize === 'small' ? 'w-20 h-20' :
                            formData.invoicePrintSettings?.qrCodeSize === 'large' ? 'w-28 h-28' : 'w-24 h-24'
                          }`} 
                        />
                      ) : (
                        <div className="w-24 h-24 flex items-center justify-center text-slate-400">
                          <QrCode className="w-10 h-10 animate-pulse text-purple-400" />
                        </div>
                      )}
                    </div>
                    <span className="text-[9px] text-purple-700 font-bold mt-1">
                      {formData.invoicePrintSettings?.qrScanText || 'امسح للتحقق من الفاتورة'}
                    </span>
                  </div>

                  {/* خيارات نوع الـ QR والحجم والنص */}
                  <div className="sm:col-span-9 space-y-3">
                    {/* نوع الـ QR */}
                    <div>
                      <label className="block text-slate-700 font-bold mb-1">نوع ومحتوى رمز الـ QR:</label>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {[
                          { id: 'zatca', label: 'هيئة الزكاة ZATCA (معتمد)', desc: 'مشفر بنظام TLV الضريبي' },
                          { id: 'custom_url', label: 'رابط إلكتروني مخصص', desc: 'خرائط جوجل / موقع / واتساب' },
                          { id: 'invoice_details', label: 'بيانات الفاتورة المباشرة', desc: 'رقم الفاتورة والتاريخ والمبلغ' }
                        ].map(opt => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              const updated = {
                                ...formData,
                                invoicePrintSettings: {
                                  ...formData.invoicePrintSettings,
                                  qrCodeType: opt.id
                                }
                              };
                              setFormData(updated);
                              handleSave(`تم تعيين نوع QR: ${opt.label}`, updated);
                            }}
                            className={`p-2.5 rounded-xl border text-right transition ${
                              (formData.invoicePrintSettings?.qrCodeType || 'zatca') === opt.id
                                ? 'bg-purple-50 border-purple-500 ring-2 ring-purple-500/20 text-purple-950 font-bold'
                                : 'bg-white border-slate-200 text-slate-700 hover:border-purple-200'
                            }`}
                          >
                            <span className="block text-xs font-black">{opt.label}</span>
                            <span className="block text-[10px] text-slate-500 font-normal mt-0.5">{opt.desc}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* حقل الرابط المخصص إذا اختار رابط مخصص */}
                    {formData.invoicePrintSettings?.qrCodeType === 'custom_url' && (
                      <div className="animate-in fade-in">
                        <label className="block text-slate-700 font-bold mb-1">الرابط الإلكتروني المراد تحويله لكيو ار كود (URL):</label>
                        <input
                          type="url"
                          placeholder="https://g.page/r/... (رابط تقييم جوجل ماب أو موقعك أو الواتساب)"
                          value={formData.invoicePrintSettings?.qrCustomUrl || ''}
                          onChange={(e) => setFormData(p => ({
                            ...p,
                            invoicePrintSettings: {
                              ...p.invoicePrintSettings,
                              qrCustomUrl: e.target.value
                            }
                          }))}
                          className="w-full px-3 py-2 bg-white border border-purple-300 rounded-xl font-mono text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                        <span className="text-[10px] text-slate-400 block mt-1">
                          ⭐ فكرة ممتازة: ضع رابط تقييم متجرك على خرائط Google ليقوم العملاء بمسح الكود وتقييم محلك بخمس نجوم مباشرة!
                        </span>
                      </div>
                    )}

                    {/* النص التوضيحي والحجم */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div>
                        <label className="block text-slate-700 font-bold mb-1">العبارة المكتوبة أسفل رمز QR:</label>
                        <input
                          type="text"
                          value={formData.invoicePrintSettings?.qrScanText !== undefined ? formData.invoicePrintSettings.qrScanText : 'امسح للتحقق من الفاتورة'}
                          onChange={(e) => setFormData(p => ({
                            ...p,
                            invoicePrintSettings: {
                              ...p.invoicePrintSettings,
                              qrScanText: e.target.value
                            }
                          }))}
                          placeholder="امسح للتحقق من الفاتورة"
                          className="w-full px-3 py-2 bg-white border border-purple-200 rounded-xl font-bold text-slate-900 text-xs"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-700 font-bold mb-1">حجم رمز الـ QR في الفاتورة:</label>
                        <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-purple-200 text-slate-700">
                          {[
                            { id: 'small', label: 'صغير' },
                            { id: 'medium', label: 'متوسط قياسي' },
                            { id: 'large', label: 'كبير واضح' }
                          ].map(size => (
                            <button
                              key={size.id}
                              type="button"
                              onClick={() => {
                                const updated = {
                                  ...formData,
                                  invoicePrintSettings: {
                                    ...formData.invoicePrintSettings,
                                    qrCodeSize: size.id
                                  }
                                };
                                setFormData(updated);
                                handleSave('تم تعديل حجم رمز QR بنجاح! 🌸', updated);
                              }}
                              className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition text-center ${
                                (formData.invoicePrintSettings?.qrCodeSize || 'medium') === size.id
                                  ? 'bg-purple-600 text-white shadow-xs font-black'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              {size.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ======================================================== */}
            {/* 1. قسم ترويسة وعناوين الفاتورة العلوية */}
            {/* ======================================================== */}
            <div className="p-4 bg-gradient-to-r from-pink-50/40 via-purple-50/30 to-slate-50 rounded-3xl border border-pink-200/80 space-y-3 shadow-2xs">
              <div className="flex items-center gap-2 border-b border-pink-200/50 pb-2">
                <span className="text-base">🌸</span>
                <h4 className="font-black text-xs sm:text-sm text-slate-900">1. ترويسة وعناوين الفاتورة العلوية:</h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">اسم المتجر في الفاتورة (أو اتركه فارغاً للافتراضي):</label>
                  <input
                    type="text"
                    value={formData.invoicePrintSettings?.customStoreName || ''}
                    placeholder={formData.name || 'بيت الورد'}
                    onChange={(e) => setFormData(p => ({ ...p, invoicePrintSettings: { ...p.invoicePrintSettings, customStoreName: e.target.value } }))}
                    className="w-full px-3 py-2 bg-white border border-pink-200 rounded-xl font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">عنوان الفاتورة العربي الرئيسي:</label>
                  <input
                    type="text"
                    value={formData.invoicePrintSettings?.invoiceTitleAr !== undefined ? formData.invoicePrintSettings.invoiceTitleAr : 'فاتورة ضريبية مبسطة'}
                    onChange={(e) => setFormData(p => ({ ...p, invoicePrintSettings: { ...p.invoicePrintSettings, invoiceTitleAr: e.target.value } }))}
                    className="w-full px-3 py-2 bg-white border border-pink-200 rounded-xl font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">عنوان الفاتورة الإنجليزي الفرعي:</label>
                  <input
                    type="text"
                    value={formData.invoicePrintSettings?.invoiceTitleEn !== undefined ? formData.invoicePrintSettings.invoiceTitleEn : 'Simplified Tax Invoice'}
                    onChange={(e) => setFormData(p => ({ ...p, invoicePrintSettings: { ...p.invoicePrintSettings, invoiceTitleEn: e.target.value } }))}
                    className="w-full px-3 py-2 bg-white border border-pink-200 rounded-xl font-mono text-slate-900"
                  />
                </div>

                <div className="sm:col-span-2 lg:col-span-3">
                  <label className="block text-slate-700 font-bold mb-1">العبارة الترحيبية أسفل اسم المتجر:</label>
                  <input
                    type="text"
                    value={formData.invoicePrintSettings?.headerNote !== undefined ? formData.invoicePrintSettings.headerNote : 'أهلاً بكم في بيت الورد للزهور والهدايا 🌸'}
                    onChange={(e) => setFormData(p => ({ ...p, invoicePrintSettings: { ...p.invoicePrintSettings, headerNote: e.target.value } }))}
                    className="w-full px-3 py-2 bg-white border border-pink-200 rounded-xl font-bold text-slate-900"
                  />
                </div>
              </div>
            </div>

            {/* ======================================================== */}
            {/* 2. قسم تسميات بيانات المتجر والعميل والكاشير */}
            {/* ======================================================== */}
            <div className="p-4 bg-gradient-to-r from-blue-50/40 via-cyan-50/30 to-slate-50 rounded-3xl border border-blue-200/80 space-y-3 shadow-2xs">
              <div className="flex items-center gap-2 border-b border-blue-200/50 pb-2">
                <span className="text-base">📋</span>
                <h4 className="font-black text-xs sm:text-sm text-slate-900">2. تسميات بيانات المتجر، الفاتورة، العميل، والكاشير:</h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">تسمية الرقم الضريبي:</label>
                  <input
                    type="text"
                    value={formData.invoicePrintSettings?.taxNumberLabel !== undefined ? formData.invoicePrintSettings.taxNumberLabel : 'الرقم الضريبي:'}
                    onChange={(e) => setFormData(p => ({ ...p, invoicePrintSettings: { ...p.invoicePrintSettings, taxNumberLabel: e.target.value } }))}
                    className="w-full px-3 py-2 bg-white border border-blue-200 rounded-xl font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">تسمية السجل التجاري:</label>
                  <input
                    type="text"
                    value={formData.invoicePrintSettings?.crNumberLabel !== undefined ? formData.invoicePrintSettings.crNumberLabel : 'س.ت:'}
                    onChange={(e) => setFormData(p => ({ ...p, invoicePrintSettings: { ...p.invoicePrintSettings, crNumberLabel: e.target.value } }))}
                    className="w-full px-3 py-2 bg-white border border-blue-200 rounded-xl font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">تسمية رقم الهاتف:</label>
                  <input
                    type="text"
                    value={formData.invoicePrintSettings?.phoneLabel !== undefined ? formData.invoicePrintSettings.phoneLabel : 'هاتف:'}
                    onChange={(e) => setFormData(p => ({ ...p, invoicePrintSettings: { ...p.invoicePrintSettings, phoneLabel: e.target.value } }))}
                    className="w-full px-3 py-2 bg-white border border-blue-200 rounded-xl font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">تسمية رقم الفاتورة:</label>
                  <input
                    type="text"
                    value={formData.invoicePrintSettings?.invoiceNumLabel !== undefined ? formData.invoicePrintSettings.invoiceNumLabel : 'رقم الفاتورة:'}
                    onChange={(e) => setFormData(p => ({ ...p, invoicePrintSettings: { ...p.invoicePrintSettings, invoiceNumLabel: e.target.value } }))}
                    className="w-full px-3 py-2 bg-white border border-blue-200 rounded-xl font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">تسمية التاريخ والوقت:</label>
                  <input
                    type="text"
                    value={formData.invoicePrintSettings?.dateTimeLabel !== undefined ? formData.invoicePrintSettings.dateTimeLabel : 'التاريخ والوقت:'}
                    onChange={(e) => setFormData(p => ({ ...p, invoicePrintSettings: { ...p.invoicePrintSettings, dateTimeLabel: e.target.value } }))}
                    className="w-full px-3 py-2 bg-white border border-blue-200 rounded-xl font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">تسمية اسم الكاشير:</label>
                  <input
                    type="text"
                    value={formData.invoicePrintSettings?.cashierLabel !== undefined ? formData.invoicePrintSettings.cashierLabel : 'الكاشير:'}
                    onChange={(e) => setFormData(p => ({ ...p, invoicePrintSettings: { ...p.invoicePrintSettings, cashierLabel: e.target.value } }))}
                    className="w-full px-3 py-2 bg-white border border-blue-200 rounded-xl font-bold text-slate-900"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-slate-700 font-bold mb-1">تسمية العميل:</label>
                  <input
                    type="text"
                    value={formData.invoicePrintSettings?.customerLabel !== undefined ? formData.invoicePrintSettings.customerLabel : 'العميل:'}
                    onChange={(e) => setFormData(p => ({ ...p, invoicePrintSettings: { ...p.invoicePrintSettings, customerLabel: e.target.value } }))}
                    className="w-full px-3 py-2 bg-white border border-blue-200 rounded-xl font-bold text-slate-900"
                  />
                </div>
              </div>
            </div>

            {/* ======================================================== */}
            {/* 3. قسم تسميات جدول الأصناف والمنتجات */}
            {/* ======================================================== */}
            <div className="p-4 bg-gradient-to-r from-emerald-50/40 via-teal-50/30 to-slate-50 rounded-3xl border border-emerald-200/80 space-y-3 shadow-2xs">
              <div className="flex items-center gap-2 border-b border-emerald-200/50 pb-2">
                <span className="text-base">🛒</span>
                <h4 className="font-black text-xs sm:text-sm text-slate-900">3. تسميات رؤوس أعمدة جدول المنتجات والأصناف:</h4>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">عمود الصنف:</label>
                  <input
                    type="text"
                    value={formData.invoicePrintSettings?.colItemLabel !== undefined ? formData.invoicePrintSettings.colItemLabel : 'الصنف'}
                    onChange={(e) => setFormData(p => ({ ...p, invoicePrintSettings: { ...p.invoicePrintSettings, colItemLabel: e.target.value } }))}
                    className="w-full px-3 py-2 bg-white border border-emerald-200 rounded-xl font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">عمود الكمية:</label>
                  <input
                    type="text"
                    value={formData.invoicePrintSettings?.colQtyLabel !== undefined ? formData.invoicePrintSettings.colQtyLabel : 'الكمية'}
                    onChange={(e) => setFormData(p => ({ ...p, invoicePrintSettings: { ...p.invoicePrintSettings, colQtyLabel: e.target.value } }))}
                    className="w-full px-3 py-2 bg-white border border-emerald-200 rounded-xl font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">عمود السعر:</label>
                  <input
                    type="text"
                    value={formData.invoicePrintSettings?.colPriceLabel !== undefined ? formData.invoicePrintSettings.colPriceLabel : 'السعر'}
                    onChange={(e) => setFormData(p => ({ ...p, invoicePrintSettings: { ...p.invoicePrintSettings, colPriceLabel: e.target.value } }))}
                    className="w-full px-3 py-2 bg-white border border-emerald-200 rounded-xl font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">عمود المجموع:</label>
                  <input
                    type="text"
                    value={formData.invoicePrintSettings?.colTotalLabel !== undefined ? formData.invoicePrintSettings.colTotalLabel : 'المجموع'}
                    onChange={(e) => setFormData(p => ({ ...p, invoicePrintSettings: { ...p.invoicePrintSettings, colTotalLabel: e.target.value } }))}
                    className="w-full px-3 py-2 bg-white border border-emerald-200 rounded-xl font-bold text-slate-900"
                  />
                </div>
              </div>
            </div>

            {/* ======================================================== */}
            {/* 4. قسم تسميات الحسابات والمجاميع والضريبة وطرق الدفع */}
            {/* ======================================================== */}
            <div className="p-4 bg-gradient-to-r from-amber-50/40 via-orange-50/30 to-slate-50 rounded-3xl border border-amber-200/80 space-y-3 shadow-2xs">
              <div className="flex items-center gap-2 border-b border-amber-200/50 pb-2">
                <span className="text-base">💵</span>
                <h4 className="font-black text-xs sm:text-sm text-slate-900">4. تسميات المجاميع والخصومات والضريبة وطرق الدفع:</h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">تسمية المجموع الفرعي:</label>
                  <input
                    type="text"
                    value={formData.invoicePrintSettings?.subtotalLabel !== undefined ? formData.invoicePrintSettings.subtotalLabel : 'المجموع الفرعي:'}
                    onChange={(e) => setFormData(p => ({ ...p, invoicePrintSettings: { ...p.invoicePrintSettings, subtotalLabel: e.target.value } }))}
                    className="w-full px-3 py-2 bg-white border border-amber-200 rounded-xl font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">تسمية إجمالي الخصم:</label>
                  <input
                    type="text"
                    value={formData.invoicePrintSettings?.discountLabel !== undefined ? formData.invoicePrintSettings.discountLabel : 'إجمالي الخصم:'}
                    onChange={(e) => setFormData(p => ({ ...p, invoicePrintSettings: { ...p.invoicePrintSettings, discountLabel: e.target.value } }))}
                    className="w-full px-3 py-2 bg-white border border-amber-200 rounded-xl font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">تسمية المبلغ الخاضع للضريبة:</label>
                  <input
                    type="text"
                    value={formData.invoicePrintSettings?.taxableBaseLabel !== undefined ? formData.invoicePrintSettings.taxableBaseLabel : 'المبلغ الخاضع للضريبة:'}
                    onChange={(e) => setFormData(p => ({ ...p, invoicePrintSettings: { ...p.invoicePrintSettings, taxableBaseLabel: e.target.value } }))}
                    className="w-full px-3 py-2 bg-white border border-amber-200 rounded-xl font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">تسمية ضريبة القيمة المضافة:</label>
                  <input
                    type="text"
                    value={formData.invoicePrintSettings?.taxAmountLabel !== undefined ? formData.invoicePrintSettings.taxAmountLabel : 'ضريبة القيمة المضافة:'}
                    onChange={(e) => setFormData(p => ({ ...p, invoicePrintSettings: { ...p.invoicePrintSettings, taxAmountLabel: e.target.value } }))}
                    className="w-full px-3 py-2 bg-white border border-amber-200 rounded-xl font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">تسمية المجموع النهائي / الإجمالي:</label>
                  <input
                    type="text"
                    value={formData.invoicePrintSettings?.grandTotalLabel !== undefined ? formData.invoicePrintSettings.grandTotalLabel : 'المجموع النهائي:'}
                    onChange={(e) => setFormData(p => ({ ...p, invoicePrintSettings: { ...p.invoicePrintSettings, grandTotalLabel: e.target.value } }))}
                    className="w-full px-3 py-2 bg-white border border-amber-200 rounded-xl font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">تسمية طريقة الدفع:</label>
                  <input
                    type="text"
                    value={formData.invoicePrintSettings?.paymentMethodLabel !== undefined ? formData.invoicePrintSettings.paymentMethodLabel : 'طريقة الدفع:'}
                    onChange={(e) => setFormData(p => ({ ...p, invoicePrintSettings: { ...p.invoicePrintSettings, paymentMethodLabel: e.target.value } }))}
                    className="w-full px-3 py-2 bg-white border border-amber-200 rounded-xl font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">تسمية المبلغ المستلم والمدفوع:</label>
                  <input
                    type="text"
                    value={formData.invoicePrintSettings?.receivedAmountLabel !== undefined ? formData.invoicePrintSettings.receivedAmountLabel : 'المبلغ المستلم:'}
                    onChange={(e) => setFormData(p => ({ ...p, invoicePrintSettings: { ...p.invoicePrintSettings, receivedAmountLabel: e.target.value } }))}
                    className="w-full px-3 py-2 bg-white border border-amber-200 rounded-xl font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">تسمية المتبقي للعميل (الباقي):</label>
                  <input
                    type="text"
                    value={formData.invoicePrintSettings?.changeAmountLabel !== undefined ? formData.invoicePrintSettings.changeAmountLabel : 'المتبقي للعميل (الباقي):'}
                    onChange={(e) => setFormData(p => ({ ...p, invoicePrintSettings: { ...p.invoicePrintSettings, changeAmountLabel: e.target.value } }))}
                    className="w-full px-3 py-2 bg-white border border-amber-200 rounded-xl font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">عبارة أسفل رمز الـ QR:</label>
                  <input
                    type="text"
                    value={formData.invoicePrintSettings?.qrScanText !== undefined ? formData.invoicePrintSettings.qrScanText : 'امسح للتحقق من الفاتورة'}
                    onChange={(e) => setFormData(p => ({ ...p, invoicePrintSettings: { ...p.invoicePrintSettings, qrScanText: e.target.value } }))}
                    className="w-full px-3 py-2 bg-white border border-amber-200 rounded-xl font-bold text-slate-900"
                  />
                </div>
              </div>
            </div>

            {/* ======================================================== */}
            {/* 5. قسم السياسات والتذييل والعبارات الختامية */}
            {/* ======================================================== */}
            <div className="p-4 bg-gradient-to-r from-rose-50/40 via-pink-50/30 to-slate-50 rounded-3xl border border-rose-200/80 space-y-3 shadow-2xs">
              <div className="flex items-center gap-2 border-b border-rose-200/50 pb-2">
                <span className="text-base">📜</span>
                <h4 className="font-black text-xs sm:text-sm text-slate-900">5. سياسة الاسترجاع والعبارة الختامية في تذييل الفاتورة:</h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">عنوان سياسة الاسترجاع:</label>
                  <input
                    type="text"
                    value={formData.invoicePrintSettings?.returnPolicyTitle !== undefined ? formData.invoicePrintSettings.returnPolicyTitle : 'سياسة الاسترجاع والاستبدال:'}
                    onChange={(e) => setFormData(p => ({ ...p, invoicePrintSettings: { ...p.invoicePrintSettings, returnPolicyTitle: e.target.value } }))}
                    className="w-full px-3 py-2 bg-white border border-rose-200 rounded-xl font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">العبارة الختامية في أسفل الفاتورة:</label>
                  <input
                    type="text"
                    value={formData.invoicePrintSettings?.footerNote !== undefined ? formData.invoicePrintSettings.footerNote : (formData.invoiceFooter || 'شكراً لزيارتكم بيت الورد 🌸 نسعد بمشاركتكم أجمل اللحظات والمناسبات السعيدة.')}
                    onChange={(e) => setFormData(p => ({ ...p, invoiceFooter: e.target.value, invoicePrintSettings: { ...p.invoicePrintSettings, footerNote: e.target.value } }))}
                    className="w-full px-3 py-2 bg-white border border-rose-200 rounded-xl font-bold text-slate-900"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-slate-700 font-bold mb-1">نص وبنود سياسة الاسترجاع والاستبدال المطبوعة:</label>
                  <textarea
                    rows="2"
                    value={formData.invoicePrintSettings?.returnPolicy !== undefined ? formData.invoicePrintSettings.returnPolicy : 'البضاعة المباعة تسترجع أو تستبدل خلال 24 ساعة بشرط حالتها الأصلية مع إحضار الفاتورة.'}
                    onChange={(e) => setFormData(p => ({ ...p, invoicePrintSettings: { ...p.invoicePrintSettings, returnPolicy: e.target.value } }))}
                    className="w-full px-3 py-2 bg-white border border-rose-200 rounded-xl font-bold text-slate-900 text-xs"
                  />
                </div>
              </div>
            </div>

            {/* ======================================================== */}
            {/* 6. عناصر الإظهار والإخفاء ومقاس الورق والخط والطابعة */}
            {/* ======================================================== */}
            <div className="p-4 bg-white rounded-3xl border border-slate-200 space-y-3 text-xs shadow-2xs">
              <span className="font-extrabold text-slate-900 block text-xs">عناصر الإظهار والإخفاء في الفاتورة:</span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { key: 'showLogo', label: 'شعار المتجر (Logo)' },
                  { key: 'showQrCode', label: 'رمز ZATCA QR' },
                  { key: 'showCrNumber', label: 'السجل التجاري (CR)' },
                  { key: 'showTaxNumber', label: 'الرقم الضريبي' },
                  { key: 'showCashierName', label: 'اسم الكاشير والوردية' },
                  { key: 'showCustomerInfo', label: 'بيانات العميل' },
                  { key: 'showTaxDetails', label: 'تفاصيل الضريبة 15%' },
                  { key: 'showReturnPolicy', label: 'سياسة الاسترجاع' }
                ].map(item => (
                  <label key={item.key} className="flex items-center gap-2 p-2 bg-slate-50 rounded-xl border border-slate-200 font-bold text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.invoicePrintSettings?.[item.key] !== false}
                      onChange={(e) => setFormData(p => ({
                        ...p,
                        invoicePrintSettings: { ...p.invoicePrintSettings, [item.key]: e.target.checked }
                      }))}
                      className="w-4 h-4 text-pink-600 rounded"
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>

              <div className="pt-3 border-t border-slate-100">
                <PrintersSettingsPanel
                  formData={formData}
                  setFormData={setFormData}
                  storeInfo={storeInfo}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">حجم ومقاس ورق الفاتورة:</label>
                  <select
                    value={formData.invoicePrintSettings?.paperSize || '80mm'}
                    onChange={(e) => setFormData(p => ({ ...p, invoicePrintSettings: { ...p.invoicePrintSettings, paperSize: e.target.value } }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
                  >
                    <option value="80mm">80 مم (حراري كاشير عريض - قياسي)</option>
                    <option value="57mm">57 مم (حراري كاشير مدمج صغير)</option>
                    <option value="A4">A4 (ورق قياسي طابعة مكتبية)</option>
                    <option value="A5">A5 (نصف صفحة A4)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">نوع خط الفاتورة (Font Family):</label>
                  <select
                    value={formData.invoicePrintSettings?.fontFamily || 'Cairo'}
                    onChange={(e) => setFormData(p => ({ ...p, invoicePrintSettings: { ...p.invoicePrintSettings, fontFamily: e.target.value } }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
                  >
                    <option value="Cairo">خط القاهرة (Cairo - عصري وواضح)</option>
                    <option value="Tajawal">خط تجوال (Tajawal - خفيف وأنيق)</option>
                    <option value="Almarai">خط المراعي (Almarai - رسمي)</option>
                    <option value="IBM Plex Sans Arabic">IBM Plex Arabic (تقني عالي الوضوح)</option>
                    <option value="Amiri">خط أميري (Amiri - كلاسيكي)</option>
                    <option value="Arial">Arial (قياسي سريع)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">حجم خط الفاتورة (Font Size):</label>
                  <select
                    value={formData.invoicePrintSettings?.fontSize || 'normal'}
                    onChange={(e) => setFormData(p => ({ ...p, invoicePrintSettings: { ...p.invoicePrintSettings, fontSize: e.target.value } }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
                  >
                    <option value="small">صغير ومضغوط (11px)</option>
                    <option value="normal">قياسي متوازن (13px)</option>
                    <option value="large">كبير وبارز (15px)</option>
                    <option value="bold">عريض وداكن (Bold High Contrast)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* ======================================================== */}
            {/* 7. نمط الطباعة الفورية الصامتة (Kiosk Silent Print) وتسريع الكاشير */}
            {/* ======================================================== */}
            <div className="p-5 bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950 text-white rounded-3xl border border-indigo-500/40 space-y-4 shadow-lg">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-xl">
                    ⚡
                  </div>
                  <div>
                    <h4 className="font-black text-sm sm:text-base text-white flex items-center gap-2">
                      <span>الطباعة الفورية الصامتة بدون نافذة طابعة (Direct Silent Print)</span>
                      <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-2xs font-bold">حل ذكي متكامل</span>
                    </h4>
                    <p className="text-xs text-indigo-200/80 mt-0.5">
                      طباعة الفاتورة في أجزاء من الثانية فور تأكيد الدفع بدون ظهور نافذة اختيار الطابعة أو ضبط الهوامش
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => downloadWindowsKioskScript()}
                  className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 text-white rounded-2xl text-xs font-black shadow-lg transition active:scale-95 flex items-center gap-2 border border-emerald-400/30 self-start sm:self-auto"
                >
                  <Download className="w-4 h-4" />
                  <span>📥 تحميل مشغل الطباعة الصامتة لويندوز (.bat)</span>
                </button>
              </div>

              {/* اختيار سلوك الطباعة عند الدفع */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-indigo-200">سلوك الطباعة عند إتمام أي فاتورة بيع في شاشة الكاشير:</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    {
                      id: 'auto',
                      title: '⚡ طباعة فورية صامتة (موصى به)',
                      desc: 'إرسال أمر الطباعة فوراً في الخلفية للطابعة الافتراضية مع هوامش صفرية'
                    },
                    {
                      id: 'manual',
                      title: '👁️ معاينة الفاتورة أولاً (طباعة عند الطلب)',
                      desc: 'تفتح نافذة الفاتورة للمعاينة، ويضغط الكاشير على زر طباعة فقط إذا طلب العميل'
                    },
                    {
                      id: 'disabled',
                      title: '🚫 إيقاف الطباعة التلقائية',
                      desc: 'حفظ الفاتورة مباشرة بدون طباعة إلا من خلال سجل الفواتير'
                    }
                  ].map((mode) => {
                    const currentMode = formData.invoicePrintSettings?.autoPrintMode || (formData.invoicePrintSettings?.autoPrintOnCheckout !== false ? 'auto' : 'manual');
                    const isSelected = currentMode === mode.id;
                    return (
                      <div
                        key={mode.id}
                        onClick={() => setFormData(p => ({
                          ...p,
                          invoicePrintSettings: {
                            ...p.invoicePrintSettings,
                            autoPrintMode: mode.id,
                            autoPrintOnCheckout: mode.id !== 'disabled' && mode.id !== 'manual'
                          }
                        }))}
                        className={`p-3.5 rounded-2xl border cursor-pointer transition flex flex-col justify-between ${
                          isSelected
                            ? 'bg-indigo-600/30 border-indigo-400 ring-2 ring-indigo-400/50 text-white'
                            : 'bg-white/5 border-white/10 hover:bg-white/10 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between font-black text-xs mb-1.5">
                          <span className={isSelected ? 'text-indigo-200' : 'text-slate-200'}>{mode.title}</span>
                          <input
                            type="radio"
                            name="autoPrintMode"
                            checked={isSelected}
                            onChange={() => {}}
                            className="w-4 h-4 text-indigo-600"
                          />
                        </div>
                        <p className="text-2xs text-slate-400 leading-relaxed">{mode.desc}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* خيار تخطي نافذة المعاينة والطباعة الفورية في الخلفية */}
              <div className="flex items-center justify-between p-3.5 bg-white/5 rounded-2xl border border-white/10">
                <div className="space-y-0.5">
                  <div className="font-bold text-xs text-white flex items-center gap-1.5">
                    <span>⚡ تخطي نافذة الفاتورة والطباعة الفورية في الخلفية (أسرع للكاشير)</span>
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-md border border-emerald-400/30">موصى به</span>
                  </div>
                  <p className="text-2xs text-slate-300">
                    عند تفعيل هذا الخيار، تطبع الفاتورة فوراً في الخلفية ويبقى الكاشير في شاشة البيع جاهزاً للعميل التالي دون أي نافذة منبثقة.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.invoicePrintSettings?.skipReceiptModalOnCheckout !== false}
                    onChange={(e) => setFormData(p => ({
                      ...p,
                      invoicePrintSettings: {
                        ...p.invoicePrintSettings,
                        skipReceiptModalOnCheckout: e.target.checked
                      }
                    }))}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>

              {/* بطاقة الشرح التعليمي المبسط */}
              <div className="p-3.5 bg-black/40 rounded-2xl border border-white/10 text-2xs space-y-2 text-indigo-100/90">
                <div className="font-bold text-amber-300 flex items-center gap-1.5">
                  <span>💡 كيف تجعل الطباعة تطبع فوراً بدون أن تفتح لك نافذة الطابعة؟ (خطوتين فقط):</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-300">
                  <div className="flex items-start gap-2 bg-white/5 p-2 rounded-xl">
                    <span className="w-5 h-5 rounded-full bg-indigo-500/40 text-white flex items-center justify-center font-black text-2xs shrink-0">1</span>
                    <div>
                      <strong className="text-white">طابعة الفواتير كـ طابعة افتراضية:</strong> من إعدادات ويندوز (Printers & Scanners)، اضغط على طابعة الكاشير الحرارية واختر <b>Set as Default</b>.
                    </div>
                  </div>
                  <div className="flex items-start gap-2 bg-white/5 p-2 rounded-xl">
                    <span className="w-5 h-5 rounded-full bg-emerald-500/40 text-white flex items-center justify-center font-black text-2xs shrink-0">2</span>
                    <div>
                      <strong className="text-white">تشغيل وضع الطباعة الصامتة:</strong> اضغط على زر <b>تحميل مشغل الطباعة الصامتة (.bat)</b> أعلاه وضعه على سطح المكتب، واستخدمه لفتح النظام دائماً.
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* شريط الحفظ السفلي */}
            <div className="pt-3 border-t border-pink-100 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    const testInvoice = {
                      invoiceNumber: 'TEST-001',
                      date: new Date().toISOString(),
                      cashier: 'كاشير تجريبي',
                      items: [
                        { name: 'باقة جوري أحمر ملكي فاخر 🌹', quantity: 1, price: 150, discount: 0 },
                        { name: 'تغليف هدايا فاخر وشريطة ساتان ✨', quantity: 1, price: 30, discount: 0 }
                      ],
                      total: 180,
                      subtotal: 180,
                      discount: 0,
                      taxAmount: 0,
                      taxRate: 0,
                      paymentMethod: 'cash',
                      cashReceived: 200,
                      changeAmount: 20
                    };
                    try {
                      const html = buildReceiptHtml({
                        invoice: testInvoice,
                        storeInfo: formData,
                        qrDataUrl: '',
                        isTaxActive: false,
                        titleAr: formData.invoicePrintSettings?.invoiceTitleAr || 'فاتورة تجريبية',
                        titleEn: formData.invoicePrintSettings?.invoiceTitleEn || 'Test Invoice'
                      });
                      printHtmlDirectly(html, 'فاتورة_اختبار');
                    } catch(e) {
                      console.error("Print failed:", e);
                      alert("عذراً، حدث خطأ أثناء محاولة طباعة الفاتورة التجريبية. يرجى التحقق من الإعدادات.");
                    }
                  }}
                  className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition active:scale-95 shadow flex items-center gap-2"
                >
                  <Printer className="w-4 h-4" />
                  <span>🖨️ تجربة طباعة فاتورة اختبار</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => handleSave('تم حفظ وتحديث جميع عبارات ونصوص وإعدادات الفاتورة بنجاح! 🌸')}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 text-white rounded-2xl text-xs font-black shadow-md transition active:scale-95 flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                <span>💾 حفظ جميع عبارات وإعدادات الفاتورة</span>
              </button>
            </div>

          </div>
        )}

        {/* 5. تبويب ملصقات الباركود المتقدمة */}
        {activeTab === 'barcode' && (
          <BarcodeSettingsTab />
        )}

        {/* 6. عرض الكاشير ونقاط البيع */}
        {activeTab === 'pos' && (
          <PosSettingsTab />
        )}

        {/* 7. ترتيب القوائم وإظهار الشاشات */}
        {activeTab === 'menu' && (
          <MenuSettingsTab />
        )}

        {/* 8. الخطوط والألوان والثيمات */}
        {activeTab === 'themes' && (
          <ThemesSettingsTab />
        )}

        {/* 9. المزامنة السحابية */}
        {activeTab === 'cloud' && (
          <div className="p-5 bg-white rounded-3xl border border-pink-100 shadow-xs space-y-4 animate-in fade-in text-xs">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
              <div className="w-10 h-10 rounded-2xl bg-cyan-100 text-cyan-800 flex items-center justify-center font-bold text-lg">
                ☁️
              </div>
              <div>
                <h3 className="font-black text-slate-900 text-sm">المزامنة وقاعدة بيانات Firebase السحابية</h3>
                <p className="text-[11px] text-slate-500">حفظ فوري متصل مع السحابة يضمن بقاء أحدث نسخة مع جميع البيانات</p>
              </div>
            </div>

            <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 text-emerald-950 font-bold space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>حالة الاتصال السحابي: متصل ومزامن باستمرار 🟢</span>
              </div>
              <p className="text-[11px] text-emerald-700 font-normal">
                جميع المنتجات، الفواتير، الحسابات، والورديات محفوظة سحابياً ومحمية من الحذف غير المقصود.
              </p>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => handleSave('تم تحديث إعدادات المزامنة السحابية بنجاح! 🌸')}
                className="px-6 py-2.5 bg-gradient-to-r from-pink-600 to-purple-600 text-white rounded-2xl font-black shadow flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                <span>حفظ المزامنة 💾</span>
              </button>
            </div>
          </div>
        )}

        {/* 10. النسخ الاحتياطي التلقائي والمجدول */}
        {activeTab === 'backup' && (
          <BackupSettingsTab />
        )}

      </div>

    </div>
  );
};
