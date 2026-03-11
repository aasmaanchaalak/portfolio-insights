'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ThesisStatus } from '../../../types/thesis';

interface ThesisStatusBadgeProps {
  status: ThesisStatus;
  onStatusChange: (status: ThesisStatus) => void;
  disabled?: boolean;
}

const STATUS_CONFIG: Record<ThesisStatus, { label: string; icon: string }> = {
  intact: { label: 'Intact', icon: '●' },
  monitor: { label: 'Monitor', icon: '◐' },
  broken: { label: 'Broken', icon: '○' },
};

const STATUS_OPTIONS: ThesisStatus[] = ['intact', 'monitor', 'broken'];

export function ThesisStatusBadge({
  status,
  onStatusChange,
  disabled,
}: ThesisStatusBadgeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (newStatus: ThesisStatus) => {
    if (newStatus !== status) {
      onStatusChange(newStatus);
    }
    setIsOpen(false);
  };

  const config = STATUS_CONFIG[status];

  return (
    <div className="thesis-status-container" ref={dropdownRef}>
      <button
        className={`thesis-status-badge ${status}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="status-icon">{config.icon}</span>
        <span className="status-label">{config.label}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="status-chevron"
        >
          <path d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="thesis-status-dropdown" role="listbox">
          {STATUS_OPTIONS.map((option) => (
            <button
              key={option}
              className={`thesis-status-option ${option} ${option === status ? 'selected' : ''}`}
              onClick={() => handleSelect(option)}
              role="option"
              aria-selected={option === status}
              type="button"
            >
              <span className="status-icon">{STATUS_CONFIG[option].icon}</span>
              <span className="status-label">{STATUS_CONFIG[option].label}</span>
              {option === status && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
