import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import { formatMoney, formatDate, resolveUserName, generateZatcaTLV, resolvePaymentMethodName } from './helpers';

// =========================================================================
//  تهريب النصوص قبل إقحامها في HTML الفاتورة
// =========================================================================
//  الفاتورة تُبنى كنص HTML ثم تُحقن في إطار طباعة. أي نص يكتبه المستخدم
//  (اسم صنف، اسم عميل، ملاحظة، اسم المتجر) كان يُقحَم كما هو.
//
//  الأثر العملي الأكثر احتمالاً — وقد يحدث في متجر زهور فعلاً:
//    صنف باسم «بوكيه ورد & شوكولاتة» أو «حجم < ١٠ سم» أو ملاحظة فيها
//    علامة اقتباس ← يفسد بناء HTML فتخرج الفاتورة مشوّهة أو ناقصة،
//    وقد يختفي جزء من الأصناف من الإيصال المطبوع بلا أي رسالة خطأ.
//
//  وأثر ثانوي أمني: نص يحوي وسماً تنفيذياً يُنفَّذ داخل إطار الطباعة.
//  أقل خطورة لأن من يُدخل الأسماء موظف معتمد، لكن لا سبب لإبقائه.
//
//  الاستخدام مقصور على حقول المستخدم النصية. الأرقام وأنماط CSS
//  وشظايا HTML المبنية داخلياً تبقى كما هي بلا تهريب.
// =========================================================================
const esc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

/**
 * محرك الطباعة الحراري الشامل (Universal Thermal Print Engine)
 * حل جذري لمشكلة عدم الطباعة في المتصفحات وطابعات الباركود والفواتير
 */
export const printHtmlDirectly = async (htmlContent, title = 'طباعة', routing = null) => {
  // =======================================================================
  //  توجيه الطابعة — كل طباعة في البرنامج تمرّ من هنا
  // =======================================================================
  //  هذه الدالة هي النقطة الوحيدة التي تطبع فعلياً (فاتورة، تقرير Z،
  //  سندات، ملصقات). فبإدخال التوجيه هنا يرث كل نوع طباعة اختيارَ
  //  الطابعة دفعةً واحدة، بلا تعديل عشر دوال ولا تكرار منطق.
  //  routing = { purpose: 'invoice' | 'report' | 'barcode', storeInfo }
  //  وإن لم يكن QZ مثبَّتاً أو مفعّلاً نكمل بالطريقة القديمة تماماً.
  // =======================================================================
  if (routing?.storeInfo) {
    try {
      const { printHtmlViaQz } = await import('./qzPrint');
      const res = await printHtmlViaQz(htmlContent, {
        purpose: routing.purpose || 'invoice',
        storeInfo: routing.storeInfo
      });
      if (res.handled) return true;
    } catch (e) {
      console.warn('[Print] تعذّر تحميل طبقة QZ، سيُطبع بالطريقة العادية:', e?.message || e);
    }
  }

  return new Promise((resolve) => {
    try {
      // إزالة أي إطارات طباعة سابقة
      const existingFrames = document.querySelectorAll('.pos-print-frame');
      existingFrames.forEach(f => {
        try { f.remove(); } catch (e) {}
      });

      // إنشاء إطار طباعة متقدم
      const printFrame = document.createElement('iframe');
      printFrame.className = 'pos-print-frame';
      printFrame.title = title;
      
      // أبعاد وظهور مخصص يمنع تحجيم Chromium أو المتصفحات للطباعة لـ 0px
      printFrame.style.position = 'fixed';
      printFrame.style.top = '0';
      printFrame.style.left = '0';
      printFrame.style.width = '100vw';
      printFrame.style.height = '100vh';
      printFrame.style.border = '0';
      printFrame.style.opacity = '0.001';
      printFrame.style.pointerEvents = 'none';
      printFrame.style.zIndex = '9999999';

      document.body.appendChild(printFrame);

      const frameDoc = printFrame.contentDocument || printFrame.contentWindow.document;
      const frameWindow = printFrame.contentWindow;

      frameDoc.open();
      frameDoc.write(htmlContent);
      frameDoc.close();

      const executePrint = () => {
        try {
          frameWindow.focus();
          frameWindow.print();
        } catch (e) {
          console.warn('Iframe print error, falling back to window.print():', e);
          window.print();
        } finally {
          setTimeout(() => {
            try {
              if (document.body.contains(printFrame)) {
                document.body.removeChild(printFrame);
              }
            } catch (err) {}
            resolve(true);
          }, 2500);
        }
      };

      // فحص اكتمال تحميل المستند والصور
      if (frameDoc.readyState === 'complete') {
        setTimeout(executePrint, 250);
      } else {
        frameWindow.onload = () => setTimeout(executePrint, 250);
        setTimeout(executePrint, 600); // احتياطي أمان
      }
    } catch (globalErr) {
      // =====================================================================
      //  الفشل يُعلَن هنا — في نقطة الطباعة الوحيدة
      // =====================================================================
      //  كانت الدالة تُرجع `false` صامتةً، و**لا أحد من مستدعيها الاثنين
      //  والعشرين يفحص القيمة المُرجَعة**. فالكاشير يضغط «طباعة»، ولا يخرج
      //  شيء، ولا تظهر رسالة — فيظنّ الطابعة معطّلة ويعيد المحاولة، أو
      //  الأسوأ: يسلّم العميل بضاعة بلا فاتورة ظنّاً أنها طُبعت.
      //  وسبعة من المستدعين يلفّون الاستدعاء بـ `try/catch` ثم
      //  `window.print()` كاحتياط — وهو **كود ميت**: الدالة غير متزامنة ولا
      //  ترفض أصلاً، فالـ catch لا يعمل أبداً.
      //  الإعلان من هنا يغطّي المستدعين كلهم دفعةً واحدة — وهذا هو معنى أن
      //  تكون نقطة الطباعة واحدة (§5.6).
      //  ولا نستدعي `window.print()` بديلاً: يطبع **الصفحة كلها** لا الفاتورة،
      //  فيُهدر ورقاً حرارياً ويُخرج شيئاً لا يشبه الإيصال.
      // =====================================================================
      console.error('[Print] فشل الطباعة:', globalErr);
      try {
        window.alert(
          '⛔ تعذّرت الطباعة.\n\n' +
          (globalErr?.message ? `السبب: ${globalErr.message}\n\n` : '') +
          'المستند لم يُطبع. تحقّق من توصيل الطابعة ثم أعد المحاولة من سجل الفواتير.'
        );
      } catch (e) {}
      resolve(false);
    }
  });
};

/**
 * توليد HTML فاتورة حرارية متكاملة ومطابقة لأعلى معايير الطباعة الحرارية
 */
