import React from 'react';
import { Instagram } from 'lucide-react';
export function Brand({ small = false }) {
  return <div className={`brand ${small ? 'brand-small' : ''}`} aria-label="Swypr"><img src="/swypr-icon.svg" alt="" /><span>swypr<span className="brand-period">.</span></span></div>;
}
export function Flower({ className = '' }) {
  return <svg className={`flower ${className}`} viewBox="0 0 100 100" aria-hidden="true"><path d="M50 39C25-6 9 9 39 44-9 20-6 54 39 52-5 75 24 96 46 61 36 106 72 103 56 62 90 98 107 68 64 53 111 47 95 15 60 41 77-4 42-12 50 39Z" fill="currentColor"/></svg>;
}
export function Switch({ checked, onChange, label }) {
  return <button type="button" className={`switch ${checked ? 'on' : ''}`} role="switch" aria-checked={checked} aria-label={label} onClick={onChange}><span/></button>;
}
function timeAgo(value) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (!Number.isFinite(minutes)) return 'in your DMs';
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}
export function Sender({ message }) {
  return <div className="card-top"><div className="sender-avatar">{message.sender.handle.replace('@', '').slice(0, 1)}</div><div><strong>{message.sender.handle}</strong><span>in your DMs · {timeAgo(message.receivedAt)}</span></div>{message.source === 'live' ? <span className="live-tag"><i/> LIVE</span> : <Instagram size={20} aria-label="Instagram"/>}</div>;
}
