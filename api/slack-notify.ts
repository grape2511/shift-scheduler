export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end();

  const { webhookUrl, payload } = req.body;

  if (!webhookUrl || !webhookUrl.startsWith('https://hooks.slack.com/')) {
    return res.status(400).json({ error: 'Invalid Slack webhook URL' });
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      return res.status(502).json({ error: 'Slack API error', status: response.status });
    }
    return res.status(200).json({ ok: true });
  } catch {
    return res.status(500).json({ error: 'Failed to send to Slack' });
  }
}