export const buildReceiptHtml = ({ invoice, storeInfo, qrDataUrl, isTaxActive, titleAr, titleEn, users = [] }) => {
  const printSettings = storeInfo?.invoicePrintSettings || {};
  const fontFamily = printSettings.fontFamily || 'Cairo';
  const paperSize = printSettings.paperSize || '80mm';
  const widthStyle = paperSize === '57mm' ? '50mm' : paperSize === 'A4' ? '190mm' : '66mm';
  const currency = storeInfo?.currency || 'ر.س';

  // تحديد شعار الفاتورة المستقل (الأولوية للشعار المخصص للفاتورة ثم هوية المتجر)
  const effectiveInvoiceLogo = printSettings.invoiceLogo || storeInfo?.logo;
  const logoMaxHeight = printSettings.invoiceLogoSize === 'small' ? '45px' : printSettings.invoiceLogoSize === 'large' ? '85px' : '60px';
  const qrImgSize = printSettings.qrCodeSize === 'small' ? '80px' : printSettings.qrCodeSize === 'large' ? '135px' : '105px';

  // معالجة بيانات وسيلة الدفع الموحدة والديناميكية
  const isSplit = invoice.paymentMethod === 'split' || (Array.isArray(invoice.splitPayments) && invoice.splitPayments.length > 0);
  let paymentLabel = isSplit 
    ? 'تقسيم الدفع 🔀' 
    : resolvePaymentMethodName(invoice, storeInfo?.paymentMethods);

  const itemsRows = (invoice.items || []).map((item) => {
    const itemName = item.name || item.product?.name || item.productName || item.title || 'صنف';
    const itemQty = Number(item.quantity ?? item.qty ?? 1) || 1;
    const itemPrice = Number(item.price ?? item.unitPrice ?? item.product?.sellingPrice ?? 0) || 0;
    const itemDiscount = Number(item.discount || 0) || 0;
    const itemTotal = (itemPrice * itemQty) - itemDiscount;

    return `
      <tr>
        <td style="padding: 4px 1px; vertical-align: top; word-break: break-word;">
          <div style="font-weight: bold; font-size: 10.5px; color: #000;">${esc(itemName)}</div>
          ${itemDiscount > 0 ? `<div style="font-size: 9px; color: #555;">${printSettings.itemDiscountLabel || 'خصم:'} -${itemDiscount} ${currency}</div>` : ''}
        </td>
        <td style="padding: 4px 1px; text-align: center; font-weight: bold; vertical-align: top;">${itemQty}</td>
        <td style="padding: 4px 1px; text-align: left; vertical-align: top;">${formatMoney(itemPrice, '')}</td>
        <td style="padding: 4px 1px; text-align: left; font-weight: bold; vertical-align: top;">${formatMoney(itemTotal, '')}</td>
      </tr>
    `;
  }).join('');

  // تفاصيل تقسيم الدفع إن وُجد
  let splitRows = '';
  if (isSplit) {
    if (Array.isArray(invoice.splitPayments) && invoice.splitPayments.length > 0) {
      splitRows = `
        <div style="margin-top: 4px; padding: 4px; border: 1px dashed #888; border-radius: 4px; background: #fafafa; font-size: 9.5px;">
          <div style="font-weight: bold; margin-bottom: 2px;">تفاصيل مبالغ تقسيم الدفع:</div>
          ${invoice.splitPayments.map(sp => `
            <div style="display: flex; justify-content: space-between;">
              <span>• ${esc(resolvePaymentMethodName(sp.methodId || sp.methodName, storeInfo?.paymentMethods))}:</span>
              <b>${formatMoney(sp.amount, currency)}</b>
            </div>
          `).join('')}
        </div>
      `;
    } else {
      const sCash = Number(invoice.splitCash) || 0;
      const sCard = Number(invoice.splitCard) || 0;
      const sCredit = Number(invoice.splitCredit) || 0;
      splitRows = `
        <div style="margin-top: 4px; padding: 4px; border: 1px dashed #888; border-radius: 4px; background: #fafafa; font-size: 9.5px;">
          <div style="font-weight: bold; margin-bottom: 2px;">تفاصيل مبالغ تقسيم الدفع:</div>
          ${sCash > 0 ? `<div style="display: flex; justify-content: space-between;"><span>• ${esc(resolvePaymentMethodName('cash', storeInfo?.paymentMethods))}:</span> <b>${formatMoney(sCash, currency)}</b></div>` : ''}
          ${sCard > 0 ? `<div style="display: flex; justify-content: space-between;"><span>• ${esc(resolvePaymentMethodName('card', storeInfo?.paymentMethods))}:</span> <b>${formatMoney(sCard, currency)}</b></div>` : ''}
          ${sCredit > 0 ? `<div style="display: flex; justify-content: space-between;"><span>• ${esc(resolvePaymentMethodName('credit', storeInfo?.paymentMethods))}:</span> <b>${formatMoney(sCredit, currency)}</b></div>` : ''}
        </div>
      `;
    }
  }

  return `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="utf-8">
      <title>فاتورة #${invoice.invoiceNumber}</title>
      <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&family=Tajawal:wght@400;700;900&display=swap" rel="stylesheet">
      <style>
        * { box-sizing: border-box !important; margin: 0; padding: 0; }
        @page { size: auto; margin: 0mm !important; }
        @media print {
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            background: #ffffff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print { display: none !important; }
        }
        body {
          font-family: '${fontFamily}', 'Cairo', 'Tajawal', sans-serif;
          font-size: 10.5px;
          line-height: 1.35;
          color: #000000;
          background: #ffffff;
          width: 100%;
          direction: rtl;
          text-align: right;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .receipt-container {
          width: 100%;
          max-width: ${widthStyle};
          margin: 0 auto;
          padding: 2mm 1.5mm;
          box-sizing: border-box;
        }
        .header { text-align: center; margin-bottom: 6px; }
        .store-logo { max-width: ${logoMaxHeight}; max-height: ${logoMaxHeight}; margin: 0 auto 4px auto; display: block; object-fit: contain; }
        .store-name { font-size: 14px; font-weight: 900; }
        .invoice-title { font-size: 12px; font-weight: 900; margin-top: 2px; }
        .invoice-subtitle { font-size: 10px; color: #444; }
        .divider { border-top: 1px dashed #000000; margin: 4px 0; }
        .meta-row { display: flex; justify-content: space-between; font-size: 10px; margin: 1.5px 0; }
        table { width: 100%; border-collapse: collapse; margin: 4px 0; }
        th { border-bottom: 1px dashed #000000; padding: 3px 1px; font-size: 10px; font-weight: bold; }
        td { font-size: 10px; }
        .total-box { margin-top: 4px; border-top: 1.5px solid #000000; border-bottom: 1.5px solid #000000; padding: 4px 0; }
        .grand-total { display: flex; justify-content: space-between; font-size: 13px; font-weight: 900; margin: 2px 0; }
        .qr-section { text-align: center; margin-top: 6px; }
        .qr-img { width: ${qrImgSize}; height: ${qrImgSize}; display: block; margin: 0 auto; }
        .footer-note { text-align: center; font-size: 9.5px; margin-top: 6px; }
      </style>
    </head>
    <body>
      <div class="receipt-container">
      <div class="header">
        ${printSettings.showLogo !== false && effectiveInvoiceLogo ? `<img class="store-logo" src="${effectiveInvoiceLogo}" alt="Invoice Logo" />` : ''}
        <div class="store-name">${esc(printSettings.customStoreName || storeInfo?.name || 'بيت الورد')} 🌸</div>
        ${printSettings.headerNote ? `<div style="font-size: 10px; font-weight: bold;">${printSettings.headerNote}</div>` : ''}
        <div class="invoice-title">${titleAr}</div>
        <div class="invoice-subtitle">${titleEn}</div>
      </div>

      <div class="divider"></div>

      <!-- تفاصيل المتجر -->
      <div style="font-size: 10px; text-align: center;">
        ${isTaxActive && printSettings.showTaxNumber !== false && storeInfo?.taxNumber ? `<div>${printSettings.taxNumberLabel || 'الرقم الضريبي:'} <b>${storeInfo.taxNumber}</b></div>` : ''}
        ${printSettings.showCrNumber !== false && storeInfo?.crNumber ? `<div>${printSettings.crNumberLabel || 'س.ت:'} <b>${storeInfo.crNumber}</b></div>` : ''}
        ${storeInfo?.address ? `<div>${esc(storeInfo.address)}</div>` : ''}
        ${storeInfo?.phone ? `<div>${printSettings.phoneLabel || 'هاتف:'} ${storeInfo.phone}</div>` : ''}
      </div>

      <div class="divider"></div>

      <!-- بيانات الفاتورة والعميل -->
      <div>
        <div class="meta-row"><span>رقم الفاتورة:</span> <b>#${invoice.invoiceNumber}</b></div>
        <div class="meta-row"><span>التاريخ والوقت:</span> <span>${formatDate(invoice.date)}</span></div>
        <div class="meta-row"><span>الكاشير:</span> <span>${esc(resolveUserName(invoice, users) || invoice.cashier || 'الكاشير')}</span></div>
        ${invoice.customer?.name ? `<div class="meta-row"><span>العميل:</span> <b>${esc(invoice.customer.name)}</b></div>` : ''}
        ${invoice.customer?.taxNumber ? `<div class="meta-row"><span>الرقم الضريبي للعميل:</span> <b>${esc(invoice.customer.taxNumber)}</b></div>` : ''}
      </div>

      <div class="divider"></div>

      <!-- جدول الأصناف -->
      <table>
        <thead>
          <tr>
            <th style="text-align: right;">${printSettings.colItemLabel || 'الصنف'}</th>
            <th style="text-align: center;">${printSettings.colQtyLabel || 'الكمية'}</th>
            <th style="text-align: left;">${printSettings.colPriceLabel || 'السعر'}</th>
            <th style="text-align: left;">${printSettings.colTotalLabel || 'المجموع'}</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRows}
        </tbody>
      </table>

      <div class="divider"></div>

      <!-- ملخص المبالغ والضرائب -->
      <div style="font-size: 10px;">
        ${invoice.discount > 0 ? `<div class="meta-row"><span>${printSettings.discountLabel || 'إجمالي الخصم:'}</span> <b>-${formatMoney(invoice.discount, currency)}</b></div>` : ''}
        
        ${isTaxActive && printSettings.showTaxDetails !== false ? `
          <div class="meta-row"><span>${printSettings.taxableBaseLabel || 'المبلغ الخاضع للضريبة:'}</span> <span>${formatMoney(invoice.taxableAmount || (invoice.total - (invoice.taxAmount || 0)), currency)}</span></div>
          <div class="meta-row"><span>${printSettings.taxAmountLabel || 'ضريبة القيمة المضافة'} (${invoice.taxRate}%):</span> <b>${formatMoney(invoice.taxAmount, currency)}</b></div>
        ` : `
          <div class="meta-row"><span>${printSettings.subtotalLabel || 'المجموع الفرعي:'}</span> <span>${formatMoney(invoice.subtotal || invoice.total, currency)}</span></div>
        `}
      </div>

      <!-- الإجمالي النهائي -->
      <div class="total-box">
        <div class="grand-total">
          <span>${printSettings.grandTotalLabel || 'المجموع النهائي:'}</span>
          <span>${formatMoney(invoice.total, currency)}</span>
        </div>
      </div>

      <!-- وسيلة الدفع والمستلم والباقي -->
      <div style="margin-top: 4px; font-size: 10px;">
        <div class="meta-row">
          <span>${printSettings.paymentMethodLabel || 'طريقة الدفع:'}</span>
          <b>${esc(paymentLabel)}</b>
        </div>
        ${splitRows}
        ${invoice.paymentMethod === 'cash' && invoice.cashReceived > 0 ? `
          <div class="meta-row"><span>${printSettings.receivedAmountLabel || 'المبلغ المستلم:'}</span> <span>${formatMoney(invoice.cashReceived, currency)}</span></div>
          <div class="meta-row"><span>${printSettings.changeAmountLabel || 'المتبقي للعميل:'}</span> <b>${formatMoney(invoice.changeAmount, currency)}</b></div>
        ` : ''}
      </div>

      <!-- رمز التحقق QR -->
      ${printSettings.showQrCode !== false && qrDataUrl ? `
        <div class="qr-section">
          <img class="qr-img" src="${qrDataUrl}" alt="QR" />
          <div style="font-size: 8.5px; color: #555; margin-top: 1px;">${printSettings.qrScanText || 'امسح للتحقق من الفاتورة'}</div>
        </div>
      ` : ''}

      <!-- سياسة الاسترجاع والملاحظات -->
      ${printSettings.showReturnPolicy !== false ? `
        <div style="margin-top: 6px; font-size: 8.5px; text-align: center; border-top: 1px dashed #aaa; padding-top: 4px;">
          <b>${printSettings.returnPolicyTitle || 'سياسة الاسترجاع والاستبدال:'}</b><br/>
          <span>${printSettings.returnPolicy || 'البضاعة المباعة تسترجع أو تستبدل خلال 24 ساعة بشرط حالتها الأصلية مع الفاتورة.'}</span>
        </div>
      ` : ''}

      ${(printSettings.footerNote || storeInfo?.invoiceFooter) ? `
        <div class="footer-note">
          ${printSettings.footerNote || storeInfo?.invoiceFooter}
        </div>
      ` : ''}
      </div>
    </body>
    </html>
  `;
};

