'use client';

import React, { useEffect, useState } from 'react';

// Turns portfolio-alert push notifications on or off for this device.
// iPhones only allow web push from the home-screen app (iOS 16.4+), so in
// Safari it explains that instead.

type Status = 'loading' | 'unsupported' | 'needs-install' | 'denied' | 'off' | 'on';

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
}

export function NotificationToggle() {
  const [status, setStatus] = useState<Status>('loading');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setStatus(isIOS() && !isStandalone() ? 'needs-install' : 'unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setStatus('denied');
      return;
    }
    navigator.serviceWorker.register('/sw.js')
      .then(reg => reg.pushManager.getSubscription())
      .then(sub => setStatus(sub ? 'on' : 'off'))
      .catch(() => setStatus('unsupported'));
  }, []);

  const enable = async () => {
    setBusy(true);
    setNote('');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus(permission === 'denied' ? 'denied' : 'off');
        return;
      }
      const { publicKey } = await fetch('/api/push/subscribe').then(r => r.json());
      if (!publicKey) throw new Error('Notifications are not configured on the server');
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource });
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      if (!res.ok) throw new Error('Could not save this device');
      setStatus('on');
      await fetch('/api/push/test', { method: 'POST' });
      setNote('Test notification sent');
    } catch (e: any) {
      setNote(e?.message || 'Could not turn on notifications');
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setNote('');
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setStatus('off');
    } catch {
      setNote('Could not turn off notifications');
    } finally {
      setBusy(false);
    }
  };

  if (status === 'loading') return null;

  return (
    <div className="notify-toggle">
      <div className="notify-toggle-row">
        <span className="notify-toggle-label">Stock alerts</span>
        {(status === 'on' || status === 'off') && (
          <button
            type="button"
            className={`notify-toggle-btn ${status === 'on' ? 'on' : ''}`}
            onClick={status === 'on' ? disable : enable}
            disabled={busy}
            aria-pressed={status === 'on'}
          >
            {busy ? '…' : status === 'on' ? 'On' : 'Off'}
          </button>
        )}
      </div>
      <p className="notify-toggle-hint">
        {status === 'on' && 'Holdings that fall below 50/200 DMA or hit a circuit.'}
        {status === 'off' && 'Get notified when a holding falls below 50/200 DMA or hits a circuit.'}
        {status === 'needs-install' && 'On iPhone, tap Share → Add to Home Screen, then open the app from there to turn on alerts.'}
        {status === 'denied' && 'Notifications are blocked for this app. Allow them in your phone settings.'}
        {status === 'unsupported' && 'This browser can’t receive notifications.'}
        {note && <><br />{note}</>}
      </p>
    </div>
  );
}
