import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import html2canvas from 'html2canvas';
import { useApp } from '../../context/AppContext';
import { 
  X, 
  Printer, 
  CheckCircle, 
  PlusCircle,
  MessageSquare,
  Mail,
  Image as ImageIcon,
  FileDown
} from 'lucide-react';
import { formatMoney, formatDate, buildInvoiceWhatsAppMessage, getWhatsAppUrls, getEmailUrl, generateZatcaTLV, resolveUserName, resolvePaymentMethodName } from '../../utils/helpers';
import { shareDocument, getPreferredShareFormat } from '../../utils/shareHelper';
import { checkUserPermission } from '../../utils/permissions';
import { buildReceiptHtml, printHtmlDirectly } from '../../utils/printHelper';

export const ReceiptModal = ({ isOpen, onClose, invoice, onNewSale }) => {
  const { storeInfo, users, customers, currentUser } = useApp();
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [isExportingImage, setIsExportingImage] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const hasAutoPrintedRef = useRef(false);
  const receiptRef = useRef(null);

  const printSettings = storeInfo?.invoicePrintSettings || {};
  
  // تحديد شعار الفاتورة المستقل (الأولوية لشعار الفاتورة المخصص ثم هوية المتجر)
  const effectiveInvoiceLogo = printSettings.invoiceLogo || storeInfo?.logo;
  const logoSizeClass = printSettings.invoiceLogoSize === 'small' 
    ? 'w-12 h-12' 
    : printSettings.invoiceLogoSize === 'large' 
      ? 'w-20 h-20' 
      : 'w-16 h-16';

  // فحص صارم وموثوق: هل المتجر والفاتورة خاضعان للضريبة بالفعل؟
  const isTaxActive = Boolean(
    storeInfo?.taxEnabled === true && 
    Number(storeInfo?.taxRate || 0) > 0 && 
    Number(invoice?.taxRate || 0) > 0 && 
    Number(invoice?.taxAmount || 0) > 0
  );

  // تحديد عناوين الفاتورة: إذا كان معفى/غير مشمول بالضريبة تسمى "فاتورة مبيعات" حتماً
  const titleAr = isTaxActive 
    ? (printSettings.invoiceTitleAr || 'فاتورة ضريبية مبسطة')
    : (printSettings.invoiceTitleAr && printSettings.invoiceTitleAr !== 'فاتورة ضريبية مبسطة' ? printSettings.invoiceTitleAr : 'فاتورة مبيعات');

  const titleEn = isTaxActive 
    ? (printSettings.invoiceTitleEn || 'Simplified Tax Invoice')
    : (printSettings.invoiceTitleEn && printSettings.invoiceTitleEn !== 'Simplified Tax Invoice' ? printSettings.invoiceTitleEn : 'Sales Invoice');

  // توليد رمز الاستجابة السريعة QR
  useEffect(() => {
    if (!invoice || printSettings.showQrCode === false) {
      setQrDataUrl('');
      return;
    }

    let qrPayload = '';
    const qrType = printSettings.qrCodeType || 'zatca';

    if (qrType === 'custom_url' && printSettings.qrCustomUrl) {
      qrPayload = printSettings.qrCustomUrl;
    } else if (qrType === 'invoice_details') {
      qrPayload = `فاتورة: #${invoice.invoiceNumber}\nالمتجر: ${storeInfo?.name || 'بيت الورد'}\nالتاريخ: ${formatDate(invoice.date)}\nالمبلغ: ${(Number(invoice.total) || 0).toFixed(2)} ${storeInfo?.currency || 'ر.س'}`;
    } else if (isTaxActive && storeInfo?.taxNumber) {
      qrPayload = generateZatcaTLV(
        storeInfo.name || 'Store',
        storeInfo.taxNumber,
        invoice.date || new Date().toISOString(),
        invoice.total || 0,
        invoice.taxAmount || 0
      );
    } else {
      qrPayload = `${storeInfo?.name || 'Store'}|${invoice.invoiceNumber}|${invoice.date}|${(Number(invoice.total) || 0).toFixed(2)}`;
    }

    const qrWidth = printSettings.qrCodeSize === 'large' ? 220 : printSettings.qrCodeSize === 'small' ? 140 : 180;

    QRCode.toDataURL(qrPayload, {
      width: qrWidth,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' }
    })
      .then(url => setQrDataUrl(url))
      .catch(err => console.error('QR Gen Error:', err));
  }, [invoice, storeInfo, isTaxActive, printSettings.showQrCode, printSettings.qrCodeType, printSettings.qrCustomUrl, printSettings.qrCodeSize]);

  // طباعة حرارية فائقة الموثوقية والدقة
  const handlePrint = () => {
    if (!invoice) return;

    try {
      const receiptHtml = buildReceiptHtml({
        invoice,
        storeInfo,
        qrDataUrl,
        isTaxActive,
        titleAr,
        titleEn,
        users
      });

      printHtmlDirectly(receiptHtml, `فاتورة_${invoice.invoiceNumber}`);
    } catch (err) {
      console.error('Print Execution Error:', err);
      window.print();
    }
  };

  const autoPrintMode = printSettings.autoPrintMode || (printSettings.autoPrintOnCheckout !== false ? 'auto' : 'manual');

  // الطباعة التلقائية عند إتمام البيع حسب الوضع المختار في الإعدادات مع ضمان جاهزية رمز الـ QR
  useEffect(() => {
    if (isOpen && invoice && autoPrintMode !== 'manual' && autoPrintMode !== 'disabled' && printSettings.autoPrintOnCheckout !== false && !hasAutoPrintedRef.current) {
      // إذا كان إظهار QR Code مفعلاً، ننتظر حتى يكتمل توليده قبل إرسال الفاتورة للطباعة
      if (printSettings.showQrCode !== false && !qrDataUrl) {
        return; // ننتظر حتى يكتمل توليد الـ QR
      }
      hasAutoPrintedRef.current = true;
      handlePrint();
    }
    if (!isOpen) {
      hasAutoPrintedRef.current = false;
    }
  }, [isOpen, invoice, qrDataUrl, autoPrintMode, printSettings.autoPrintOnCheckout, printSettings.showQrCode]);

  // اختصارات لوحة المفاتيح في شاشة الفاتورة (F1 للطباعة، Escape للإغلاق)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'F1') {
        e.preventDefault();
        handlePrint();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen || !invoice) return null;

  // دالة فتح الواتساب بذكاء وبشكل مباشر دون نوافذ إضافية
  const openWhatsAppSmart = (phone, text) => {
    const urls = getWhatsAppUrls(phone, text);
    const isDesktop = !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    if (isDesktop) {
      // فتح تطبيق واتساب المثبت على الكمبيوتر مباشرة
      const link = document.createElement('a');
      link.href = urls.desktopAppUrl;
      link.click();
    } else {
      window.open(urls.universalUrl, '_blank');
    }
  };

  // إرسال عبر الواتساب بالصيغة المختارة في الإعدادات (صورة / PDF / نص)
  const handleWhatsAppSend = async () => {
    // صلاحية إرسال الفاتورة للعميل عبر واتساب
    if (!checkUserPermission(currentUser, 'invoices_send_whatsapp')) {
      alert('⛔ ليس لديك صلاحية إرسال الفاتورة عبر الواتساب.\nتُمنح من: الإعدادات ← المستخدمون ← الصلاحيات.');
      return;
    }
    const text = buildInvoiceWhatsAppMessage(invoice, storeInfo);
    let customerPhone = (invoice.customer?.phone && invoice.customer?.phone !== '-' && invoice.customer?.phone !== '0500000000') ? invoice.customer.phone : '';
    if (!customerPhone) {
      const promptPhone = prompt('أدخل رقم جوال العميل للإرسال عبر الواتساب (أو اضغط موافق لاختيار المحادثة من الواتساب):', '');
      if (promptPhone && promptPhone.trim()) {
        customerPhone = promptPhone.trim();
      }
    }

    const format = getPreferredShareFormat(storeInfo);
    if (format === 'text') {
      openWhatsAppSmart(customerPhone, text);
      return;
    }

    // نرسل صورة الفاتورة المطبوعة لا لقطة الشاشة: نبني نفس HTML الطباعة
    // المستخدَم في زر الطباعة. التقاط عنصر الشاشة كان ينتج فاتورة بشكل
    // الواجهة (ألوان وأزرار وتخطيط النافذة) لا بشكل الإيصال الحراري.
    const receiptHtml = buildReceiptHtml({
      invoice,
      storeInfo,
      qrDataUrl,
      isTaxActive,
      titleAr,
      titleEn,
      users
    });

    await shareDocument({
      format,
      phone: customerPhone,
      text,
      html: receiptHtml,
      width: 380,
      filename: `فاتورة-${invoice.invoiceNumber || ''}`
    });
  };

  // إرسال عبر البريد الإلكتروني
  const handleEmailSend = () => {
    const text = buildInvoiceWhatsAppMessage(invoice, storeInfo);
    const customerEmail = invoice.customer?.email || storeInfo?.email || '';
    const subject = `${titleAr} #${invoice.invoiceNumber} - ${storeInfo?.name || 'بيت الورد'}`;
    const url = getEmailUrl(customerEmail, subject, text);
    window.open(url, '_blank');
  };

  // تصدير ومشاركة كصورة رقمية (PNG) عبر الواتساب مع النسخ للحافظة
  const handleSaveAsImage = async () => {
    if (!receiptRef.current) return;
    try {
      setIsExportingImage(true);
      setToastMessage('جاري معالجة وتوليد صورة الفاتورة...');

      const canvas = await html2canvas(receiptRef.current, {
        scale: 2.5,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false
      });

      canvas.toBlob(async (blob) => {
        if (!blob) {
          setIsExportingImage(false);
          setToastMessage(null);
          return;
        }

        const fileName = `فاتورة_${invoice.invoiceNumber}.png`;
        const file = new File([blob], fileName, { type: 'image/png' });

        let copiedToClipboard = false;
        if (navigator.clipboard && window.ClipboardItem) {
          try {
            const item = new ClipboardItem({ 'image/png': blob });
            await navigator.clipboard.write([item]);
            copiedToClipboard = true;
          } catch (clipErr) {
            console.log('Clipboard write note:', clipErr);
          }
        }

        // 2. تنزيل صورة الفاتورة للملفات
        try {
          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = fileName;
          link.click();
        } catch (e) {}

        // 3. فتح الواتساب مباشرة برقم العميل ورسالة الفاتورة (دون أي نافذة مشاركة لويندوز)
        let customerPhone = (invoice.customer?.phone && invoice.customer?.phone !== '-' && invoice.customer?.phone !== '0500000000') ? invoice.customer.phone : '';
        if (!customerPhone) {
          const promptPhone = prompt('أدخل رقم جوال العميل للإرسال عبر الواتساب (أو اضغط موافق لاختيار المحادثة من الواتساب):', '');
          if (promptPhone && promptPhone.trim()) {
            customerPhone = promptPhone.trim();
          }
        }

        const text = buildInvoiceWhatsAppMessage(invoice, storeInfo);
        openWhatsAppSmart(customerPhone, text);

        setIsExportingImage(false);
        setToastMessage(
          copiedToClipboard 
            ? '✅ تم فتح الواتساب ونسخ صورة الفاتورة للحافظة! اضغط (Ctrl + V) أو لصق في المحادثة لإرسال الصورة فوراً 🌸' 
            : '✅ تم فتح الواتساب وتنزيل صورة الفاتورة 🌸'
        );

        setTimeout(() => setToastMessage(null), 6000);
      }, 'image/png');

    } catch (err) {
      console.error('Image Export Error:', err);
      setIsExportingImage(false);
      setToastMessage('⚠️ حدث خطأ أثناء إنشاء الصورة، تم فتح محادثة الواتساب.');
      setTimeout(() => setToastMessage(null), 4000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-3 overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-sm sm:max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-150 my-auto flex flex-col max-h-[94vh]">
        
        {/* شريط الإجراءات العلوي */}
        <div className="p-3.5 bg-gradient-to-r from-[#380624] via-[#2A0845] to-[#4A0E4E] text-white flex items-center justify-between no-print border-b border-pink-500/30">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-400" />
            <span className="font-bold text-xs">تم إصدار الفاتورة بنجاح 🌸</span>
          </div>
          <button 
            onClick={onClose}
            className="p-1 rounded-lg bg-pink-950/80 hover:bg-pink-900 text-pink-200 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* شريط الإشعار والتوجيه الذكي */}
        {toastMessage && (
          <div className="p-3 bg-gradient-to-r from-purple-900 to-pink-900 text-white text-xs font-bold text-center border-b border-pink-400/30 animate-in fade-in flex items-center justify-between gap-2">
            <span>{toastMessage}</span>
            <button onClick={() => setToastMessage(null)} className="text-white/70 hover:text-white text-xs">✕</button>
          </div>
        )}

        {/* محتوى الفاتورة الحرارية القابل للطباعة */}
        <div className="flex-1 overflow-y-auto p-4 bg-pink-50/20 text-slate-900 font-mono text-xs select-text">
          <div 
            id="printable-receipt" 
            ref={receiptRef} 
            className="bg-white p-4 rounded-2xl border border-pink-100 shadow-sm text-center space-y-3"
          >
            {/* الشعار إن وُجد (مستقل للفاتورة أو من هوية المتجر) */}
            {printSettings.showLogo !== false && effectiveInvoiceLogo && (
              <div className={`${logoSizeClass} mx-auto rounded-2xl overflow-hidden shadow-sm border border-pink-200 bg-white p-1 flex items-center justify-center`}>
                <img src={effectiveInvoiceLogo} alt="Invoice Logo" className="w-full h-full object-contain" />
              </div>
            )}

            {/* ترويسة وعناوين الفاتورة */}
            <div>
              <h2 className="text-base font-black text-slate-900 flex items-center justify-center gap-1">
                <span>{printSettings.customStoreName || storeInfo?.name || 'بيت الورد'}</span>
                <span className="text-pink-600">🌸</span>
              </h2>
              {printSettings.headerNote && (
                <p className="text-[10px] text-pink-700 font-sans font-bold mt-0.5">{printSettings.headerNote}</p>
              )}
              <p className="text-[11px] font-sans font-black text-slate-700">
                {titleAr}
              </p>
              <p className="text-[10px] text-slate-500 font-medium font-sans">
                {titleEn}
              </p>
            </div>

            {/* تفاصيل المتجر: يختفي الرقم الضريبي تماماً إذا لم يكن المتجر خاضعاً للضريبة */}
            <div className="text-[10px] space-y-0.5 text-slate-600 border-b border-dashed border-slate-300 pb-2">
              {isTaxActive && printSettings.showTaxNumber !== false && storeInfo?.taxNumber && (
                <p>
                  <span>{printSettings.taxNumberLabel || 'الرقم الضريبي:'} </span>
                  <span className="font-bold font-mono">{storeInfo.taxNumber}</span>
                </p>
              )}
              {printSettings.showCrNumber !== false && storeInfo?.crNumber && (
                <p>
                  <span>{printSettings.crNumberLabel || 'س.ت:'} </span>
                  <span className="font-bold font-mono">{storeInfo.crNumber}</span>
                </p>
              )}
              {storeInfo?.address && <p>{storeInfo.address}</p>}
              {storeInfo?.phone && (
                <p>
                  <span>{printSettings.phoneLabel || 'هاتف:'} </span>
                  <span className="font-mono">{storeInfo.phone}</span>
                </p>
              )}
            </div>

            {/* بيانات الفاتورة والكاشير والعميل */}
            <div className="text-[10px] text-right space-y-1 border-b border-dashed border-slate-300 pb-2">
              <div className="flex justify-between">
                <span>{printSettings.invoiceNumLabel || 'رقم الفاتورة:'}</span>
                <span className="font-bold font-mono">{invoice.invoiceNumber}</span>
              </div>
              <div className="flex justify-between">
                <span>{printSettings.dateTimeLabel || 'التاريخ والوقت:'}</span>
                <span>{formatDate(invoice.date)}</span>
              </div>
              {printSettings.showCashierName !== false && (
                <div className="flex justify-between">
                  <span>{printSettings.cashierLabel || 'الكاشير:'}</span>
                  <span>{resolveUserName(invoice, users)}</span>
                </div>
              )}
              {printSettings.showCustomerInfo !== false && (
                <div className="flex justify-between">
                  <span>{printSettings.customerLabel || 'العميل:'}</span>
                  <span>{invoice.customer?.name || 'عميل نقدي عام'}</span>
                </div>
              )}
            </div>

            {/* جدول الأصناف المباعة المخصص */}
            <div className="border-b border-dashed border-slate-300 pb-2 text-[10px]">
              <table className="w-full text-right">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="pb-1">{printSettings.colItemLabel || 'الصنف'}</th>
                    <th className="pb-1 text-center">{printSettings.colQtyLabel || 'الكمية'}</th>
                    <th className="pb-1 text-left">{printSettings.colPriceLabel || 'السعر'}</th>
                    <th className="pb-1 text-left">{printSettings.colTotalLabel || 'المجموع'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoice.items.map((item, idx) => {
                    const itemTotal = (item.unitPrice * item.qty) - (item.discount || 0);
                    return (
                      <tr key={idx} className="py-1">
                        <td className="py-1 font-sans font-medium text-slate-800">
                          {item.product?.name || item.name}
                          {item.discount > 0 && (
                            <span className="text-[9px] text-rose-600 block">
                              {printSettings.itemDiscountLabel || 'خصم:'} -{item.discount} {storeInfo?.currency || 'ر.س'}
                            </span>
                          )}
                        </td>
                        <td className="py-1 text-center font-bold">{item.qty}</td>
                        <td className="py-1 text-left font-mono">{(item.unitPrice || 0).toFixed(2)}</td>
                        <td className="py-1 text-left font-bold font-mono">{itemTotal.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* مجاميع الفاتورة والحسابات المالية */}
            <div className="text-[11px] space-y-1 border-b border-dashed border-slate-300 pb-2 text-right">
              {/* المجموع الفرعي قبل الخصم إذا وجد خصم */}
              {invoice.discount > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>{printSettings.subtotalLabel || 'المجموع الفرعي:'}</span>
                  <span className="font-mono">{formatMoney(invoice.subtotal, storeInfo?.currency)}</span>
                </div>
              )}

              {invoice.discount > 0 && (
                <div className="flex justify-between text-rose-600 font-semibold">
                  <span>{printSettings.discountLabel || 'إجمالي الخصم:'}</span>
                  <span className="font-mono">-{formatMoney(invoice.discount, storeInfo?.currency)}</span>
                </div>
              )}

              {/* أسطر الضريبة: تظهر فقط وفقط إذا كان المتجر خاضعاً للضريبة */}
              {isTaxActive && printSettings.showTaxDetails !== false && (
                <>
                  <div className="flex justify-between text-slate-600">
                    <span>{printSettings.taxableBaseLabel || 'المبلغ الخاضع للضريبة:'}</span>
                    <span className="font-mono">{formatMoney(invoice.taxableAmount || (invoice.total - (invoice.taxAmount || 0)), storeInfo?.currency)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>{printSettings.taxAmountLabel || 'ضريبة القيمة المضافة'} ({invoice.taxRate}% {invoice.taxInclusive !== false ? (printSettings.inclusiveBadgeText || 'مشمولة') : (printSettings.exclusiveBadgeText || 'مضافة')}):</span>
                    <span className="font-bold font-mono">{invoice.taxInclusive !== false ? '' : '+'}{formatMoney(invoice.taxAmount, storeInfo?.currency)}</span>
                  </div>
                </>
              )}

              {/* المجموع النهائي البارز */}
              <div className="flex justify-between font-black text-sm text-slate-900 pt-1 border-t border-dotted border-slate-200">
                <span>{printSettings.grandTotalLabel || 'المجموع النهائي:'}</span>
                <span className="font-black text-pink-700 font-mono text-base">{formatMoney(invoice.total, storeInfo?.currency)}</span>
              </div>

              {isTaxActive && (
                <p className="text-[9px] text-slate-400 text-center pt-0.5 font-sans">
                  {invoice.taxInclusive !== false 
                    ? (printSettings.taxInclusiveNote || '📌 الأسعار شاملة ضريبة القيمة المضافة') 
                    : (printSettings.taxExclusiveNote || '📌 تمت إضافة ضريبة القيمة المضافة للفاتورة')}
                </p>
              )}

              {/* طريقة الدفع */}
              <div className="flex justify-between text-[10px] text-slate-600 pt-1">
                <span>{printSettings.paymentMethodLabel || 'طريقة الدفع:'}</span>
                <span className="font-bold">{resolvePaymentMethodName(invoice, storeInfo?.paymentMethods)}</span>
              </div>

              {/* تفاصيل الدفع المقسم بالتفصيل في الإيصال */}
              {(invoice.paymentMethod === 'split' || (Array.isArray(invoice.splitPayments) && invoice.splitPayments.length > 0)) && (
                <div className="pt-1 text-[10px] text-slate-700 border-t border-dotted border-slate-300 mt-1 space-y-1">
                  <div className="text-[9px] font-bold text-slate-500 text-right">تفاصيل الدفعات المقسمة:</div>
                  {Array.isArray(invoice.splitPayments) && invoice.splitPayments.length > 0 ? (
                    invoice.splitPayments.map((sp, sidx) => (
                      <div key={sidx} className="flex justify-between items-center text-[10px] bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">
                        <div className="flex items-center gap-1 truncate max-w-[60%]">
                          <span className="font-bold">{resolvePaymentMethodName(sp.methodId || sp.methodName, storeInfo?.paymentMethods)}</span>
                          {sp.refNumber && (
                            <span className="text-[8px] font-mono text-slate-500">({sp.refNumber})</span>
                          )}
                          {sp.note && (
                            <span className="text-[8px] text-slate-500 truncate">[{sp.note}]</span>
                          )}
                        </div>
                        <span className="font-bold font-mono">{formatMoney(sp.amount, storeInfo?.currency)}</span>
                      </div>
                    ))
                  ) : (
                    <>
                      {Number(invoice.splitCash) > 0 && (
                        <div className="flex justify-between items-center text-[10px] bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">
                          <span className="font-bold">{resolvePaymentMethodName('cash', storeInfo?.paymentMethods)}</span>
                          <span className="font-bold font-mono">{formatMoney(invoice.splitCash, storeInfo?.currency)}</span>
                        </div>
                      )}
                      {Number(invoice.splitCard) > 0 && (
                        <div className="flex justify-between items-center text-[10px] bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">
                          <span className="font-bold">{resolvePaymentMethodName('card', storeInfo?.paymentMethods)}</span>
                          <span className="font-bold font-mono">{formatMoney(invoice.splitCard, storeInfo?.currency)}</span>
                        </div>
                      )}
                      {Number(invoice.splitCredit) > 0 && (
                        <div className="flex justify-between items-center text-[10px] bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">
                          <span className="font-bold flex items-center gap-1">
                            <span>{resolvePaymentMethodName('credit', storeInfo?.paymentMethods)}</span>
                            {((customers || []).find(c => c && (c.id === invoice.customer?.id || c.name === invoice.customer?.name))?.balance === 0) && (
                              <span className="text-[8px] bg-emerald-100 text-emerald-800 px-1 py-0.2 rounded font-bold">سُدد بالكامل ✅</span>
                            )}
                          </span>
                          <span className="font-bold font-mono">{formatMoney(invoice.splitCredit, storeInfo?.currency)}</span>
                        </div>
                      )}
                    </>
                  )}
                  {invoice.changeAmount > 0 && (
                    <div className="flex justify-between font-bold text-emerald-700 pt-0.5">
                      <span>الباقي المستحق للعميل:</span>
                      <span className="font-mono">{formatMoney(invoice.changeAmount, storeInfo?.currency)}</span>
                    </div>
                  )}
                </div>
              )}

              {/* تفاصيل النقدية المستلمة والباقي للدفع النقدي */}
              {invoice.paymentMethod === 'cash' && (
                <div className="pt-1 text-[10px] text-slate-600">
                  <div className="flex justify-between">
                    <span>{printSettings.receivedAmountLabel || 'المبلغ المستلم:'}</span>
                    <span className="font-mono">{formatMoney(invoice.receivedAmount, storeInfo?.currency)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-emerald-700">
                    <span>{printSettings.changeAmountLabel || 'المتبقي للعميل (الباقي):'}</span>
                    <span className="font-mono">{formatMoney(invoice.changeAmount, storeInfo?.currency)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* رمز الاستجابة السريعة QR */}
            {printSettings.showQrCode !== false && qrDataUrl && (
              <div className="flex flex-col items-center justify-center pt-1">
                <img 
                  src={qrDataUrl} 
                  alt="Invoice QR Code" 
                  className={`border border-slate-200 p-1 rounded-xl bg-white shadow-2xs ${
                    printSettings.qrCodeSize === 'small' ? 'w-20 h-20' :
                    printSettings.qrCodeSize === 'large' ? 'w-32 h-32' : 'w-24 h-24'
                  }`} 
                />
                <span className="text-[9px] text-slate-500 font-bold mt-1">
                  {printSettings.qrScanText || 'امسح للتحقق من الفاتورة'}
                </span>
              </div>
            )}

            {/* سياسة الاسترجاع والشروط */}
            {printSettings.showReturnPolicy !== false && (
              <div className="p-2 bg-pink-50/40 rounded-xl text-[9px] text-slate-600 leading-relaxed text-right font-sans">
                <p className="font-bold text-pink-900">
                  {printSettings.returnPolicyTitle || 'سياسة الاسترجاع والاستبدال:'}
                </p>
                <p>
                  {printSettings.returnPolicy || 'البضاعة المباعة تسترجع أو تستبدل خلال 24 ساعة بشرط حالتها الأصلية مع إحضار الفاتورة.'}
                </p>
              </div>
            )}

            {/* تذييل الفاتورة والعبارة الختامية */}
            {(printSettings.footerNote || storeInfo?.invoiceFooter) && (
              <p className="text-[10px] font-sans text-slate-500 pt-1 leading-relaxed text-center">
                {printSettings.footerNote || storeInfo?.invoiceFooter}
              </p>
            )}

          </div>
        </div>

        {/* أزرار الإجراءات السريعة والمشاركة */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 no-print space-y-2">
          
          {/* شبكة أزرار الإرسال الذكية */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button
              onClick={handleSaveAsImage}
              disabled={isExportingImage}
              className="p-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition active:scale-95 disabled:opacity-50"
            >
              <ImageIcon className="w-4 h-4" />
              <span>واتساب (صورة) 🖼️</span>
            </button>

            <button
              onClick={handleWhatsAppSend}
              className="p-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-2xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition active:scale-95"
            >
              <MessageSquare className="w-4 h-4" />
              <span>واتساب (نص) 💬</span>
            </button>

            <button
              onClick={() => window.print()}
              className="p-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition active:scale-95"
            >
              <FileDown className="w-4 h-4" />
              <span>مستند PDF 📄</span>
            </button>

            <button
              onClick={handleEmailSend}
              className="p-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition active:scale-95"
            >
              <Mail className="w-4 h-4" />
              <span>إيميل 📧</span>
            </button>
          </div>

          {/* أزرار الطباعة الحرارية المباشرة وفتح فاتورة جديدة */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              onClick={handlePrint}
              className="p-3 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-black text-xs flex items-center justify-center gap-2 shadow-md transition active:scale-95"
            >
              <Printer className="w-4 h-4" />
              <span>🖨️ طباعة حرارية</span>
            </button>

            <button
              onClick={() => {
                onClose();
                if (onNewSale) onNewSale();
              }}
              className="p-3 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 text-white rounded-2xl font-black text-xs flex items-center justify-center gap-2 shadow-md transition active:scale-95"
            >
              <PlusCircle className="w-4 h-4" />
              <span>🌸 فاتورة جديدة</span>
            </button>
          </div>

        </div>

      </div>
    </div>
  );
};