/**
 * توليد وطباعة ملصقات الباركود الحرارية (Barcode Thermal Labels)
 */
/**
 * توليد وطباعة ملصقات الباركود الحرارية (Barcode Thermal Labels & A4 Sticker Sheets)
 */
export const printThermalBarcodeLabels = async ({ product, copies = 1, size = '50x25', storeInfo }) => {
  const bs = { ...storeInfo?.barcodeLabelSettings } || {};
  const isA4 = size === 'a4_3x8' || size === 'a4' || bs.paperType === 'a4';

  const sizeMap = { 
    '40x30': [40,30], 
    '38x25': [38,25], 
    '50x25': [50,25], 
    '60x40': [60,40], 
    '70x35': [70,35], 
    '80x50': [80,50] 
  };

  const [widthMm, heightMm] = sizeMap[size] || [bs.customWidth || 50, bs.customHeight || 25];
  const storeName = bs.customStoreName || storeInfo?.name || 'بيت الورد للزهور والهدايا';
  const prodName = product.name || 'صنف';
  const priceText = formatMoney(product.sellingPrice, '');
  const currency = storeInfo?.currency || 'ر.س';
  const code = String(product.barcode || '628100000000').trim();
  const symbology = bs.symbology || 'CODE128';

  const showStoreName = bs.showStoreName !== false;
  const showProdName = bs.showProductName !== false;
  const showPrice = bs.showPrice !== false;
  const showBarcodeText = bs.showBarcodeText !== false;
  const showTax = bs.showTaxIndicator !== false && storeInfo?.taxEnabled !== false && Number(storeInfo?.taxRate || 0) > 0;
  const showCurrency = bs.showCurrency !== false;
  const showFooter = bs.showCustomFooter !== false && bs.customFooterText;

  const storeNameSize = bs.storeNameSize || 10;
  const prodNameSize = bs.productNameSize || 11;
  const priceSize = bs.priceSize || 13;
  const barcodeTextSize = bs.barcodeTextSize || 9;
  const barcodeHeight = bs.barcodeHeight || 12;
  const footerText = bs.customFooterText || '';
  const borderRadius = bs.borderRadius || 0;
  const marginT = bs.marginTop !== undefined ? bs.marginTop : 1.5;
  const marginB = bs.marginBottom !== undefined ? bs.marginBottom : 1.5;
  const marginL = bs.marginLeft !== undefined ? bs.marginLeft : 1.5;
  const marginR = bs.marginRight !== undefined ? bs.marginRight : 1.5;

  const taxLabel = storeInfo?.taxInclusive !== false ? 'شامل الضريبة' : '+ ضريبة';

  const fontFamilies = {
    tahoma: "'Tahoma', 'Segoe UI', 'Cairo', Arial, 'Simplified Arabic', sans-serif",
    cairo: "'Cairo', 'Tahoma', 'Segoe UI', Arial, sans-serif",
    arial: "Arial, 'Simplified Arabic', 'Tahoma', sans-serif",
    simplified: "'Simplified Arabic', 'Tahoma', Arial, sans-serif"
  };
  const chosenFont = fontFamilies[bs.fontFamily] || fontFamilies.tahoma;

  let jsFormat = symbology;
  if (jsFormat === 'EAN13' && (code.length !== 13 || !/^\d+$/.test(code))) jsFormat = 'CODE128';
  if (jsFormat === 'UPCA' && (code.length !== 12 || !/^\d+$/.test(code))) jsFormat = 'CODE128';
  if (jsFormat === 'CODE39') jsFormat = 'CODE39';

  // إنشاء SVG للباركود بشكل متزامن وبأعلى دقة
  let svgString = '';
  try {
    const tempSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    JsBarcode(tempSvg, code, {
      format: jsFormat,
      width: 1.6,
      height: Math.max(16, barcodeHeight * 2.5),
      displayValue: showBarcodeText,
      font: 'monospace',
      fontOptions: 'bold',
      fontSize: barcodeTextSize,
      textMargin: 1,
      margin: 0,
      background: 'transparent',
      lineColor: '#000000'
    });
    svgString = new XMLSerializer().serializeToString(tempSvg);
  } catch (e) {
    console.error('JsBarcode Generation Error:', e);
  }

  // بناء القالب الفردي
  const singleLabelInnerHtml = `
    ${showStoreName ? `<div class="store-title" style="font-size:${storeNameSize * 0.75}pt">${esc(storeName)} 🌸</div>` : ''}
    ${showProdName ? `<div class="prod-title" style="font-size:${prodNameSize * 0.75}pt">${esc(prodName)}</div>` : ''}
    <div class="barcode-container">
      ${svgString}
    </div>
    ${showPrice ? `
      <div class="price-row">
        <span class="price-val" style="font-size:${priceSize * 0.75}pt">${priceText} ${showCurrency ? currency : ''}</span>
        ${showTax ? `<span class="vat-badge">${taxLabel}</span>` : ''}
      </div>
    ` : ''}
    ${showFooter ? `<div class="footer-note">${esc(footerText)}</div>` : ''}
  `;

  let fullHtml = '';

  if (isA4) {
    // تنسيق طباعة ورق A4 لاصق متعدد (3 أعمدة × 8 صفوف)
    const labelsGrid = Array.from({ length: copies }).map(() => `
      <div class="a4-label-cell">
        ${singleLabelInnerHtml}
      </div>
    `).join('');

    fullHtml = `
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8">
        <title>ملصقات A4 - ${esc(prodName)}</title>
        <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@600;800;900&display=swap" rel="stylesheet">
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          @page {
            size: A4 portrait;
            margin: 8mm 6mm;
          }
          body {
            background: #ffffff;
            font-family: ${chosenFont};
            font-weight: 700;
            -webkit-font-smoothing: antialiased;
            text-rendering: optimizeLegibility;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .a4-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 3mm 2.5mm;
            width: 100%;
          }
          .a4-label-cell {
            height: 34mm;
            border: 0.5px dashed #ccc;
            border-radius: ${borderRadius}px;
            padding: 1.5mm;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: space-between;
            text-align: center;
            overflow: hidden;
            background: #fff;
          }
          .store-title { font-family: ${chosenFont}; font-weight: 900; color: #000; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; }
          .prod-title { font-family: ${chosenFont}; font-weight: 900; color: #000; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; }
          .barcode-container { display: flex; align-items: center; justify-content: center; width: 100%; margin: 0.5mm 0; }
          .barcode-container svg { max-width: 95%; height: auto; max-height: 13mm; }
          .price-row { display: flex; align-items: center; justify-content: center; gap: 1.5mm; width: 100%; line-height: 1; }
          .price-val { font-family: ${chosenFont}; font-weight: 900; color: #000; }
          .vat-badge { font-family: ${chosenFont}; font-size: 6pt; font-weight: 800; border: 0.5px solid #000; border-radius: 1mm; padding: 0.2mm 0.8mm; }
          .footer-note { font-family: ${chosenFont}; font-size: 5.5pt; font-weight: 700; color: #000; white-space: nowrap; }
        </style>
      </head>
      <body>
        <div class="a4-grid">
          ${labelsGrid}
        </div>
      </body>
      </html>
    `;
  } else {
    // تنسيق رول طابعات الباركود الحرارية القياسية (Xprinter / Zebra / TSC)
    let labelsHtml = '';
    for (let i = 0; i < copies; i++) {
      labelsHtml += `
        <div class="label-page">
          ${singleLabelInnerHtml}
        </div>
      `;
    }

    fullHtml = `
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8">
        <title>ملصقات باركود - ${esc(prodName)}</title>
        <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@600;800;900&display=swap" rel="stylesheet">
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          @page {
            size: ${widthMm}mm ${heightMm}mm;
            margin: 0;
          }
          html, body {
            width: ${widthMm}mm;
            height: 100%;
            background: #ffffff;
            font-family: ${chosenFont};
            font-weight: 700;
            -webkit-font-smoothing: antialiased;
            text-rendering: optimizeLegibility;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .label-page {
            width: ${widthMm}mm;
            height: ${heightMm}mm;
            page-break-after: always;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: space-between;
            padding-top: ${marginT}mm;
            padding-bottom: ${marginB}mm;
            padding-left: ${marginL}mm;
            padding-right: ${marginR}mm;
            text-align: center;
            overflow: hidden;
            background: #ffffff;
            ${borderRadius > 0 ? `border-radius: ${borderRadius}px;` : ''}
          }
          .label-page:last-child {
            page-break-after: avoid;
          }
          .store-title {
            font-family: ${chosenFont};
            font-weight: 900;
            color: #000;
            line-height: 1.1;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            width: 100%;
          }
          .prod-title {
            font-family: ${chosenFont};
            font-weight: 900;
            color: #000;
            line-height: 1.1;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            width: 100%;
          }
          .barcode-container {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            margin: 0.5mm 0;
          }
          .barcode-container svg {
            max-width: 96%;
            height: auto;
            max-height: ${Math.max(10, heightMm * 0.45)}mm;
          }
          .price-row {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 1.5mm;
            width: 100%;
            line-height: 1;
          }
          .price-val {
            font-family: ${chosenFont};
            font-weight: 900;
            color: #000;
          }
          .vat-badge {
            font-family: ${chosenFont};
            font-size: 6.5pt;
            font-weight: 800;
            border: 0.5px solid #000;
            border-radius: 1mm;
            padding: 0.2mm 0.8mm;
          }
          .footer-note {
            font-family: ${chosenFont};
            font-size: 6pt;
            font-weight: 700;
            color: #000;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 100%;
          }
        </style>
      </head>
      <body>
        ${labelsHtml}
      </body>
      </html>
    `;
  }

  // =======================================================================
  //  مسار TSPL أولاً — ثم HTML احتياطاً
  // =======================================================================
  //  HTML يطبع «صفحة» لا «ملصقاً»: المتصفّح يفرض هوامشه، والتحجيم يختلف
  //  بين جهاز وآخر، والباركود يُرسم صورةً فتتغيّر سماكة خطوطه مع الدقّة
  //  فيصعب مسحه. TSPL يعطي الطابعة المقاس بالملّيمتر ويولّد الباركود
  //  بخطوط الطابعة نفسها — وهذا هو الفرق بين ملصق يُمسح دائماً وملصق
  //  «غير احترافي».
  //  الارتداد إلى HTML تلقائي وصامت: TSPL لا يعمل بلا QZ، ولا يدعم
  //  العربية، فلا يجوز أن يمنع الطباعة إن تعذّر.
  // =======================================================================
  try {
    const { canUseTspl, buildTsplLabel } = await import('./tsplLabel');
    if (canUseTspl(product, storeInfo)) {
      const { printRawViaQz } = await import('./qzPrint');
      const commands = buildTsplLabel({
        product,
        copies,
        settings: storeInfo?.barcodeLabelSettings || {},
        storeInfo
      });
      const res = await printRawViaQz(commands, { purpose: 'barcode', storeInfo });
      if (res?.handled) return true;
      console.warn('[Print] تعذّرت طباعة TSPL، سيُطبع الملصق بـ HTML:', res?.reason);
    }
  } catch (e) {
    console.warn('[Print] طبقة TSPL غير متاحة، سيُطبع الملصق بـ HTML:', e?.message || e);
  }

  // الملصقات وحدها تذهب لطابعة الباركود المحفوظة، لا للطابعة الافتراضية
  return printHtmlDirectly(fullHtml, `ملصقات_${prodName}`, { purpose: 'barcode', storeInfo });
};

