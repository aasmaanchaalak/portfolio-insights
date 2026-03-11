'use client';

import React from 'react';

export interface DrawerTab {
  id: string;
  label: string;
  enabled: boolean;
}

interface DrawerTabsProps {
  tabs: DrawerTab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

export function DrawerTabs({ tabs, activeTab, onTabChange }: DrawerTabsProps) {
  return (
    <div className="drawer-tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`drawer-tab ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => tab.enabled && onTabChange(tab.id)}
          disabled={!tab.enabled}
          role="tab"
          aria-selected={activeTab === tab.id}
          aria-controls={`panel-${tab.id}`}
          type="button"
        >
          {tab.label}
          {!tab.enabled && (
            <span className="drawer-tab-badge">Soon</span>
          )}
        </button>
      ))}
    </div>
  );
}
