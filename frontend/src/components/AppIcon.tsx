import { useEffect, useMemo, useState } from 'react';
import { getAppDisplayName, getAppIconUrls } from '../utils/appIcons';

interface AppIconProps {
  appName: string;
  size?: number;
  className?: string;
}

export function AppIcon({ appName, size = 40, className = '' }: AppIconProps) {
  const iconUrls = useMemo(() => getAppIconUrls(appName), [appName]);
  const [iconIndex, setIconIndex] = useState(0);
  const display = getAppDisplayName(appName);
  const boxStyle = { width: size, height: size };
  const iconUrl = iconIndex < iconUrls.length ? iconUrls[iconIndex] : undefined;

  useEffect(() => {
    setIconIndex(0);
  }, [appName, iconUrls]);

  if (iconUrl) {
    return (
      <img
        src={iconUrl}
        alt={display}
        title={display}
        style={boxStyle}
        className={`rounded-xl object-contain p-1.5 bg-white/5 border border-white/10 ${className}`}
        onError={() => {
          if (iconIndex < iconUrls.length - 1) {
            setIconIndex((current) => current + 1);
          } else {
            setIconIndex(iconUrls.length);
          }
        }}
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
