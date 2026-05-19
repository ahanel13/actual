import { useState } from 'react';

import { theme } from '@actual-app/components/theme';

const BANK_DOMAINS: Record<string, string> = {
  'ally': 'ally.com',
  'ally bank': 'ally.com',
  'american express': 'americanexpress.com',
  'amex': 'americanexpress.com',
  'apple card': 'apple.com',
  'bank of america': 'bankofamerica.com',
  'barclays': 'barclays.com',
  'barclays uk': 'barclays.co.uk',
  'betterment': 'betterment.com',
  'bnp paribas': 'bnpparibas.com',
  'bmo': 'bmo.com',
  'capital one': 'capitalone.com',
  'charles schwab': 'schwab.com',
  'schwab': 'schwab.com',
  'chase': 'chase.com',
  'chime': 'chime.com',
  'cibc': 'cibc.com',
  'citi': 'citi.com',
  'citibank': 'citi.com',
  'citigroup': 'citi.com',
  'coinbase': 'coinbase.com',
  'commerzbank': 'commerzbank.com',
  'deutsche bank': 'db.com',
  'discover': 'discover.com',
  'e*trade': 'etrade.com',
  'etrade': 'etrade.com',
  'fidelity': 'fidelity.com',
  'goldman sachs': 'goldmansachs.com',
  'hsbc': 'hsbc.com',
  'ing': 'ing.com',
  'keybank': 'key.com',
  'lloyds': 'lloyds.com',
  'lloyds bank': 'lloyds.com',
  'm1 finance': 'm1.com',
  'marcus': 'marcus.com',
  'marcus by goldman sachs': 'marcus.com',
  'merrill lynch': 'ml.com',
  'monzo': 'monzo.com',
  'morgan stanley': 'morganstanley.com',
  'n26': 'n26.com',
  'natwest': 'natwest.com',
  'navy federal': 'navyfederal.org',
  'navy federal credit union': 'navyfederal.org',
  'pnc': 'pnc.com',
  'pnc bank': 'pnc.com',
  'rbc': 'rbc.com',
  'regions': 'regions.com',
  'regions bank': 'regions.com',
  'revolut': 'revolut.com',
  'robinhood': 'robinhood.com',
  'royal bank of canada': 'rbc.com',
  'santander': 'santander.com',
  'scotiabank': 'scotiabank.com',
  'sofi': 'sofi.com',
  'starling': 'starlingbank.com',
  'starling bank': 'starlingbank.com',
  'synchrony': 'synchronybank.com',
  'synchrony bank': 'synchronybank.com',
  'td bank': 'td.com',
  'td ameritrade': 'tdameritrade.com',
  'td canada trust': 'td.com',
  'transferwise': 'wise.com',
  'truist': 'truist.com',
  'us bank': 'usbank.com',
  'u.s. bank': 'usbank.com',
  'usaa': 'usaa.com',
  'vanguard': 'vanguard.com',
  'wealthfront': 'wealthfront.com',
  'wells fargo': 'wellsfargo.com',
  'wise': 'wise.com',
};

function clearbitUrl(bankName: string): string | null {
  const key = bankName.toLowerCase().trim();
  const domain = BANK_DOMAINS[key];
  if (domain) return `https://logo.clearbit.com/${domain}`;
  const slug = key.replace(/[^a-z0-9]/g, '');
  if (slug.length >= 3) return `https://logo.clearbit.com/${slug}.com`;
  return null;
}

function hashColor(str: string): string {
  const colors = [
    '#4f86c6', '#5aaa7f', '#c46b3a', '#8b6bb1',
    '#c4903a', '#3a9cc4', '#c43a5a', '#6bb18b',
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function Initials({ name, size }: { name: string; size: number }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.22,
        backgroundColor: hashColor(name),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        fontSize: size * 0.38,
        fontWeight: 700,
        color: '#fff',
        letterSpacing: '-0.02em',
      }}
    >
      {initials || '?'}
    </div>
  );
}

type BankLogoProps = {
  /** Display name of the institution */
  bankName: string | null | undefined;
  /** Base64 PNG from Plaid (stored server-side) */
  institutionLogo?: string | null;
  size?: number;
};

export function BankLogo({ bankName, institutionLogo, size = 28 }: BankLogoProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const label = bankName ?? '';

  const imgStyle: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: size * 0.22,
    objectFit: 'contain',
    flexShrink: 0,
    border: `1px solid ${theme.tableBorder}`,
    backgroundColor: theme.cardBackground,
  };

  if (institutionLogo && !imgFailed) {
    return (
      <img
        src={`data:image/png;base64,${institutionLogo}`}
        alt={label}
        onError={() => setImgFailed(true)}
        style={imgStyle}
      />
    );
  }

  const cbUrl = label ? clearbitUrl(label) : null;
  if (cbUrl && !imgFailed) {
    return (
      <img
        src={cbUrl}
        alt={label}
        onError={() => setImgFailed(true)}
        style={imgStyle}
      />
    );
  }

  return <Initials name={label || '?'} size={size} />;
}
