import React from 'react';
import type { LucideIcon } from 'lucide-react';

export interface Preset {
  name: string;
  label: string;
  icon?: LucideIcon;
}

interface PresetGridProps {
  presets: Preset[];
  activePreset: string | null;
  onSelect: (name: string) => void;
}

export const PresetGrid: React.FC<PresetGridProps> = ({
  presets,
  activePreset,
  onSelect,
}) => {
  if (presets.length === 0) {
    return (
      <div className="flex items-center justify-center h-16 text-gray-600 text-sm">
        No presets available
      </div>
    );
  }

  return (
    <div
      className="grid gap-1.5"
      style={{
        gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
      }}
    >
      {presets.map(preset => {
        const isActive = preset.name === activePreset;
        const Icon = preset.icon;

        return (
          <button
            key={preset.name}
            type="button"
            onClick={() => onSelect(preset.name)}
            title={preset.label}
            aria-pressed={isActive}
            className={`
              group relative flex flex-col items-center justify-center gap-1
              px-2 py-2 rounded text-center
              text-[11px] font-medium leading-tight
              transition-all duration-100
              focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1 focus-visible:ring-offset-gray-900
              ${isActive
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40 ring-1 ring-indigo-400'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200 border border-gray-700 hover:border-gray-600'}
            `}
          >
            {Icon && (
              <Icon
                className={`w-4 h-4 flex-shrink-0 transition-colors ${
                  isActive ? 'text-white' : 'text-gray-500 group-hover:text-gray-300'
                }`}
              />
            )}
            <span className="w-full truncate leading-none">{preset.label}</span>

            {/* Active indicator dot */}
            {isActive && (
              <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-indigo-300" />
            )}
          </button>
        );
      })}
    </div>
  );
};

export default PresetGrid;