/**
 * توليد وطباعة تقرير إغلاق الوردية Z-Report
 */
// يبني تقرير الوردية كـ HTML (يُستخدم للطباعة وللإرسال كصورة أو PDF)
export const buildZReportHtml = (rep, storeInfo, users = []) => {
  const storeName = storeInfo?.name || 'بيت الورد للزهور والهدايا';
  const currency = storeInfo?.currency || 'ر.س';

  let paymentRowsHtml = '';
  if (rep.paymentMethodsBreakdown && typeof rep.paymentMethodsBreakdown === 'object') {
    const methodsList = Object.values(rep.paymentMethodsBreakdown).filter(m => Number(m.amount) > 0);
    if (methodsList.length > 0) {
      methodsList.forEach(m => {
        const splitLabel = m.splitCount > 0 ? ` • منها ${m.splitCount} مجزأة` : '';
        const countLabel = m.count === 1 ? 'حركة دفع' : 'حركات دفع';
        paymentRowsHtml += `<div class="row"><span>• مبيعات ${esc(m.name)}:</span> <b>${formatMoney(m.amount, currency)} (${m.count || 1} ${countLabel}${splitLabel})</b></div>`;
      });
    } else {
      paymentRowsHtml += `<div class="row"><span>• لا توجد مبيعات</span> <b>0.00 ${currency}</b></div>`;
    }
  } else {
    if (Number(rep.cashSales) > 0) paymentRowsHtml += `<div class="row"><span>• مبيعات كاش (نقدي):</span> <b>${formatMoney(rep.cashSales, currency)}</b></div>`;
    if (Number(rep.cardSales) > 0) paymentRowsHtml += `<div class="row"><span>• مبيعات مدى / شبكة:</span> <b>${formatMoney(rep.cardSales, currency)}</b></div>`;
    if (Number(rep.creditSales) > 0) paymentRowsHtml += `<div class="row"><span>• مبيعات آجل / ذمم:</span> <b>${formatMoney(rep.creditSales, currency)}</b></div>`;
    if (Number(rep.bankSales || rep.transferSales) > 0) paymentRowsHtml += `<div class="row"><span>• مبيعات تحويل بنكي:</span> <b>${formatMoney(rep.bankSales || rep.transferSales, currency)}</b></div>`;
    if (Number(rep.visaSales) > 0) paymentRowsHtml += `<div class="row"><span>• مبيعات فيزا:</span> <b>${formatMoney(rep.visaSales, currency)}</b></div>`;
    if (Number(rep.tamaraSales) > 0) paymentRowsHtml += `<div class="row"><span>• مبيعات تمارا:</span> <b>${formatMoney(rep.tamaraSales, currency)}</b></div>`;
    if (Number(rep.ninjaSales) > 0) paymentRowsHtml += `<div class="row"><span>• مبيعات تطبيق نينجا:</span> <b>${formatMoney(rep.ninjaSales, currency)}</b></div>`;
  }

  const fullHtml = `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8" />
        <title>تقرير إغلاق الوردية Z-Report</title>
        <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap" rel="stylesheet">
        <style>
          * { box-sizing: border-box !important; margin: 0; padding: 0; }
          @page { size: auto; margin: 0mm !important; }
          @media print {
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              width: 100% !important;
              background: #fff !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
          }
          body {
            margin: 0 auto;
            padding: 2mm 0;
            font-family: 'Cairo', sans-serif;
            font-size: 10px;
            background: #fff;
            color: #000;
            direction: rtl;
            text-align: right;
            width: 100%;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .zreport-container {
            width: 100%;
            max-width: 66mm;
            margin: 0 auto;
            padding: 1.5mm 2mm;
            box-sizing: border-box;
          }
          .header { text-align: center; border-bottom: 1.5px dashed #000; padding-bottom: 2mm; margin-bottom: 2.5mm; }
          .store-name { font-size: 12pt; font-weight: 900; }
          .report-title { font-size: 10pt; font-weight: 900; margin: 1.5mm 0; background: #000; color: #fff; padding: 1mm; border-radius: 1mm; text-align: center; }
          .cashier-box { border: 1.2px solid #000; padding: 2mm; margin-bottom: 2.5mm; border-radius: 1.5mm; background: #f9f9f9; }
          .cashier-name { font-size: 10pt; font-weight: 900; color: #000; }
          .row { display: flex; justify-content: space-between; align-items: center; gap: 2mm; margin: 1.2mm 0; font-size: 8.5pt; }
          .row-bold { font-weight: 900; font-size: 9.5pt; }
          .divider { border-top: 1px dashed #000; margin: 2mm 0; }
          .total-row { border-top: 1.5px solid #000; border-bottom: 1.5px solid #000; padding: 1.8mm 0; font-size: 11pt; font-weight: 900; }
          .footer { text-align: center; margin-top: 3mm; font-size: 7.5pt; border-top: 1px dashed #000; padding-top: 1.5mm; color: #444; }
          .signature-box { margin-top: 3.5mm; display: flex; justify-content: space-between; gap: 2mm; font-size: 7.5pt; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="zreport-container">
        <div class="header">
          <div class="store-name">${storeName} 🌸</div>
          <div class="report-title">تقرير إغلاق الوردية (Z-Report)</div>
          <div>رقم الوردية: #${rep.id || 1}</div>
        </div>

        <div class="cashier-box">
          <div class="row"><span style="font-weight:bold;">الكاشير المسؤول:</span> <span class="cashier-name">${esc(resolveUserName(rep, users) || rep.cashierName || 'الكاشير')}</span></div>
          <div class="row"><span>وقت البدء:</span> <span>${formatDate(rep.openedAt)}</span></div>
          <div class="row"><span>وقت الإغلاق:</span> <span>${formatDate(rep.closedAt || new Date())}</span></div>
          <div class="row"><span>العهدة الافتتاحية:</span> <b>${formatMoney(rep.openingCash || rep.startCash || 0, currency)}</b></div>
        </div>

        <div class="divider"></div>

        <div class="row"><span>عدد الفواتير المنفذة:</span> <b>${rep.totalOrders || rep.invoicesCount || 0} فاتورة${Number(rep.splitInvoicesCount) > 0 ? ` <small style="font-weight:normal; font-size:9px;">(منها ${rep.splitInvoicesCount} مجزأة • ${rep.paymentOperationsCount || (rep.totalOrders || rep.invoicesCount || 0)} حركة دفع)</small>` : ''}</b></div>
        <div class="row"><span>إجمالي المبيعات الإجمالية:</span> <b>${formatMoney(rep.totalSales, currency)}</b></div>
        <div class="row"><span>إجمالي الخصومات:</span> <span>-${formatMoney(rep.totalDiscounts || 0, currency)}</span></div>
        <div class="row"><span>ضريبة القيمة المضافة:</span> <span>${formatMoney(rep.taxAmount || 0, currency)}</span></div>
        
        <div class="divider"></div>
        <div style="font-weight:900; margin-bottom:1mm;">توزيع وسائل الدفع:</div>
        ${paymentRowsHtml}

        <div class="divider"></div>
        <div style="font-weight:900; margin-bottom:1mm;">حركة تدفق نقدية الدرج:</div>
        <div class="row"><span>العهدة الافتتاحية:</span> <b>${formatMoney(rep.openingCash || rep.startCash || 0, currency)}</b></div>
        <div class="row"><span>مبيعات النقد (كاش):</span> <b>+${formatMoney(rep.cashSales || 0, currency)}</b></div>
        ${Number(rep.cashRefunds) > 0 ? `<div class="row"><span>مرتجعات نقدية للعملاء:</span> <span>-${formatMoney(rep.cashRefunds, currency)}</span></div>` : ''}
        ${Number(rep.cashIn) > 0 ? `<div class="row"><span>إيداعات نقدية / تحصيل:</span> <span>+${formatMoney(rep.cashIn, currency)}</span></div>` : ''}
        ${Number(rep.cashOut) > 0 ? `<div class="row"><span>سحب نقدي / ترحيل:</span> <span>-${formatMoney(rep.cashOut, currency)}</span></div>` : ''}
        ${Number(rep.totalExpenses) > 0 ? `<div class="row"><span>مصروفات تشغيلية نقدية:</span> <span>-${formatMoney(rep.totalExpenses, currency)}</span></div>` : ''}
        ${Number(rep.totalPurchases) > 0 ? `<div class="row"><span>مشتريات وتوريد نقدي:</span> <span>-${formatMoney(rep.totalPurchases, currency)}</span></div>` : ''}

        <div class="total-row row">
          <span>صافي درج النقدية:</span>
          <span>${formatMoney(rep.expectedCash || rep.netCashInDrawer || ((rep.openingCash || rep.startCash || 0) + (rep.cashSales || 0) - (rep.totalExpenses || 0)), currency)}</span>
        </div>

        <div class="divider"></div>
        <div class="row row-bold"><span>النقدية المتوقعة بالدرج:</span> <span>${formatMoney(rep.expectedCash, currency)}</span></div>
        <div class="row row-bold" style="font-size: 11pt;"><span>النقدية الفعلية المحصاة:</span> <span>${formatMoney(rep.actualCash, currency)}</span></div>
        
        <div class="row row-bold" style="font-size: 11pt; padding: 1.5mm 0; background: #eee; border-radius: 1mm; padding: 1mm 2mm;">
          <span>الفارق (عجز/زيادة):</span>
          <span>${rep.difference === 0 ? 'مطابق تماماً (0.00) ✅' : rep.difference > 0 ? `+${formatMoney(rep.difference, currency)} (فائض)` : `${formatMoney(rep.difference, currency)} (عجز)`}</span>
        </div>

        ${rep.notes ? `<div style="margin-top:2mm; font-size:8.5pt;"><strong>ملاحظات:</strong> ${esc(rep.notes)}</div>` : ''}

        <div class="signature-box">
          <div>توقيع الكاشير: ....................</div>
          <div>اعتماد الإدارة: ....................</div>
        </div>

        <div class="footer">
          تم إصدار هذا التقرير تلقائياً بواسطة نظام بيت الورد 🌸<br/>
          ${new Date().toLocaleString('ar-SA')}
        </div>
        </div>
      </body>
    </html>
  `;

  return fullHtml;
};

