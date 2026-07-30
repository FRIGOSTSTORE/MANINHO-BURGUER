// Meta (Facebook) Conversions API — envio server-side dos eventos do site.
// Recebe os eventos do frontend (/api/fb-event) e repassa para o Graph API
// com os dados do cliente hasheados em SHA-256 (requisito da Meta).

const crypto = require('crypto');

const DEFAULT_PIXEL_ID = '1759273401944214';
const DEFAULT_ACCESS_TOKEN = 'EAAUO1JEP0FQBSFwbyf7pR4iZCzFA9PpwceoHuhiQRiOtClXbzzU8aLEl0yr9jVg3tKXKk8CWj6Jcaqt3fGV9kndFTYghrbEYFH2W93GJYakA2GFrj3r2drOCVyNOcGqiHZAHirEQcIQhRFmMyoPLfB43ZCmPQid1Aom4yNqOwNbbrdQxKosdOgk1ep2rZBCI5QZDZD';
const GRAPH_VERSION = 'v21.0';

function sha256(value) {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return undefined;
  return crypto.createHash('sha256').update(v).digest('hex');
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizePhone(phone) {
  let v = onlyDigits(phone);
  if (!v) return undefined;
  if (!v.startsWith('55')) v = '55' + v;
  return v;
}

function splitName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return {};
  return { fn: parts[0], ln: parts.length > 1 ? parts[parts.length - 1] : undefined };
}

function clean(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== ''));
}

function buildUserData(user = {}, req = {}) {
  const { fn, ln } = splitName(user.name);
  const cityUf = String(user.city || '').split('/');
  const headers = req.headers || {};
  const ip = (headers['x-forwarded-for'] || '').split(',')[0].trim() || headers['x-real-ip'] || undefined;

  return clean({
    em: sha256(user.email),
    ph: sha256(normalizePhone(user.phone)),
    fn: sha256(fn),
    ln: sha256(ln),
    external_id: sha256(user.externalId || user.document || user.email),
    zp: sha256(onlyDigits(user.cep)),
    ct: sha256(String(cityUf[0] || '').replace(/\s+/g, '')),
    st: sha256((cityUf[1] || '').trim()),
    country: sha256('br'),
    client_ip_address: user.clientIp || ip,
    client_user_agent: user.userAgent || headers['user-agent'],
    fbp: user.fbp,
    fbc: user.fbc,
  });
}

// Reutilizável pelos outros endpoints (webhook, pix, etc.)
async function sendMetaEvent({ eventName, eventId, eventSourceUrl, customData = {}, user = {}, req = {}, actionSource = 'website', testEventCode }) {
  const pixelId = process.env.FB_PIXEL_ID || process.env.META_PIXEL_ID || DEFAULT_PIXEL_ID;
  const accessToken = process.env.FB_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN || DEFAULT_ACCESS_TOKEN;
  if (!pixelId || !accessToken) {
    return { ok: false, error: 'FB_PIXEL_ID/FB_ACCESS_TOKEN não configurados.' };
  }

  const payload = {
    data: [clean({
      event_name: eventName,
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,
      event_source_url: eventSourceUrl,
      action_source: actionSource,
      user_data: buildUserData(user, req),
      custom_data: clean({
        currency: customData.currency || 'BRL',
        value: customData.value,
        content_type: customData.content_type,
        content_ids: customData.content_ids,
        content_name: customData.content_name,
        contents: customData.contents,
        num_items: customData.num_items,
        order_id: customData.order_id,
      }),
    })],
  };

  const code = testEventCode || process.env.FB_TEST_EVENT_CODE;
  if (code) payload.test_event_code = code;

  const url = "https://graph.facebook.com/" + GRAPH_VERSION + "/" + pixelId + "/events?access_token=" + encodeURIComponent(accessToken);
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { ok: response.ok, status: response.status, result: json };
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
    const eventName = String(body.event || body.eventName || '').trim();
    if (!eventName) return res.status(400).json({ error: 'Informe o nome do evento.' });

    const out = await sendMetaEvent({
      eventName,
      eventId: body.eventId,
      eventSourceUrl: body.eventSourceUrl,
      customData: body.data || {},
      user: body.user || {},
      req,
    });

    return res.status(out.ok ? 200 : 502).json(out);
  } catch (error) {
    return res.status(200).json({ ok: false, error: error?.message || 'Erro ao enviar evento para a Meta.' });
  }
};

module.exports.sendMetaEvent = sendMetaEvent;
