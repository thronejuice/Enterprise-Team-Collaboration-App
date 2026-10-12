'use client';

import { useEffect, useState } from 'react';
import { APP_VERSION, RELEASE_NOTES } from '@/lib/release-notes';
import { Modal } from './modal';
import { Button } from './ui';

export const SEEN_KEY = 'nexus:whats-new-seen';

/** Opens once per version in each browser. Storage can be blocked, in which case it simply never opens. */
export function WhatsNew() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(SEEN_KEY) !== APP_VERSION) setOpen(true);
    } catch {}
  }, []);

  function close() {
    setOpen(false);
    try {
      localStorage.setItem(SEEN_KEY, APP_VERSION);
    } catch {}
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={`What's new in ${RELEASE_NOTES.version}`}
      footer={<Button onClick={close}>Got it</Button>}
    >
      <p className="mb-4 text-xs text-fg-subtle">Released {RELEASE_NOTES.date}</p>
      <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
        {RELEASE_NOTES.sections.map((section) => (
          <section key={section.title}>
            <h3 className="mb-1.5 text-sm font-semibold">{section.title}</h3>
            <ul className="list-inside list-disc space-y-1 text-[13px] text-fg-muted">
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Modal>
  );
}
