// 角色圖：五個階段，每晉升一次多一樣配件（全部用程式畫，不需要圖片）

const BG = ['#dbeafe', '#d1fae5', '#e0e7ff', '#fde68a', '#fcd34d'];
const SKIN = '#f2c9a5';
const HAIR = '#2d2a26';
let seq = 0;

function body(stage) {
  const shoulders = 'M14 124 C14 96 34 84 60 84 C86 84 106 96 106 124 Z';
  const shirtV = 'M50 84 L60 102 L70 84 Z';
  switch (stage) {
    case 0: // 見習：淺藍 polo 衫
      return `<path d="${shoulders}" fill="#60a5fa"/>
        <path d="M48 84 L60 96 L72 84 L66 84 L60 90 L54 84 Z" fill="#dbeafe"/>
        <rect x="70" y="100" width="14" height="10" rx="2" fill="#1e3a8a" opacity=".5"/>`;
    case 1: // 安全專員：白襯衫＋識別證
      return `<path d="${shoulders}" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1"/>
        <path d="M50 84 L60 94 L70 84" fill="none" stroke="#cbd5e1" stroke-width="2"/>
        <path d="M52 86 L60 108 L68 86" fill="none" stroke="#2563eb" stroke-width="2.5"/>
        <rect x="53" y="106" width="14" height="11" rx="2" fill="#fff" stroke="#2563eb" stroke-width="1.5"/>
        <rect x="56" y="109" width="8" height="2" fill="#2563eb"/>`;
    case 2: // 資安調查員：灰色外套＋識別證
      return `<path d="${shoulders}" fill="#475569"/>
        <path d="${shirtV}" fill="#f8fafc"/>
        <path d="M50 84 L58 112 L44 96 Z M70 84 L62 112 L76 96 Z" fill="#334155"/>
        <path d="M54 88 L60 104 L66 88" fill="none" stroke="#22c55e" stroke-width="2"/>
        <rect x="54" y="102" width="12" height="10" rx="2" fill="#fff" stroke="#22c55e" stroke-width="1.5"/>`;
    case 3: // 企業安全分析師：深藍西裝＋紅領帶
      return `<path d="${shoulders}" fill="#1e3a5f"/>
        <path d="${shirtV}" fill="#f8fafc"/>
        <path d="M58 88 L62 88 L64 110 L60 116 L56 110 Z" fill="#b91c1c"/>
        <path d="M50 84 L58 114 L42 96 Z M70 84 L62 114 L78 96 Z" fill="#16304f"/>`;
    default: // 企業安全主管：黑西裝＋金領帶＋徽章＋耳機
      return `<path d="${shoulders}" fill="#111827"/>
        <path d="${shirtV}" fill="#f8fafc"/>
        <path d="M58 88 L62 88 L64 110 L60 116 L56 110 Z" fill="#d97706"/>
        <path d="M50 84 L58 114 L42 96 Z M70 84 L62 114 L78 96 Z" fill="#0b1220"/>
        <circle cx="80" cy="102" r="5" fill="#fbbf24" stroke="#b45309" stroke-width="1.5"/>
        <path d="M80 98.5 L81.2 101 L84 101.2 L81.8 103 L82.5 105.6 L80 104.2 L77.5 105.6 L78.2 103 L76 101.2 L78.8 101 Z" fill="#b45309"/>`;
  }
}

/** 回傳角色 SVG 字串；stage 0～4 */
export function avatarSVG(stage = 0, { label = '' } = {}) {
  const s = Math.max(0, Math.min(4, stage));
  const id = `av${++seq}`;
  const earpiece = s === 4
    ? '<path d="M84 56 q7 4 3 14" fill="none" stroke="#111827" stroke-width="2.5" stroke-linecap="round"/>'
    : '';
  const ring = s === 4 ? '<circle cx="60" cy="60" r="57" fill="none" stroke="#f59e0b" stroke-width="4"/>' : '';
  return `<svg class="avatar" viewBox="0 0 120 120" role="img" aria-label="${label || '角色'}">
    <defs><clipPath id="${id}"><circle cx="60" cy="60" r="58"/></clipPath></defs>
    <circle cx="60" cy="60" r="58" fill="${BG[s]}"/>
    <g clip-path="url(#${id})">
      ${body(s)}
      <rect x="52" y="70" width="16" height="16" rx="4" fill="${SKIN}"/>
      <circle cx="37" cy="54" r="4.5" fill="${SKIN}"/>
      <circle cx="83" cy="54" r="4.5" fill="${SKIN}"/>
      <circle cx="60" cy="52" r="23" fill="${SKIN}"/>
      <path d="M36 52 C33 30 48 22 60 22 C74 22 88 30 84 52 C80 40 72 35 60 36 C49 36 40 41 36 52 Z" fill="${HAIR}"/>
      <path d="M47 47 L55 46" stroke="${HAIR}" stroke-width="2.2" stroke-linecap="round"/>
      <path d="M65 46 L73 47" stroke="${HAIR}" stroke-width="2.2" stroke-linecap="round"/>
      <circle cx="51" cy="54" r="2.6" fill="#1f2937"/>
      <circle cx="69" cy="54" r="2.6" fill="#1f2937"/>
      <circle cx="46" cy="61" r="3.5" fill="#f9a8a8" opacity=".5"/>
      <circle cx="74" cy="61" r="3.5" fill="#f9a8a8" opacity=".5"/>
      <path d="M53 63 Q60 69 67 63" fill="none" stroke="#7c2d12" stroke-width="2.2" stroke-linecap="round"/>
      ${earpiece}
    </g>
    ${ring}
  </svg>`;
}
