// Consulta automática do status do pagamento PIX na Fyntra.
// Chamado pelo frontend em intervalos curtos enquanto o QR Code está na tela.

const FYNTRA_API_BASE_URL = 'https://api-gateway.fyntrabr.com';
const DEFAULT_FYNTRA_KEY = '6318f195-00cf-4647-8487-99fbc7042c33';

const PAID_STATUSES = ['PAID', 'APPROVED', 'COMPLETED', 'CONFIRMED', 'SETTLED'];
const FAILED_STATUSES = ['REFUSED', 'CANCELED', 'CANCELLED', 'EXPIRED', 'CHARGEBACK', 'REFUNDED', 'FAILED'];

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  try {
    const id = String((req.query && req.query.id) || '').trim();
    if (!id) {
      return res.status(400).json({ error: 'Informe o id da transação.' });
    }

    const apiKey = process.env.FYNTRA_API_KEY || process.env.PIX_API_TOKEN || DEFAULT_FYNTRA_KEY;

    const response = await fetch(`${FYNTRA_API_BASE_URL}/api/user/transactions/${encodeURIComponent(id)}/summary`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'User-Agent': 'AtivoB2B/1.0',
      },
    });

    const text = await response.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'FYNTRA_STATUS_ERROR',
        message: json?.message || 'Não foi possível consultar o status.',
      });
    }

    const data = json?.data || json;
    const status = String(data?.status || 'WAITING_PAYMENT').toUpperCase();

    return res.status(200).json({
      id: data?.id || id,
      status,
      paid: PAID_STATUSES.includes(status),
      failed: FAILED_STATUSES.includes(status),
      paidAt: data?.paidAt || null,
      amount: data?.amount || null,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'PIX_STATUS_INTERNAL_ERROR',
      message: error?.message || 'Erro interno ao consultar o pagamento.',
    });
  }
};