// الطباعة المباشرة لتقرير الوردية
export const printZReportHtml = (rep, storeInfo, users = []) =>
  printHtmlDirectly(buildZReportHtml(rep, storeInfo, users), 'تقرير_الوردية_Z', { purpose: 'report', storeInfo });

/**
 * تحميل أداة تشغيل الكاشير بالطباعة الفورية الصامتة لويندوز (Windows Kiosk Silent Print Launcher)
 * تقوم بإنشاء ملف تشغيل .bat يفتح Chrome أو Edge مع تفعيل ميزة --kiosk-printing
 */
export const downloadWindowsKioskScript = (customUrl = null) => {
  const targetUrl = customUrl || (typeof window !== 'undefined' ? window.location.origin : 'https://flower-house-8888d.web.app');
  
  const batContent = `@echo off
chcp 65001 > nul
title 🌸 تشغيل نظام كاشير بيت الورد - الطباعة الفورية الصامتة
color 0b
cls
echo ================================================================
echo   🌸 تشغيل نظام نقطة بيع بيت الورد (FLOWER HOUSE POS)
echo   ⚡ نمط الطباعة الفورية الصامتة المباشرة (Direct Kiosk Silent Print)
echo ================================================================
echo.
echo [1/2] جاري فحص المتصفح وتفعيل نمط الطباعة الفورية بدون نوافذ...
echo.

set APP_URL=${targetUrl}

:: محاولة تشغيل Google Chrome
where chrome >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo تم العثور على Google Chrome! جاري فتح نقطة البيع...
    start "" chrome --kiosk-printing --app="%APP_URL%"
    goto SUCCESS
)

if exist "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" (
    echo تم العثور على Google Chrome في مجلد البرامج!
    start "" "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" --kiosk-printing --app="%APP_URL%"
    goto SUCCESS
)

if exist "%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe" (
    echo تم العثور على Google Chrome!
    start "" "%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe" --kiosk-printing --app="%APP_URL%"
    goto SUCCESS
)

if exist "%LocalAppData%\\Google\\Chrome\\Application\\chrome.exe" (
    echo تم العثور على Google Chrome في مجلد المستخدم!
    start "" "%LocalAppData%\\Google\\Chrome\\Application\\chrome.exe" --kiosk-printing --app="%APP_URL%"
    goto SUCCESS
)

:: محاولة تشغيل Microsoft Edge كبديل ذكي
where msedge >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo تم العثور على Microsoft Edge! جاري فتح نقطة البيع...
    start "" msedge --kiosk-printing --app="%APP_URL%"
    goto SUCCESS
)

if exist "%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe" (
    echo تم العثور على Microsoft Edge!
    start "" "%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe" --kiosk-printing --app="%APP_URL%"
    goto SUCCESS
)

echo [!] تنبيه: لم يتم العثور على Chrome أو Edge تلقائياً. يرجى تثبيت Google Chrome.
pause
exit

:SUCCESS
echo.
echo [2/2] تم تشغيل نقطة البيع بنجاح! 🌸
echo الآن ستتم طباعة الفواتير فوراً على الطابعة الافتراضية بدون نافذة طابعة.
timeout /t 3 > nul
exit
`;

  try {
    const blob = new Blob([batContent], { type: 'application/x-bat;charset=utf-8' });
    const downloadLink = document.createElement('a');
    downloadLink.href = URL.createObjectURL(blob);
    downloadLink.download = 'تشغيل_كاشير_بيت_الورد_طباعة_صامتة.bat';
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    setTimeout(() => URL.revokeObjectURL(downloadLink.href), 1000);
    return true;
  } catch (err) {
    console.error('Failed to generate kiosk launcher:', err);
    return false;
  }
};

