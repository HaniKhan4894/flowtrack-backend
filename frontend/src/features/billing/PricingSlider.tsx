import { useMemo } from 'react';
import {
  buildSliderStops,
  sliderIndexToUserCount,
  userCountToSliderIndex,
  type BillingSliderSettings,
} from './pricingMath';

interface PricingSliderProps {
  userCount: number;
  settings: BillingSliderSettings;
  onChange: (count: number) => void;
  className?: string;
}

interface TickLabel {
  stop: number;
  pct: number;
  position: 'top' | 'bottom';
}

function buildTrackabiTickLabels(stops: number[]): TickLabel[] {
  return stops
    .map((stop, idx) => {
      const pct = stops.length <= 1 ? 0 : (idx / (stops.length - 1)) * 100;
      let position: 'top' | 'bottom' | null = null;

      if (stop === 1) {
        position = 'bottom';
      } else if (stop % 10 === 0) {
        position = 'top';
      } else if (stop % 10 === 5) {
        position = 'bottom';
      }

      return position ? { stop, pct, position } : null;
    })
    .filter((t): t is TickLabel => t !== null);
}

export function PricingSlider({ userCount, settings, onChange, className = '' }: PricingSliderProps) {
  const stops = useMemo(() => buildSliderStops(settings), [settings]);
  const sliderIndex = userCountToSliderIndex(userCount, settings);
  const tickLabels = useMemo(() => buildTrackabiTickLabels(stops), [stops]);
  const topLabels = tickLabels.filter((t) => t.position === 'top');
  const bottomLabels = tickLabels.filter((t) => t.position === 'bottom');

  const thumbPct = stops.length <= 1 ? 0 : (sliderIndex / (stops.length - 1)) * 100;

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-white">How many users do you need?</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Starts at 1, then steps of 5. Plans grey out when your team exceeds their seat limit.
          </p>
        </div>
        <p className="text-3xl font-extrabold text-white tabular-nums">
          {userCount}
          <span className="text-base font-medium text-slate-400 ml-1">users</span>
        </p>
      </div>

      <div className="px-1 select-none">
        {/* Above-track labels (10, 20, 30…) */}
        <div className="relative h-5 mb-1 hidden sm:block">
          {topLabels.map(({ stop, pct }) => (
            <button
              key={`top-${stop}`}
              type="button"
              style={{ left: `${pct}%` }}
              onClick={() => onChange(stop)}
              className={`absolute -translate-x-1/2 text-[10px] leading-none transition-colors ${
                userCount === stop ? 'text-primary-400 font-semibold' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {stop}
            </button>
          ))}
        </div>

        {/* Track + ticks */}
        <div className="relative">
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-0.5 rounded-full bg-white/10 pointer-events-none" />
          <div
            className="absolute top-1/2 -translate-y-1/2 h-0.5 rounded-full bg-primary-500/70 pointer-events-none"
            style={{ width: `${thumbPct}%` }}
          />
          {stops.map((stop, idx) => {
            const pct = stops.length <= 1 ? 0 : (idx / (stops.length - 1)) * 100;
            return (
              <div
                key={`tick-${stop}`}
                className="absolute top-1/2 -translate-y-1/2 w-px h-2 bg-white/20 pointer-events-none"
                style={{ left: `${pct}%` }}
              />
            );
          })}
          <input
            type="range"
            min={0}
            max={Math.max(0, stops.length - 1)}
            step={1}
            value={sliderIndex}
            onChange={(e) => onChange(sliderIndexToUserCount(Number(e.target.value), settings))}
            className="relative w-full h-6 appearance-none cursor-pointer bg-transparent accent-primary-500 z-10
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-2
              [&::-webkit-slider-thumb]:rounded-sm [&::-webkit-slider-thumb]:bg-primary-500
              [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-2 [&::-moz-range-thumb]:rounded-sm
              [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-primary-500"
            aria-label="Number of users"
            aria-valuemin={stops[0]}
            aria-valuemax={stops[stops.length - 1]}
            aria-valuenow={userCount}
            aria-valuetext={`${userCount} users`}
          />
        </div>

        {/* Below-track labels (1, 5, 15, 25…) */}
        <div className="relative h-5 mt-1">
          {bottomLabels.map(({ stop, pct }) => (
            <button
              key={`bottom-${stop}`}
              type="button"
              style={{ left: `${pct}%` }}
              onClick={() => onChange(stop)}
              className={`absolute -translate-x-1/2 text-[10px] leading-none transition-colors ${
                userCount === stop ? 'text-primary-400 font-semibold' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {stop}
            </button>
          ))}
        </div>

        {/* Mobile: show top labels as compact row */}
        <div className="flex flex-wrap justify-between gap-x-1 gap-y-0.5 mt-2 sm:hidden">
          {[1, ...topLabels.map((t) => t.stop)].filter((v, i, a) => a.indexOf(v) === i).slice(0, 8).map((stop) => (
            <button
              key={`m-${stop}`}
              type="button"
              onClick={() => onChange(stop)}
              className={`text-[9px] px-1 ${userCount === stop ? 'text-primary-400 font-semibold' : 'text-slate-500'}`}
            >
              {stop}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
