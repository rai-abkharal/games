import React from "react";
import {
  Gamepad2,
  LayoutDashboard,
  Activity,
  Layers,
  UploadCloud,
  RefreshCw,
  ShieldCheck,
  Megaphone,
  Zap,
  Smartphone,
  ListOrdered,
  AlertTriangle,
} from "lucide-react";
import type { TabType } from "../../types/admin";

interface SidebarProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  can: (permission: string) => boolean;
  gamesCount?: number;
  reportsCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  can,
  gamesCount,
  reportsCount,
}) => {
  const navItems: {
    id: TabType;
    label: string;
    icon: React.ComponentType<any>;
    permission: string;
    count?: number;
  }[] = [
    {
      id: "dashboard",
      label: "Overview",
      icon: LayoutDashboard,
      permission: "analytics.read",
    },
    {
      id: "analytics",
      label: "Analytics & Usage",
      icon: Activity,
      permission: "analytics.read",
    },
    {
      id: "games",
      label: "Game Catalog",
      icon: Layers,
      permission: "games.read",
      count: gamesCount,
    },
    {
      id: "upload",
      label: "Upload New Game",
      icon: UploadCloud,
      permission: "games.upload",
    },
    {
      id: "update",
      label: "Update Game Code",
      icon: RefreshCw,
      permission: "games.update",
    },
    {
      id: "gestures",
      label: "Touch & Swipe Locks",
      icon: ShieldCheck,
      permission: "games.configure",
    },
    {
      id: "ads",
      label: "Ads & Monetization",
      icon: Megaphone,
      permission: "ads.configure",
    },
    {
      id: "preload",
      label: "Startup Preload",
      icon: Zap,
      permission: "games.configure",
    },
    {
      id: "simulator",
      label: "Device Simulator",
      icon: Smartphone,
      permission: "games.read",
    },
    {
      id: "feed",
      label: "Feed Sequencer",
      icon: ListOrdered,
      permission: "feed.manage",
    },
    {
      id: "reports",
      label: "Reports Queue",
      icon: AlertTriangle,
      permission: "reports.read",
      count: reportsCount,
    },
  ];

  return (
    <aside
      style={{
        width: "280px",
        background: "rgba(15, 23, 42, 0.6)",
        backdropFilter: "blur(20px)",
        borderRight: "1px solid var(--border-subtle)",
        display: "flex",
        flexDirection: "column",
        padding: "24px 16px",
        zIndex: 50,
      }}
    >
      {/* Brand Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "0 12px 24px",
          borderBottom: "1px solid var(--border-subtle)",
          marginBottom: "20px",
        }}
      >
        <div
          style={{
            width: "40px",
            height: "40px",
            borderRadius: "12px",
            background: "linear-gradient(135deg, #6366f1, #a855f7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 8px 16px rgba(99, 102, 241, 0.3)",
          }}
        >
          <Gamepad2 size={22} color="#fff" />
        </div>
        <div>
          <h1
            style={{
              fontSize: "18px",
              fontWeight: "800",
              letterSpacing: "-0.5px",
            }}
          >
            SWIPE PLAY
          </h1>
          <p
            style={{
              fontSize: "11px",
              color: "var(--accent-cyan)",
              fontWeight: "600",
              textTransform: "uppercase",
              letterSpacing: "1px",
            }}
          >
            Operator Studio
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {navItems
          .filter((item) => can(item.permission))
          .map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "12px 16px",
                  borderRadius: "12px",
                  border: "none",
                  background: isActive
                    ? "linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(99, 102, 241, 0.05))"
                    : "transparent",
                  color: isActive ? "#818cf8" : "var(--text-muted)",
                  borderLeft: isActive
                    ? "3px solid #6366f1"
                    : "3px solid transparent",
                  fontWeight: isActive ? 600 : 500,
                  fontSize: "14px",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.15s ease",
                }}
              >
                <Icon
                  size={18}
                  color={isActive ? "#818cf8" : "currentColor"}
                />
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.count !== undefined && item.count > 0 && (
                  <span
                    style={{
                      background: "rgba(239, 68, 68, 0.2)",
                      color: "#f87171",
                      fontSize: "11px",
                      padding: "2px 8px",
                      borderRadius: "10px",
                      fontWeight: 700,
                    }}
                  >
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
      </nav>

      {/* System Health Status Footer */}
      <div
        style={{
          marginTop: "auto",
          padding: "16px",
          borderRadius: "12px",
          background: "rgba(0, 0, 0, 0.3)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: "6px",
          }}
        >
          <div
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: "#10b981",
              boxShadow: "0 0 8px #10b981",
            }}
          />
          <span
            style={{ fontSize: "12px", fontWeight: 600, color: "#34d399" }}
          >
            Fastify + CDN Online
          </span>
        </div>
        <p style={{ fontSize: "11px", color: "var(--text-dim)" }}>
          Port 3000 • Localhost Storage
        </p>
      </div>
    </aside>
  );
};
