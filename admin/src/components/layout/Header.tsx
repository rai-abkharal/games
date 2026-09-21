import React from "react";
import { RefreshCw, Smartphone } from "lucide-react";
import type { TabType } from "../../types/admin";

interface HeaderProps {
  activeTab: TabType;
  loading?: boolean;
  onRefresh: () => void;
  onOpenSimulator: () => void;
}

const TAB_TITLES: Record<TabType, string> = {
  dashboard: "Platform Performance & Metrics",
  analytics: "Game Usage Analytics & GA4 Telemetry",
  games: "Game Catalog & Staged Rollouts",
  upload: "Package Ingestion & 7-Point Validator",
  update: "Update Game Code",
  simulator: "Interactive Device Simulator & Bridge Debugger",
  feed: "TikTok Feed Sequencer & Weights",
  reports: "User Reports & Moderation",
  gestures: "Touch & Swipe Locks",
  ads: "Ads & Monetization Remote Config",
  preload: "Startup Preload Remote Configuration",
};

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  loading = false,
  onRefresh,
  onOpenSimulator,
}) => {
  return (
    <header
      style={{
        height: "70px",
        borderBottom: "1px solid var(--border-subtle)",
        padding: "0 32px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "rgba(15, 23, 42, 0.3)",
        backdropFilter: "blur(10px)",
        position: "sticky",
        top: 0,
        zIndex: 40,
      }}
    >
      <div>
        <h2 style={{ fontSize: "20px", fontWeight: "700" }}>
          {TAB_TITLES[activeTab] || "Operator Studio"}
        </h2>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        <button
          className="btn-secondary"
          onClick={onRefresh}
          disabled={loading}
        >
          <RefreshCw
            size={15}
            style={loading ? { animation: "spin 1s linear infinite" } : undefined}
          />{" "}
          {loading ? "Refreshing..." : "Refresh"}
        </button>
        <button className="btn-primary" onClick={onOpenSimulator}>
          <Smartphone size={16} /> Open Simulator
        </button>
      </div>
    </header>
  );
};
