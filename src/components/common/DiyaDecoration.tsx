import React from 'react';

interface DiyaProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const DiyaIcon: React.FC<DiyaProps> = ({ size = 'md', className = '' }) => {
  const dim = size === 'sm' ? 'w-6 h-6' : size === 'lg' ? 'w-12 h-12' : 'w-8 h-8';

  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${dim} ${className} inline-block`}
      aria-label="Diya festive lamp"
    >
      {/* Glow aura */}
      <circle cx="32" cy="18" r="14" fill="url(#flame-glow)" opacity="0.6" />
      {/* Flame */}
      <path
        d="M32 4C32 4 24 16 24 23C24 27.4183 27.5817 31 32 31C36.4183 31 40 27.4183 40 23C40 16 32 4 32 4Z"
        fill="url(#flame-gradient)"
        className="animate-diya origin-bottom"
      />
      {/* Inner bright flame */}
      <path
        d="M32 12C32 12 28 19 28 23C28 25.2 29.8 27 32 27C34.2 27 36 25.2 36 23C36 19 32 12 32 12Z"
        fill="#FEF08A"
      />
      {/* Diya Base Clay / Brass Pot */}
      <path
        d="M10 32C10 32 14 30 32 30C50 30 54 32 54 32C56 34 52 48 32 48C12 48 8 34 10 32Z"
        fill="url(#diya-brass)"
        stroke="#D97706"
        strokeWidth="1.5"
      />
      {/* Diya Base Stand */}
      <path
        d="M26 48L24 54C24 55 26 56 32 56C38 56 40 55 40 54L38 48H26Z"
        fill="url(#diya-stand)"
      />
      {/* Decorative dots on rim */}
      <circle cx="20" cy="34" r="1.5" fill="#FEF08A" />
      <circle cx="26" cy="35" r="1.5" fill="#FEF08A" />
      <circle cx="32" cy="35.5" r="1.5" fill="#FEF08A" />
      <circle cx="38" cy="35" r="1.5" fill="#FEF08A" />
      <circle cx="44" cy="34" r="1.5" fill="#FEF08A" />

      <defs>
        <radialGradient id="flame-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#F59E0B" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="flame-gradient" x1="32" y1="4" x2="32" y2="31" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FBBF24" />
          <stop offset="40%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#DC2626" />
        </linearGradient>
        <linearGradient id="diya-brass" x1="10" y1="30" x2="54" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#D97706" />
          <stop offset="50%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#B45309" />
        </linearGradient>
        <linearGradient id="diya-stand" x1="24" y1="48" x2="40" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#B45309" />
          <stop offset="100%" stopColor="#78350F" />
        </linearGradient>
      </defs>
    </svg>
  );
};

export const RangoliMotif: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg
    viewBox="0 0 100 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`h-6 w-32 ${className}`}
  >
    <path
      d="M0 12 Q25 0 50 12 Q75 24 100 12"
      stroke="url(#rangoli-gold)"
      strokeWidth="1.5"
      fill="none"
    />
    <circle cx="50" cy="12" r="3" fill="#FBBF24" />
    <circle cx="25" cy="6" r="2" fill="#F59E0B" />
    <circle cx="75" cy="18" r="2" fill="#F59E0B" />
    <defs>
      <linearGradient id="rangoli-gold" x1="0" y1="12" x2="100" y2="12" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#7E22CE" stopOpacity="0.2" />
        <stop offset="50%" stopColor="#FBBF24" />
        <stop offset="100%" stopColor="#7E22CE" stopOpacity="0.2" />
      </linearGradient>
    </defs>
  </svg>
);
