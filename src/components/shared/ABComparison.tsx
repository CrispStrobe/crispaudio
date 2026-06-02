import React, { useCallback } from 'react';
import { ArrowLeftRight, Copy } from 'lucide-react';

type Slot = 'A' | 'B';

interface ABComparisonProps {
  activeSlot: Slot;
  morphAmount: number; // 0=full A, 1=full B
  onSlotChange: (slot: Slot) => void;
  onMorphChange: (amount: number) => void;
  onSwap: () => void;
  onCopy: (from: Slot, to: Slot) => void;
}

export const ABComparison: React.FC<ABComparisonProps> = ({
  activeSlot,
  morphAmount,
  onSlotChange,
  onMorphChange,
  onSwap,
  onCopy,
}) => {
  const handleMorph = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onMorphChange(parseFloat(e.target.value));
    },
    [onMorphChange]
  );

  const morphPercent = Math.round(morphAmount * 100);
  const fillPercent = morphAmount * 100;

  return (
    <div className="flex flex-col gap-3 p-3 bg-gray-900 border border-gray-700 rounded-lg select-none">
      {/* Slot buttons + swap */}
      <div className="flex items-center gap-2">
        {/* A button */}
        <button
          type="button"
          onClick={() => onSlotChange('A')}
          className={`
            flex-1 h-8 rounded font-bold text-sm tracking-wide transition-all
            ${activeSlot === 'A'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/50 ring-1 ring-indigo-400'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'}
          `}
          aria-pressed={activeSlot === 'A'}
        >
          A
        </button>

        {/* Swap button */}
        <button
          type="button"
          onClick={onSwap}
          title="Swap A and B"
          className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
          aria-label="Swap A and B"
        >
          <ArrowLeftRight className="w-3.5 h-3.5" />
        </button>

        {/* B button */}
        <button
          type="button"
          onClick={() => onSlotChange('B')}
          className={`
            flex-1 h-8 rounded font-bold text-sm tracking-wide transition-all
            ${activeSlot === 'B'
              ? 'bg-violet-600 text-white shadow-lg shadow-violet-900/50 ring-1 ring-violet-400'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'}
          `}
          aria-pressed={activeSlot === 'B'}
        >
          B
        </button>
      </div>

      {/* Morph slider */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-[11px] text-gray-500 font-mono select-none">
          <span>A</span>
          <span
            className={`text-gray-200 font-medium ${
              morphPercent === 0 ? 'text-indigo-400' : morphPercent === 100 ? 'text-violet-400' : ''
            }`}
          >
            {morphPercent === 0
              ? '100% A'
              : morphPercent === 100
              ? '100% B'
              : `${100 - morphPercent}% / ${morphPercent}%`}
          </span>
          <span>B</span>
        </div>

        <div className="relative h-4 flex items-center">
          {/* Track background */}
          <div className="absolute inset-x-0 h-1.5 rounded-full bg-gray-700 overflow-hidden">
            <div
              className="absolute left-0 h-full rounded-l-full bg-indigo-500"
              style={{ width: `${50 - Math.abs(fillPercent - 50)}%`, right: fillPercent >= 50 ? undefined : 'auto' }}
            />
            {/* Gradient bar from indigo to violet */}
            <div
              className="h-full rounded-full"
              style={{
                background: 'linear-gradient(to right, #6366f1, #7c3aed)',
                width: `${fillPercent}%`,
              }}
            />
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={morphAmount}
            onChange={handleMorph}
            className="
              relative w-full h-1.5 appearance-none bg-transparent
              focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1 focus-visible:ring-offset-gray-900
              [&::-webkit-slider-thumb]:appearance-none
              [&::-webkit-slider-thumb]:w-4
              [&::-webkit-slider-thumb]:h-4
              [&::-webkit-slider-thumb]:rounded-full
              [&::-webkit-slider-thumb]:bg-white
              [&::-webkit-slider-thumb]:border
              [&::-webkit-slider-thumb]:border-gray-400
              [&::-webkit-slider-thumb]:shadow
              [&::-webkit-slider-thumb]:cursor-pointer
              [&::-webkit-slider-thumb]:transition-transform
              [&::-webkit-slider-thumb]:hover:scale-110
              [&::-moz-range-thumb]:w-4
              [&::-moz-range-thumb]:h-4
              [&::-moz-range-thumb]:rounded-full
              [&::-moz-range-thumb]:bg-white
              [&::-moz-range-thumb]:border
              [&::-moz-range-thumb]:border-gray-400
              [&::-moz-range-thumb]:cursor-pointer
            "
            aria-label="Morph between A and B"
          />
        </div>
      </div>

      {/* Copy buttons */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onCopy('A', 'B')}
          className="flex-1 flex items-center justify-center gap-1.5 h-6 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 text-[11px] font-medium transition-colors"
          title="Copy A to B"
        >
          <Copy className="w-3 h-3" />
          A → B
        </button>
        <button
          type="button"
          onClick={() => onCopy('B', 'A')}
          className="flex-1 flex items-center justify-center gap-1.5 h-6 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 text-[11px] font-medium transition-colors"
          title="Copy B to A"
        >
          <Copy className="w-3 h-3" />
          B → A
        </button>
      </div>
    </div>
  );
};

export default ABComparison;
