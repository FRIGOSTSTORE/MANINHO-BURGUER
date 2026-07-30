// Endpoint serverless para gerar PIX via API Fyntra na Vercel.
// IMPORTANTE: a chave fica somente no backend (/api), nunca no index.html.

const FYNTRA_API_BASE_URL = 'https://api-gateway.fyntrabr.com';
const DEFAULT_FYNTRA_KEY = '6318f195-00cf-4647-8487-99fbc7042c33';

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function moneyToCents(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100);
}

function splitCityUf(cityUf) {
  const raw = String(cityUf || '').trim();
  const parts = raw.split('/').map((p) => p.trim()).filter(Boolean);
  return {
    city: parts[0] || 'São Paulo',
    state: (parts[1] || 'SP').slice(0, 2).toUpperCase(),
  };
}

function isValidCpf(cpf) {
  const value = onlyDigits(cpf);
  if (value.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(value)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += Number(value[i]) * (10 - i);
  let check = (sum * 10) % 11;
  if (check === 10) check = 0;
  if (check !== Number(value[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i += 1) sum += Number(value[i]) * (11 - i);
  check = (sum * 10) % 11;
  if (check === 10) check = 0;
  return check === Number(value[10]);
}

function generateValidCpf() {
  const base = [];
  for (let i = 0; i < 9; i += 1) base.push(Math.floor(Math.random() * 10));
  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += base[i] * (10 - i);
  let d1 = (sum * 10) % 11;
  if (d1 === 10) d1 = 0;
  base.push(d1);
  sum = 0;
  for (let i = 0; i < 10; i += 1) sum += base[i] * (11 - i);
  let d2 = (sum * 10) % 11;
  if (d2 === 10) d2 = 0;
  base.push(d2);
  return base.join('');
}

function resolveDocument(input) {
  if (isValidCpf(input)) return onlyDigits(input);
  const fallback = process.env.DEFAULT_CUSTOMER_DOCUMENT;
  if (isValidCpf(fallback)) return onlyDigits(fallback);
  return generateValidCpf();
}

function normalizePhone(phone) {
  let value = onlyDigits(phone);
  if (value.startsWith('55') && value.length > 11) value = value.slice(2);
  if (value.length < 10 || value.length > 11) return '11999999999';
  return value;
}

function normalizeEmail(email, txid) {
  const value = String(email || '').trim().toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) return value;
  return `pedido${onlyDigits(txid) || Date.now()}@gmail.com`;
}

function buildQrDataUrl(payload) {
  if (!payload) return '';
  // Sem dependências de build: usa serviço público para renderizar o QR a partir do copia-e-cola.
  return `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(payload)}`;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  try {
    const body = req.body || {};
    const amountInCents = moneyToCents(body.amount);
    const txid = String(body.txid || `FG${Date.now()}`).slice(0, 80);
    const name = String(body.name || 'Cliente').trim().slice(0, 120);
    const phone = normalizePhone(body.phone);
    const cep = onlyDigits(body.cep || '01000000') || '01000000';
    const { city, state } = splitCityUf(body.city);

    if (!amountInCents) {
      return res.status(400).json({ error: 'Valor do pedido inválido.' });
    }

    const apiKey = process.env.FYNTRA_API_KEY || process.env.PIX_API_TOKEN || DEFAULT_FYNTRA_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'FYNTRA_API_KEY não configurada.' });
    }

    const address = {
      street: String(body.address || 'Endereço não informado').slice(0, 120),
      streetNumber: String(body.number || 'S/N').slice(0, 20),
      complement: String(body.complement || '').slice(0, 80),
      zipCode: cep,
      neighborhood: String(body.neighborhood || 'Centro').slice(0, 80),
      city,
      state,
      country: 'BR',
    };

    const items = Array.isArray(body.items) && body.items.length
      ? body.items.map((item, index) => ({
          title: String(item.title || `Item ${index + 1}`).slice(0, 120),
          unitPrice: moneyToCents(item.unitPrice || item.price || 0),
          quantity: Math.max(1, Number.parseInt(item.quantity || 1, 10)),
          tangible: true,
          externalRef: String(item.externalRef || `item-${index + 1}`).slice(0, 80),
        })).filter((item) => item.unitPrice > 0)
      : [{ title: 'Pedido Maninho Burguer', unitPrice: amountInCents, quantity: 1, tangible: true, externalRef: txid }];

    if (!items.length) {
      items.push({ title: 'Pedido Maninho Burguer', unitPrice: amountInCents, quantity: 1, tangible: true, externalRef: txid });
    }

    const shippingFee = moneyToCents(body.shippingFee || 0);
    const itemsTotal = items.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0);
    const finalAmount = itemsTotal ? itemsTotal + shippingFee : amountInCents;

    const payload = {
      amount: finalAmount,
      paymentMethod: 'PIX',
      customer: {
        name,
        email: normalizeEmail(body.email, txid),
        document: { number: resolveDocument(body.document), type: 'CPF' },
        phone,
        externalRef: txid,
        address,
      },
      shipping: {
        fee: shippingFee,
        address,
      },
      items,
      pix: { expiresInDays: 1 },
      metadata: JSON.stringify({ order_number: txid, source: 'maninho-vercel' }),
    };

    const response = await fetch(`${FYNTRA_API_BASE_URL}/api/user/transactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'User-Agent': 'AtivoB2B/1.0',
      },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'FYNTRA_API_ERROR',
        message: json?.message || json?.error?.message || 'Erro ao criar transação PIX na Fyntra.',
        details: json,
      });
    }

    const data = json?.data || json;
    const pixPayload = data?.pix?.qrcode || data?.qrCode || data?.qrcode || data?.payload?.pix?.qrcode || '';

    return res.status(200).json({
      transactionId: data?.id || data?.transactionId || null,
      status: data?.status || 'WAITING_PAYMENT',
      payload: pixPayload,
      qrCode: pixPayload,
      qrDataUrl: buildQrDataUrl(pixPayload),
      raw: data,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'PIX_INTERNAL_ERROR',
      message: error?.message || 'Erro interno ao gerar PIX.',
    });
  }
};