/**
 * توليد وطباعة سند سحب وترحيل نقدي إلى الخزينة الرئيسية (Treasury Safe Drop Voucher)
 */
export const printTreasuryDropVoucherHtml = (tx, storeInfo, activeShift, users = []) => {
  const storeName = storeInfo?.name || 'بيت الورد للزهور والهدايا';
  const currency = storeInfo?.currency || 'ر.س';
  const voucherNo = tx.voucherNo || `TR-${Date.now().toString().slice(-6)}`;
  const cashierName = resolveUserName(tx, users) || tx.user || (activeShift ? resolveUserName(activeShift, users) : '') || 'كاشير';
  const recipient = tx.recipient || 'أمين الخزينة الرئيسية';
  const dateStr = formatDate(tx.date || new Date().toISOString());

  const fullHtml = `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8" />
        <title>سند سحب وترحيل للخزينة - ${voucherNo}</title>
        <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap" rel="stylesheet">
        <style>
          * { box-sizing: border-box !important; margin: 0; padding: 0; }
          @page { size: auto; margin: 0mm !important; }
          @media print {
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              width: 100% !important;
              background: #fff !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
          }
          body {
            margin: 0 auto;
            padding: 2mm 0;
            font-family: 'Cairo', sans-serif;
            font-size: 10px;
            background: #fff;
            color: #000;
            direction: rtl;
            text-align: right;
            width: 100%;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .voucher-container {
            width: 100%;
            max-width: 66mm;
            margin: 0 auto;
            padding: 1.5mm 2mm;
            box-sizing: border-box;
          }
          .header { text-align: center; border-bottom: 1.5px dashed #000; padding-bottom: 2mm; margin-bottom: 2.5mm; }
          .store-name { font-size: 12pt; font-weight: 900; }
          .voucher-title { font-size: 9.5pt; font-weight: 900; margin: 1.5mm 0; background: #000; color: #fff; padding: 1mm; border-radius: 1mm; text-align: center; }
          .box { border: 1.2px solid #000; padding: 2mm; margin-bottom: 2.5mm; border-radius: 1.5mm; background: #fafafa; }
          .row { display: flex; justify-content: space-between; align-items: center; gap: 2mm; margin: 1.2mm 0; font-size: 8.5pt; }
          .amount-box { border: 1.5px solid #000; padding: 2.5mm 1.5mm; text-align: center; margin: 2.5mm 0; border-radius: 2mm; }
          .amount-val { font-size: 14pt; font-weight: 900; color: #000; }
          .signatures { display: flex; justify-content: space-between; gap: 3mm; margin-top: 4mm; padding-top: 2mm; border-top: 1px dashed #000; font-size: 8pt; font-weight: bold; }
          .sig-col { width: 48%; text-align: center; }
          .sig-line { margin-top: 6mm; border-top: 1px dotted #000; text-align: center; font-size: 7.5pt; padding-top: 1mm; }
          .footer { text-align: center; margin-top: 3mm; font-size: 7pt; color: #555; }
        </style>
      </head>
      <body>
        <div class="voucher-container">
          <div class="header">
            <div class="store-name">${storeName} 🌸</div>
            <div class="voucher-title">سند سحب وترحيل للخزينة الرئيسية</div>
            <div style="font-weight: bold; margin-top: 1mm; font-size: 8.5pt;">رقم السند: ${voucherNo}</div>
          </div>

          <div class="box">
            <div class="row">
              <span style="color:#333; shrink-0">التاريخ:</span>
              <span style="font-weight:bold; font-size:8pt; text-align:left;">${dateStr}</span>
            </div>
            <div class="row">
              <span>الكاشير المسلّم:</span>
              <span style="font-weight:900;">${esc(cashierName)}</span>
            </div>
            <div class="row">
              <span>المستلم / الخزينة:</span>
              <span style="font-weight:900;">${esc(recipient)}</span>
            </div>
            ${tx.authorizedBy ? `
            <div class="row">
              <span>المدير المشرف:</span>
              <span style="font-weight:900; color:#000;">${esc(tx.authorizedBy)} 👑</span>
            </div>` : ''}
            ${activeShift?.id ? `
            <div class="row">
              <span>رقم الوردية:</span>
              <span style="font-family: monospace; font-size: 7.5pt; word-break: break-all;">${activeShift.id}</span>
            </div>` : ''}
          </div>

          <div class="amount-box">
            <div style="font-size: 8pt; font-weight: bold; color: #333;">المبلغ المرحل إلى الخزينة:</div>
            <div class="amount-val">${formatMoney(tx.amount, currency)}</div>
            ${tx.reason ? `<div style="font-size: 7.5pt; color: #444; margin-top: 1mm; word-break: break-word;">السبب: ${esc(tx.reason)}</div>` : ''}
          </div>

          <div class="signatures">
            <div class="sig-col">
              <div>توقيع الكاشير المسلّم:</div>
              <div class="sig-line">${esc(cashierName)}</div>
            </div>
            <div class="sig-col">
              <div>توقيع واعتماد المستلم:</div>
              <div class="sig-line">${esc(tx.authorizedBy || recipient)}</div>
            </div>
          </div>

          <div class="footer">
            <div>نظام بيت الورد السحابي لنقاط البيع 🌸</div>
            <div>تم التوثيق والمزامنة السحابية آلياً</div>
          </div>
        </div>
      </body>
    </html>
  `;

  return printHtmlDirectly(fullHtml, `سند_ترحيل_${voucherNo}`, { purpose: 'report', storeInfo });
};

/**
 * طباعة سند استلام وتسليم كاش الوردية وتبرئة ذمة الكاشير
 */
