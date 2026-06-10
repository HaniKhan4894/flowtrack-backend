import { useState } from 'react';
import { getAppIconUrl, getAppDisplayName } from '../utils/appIcons';

interface AppIconProps {
  appName: string;
  size?: number;
  className?: string;
}

export function AppIcon({ appName, size = 40, className = '' }: AppIconProps) {
  const [failed, setFailed] = useState(false);
  const iconUrl = getAppIconUrl(appName);
  const display = getAppDisplayName(appName);
  const boxStyle = { width: size, height: size };

  if (iconUrl && !failed) {
    return (
      <img
        src={iconUrl}
        alt={display}
        title={display}
        style={boxStyle}
        className={`rounded-xl object-contain p-1.5 bg-white/5 border border-white/10 ${className}`}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div
      style={boxStyle}
      title={display}
      className={`rounded-xl bg-white/5 flex items-center justify-center border border-white/10 font-bold text-primary-400 shrink-0 ${className}`}
    >
      {(display[0] || '?').toUpperCase()}
    </div>
  );
}
