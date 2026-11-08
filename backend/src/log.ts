/** Structured log line for Workers Logs. Never pass tokens, cookies, join codes or IPs. */
export function log(event: string, fields: Record<string, string | number | boolean | null> = {}) {
  console.log(JSON.stringify({ event, ...fields }));
}
