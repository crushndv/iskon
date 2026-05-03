// netlify/functions/form-submission.js
// Обработчик форм: отправляет заявку в Telegram и Bitrix24
// Переменные окружения задаются в Netlify Dashboard → Site Settings → Environment Variables

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405 };

  let payload;
  try {
    // Netlify Forms отправляет application/x-www-form-urlencoded
    const body = new URLSearchParams(event.body);
    payload = {
      name:       body.get('name')     || '—',
      phone:      body.get('phone')    || '—',
      location:   body.get('location') || '—',
      service:    body.get('service')  || '—',
      source:     body.get('page_source') || 'Сайт',
      formName:   body.get('form-name')   || 'lead',
    };
  } catch (e) {
    return { statusCode: 400, body: 'Bad request' };
  }

  const results = await Promise.allSettled([
    sendTelegram(payload),
    sendBitrix24(payload),
  ]);

  results.forEach((r, i) => {
    if (r.status === 'rejected') console.error(`[${i === 0 ? 'Telegram' : 'Bitrix24'}] Error:`, r.reason);
  });

  return { statusCode: 200, body: 'OK' };
};

/* ── TELEGRAM ────────────────────────────────────────────────── */
async function sendTelegram(p) {
  const token  = process.env.TELEGRAM_BOT_TOKEN;   // Получить у @BotFather
  const chatId = process.env.TELEGRAM_CHAT_ID;     // ID вашего чата/группы

  if (!token || !chatId) {
    console.warn('[Telegram] TELEGRAM_BOT_TOKEN или TELEGRAM_CHAT_ID не заданы');
    return;
  }

  const serviceLabels = {
    'own-land':   '🏗 Строительство на участке',
    'ready-home': '🏠 Купить готовый дом',
    'project':    '📐 Проектирование',
    'supervision':'🔍 Технический надзор',
    'consult':    '💬 Консультация',
  };

  const text = [
    `🔔 *Новая заявка — ИСКОН*`,
    ``,
    `👤 *Имя:* ${p.name}`,
    `📞 *Телефон:* ${p.phone}`,
    `📍 *Место застройки:* ${p.location}`,
    `🏷 *Тип обращения:* ${serviceLabels[p.service] || p.service}`,
    ``,
    `🌐 *Источник:* ${p.source}`,
    `⏰ ${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}`,
  ].join('\n');

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
    }),
  });

  if (!res.ok) throw new Error(`Telegram API: ${res.status} ${await res.text()}`);
}

/* ── BITRIX24 ────────────────────────────────────────────────── */
async function sendBitrix24(p) {
  const webhook = process.env.BITRIX24_WEBHOOK_URL;
  // Получить: Bitrix24 → Приложения → Входящий вебхук → crm.lead.add

  if (!webhook) {
    console.warn('[Bitrix24] BITRIX24_WEBHOOK_URL не задан');
    return;
  }

  const serviceToSource = {
    'own-land':   'WEB',
    'ready-home': 'WEB',
    'project':    'WEB',
    'supervision':'WEB',
    'consult':    'WEB',
  };

  const body = {
    fields: {
      TITLE:      `[ИСКОН] ${p.name} — ${p.location}`,
      NAME:       p.name,
      PHONE:      [{ VALUE: p.phone, VALUE_TYPE: 'WORK' }],
      SOURCE_ID:  serviceToSource[p.service] || 'WEB',
      SOURCE_DESCRIPTION: p.source,
      COMMENTS:   `Место застройки: ${p.location}\nТип: ${p.service}`,
      UTM_SOURCE: 'website',
      UTM_MEDIUM: 'organic',
      UTM_CAMPAIGN: p.formName,
    },
  };

  const res = await fetch(webhook + 'crm.lead.add.json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`Bitrix24 API: ${res.status} ${await res.text()}`);
}