export const printShiftHandoverVoucherHtml = (handoverData, storeInfo = {}, users = []) => {
  const storeName = storeInfo.name || 'بيت الورد';
  const currency = storeInfo.currency || 'ر.س';
  const dateStr = formatDate(handoverData.date || new Date().toISOString());
  const voucherNo = handoverData.voucherNo || `REC-SH-${Date.now().toString().slice(-6)}`;
  const cashierName = resolveUserName(handoverData, users) || handoverData.cashierName || 'كاشير نقطة البيع';
  const managerName = resolveUserName(handoverData.managerName || handoverData.user || 'المدير', users) || 'مدير المتجر';
  const amount = Number(handoverData.amount) || 0;

  const fullHtml = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
      <head>
        <meta charset="utf-8" />
        <title>سند_استلام_كاش_وردية_${voucherNo}</title>
        <style>
          @page { size: auto; margin: 0; }
          body {
            font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif;
            margin: 0;
            padding: 2.5mm 3mm;
            color: #000;
            background: #fff;
            font-size: 9pt;
            line-height: 1.35;
            width: 100%;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .voucher-container {
            width: 100%;
            max-width: 68mm;
            margin: 0 auto;
            padding: 1.5mm 2mm;
            box-sizing: border-box;
          }
          .header { text-align: center; border-bottom: 1.5px dashed #000; padding-bottom: 2mm; margin-bottom: 2.5mm; }
          .store-name { font-size: 12pt; font-weight: 900; }
          .voucher-title { font-size: 9.5pt; font-weight: 900; margin: 1.5mm 0; background: #000; color: #fff; padding: 1.2mm; border-radius: 1mm; text-align: center; }
          .box { border: 1.2px solid #000; padding: 2mm; margin-bottom: 2.5mm; border-radius: 1.5mm; background: #fafafa; }
          .row { display: flex; justify-content: space-between; align-items: center; gap: 2mm; margin: 1.2mm 0; font-size: 8.5pt; }
          .amount-box { border: 1.5px solid #000; padding: 2.5mm 1.5mm; text-align: center; margin: 2.5mm 0; border-radius: 2mm; background: #fdfdfd; }
          .amount-val { font-size: 14pt; font-weight: 900; color: #000; }
          .signatures { display: flex; justify-content: space-between; gap: 3mm; margin-top: 4mm; padding-top: 2mm; border-top: 1px dashed #000; font-size: 8pt; font-weight: bold; }
          .sig-col { width: 48%; text-align: center; }
          .sig-line { margin-top: 6mm; border-top: 1px dotted #000; text-align: center; font-size: 7.5pt; padding-top: 1mm; }
          .footer { text-align: center; margin-top: 3mm; font-size: 7pt; color: #555; }
        </style>
      </head>
      <body>
        <div class="voucher-container">
          <div class="header">
            <div class="store-name">${storeName} 🌸</div>
            <div class="voucher-title">سند استلام نقدية وردية (تبرئة ذمة)</div>
            <div style="font-weight: bold; margin-top: 1mm; font-size: 8.5pt;">رقم السند: ${voucherNo}</div>
          </div>

          <div class="box">
            <div class="row">
              <span>التاريخ والتوقيت:</span>
              <span style="font-weight:bold; font-size:8pt;">${dateStr}</span>
            </div>
            <div class="row">
              <span>الكاشير المسلّم:</span>
              <span style="font-weight:900;">${esc(cashierName)}</span>
            </div>
            <div class="row">
              <span>المدير المستلم:</span>
              <span style="font-weight:900; color:#000;">${esc(managerName)} 👑</span>
            </div>
            ${handoverData.shiftId ? `
            <div class="row">
              <span>معرف الوردية:</span>
              <span style="font-family: monospace; font-size: 7.5pt;">${String(handoverData.shiftId).slice(-10)}</span>
            </div>` : ''}
          </div>

          <div class="amount-box">
            <div style="font-size: 8pt; font-weight: bold; color: #333;">المبلغ النقدي المستلم فعلياً:</div>
            <div class="amount-val">${formatMoney(amount, currency)}</div>
            ${handoverData.notes ? `<div style="font-size: 7.5pt; color: #444; margin-top: 1.5mm; word-break: break-word;">ملاحظات: ${esc(handoverData.notes)}</div>` : ''}
          </div>

          <div class="signatures">
            <div class="sig-col">
              <div>توقيع الكاشير المسلّم:</div>
              <div class="sig-line">${esc(cashierName)}</div>
            </div>
            <div class="sig-col">
              <div>توقيع المدير المستلم:</div>
              <div class="sig-line">${esc(managerName)}</div>
            </div>
          </div>

          <div class="footer">
            <div>نظام بيت الورد السحابي لنقاط البيع 🌸</div>
            <div>تم استلام العهدة ودخولها خزينة الإدارة رسمياً</div>
          </div>
        </div>
      </body>
    </html>
  `;

  return printHtmlDirectly(fullHtml, `سند_استلام_كاش_${voucherNo}`, { purpose: 'report', storeInfo });
};

/**
 * طباعة سند إيداع بنكي للمبيعات والنقدية
 */
export const printBankDepositVoucherHtml = (depositData, storeInfo = {}) => {
  const storeName = storeInfo.name || 'بيت الورد';
  const currency = storeInfo.currency || 'ر.س';
  const dateStr = formatDate(depositData.date || new Date().toISOString());
  const voucherNo = depositData.voucherNo || `BNK-${Date.now().toString().slice(-6)}`;
  const bankName = depositData.bankName || 'البنك';
  const slipNumber = depositData.depositSlipNumber || 'بدون إيصال';
  const managerName = depositData.user || 'مدير المتجر';
  const amount = Number(depositData.depositAmount || Math.abs(depositData.amount)) || 0;

  const fullHtml = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
      <head>
        <meta charset="utf-8" />
        <title>سند_إيداع_بنكي_${voucherNo}</title>
        <style>
          @page { size: auto; margin: 0; }
          body {
            font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif;
            margin: 0;
            padding: 2.5mm 3mm;
            color: #000;
            background: #fff;
            font-size: 9pt;
            line-height: 1.35;
            width: 100%;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .voucher-container {
            width: 100%;
            max-width: 68mm;
            margin: 0 auto;
            padding: 1.5mm 2mm;
            box-sizing: border-box;
          }
          .header { text-align: center; border-bottom: 1.5px dashed #000; padding-bottom: 2mm; margin-bottom: 2.5mm; }
          .store-name { font-size: 12pt; font-weight: 900; }
          .voucher-title { font-size: 9.5pt; font-weight: 900; margin: 1.5mm 0; background: #000; color: #fff; padding: 1.2mm; border-radius: 1mm; text-align: center; }
          .box { border: 1.2px solid #000; padding: 2mm; margin-bottom: 2.5mm; border-radius: 1.5mm; background: #fafafa; }
          .row { display: flex; justify-content: space-between; align-items: center; gap: 2mm; margin: 1.2mm 0; font-size: 8.5pt; }
          .amount-box { border: 1.5px solid #000; padding: 2.5mm 1.5mm; text-align: center; margin: 2.5mm 0; border-radius: 2mm; background: #fdfdfd; }
          .amount-val { font-size: 14pt; font-weight: 900; color: #000; }
          .signatures { display: flex; justify-content: space-between; gap: 3mm; margin-top: 4mm; padding-top: 2mm; border-top: 1px dashed #000; font-size: 8pt; font-weight: bold; }
          .sig-col { width: 48%; text-align: center; }
          .sig-line { margin-top: 6mm; border-top: 1px dotted #000; text-align: center; font-size: 7.5pt; padding-top: 1mm; }
          .footer { text-align: center; margin-top: 3mm; font-size: 7pt; color: #555; }
        </style>
      </head>
      <body>
        <div class="voucher-container">
          <div class="header">
            <div class="store-name">${storeName} 🌸</div>
            <div class="voucher-title">سند إيداع مبيعات بنكي 🏦</div>
            <div style="font-weight: bold; margin-top: 1mm; font-size: 8.5pt;">رقم السند: ${voucherNo}</div>
          </div>

          <div class="box">
            <div class="row">
              <span>التاريخ والتوقيت:</span>
              <span style="font-weight:bold; font-size:8pt;">${dateStr}</span>
            </div>
            <div class="row">
              <span>البنك المودع فيه:</span>
              <span style="font-weight:900;">${esc(bankName)}</span>
            </div>
            <div class="row">
              <span>رقم إيصال الإيداع:</span>
              <span style="font-weight:900; font-family:monospace;">${esc(slipNumber)}</span>
            </div>
            <div class="row">
              <span>المودع (المدير):</span>
              <span style="font-weight:900;">${esc(managerName)} 👑</span>
            </div>
          </div>

          <div class="amount-box">
            <div style="font-size: 8pt; font-weight: bold; color: #333;">المبلغ المودع في الحساب البنكي:</div>
            <div class="amount-val">${formatMoney(amount, currency)}</div>
            ${depositData.notes ? `<div style="font-size: 7.5pt; color: #444; margin-top: 1.5mm; word-break: break-word;">ملاحظات: ${esc(depositData.notes)}</div>` : ''}
          </div>

          <div class="signatures">
            <div class="sig-col">
              <div>توقيع مسؤول الإيداع:</div>
              <div class="sig-line">${esc(managerName)}</div>
            </div>
            <div class="sig-col">
              <div>اعتماد وختم الإدارة:</div>
              <div class="sig-line">إدارة المتجر</div>
            </div>
          </div>

          <div class="footer">
            <div>نظام بيت الورد السحابي لنقاط البيع 🌸</div>
            <div>تم ترحيل الكاش وتوثيق الإيداع البنكي محاسبياً</div>
          </div>
        </div>
      </body>
    </html>
  `;

  return printHtmlDirectly(fullHtml, `سند_إيداع_${voucherNo}`, { purpose: 'report', storeInfo });
};

// =====================================================================
//  سند تغذية درج الكاشير من خزينة المدير أو من البنك
// =====================================================================
//  قيد مزدوج: يزيد درج الكاشير وينقص المصدر. السند يُوقّعه الطرفان.
export const printDrawerFundingVoucherHtml = (data, storeInfo = {}) => {
  const storeName = storeInfo.name || 'بيت الورد';
  const currency = storeInfo.currency || 'ر.س';
  const dateStr = formatDate(data.date || new Date().toISOString());
  const voucherNo = data.voucherNo || `FUND-${Date.now().toString().slice(-6)}`;
  const cashierName = data.cashierName || 'الكاشير';
  const managerName = data.managerName || data.user || 'مدير المتجر';
  const sourceLabel = data.sourceLabel || (data.fundingSource === 'bank' ? 'الحساب البنكي' : 'كاش خزينة المدير');
  const amount = Number(data.amount) || 0;
  const isPending = Boolean(data.isPendingFloat);
  const docTitle = isPending ? 'سند تسليم عهدة كاشير 🤝' : 'سند تغذية درج كاشير 💵';

  const fullHtml = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
      <head>
        <meta charset="utf-8" />
        <title>سند_تغذية_درج_${voucherNo}</title>
        <style>
          @page { size: auto; margin: 0; }
          body { font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif; margin: 0; padding: 2.5mm 3mm; color: #000; background: #fff; font-size: 9pt; line-height: 1.35; width: 100%; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .voucher-container { width: 100%; max-width: 68mm; margin: 0 auto; padding: 1.5mm 2mm; box-sizing: border-box; }
          .header { text-align: center; border-bottom: 1.5px dashed #000; padding-bottom: 2mm; margin-bottom: 2.5mm; }
          .store-name { font-size: 12pt; font-weight: 900; }
          .voucher-title { font-size: 9.5pt; font-weight: 900; margin: 1.5mm 0; background: #000; color: #fff; padding: 1.2mm; border-radius: 1mm; text-align: center; }
          .box { border: 1.2px solid #000; padding: 2mm; margin-bottom: 2.5mm; border-radius: 1.5mm; background: #fafafa; }
          .row { display: flex; justify-content: space-between; align-items: center; gap: 2mm; margin: 1.2mm 0; font-size: 8.5pt; }
          .amount-box { border: 1.5px solid #000; padding: 2.5mm 1.5mm; text-align: center; margin: 2.5mm 0; border-radius: 2mm; background: #fdfdfd; }
          .amount-val { font-size: 14pt; font-weight: 900; color: #000; }
          .entry { border: 1px dotted #000; border-radius: 1.5mm; padding: 1.5mm 2mm; margin-bottom: 2.5mm; font-size: 8pt; }
          .signatures { display: flex; justify-content: space-between; gap: 3mm; margin-top: 4mm; padding-top: 2mm; border-top: 1px dashed #000; font-size: 8pt; font-weight: bold; }
          .sig-col { width: 48%; text-align: center; }
          .sig-line { margin-top: 6mm; border-top: 1px dotted #000; text-align: center; font-size: 7.5pt; padding-top: 1mm; }
          .footer { text-align: center; margin-top: 3mm; font-size: 7pt; color: #555; }
        </style>
      </head>
      <body>
        <div class="voucher-container">
          <div class="header">
            <div class="store-name">${storeName} 🌸</div>
            <div class="voucher-title">${docTitle}</div>
            <div style="font-weight: bold; margin-top: 1mm; font-size: 8.5pt;">رقم السند: ${voucherNo}</div>
          </div>

          <div class="box">
            <div class="row"><span>التاريخ والتوقيت:</span><span style="font-weight:bold; font-size:8pt;">${dateStr}</span></div>
            <div class="row"><span>الكاشير المستلم:</span><span style="font-weight:900;">${esc(cashierName)} 🌸</span></div>
            <div class="row"><span>مصدر الزيادة:</span><span style="font-weight:900;">${esc(sourceLabel)}</span></div>
            <div class="row"><span>المُسلِّم (المدير):</span><span style="font-weight:900;">${esc(managerName)} 👑</span></div>
            ${data.shiftId ? `<div class="row"><span>رقم الوردية:</span><span style="font-family:monospace; font-size:7.5pt;">${data.shiftId}</span></div>` : ''}
          </div>

          <div class="amount-box">
            <div style="font-size: 8pt; font-weight: bold; color: #333;">${isPending ? 'المبلغ المُسلَّم كعهدة (رصيد افتتاحي عند فتح الوردية):' : 'المبلغ المُضاف إلى درج الكاشير:'}</div>
            <div class="amount-val">${formatMoney(amount, currency)}</div>
            ${data.notes ? `<div style="font-size: 7.5pt; color: #444; margin-top: 1.5mm; word-break: break-word;">ملاحظات: ${esc(data.notes)}</div>` : ''}
          </div>

          <div class="entry">
            <div style="font-weight:900; margin-bottom:1mm;">القيد المحاسبي المزدوج:</div>
            <div class="row"><span>مدين — درج الكاشير (${esc(cashierName)}):</span><span style="font-weight:900;">${formatMoney(amount, currency)}</span></div>
            <div class="row"><span>دائن — ${esc(sourceLabel)}:</span><span style="font-weight:900;">${formatMoney(amount, currency)}</span></div>
          </div>

          <div class="signatures">
            <div class="sig-col">
              <div>توقيع المُسلِّم (الإدارة):</div>
              <div class="sig-line">${esc(managerName)}</div>
            </div>
            <div class="sig-col">
              <div>توقيع المستلم (الكاشير):</div>
              <div class="sig-line">${esc(cashierName)}</div>
            </div>
          </div>

          <div class="footer">
            <div>نظام بيت الورد السحابي لنقاط البيع 🌸</div>
            <div>${isPending ? 'تصير هذه العهدة الرصيد الافتتاحي المثبَّت عند فتح الوردية' : 'تُضاف هذه الزيادة إلى عهدة الكاشير وتُحسب عليه عند إقفال الوردية'}</div>
          </div>
        </div>
      </body>
    </html>
  `;

  return printHtmlDirectly(fullHtml, `سند_تغذية_درج_${voucherNo}`, { purpose: 'report', storeInfo });
};

/**
 * طباعة الفاتورة حرارياً بشكل مباشر وفوري في الخلفية مع توليد الـ QR code تلقائياً
 * تستخدم للطباعة الفورية السريعة عند إتمام البيع دون الحاجة لفتح أي نوافذ
 */
export const printInvoiceDirectly = async ({ invoice, storeInfo, users = [] }) => {
  if (!invoice) return false;
  const printSettings = storeInfo?.invoicePrintSettings || {};

  // فحص صارم وموثوق: هل المتجر والفاتورة خاضعان للضريبة بالفعل؟
  const isTaxActive = Boolean(
    storeInfo?.taxEnabled === true && 
    Number(storeInfo?.taxRate || 0) > 0 && 
    Number(invoice?.taxRate || 0) > 0 && 
    Number(invoice?.taxAmount || 0) > 0
  );

  let qrDataUrl = '';
  if (printSettings.showQrCode !== false) {
    try {
      let qrPayload = '';
      const qrType = printSettings.qrCodeType || 'zatca';

      if (qrType === 'custom_url' && printSettings.qrCustomUrl) {
        qrPayload = printSettings.qrCustomUrl;
      } else if (qrType === 'invoice_details') {
        qrPayload = `فاتورة: #${invoice.invoiceNumber}\nالمتجر: ${esc(storeInfo?.name || 'بيت الورد')}\nالتاريخ: ${formatDate(invoice.date)}\nالمبلغ: ${(Number(invoice.total) || 0).toFixed(2)} ${storeInfo?.currency || 'ر.س'}`;
      } else if (isTaxActive && storeInfo?.taxNumber) {
        qrPayload = generateZatcaTLV(
          storeInfo.name || 'Store',
          storeInfo.taxNumber,
          invoice.date || new Date().toISOString(),
          invoice.total || 0,
          invoice.taxAmount || 0
        );
      } else {
        qrPayload = `${esc(storeInfo?.name || 'Store')}|${invoice.invoiceNumber}|${invoice.date}|${(Number(invoice.total) || 0).toFixed(2)}`;
      }

      const qrWidth = printSettings.qrCodeSize === 'large' ? 220 : printSettings.qrCodeSize === 'small' ? 140 : 180;
      qrDataUrl = await QRCode.toDataURL(qrPayload, {
        width: qrWidth,
        margin: 1,
        errorCorrectionLevel: 'M',
        color: { dark: '#000000', light: '#ffffff' }
      });
    } catch (err) {
      console.warn('QR Code generation notice:', err);
    }
  }

  const titleAr = isTaxActive 
    ? (printSettings.invoiceTitleAr || 'فاتورة ضريبية مبسطة')
    : (printSettings.invoiceTitleAr && printSettings.invoiceTitleAr !== 'فاتورة ضريبية مبسطة' ? printSettings.invoiceTitleAr : 'فاتورة مبيعات');

  const titleEn = isTaxActive 
    ? (printSettings.invoiceTitleEn || 'Simplified Tax Invoice')
    : (printSettings.invoiceTitleEn && printSettings.invoiceTitleEn !== 'Simplified Tax Invoice' ? printSettings.invoiceTitleEn : 'Sales Invoice');

  const receiptHtml = buildReceiptHtml({
    invoice,
    storeInfo,
    qrDataUrl,
    isTaxActive,
    titleAr,
    titleEn,
    users
  });

  return printHtmlDirectly(receiptHtml, `فاتورة_${invoice.invoiceNumber}`, { purpose: 'invoice', storeInfo });
};

