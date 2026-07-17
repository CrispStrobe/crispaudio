import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Lock, Unlock } from 'lucide-react';

interface ParamSliderProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  locked?: boolean;
  onChange: (value: number) => void;
  onLockToggle?: () => void;
  disabled?: boolean;
  tooltip?: string;
}

function useSmoothParam(targetValue: number, speed = 0.12): number {
  const [current, setCurrent] = useState(targetValue);
  const rafRef = useRef<number | null>(null);
  const targetRef = useRef(targetValue);

  useEffect(() => {
    targetRef.current = targetValue;
  }, [targetValue]);

  useEffect(() => {
    const tick = () => {
      setCurrent(prev => {
        const diff = targetRef.current - prev;
        if (Math.abs(diff) < 0.0005) return targetRef.current;
        return prev + diff * speed;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [speed]);

  return current;
}

function formatValue(value: number, step: number, unit?: string): string {
  const decimals = step < 0.01 ? 3 : step < 0.1 ? 2 : step < 1 ? 1 : 0;
  const formatted = value.toFixed(decimals);
  return unit ? `${formatted}${unit}` : formatted;
}

export const ParamSlider: React.FC<ParamSliderProps> = React.memo(({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  unit,
  locked = false,
  onChange,
  onLockToggle,
  disabled = false,
  tooltip,
}) => {
  const smoothValue = useSmoothParam(value);
  const [showTooltip, setShowTooltip] = useState(false);
  const isDisabled = disabled || locked;
  const inputId = `param-${label.replace(/\s+/g, '-').toLowerCase()}`;

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (isDisabled) return;
      const parsed = parseFloat(e.target.value);
      if (!isNaN(parsed) && isFinite(parsed)) {
        onChange(parsed);
      }
    },
    [isDisabled, onChange]
  );

  const fillPercent = ((smoothValue - min) / (max - min)) * 100;

  return (
    <div className="group flex flex-col gap-1.5 w-full param-slider">
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <label
            htmlFor={inputId}
            className="param-slider__label text-xs font-medium text-gray-300 truncate select-none leading-none"
            title={tooltip ?? label}
          >
            {label}
          </label>

          {tooltip && (
            <div className="relative flex-shrink-0">
              <button
                type="button"
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
                onClick={() => setShowTooltip((v) => !v)}
                className="param-slider__info w-3.5 h-3.5 rounded-full bg-gray-700 text-gray-400 hover:text-gray-200 hover:bg-gray-600 flex items-center justify-center text-[9px] font-bold leading-none transition-colors"
                aria-label={`Info: ${label}`}
                aria-expanded={showTooltip}
              >
                ?
              </button>
              {showTooltip && (
                <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-gray-800 border border-gray-600 rounded text-xs text-gray-300 shadow-xl pointer-events-none whitespace-normal">
                  {tooltip}
                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-600" />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="param-slider__value font-mono text-[11px] text-gray-200 bg-gray-800 border border-gray-700 px-1.5 py-0.5 rounded leading-none min-w-[3.5rem] text-right tabular-nums">
            {formatValue(smoothValue, step, unit)}
          </span>

          {onLockToggle && (
            <button
              type="button"
              onClick={onLockToggle}
              disabled={disabled}
              className={`
                param-slider__lock p-0.5 rounded transition-colors flex items-center justify-center
                ${locked
                  ? 'text-amber-400 hover:text-amber-300'
                  : 'text-gray-500 hover:text-gray-300'}
                ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
              `}
              title={locked ? 'Unlock parameter' : 'Lock parameter'}
              aria-label={locked ? 'Unlock' : 'Lock'}
            >
              {locked
                ? <Lock className="w-3 h-3" />
                : <Unlock className="w-3 h-3" />}
            </button>
          )}
        </div>
      </div>

      {/* Track + thumb */}
      <div className="param-slider__track relative h-4 flex items-center">
        {/* Background track */}
        <div className="absolute inset-x-0 h-1.5 rounded-full bg-gray-700 overflow-hidden">
          <div
            className={`h-full rounded-full transition-none ${
              locked ? 'bg-amber-600/50' : 'bg-indigo-500'
            }`}
            style={{ width: `${Math.max(0, Math.min(100, fillPercent))}%` }}
          />
        </div>

        <input
          id={inputId}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={handleChange}
          disabled={isDisabled}
          aria-label={label}
          className={`
            param-slider__input
            relative w-full h-1.5 appearance-none bg-transparent rounded-full
            touch-none
            focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1 focus-visible:ring-offset-gray-900
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:w-3.5
            [&::-webkit-slider-thumb]:h-3.5
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-white
            [&::-webkit-slider-thumb]:border
            [&::-webkit-slider-thumb]:border-gray-400
            [&::-webkit-slider-thumb]:shadow
            [&::-webkit-slider-thumb]:cursor-pointer
            [&::-webkit-slider-thumb]:transition-transform
            [&::-webkit-slider-thumb]:hover:scale-110
            [&::-moz-range-thumb]:w-3.5
            [&::-moz-range-thumb]:h-3.5
            [&::-moz-range-thumb]:rounded-full
            [&::-moz-range-thumb]:bg-white
            [&::-moz-range-thumb]:border
            [&::-moz-range-thumb]:border-gray-400
            [&::-moz-range-thumb]:cursor-pointer
            ${isDisabled ? 'opacity-40 cursor-not-allowed [&::-webkit-slider-thumb]:cursor-not-allowed' : ''}
          `}
        />
      </div>
    </div>
  );
});

ParamSlider.displayName = 'ParamSlider';

export default ParamSlider;
