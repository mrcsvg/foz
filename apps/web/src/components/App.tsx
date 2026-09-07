import { useEffect } from 'react';
import { connectEvents } from '../api';
import { useFoz } from '../store';
import { installKeyHandler, keymapRuntime } from '../keys';
import { Sidebar } from './Sidebar';
import { ConversationList } from './ConversationList';
import { Thread } from './Thread';
import { StatusLine } from './StatusLine';
import { Finder } from './Finder';
import { Help } from './Help';

export function App() {
  const ready = useFoz((s) => s.ready);
  const keymap = useFoz((s) => s.keymap);
  const sidebarVisible = useFoz((s) => s.sidebarVisible);
  const openId = useFoz((s) => s.openId);
  const mode = useFoz((s) => s.mode);

  useEffect(() => {
    void useFoz.getState().boot();
    const stop = connectEvents(
      (e) => useFoz.getState().handleEvent(e),
      (c) => useFoz.getState().setConnected(c),
    );
    const uninstall = installKeyHandler();
    return () => {
      stop();
      uninstall();
    };
  }, []);

  useEffect(() => {
    if (keymap) keymapRuntime.load(keymap);
  }, [keymap]);

  if (!ready) {
    return (
      <div className="boot">
        <pre className="logo">{LOGO}</pre>
        <div className="muted">conectando…</div>
      </div>
    );
  }

  return (
    <div className={`app mode-${mode} ${sidebarVisible ? '' : 'no-sidebar'} ${openId ? 'has-thread' : ''}`}>
      <div className="panes">
        {sidebarVisible && <Sidebar />}
        <ConversationList />
        <Thread />
      </div>
      <StatusLine />
      <Finder />
      <Help />
    </div>
  );
}

export const LOGO = String.raw`
  __
 / _| ___ ____
| |_ / _ \_  /
|  _| (_) / /
|_|  \___/___|
`;
