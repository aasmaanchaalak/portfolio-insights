// Web push: device subscriptions and sending. A user can subscribe several
// devices (phone, laptop); each browser/app install is one subscription.

import webpush from 'web-push';
import { query } from './db';
import { UserRole } from './queries';

let tablesReady = false;
async function ensurePushTables(): Promise<void> {
  if (tablesReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      endpoint    TEXT PRIMARY KEY,
      user_email  VARCHAR(255) NOT NULL,
      p256dh      TEXT NOT NULL,
      auth        TEXT NOT NULL,
      user_agent  TEXT,
      created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON push_subscriptions (user_email)`);
  tablesReady = true;
}

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export async function savePushSubscription(email: string, sub: PushSubscriptionInput, userAgent: string | null): Promise<void> {
  await ensurePushTables();
  await query(`
    INSERT INTO push_subscriptions (endpoint, user_email, p256dh, auth, user_agent)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (endpoint) DO UPDATE SET user_email = $2, p256dh = $3, auth = $4, user_agent = $5
  `, [sub.endpoint, email, sub.keys.p256dh, sub.keys.auth, userAgent]);
}

export async function deletePushSubscription(email: string, endpoint: string): Promise<void> {
  await ensurePushTables();
  await query(`DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_email = $2`, [endpoint, email]);
}

export interface Subscriber {
  endpoint: string;
  p256dh: string;
  auth: string;
  userEmail: string;
  role: UserRole;
}

/** Every subscribed device, with its owner's role (for analyst filtering). */
export async function getSubscribers(email?: string): Promise<Subscriber[]> {
  await ensurePushTables();
  const rows = await query<any>(`
    SELECT p.endpoint, p.p256dh, p.auth, p.user_email, u.role
    FROM push_subscriptions p
    JOIN users u ON u.email = p.user_email
    ${email ? 'WHERE p.user_email = $1' : ''}
  `, email ? [email] : []);
  return rows.map(r => ({ endpoint: r.endpoint, p256dh: r.p256dh, auth: r.auth, userEmail: r.user_email, role: r.role || 'analyst' }));
}

export interface PushMessage {
  title: string;
  body: string;
  tag?: string;  // same tag replaces an earlier notification instead of stacking
  url?: string;  // opened when the notification is tapped
}

let vapidReady = false;
function ensureVapid(): void {
  if (vapidReady) return;
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) throw new Error('VAPID keys are not configured');
  webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:admin@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  vapidReady = true;
}

/** Sends to one device. Drops the subscription if the push service says it's gone. */
export async function sendPush(sub: Subscriber, msg: PushMessage): Promise<boolean> {
  ensureVapid();
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(msg),
      { TTL: 60 * 60 },
    );
    return true;
  } catch (e: any) {
    if (e?.statusCode === 404 || e?.statusCode === 410) {
      await query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [sub.endpoint]);
    } else {
      console.warn(`[push] send failed (${e?.statusCode ?? e?.message}) for ${sub.userEmail}`);
    }
    return false;
  }
}
