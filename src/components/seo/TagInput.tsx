'use client';

import { useState, KeyboardEvent } from 'react';
import { X } from 'lucide-react';

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  maxTags?: number;
}

export default function TagInput({ tags, onChange, placeholder = 'Type and press Enter...', maxTags = 30 }: TagInputProps) {
  const [input, setInput] = useState('');

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = input.trim().toLowerCase();
      if (val && !tags.includes(val) && tags.length < maxTags) {
        onChange([...tags, val]);
      }
      setInput('');
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  };

  const removeTag = (index: number) => {
    onChange(tags.filter((_, i) => i !== index));
  };

  const isAtLimit = tags.length >= maxTags;

  return (
    <div className="flex flex-wrap gap-1.5 md:gap-2 p-2 bg-slate-900 border border-slate-700 rounded-lg min-h-[44px] items-center focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 transition-colors">
      {tags.map((tag, index) => (
        <span
          key={index}
          className="flex items-center gap-1 px-2 py-0.5 md:py-1 bg-blue-500/20 text-blue-300 rounded text-xs md:text-sm border border-blue-500/30"
        >
          {tag}
          <button
            onClick={() => removeTag(index)}
            className="hover:text-white transition-colors"
            type="button"
          >
            <X size={12} />
          </button>
        </span>
      ))}
      {!isAtLimit && (
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[100px] md:min-w-[120px] bg-transparent text-white outline-none text-sm placeholder:text-slate-500"
        />
      )}
      {isAtLimit && (
        <span className="text-slate-500 text-xs">Limit reached ({maxTags})</span>
      )}
    </div>
  );
}
