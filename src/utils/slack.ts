export async function sendSlackNotification(webhookUrl: string, text: string) {
  try {
    const res = await fetch('/api/slack-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        webhookUrl,
        payload: { text },
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('Slack notification failed:', res.status, body);
    }
  } catch (err) {
    console.error('Slack notification error:', err);
  }
}
