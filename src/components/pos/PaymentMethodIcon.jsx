import React from 'react';
import {
  Banknote,
  CreditCard,
  UserCheck,
  Split,
  Smartphone,
  Sparkles,
  Zap,
  ShoppingBag,
  Gift,
  QrCode,
  Globe,
  Wallet
} from 'lucide-react';

export const PaymentMethodIcon = ({ method, className = 'w-7 h-7 sm:w-8 sm:h-8' }) => {
  if (!method) return <CreditCard className={className} />;

  if (method.image) {
    return (
      <div className="w-full h-full bg-white flex items-center justify-center p-0.5">
        <img src={method.image} alt={method.name} className="w-full h-full object-contain" />
      </div>
    );
  }

  const { iconName, type, id: methodId } = method;

  if (methodId === 'cash' || type === 'cash' || iconName === 'Banknote') {
    return (
      <svg viewBox="0 0 48 48" fill="none" className={`${className} drop-shadow-sm`}>
        <rect x="4" y="10" width="40" height="28" rx="6" fill="#10B981"/>
        <circle cx="24" cy="24" r="7" fill="#047857" stroke="#34D399" strokeWidth="2"/>
        <text x="24" y="27" textAnchor="middle" fill="#FFFFFF" fontSize="9" fontWeight="900" fontFamily="sans-serif">SAR</text>
        <circle cx="10" cy="24" r="2.5" fill="#34D399"/>
        <circle cx="38" cy="24" r="2.5" fill="#34D399"/>
      </svg>
    );
  }
  if (methodId === 'card') {
    return (
      <svg viewBox="0 0 48 48" fill="none" className={`${className} drop-shadow-sm`}>
        <rect x="4" y="8" width="40" height="32" rx="6" fill="#FFFFFF"/>
        <path d="M8 24C8 17.37 13.37 12 20 12H28C34.63 12 40 17.37 40 24C40 30.63 34.63 36 28 36H20C13.37 36 8 30.63 8 24Z" fill="#007A3D"/>
        <path d="M22 18H26C29.31 18 32 20.69 32 24C32 27.31 29.31 30 26 30H22V18Z" fill="#00A3E0"/>
        <text x="14" y="27" fill="#FFFFFF" fontSize="9" fontWeight="900" fontFamily="Cairo">مدى</text>
      </svg>
    );
  }
  if (methodId === 'visa') {
    return (
      <svg viewBox="0 0 48 48" fill="none" className={`${className} drop-shadow-sm`}>
        <rect x="4" y="8" width="40" height="32" rx="6" fill="#1A1F71"/>
        <text x="24" y="27" textAnchor="middle" fill="#FFFFFF" fontSize="11" fontStyle="italic" fontWeight="900" fontFamily="sans-serif">VISA</text>
        <rect x="6" y="32" width="36" height="2" fill="#F7B600"/>
      </svg>
    );
  }
  if (methodId === 'transfer' || iconName === 'Globe') {
    return (
      <svg viewBox="0 0 48 48" fill="none" className={`${className} drop-shadow-sm`}>
        <rect x="4" y="8" width="40" height="32" rx="6" fill="#2563EB"/>
        <path d="M24 13L11 20V22H37V20L24 13Z" fill="#93C5FD"/>
        <rect x="14" y="24" width="4" height="7" fill="#FFFFFF"/>
        <rect x="22" y="24" width="4" height="7" fill="#FFFFFF"/>
        <rect x="30" y="24" width="4" height="7" fill="#FFFFFF"/>
        <rect x="10" y="32" width="28" height="3" fill="#93C5FD"/>
      </svg>
    );
  }
  if (methodId === 'tamara' || iconName === 'Sparkles') {
    return (
      <svg viewBox="0 0 48 48" fill="none" className={`${className} drop-shadow-sm`}>
        <rect x="4" y="8" width="40" height="32" rx="6" fill="#FF8D6B"/>
        <circle cx="18" cy="22" r="6" fill="#FFFFFF"/>
        <circle cx="30" cy="22" r="6" fill="#2B1F4D"/>
        <text x="24" y="35" textAnchor="middle" fill="#FFFFFF" fontSize="7" fontWeight="bold" fontFamily="sans-serif">tamara</text>
      </svg>
    );
  }
  if (methodId === 'ninja' || iconName === 'Zap') {
    return (
      <svg viewBox="0 0 48 48" fill="none" className={`${className} drop-shadow-sm`}>
        <rect x="4" y="8" width="40" height="32" rx="6" fill="#E11D48"/>
        <path d="M26 14L16 26H24L22 34L32 22H24L26 14Z" fill="#FACC15"/>
      </svg>
    );
  }
  if (methodId === 'credit' || type === 'credit' || iconName === 'UserCheck') {
    return (
      <svg viewBox="0 0 48 48" fill="none" className={`${className} drop-shadow-sm`}>
        <rect x="4" y="8" width="40" height="32" rx="6" fill="#D97706"/>
        <circle cx="24" cy="19" r="5" fill="#FEF3C7"/>
        <path d="M15 32C15 27.5 19 25.5 24 25.5C29 25.5 33 27.5 33 32" stroke="#FEF3C7" strokeWidth="2.5" strokeLinecap="round"/>
      </svg>
    );
  }
  if (methodId === 'split' || iconName === 'Split') {
    return (
      <svg viewBox="0 0 48 48" fill="none" className={`${className} drop-shadow-sm`}>
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

  switch (iconName) {
    case 'Banknote': return <Banknote className="w-5 h-5 text-white" />;
    case 'CreditCard': return <CreditCard className="w-5 h-5 text-white" />;
    case 'Smartphone': return <Smartphone className="w-5 h-5 text-white" />;
    case 'Zap': return <Zap className="w-5 h-5 text-white" />;
    case 'Sparkles': return <Sparkles className="w-5 h-5 text-white" />;
    case 'ShoppingBag': return <ShoppingBag className="w-5 h-5 text-white" />;
    case 'UserCheck': return <UserCheck className="w-5 h-5 text-white" />;
    case 'Split': return <Split className="w-5 h-5 text-white" />;
    case 'Wallet': return <Wallet className="w-5 h-5 text-white" />;
    case 'Gift': return <Gift className="w-5 h-5 text-white" />;
    case 'QrCode': return <QrCode className="w-5 h-5 text-white" />;
    case 'Globe': return <Globe className="w-5 h-5 text-white" />;
    default:
      if (type === 'cash') return <Banknote className="w-5 h-5 text-white" />;
      if (type === 'credit') return <UserCheck className="w-5 h-5 text-white" />;
      if (type === 'split') return <Split className="w-5 h-5 text-white" />;
      return <CreditCard className="w-5 h-5 text-white" />;
  }
};
