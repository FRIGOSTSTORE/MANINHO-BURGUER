// Webhook (postback) da Fyntra: recebe a confirmação automática do pagamento.
// Configure esta URL no painel da Fyntra: https://SEU-DOMINIO.vercel.app/api/webhook

const { sendMetaEvent } = require('./fb-event');

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

    // Purchase server-side para a Meta (API de Conversões) quando o PIX é confirmado.
    const PAID = ['PAID', 'APPROVED', 'COMPLETED', 'CONFIRMED', 'SETTLED'];
    let metaSent = false;
    if (PAID.includes(status)) {
      let orderId = data.externalRef || data.customer?.externalRef || transactionId;
      try {
        const meta = typeof data.metadata === 'string' ? JSON.parse(data.metadata) : data.metadata;
        if (meta?.order_number) orderId = meta.order_number;
      } catch { /* metadata não é JSON */ }

      const amount = Number(data.amount || 0);
      const value = amount > 1000 ? amount / 100 : amount; // Fyntra envia centavos
      const customer = data.customer || data.payer || {};

      try {
        const out = await sendMetaEvent({
          eventName: 'Purchase',
          eventId: 'purchase-' + orderId,
          actionSource: 'website',
          eventSourceUrl: process.env.SITE_URL || undefined,
          customData: { value, currency: 'BRL', order_id: String(orderId) },
          user: {
            name: customer.name,
            email: customer.email,
            phone: customer.phone,
            document: customer.document?.number || customer.document,
            cep: customer.address?.zipCode,
            city: [customer.address?.city, customer.address?.state].filter(Boolean).join('/'),
            externalId: String(orderId),
          },
          req,
        });
        metaSent = !!out.ok;
        console.log('[META CAPI PURCHASE]', JSON.stringify({ orderId, ok: out.ok, status: out.status }));
      } catch (metaError) {
        console.log('[META CAPI ERROR]', metaError?.message || metaError);
      }
    }

    // Ponto de extensão: enviar WhatsApp, e-mail ou registrar em banco quando status for PAID.

    return res.status(200).json({ received: true, transactionId, status, metaSent });
  } catch (error) {
    return res.status(200).json({ received: true, error: error?.message || 'erro' });
  }
};
