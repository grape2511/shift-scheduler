export async function sendSlackNotification(webhookUrl: string, text: string) {
  try {
    await fetch('/api/slack-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        webhookUrl,
        payload: { text },
      }),
    });
  } catch {
    // Fire-and-forget: never block the app
  }
}
