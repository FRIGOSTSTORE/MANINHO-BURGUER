// Webhook (postback) da Fyntra: recebe a confirmação automática do pagamento.
// Configure esta URL no painel da Fyntra: https://SEU-DOMINIO.vercel.app/api/webhook

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  try {
    const body = req.body || {};
    const data = body.data || body;
    const status = String(data.status || '').toUpperCase();
    const transactionId = data.id || body.objectId || null;

    const secret = process.env.PIX_WEBHOOK_SECRET;
    if (secret) {
      const received = req.headers['x-webhook-secret'] || req.query?.secret;
      if (received !== secret) {
        return res.status(401).json({ error: 'Assinatura do webhook inválida.' });
      }
    }

    // Log aparece em Vercel → Deployments → Functions → Logs
    console.log('[FYNTRA WEBHOOK]', JSON.stringify({
      transactionId,
      status,
      amount: data.amount || null,
      paidAt: data.paidAt || null,
      customer: data.customer?.name || data.payer?.name || null,
    }));

    // Ponto de extensão: enviar WhatsApp, e-mail ou registrar em banco quando status for PAID.

    return res.status(200).json({ received: true, transactionId, status });
  } catch (error) {
    return res.status(200).json({ received: true, error: error?.message || 'erro' });
  }
};
