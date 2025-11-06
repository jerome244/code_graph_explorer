'use client';

import { useEffect, useState } from 'react';

export default function SentToast({ showInitially }: { showInitially: boolean }) {
  const [show, setShow] = useState(showInitially);

  useEffect(() => {
    if (!show) return;
    const t = setTimeout(() => {
      setShow(false);
      // remove ?sent=1 from the URL without reloading
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('sent');
        window.history.replaceState({}, '', url.toString());
      } catch {}
    }, 2000);
    return () => clearTimeout(t);
  }, [show]);

  if (!show) return null;

  return (
    <div role="status" aria-live="polite" style={{
      background: '#10b981',
      color: '#fff',
      padding: '6px 10px',
      borderRadius: 8,
      fontWeight: 600,
      marginBottom: 8,
      display: 'inline-block'
    }}>
      Message sent ✓
    </div>
  );
}
