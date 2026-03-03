// Shared demo merchant naming helpers.
// Map synthetic merchant ids (M001...) to real-world merchant brand names for UI demo clarity.

const MERCHANT_BRANDS = [
  'Starbucks',
  'Walmart',
  'Target',
  'Costco',
  'Best Buy',
  'Home Depot',
  'CVS Pharmacy',
  'Walgreens',
  'McDonald\'s',
  'Subway',
  'Chipotle',
  'Domino\'s',
  'Nike',
  'Adidas',
  'Macy\'s',
  'Nordstrom',
  '7-Eleven',
  'Kroger',
  'Safeway',
  'Whole Foods',
  'IKEA',
  'Sephora',
  'Ulta Beauty',
  'H&M',
  'Zara'
];

function idToIndex(merchantId) {
  const n = Number(String(merchantId || '').replace(/\D/g, ''));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return (n - 1) % MERCHANT_BRANDS.length;
}

export function getMerchantName(merchantId) {
  return MERCHANT_BRANDS[idToIndex(merchantId)];
}

export function getMerchantEmail(merchantId) {
  const safe = getMerchantName(merchantId).toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '');
  return `${safe}@merchant.demo`;
}

