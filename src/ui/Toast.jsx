import { useEffect, useState } from 'react';
import { useSession } from '../state/index.js';
import './Toast.css';

// Message temporaire en bas de la fenêtre (3,2 s)
export default function Toast() {
  const t = useSession('toast');
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    if (!t) return;
    setMsg(t.msg);
    const id = setTimeout(() => setMsg(null), 3200);
    return () => clearTimeout(id);
  }, [t]);
  return <div className="toast" role="status" hidden={!msg}>{msg}</div>;
}
