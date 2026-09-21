import React from "react";
import {
  Gamepad2,
  Sparkles,
  TrendingUp,
  Zap,
  CheckCircle2,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import type { GameItem } from "../../types/admin";

interface DashboardTabProps {
  games: GameItem[];
  onTestGame: (gameSlug: string) => void;
  onViewValidation: (gameId: string) => void;
}

export const DashboardTab: React.FC<DashboardTabProps> = ({
  games,
  onTestGame,
  onViewValidation,
}) => {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "28px",
      }}
    >
      {/* Stat Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "20px",
        }}
      >
        <div className="glass-panel" style={{ padding: "24px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              color: "var(--text-muted)",
            }}
          >
            <span style={{ fontSize: "13px", fontWeight: 600 }}>
              ACTIVE GAMES
            </span>
            <Gamepad2 size={20} color="#818cf8" />
          </div>
          <div
            style={{
              fontSize: "32px",
              fontWeight: 800,
              margin: "12px 0 4px",
              color: "#fff",
            }}
          >
            {games.filter((g) => g.status === "published").length} /{" "}
            {games.length}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "12px",
              color: "#34d399",
            }}
          >
            <Sparkles size={13} /> Ready for instant swipe
          </div>
        </div>

        <div className="glass-panel" style={{ padding: "24px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              color: "var(--text-muted)",
            }}
          >
            <span style={{ fontSize: "13px", fontWeight: 600 }}>
              SWIPE-THROUGH RATE
            </span>
            <TrendingUp size={20} color="#06b6d4" />
          </div>
          <div
            style={{
              fontSize: "32px",
              fontWeight: 800,
              margin: "12px 0 4px",
              color: "#06b6d4",
            }}
          >
            18.4%
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "12px",
              color: "#34d399",
            }}
          >
            <span>Target &lt; 35% (Healthy)</span>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: "24px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              color: "var(--text-muted)",
            }}
          >
            <span style={{ fontSize: "13px", fontWeight: 600 }}>
              AVG GAMEPLAY FPS
            </span>
            <Zap size={20} color="#f59e0b" />
          </div>
          <div
            style={{
              fontSize: "32px",
              fontWeight: 800,
              margin: "12px 0 4px",
              color: "#f59e0b",
            }}
          >
            59.8
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "12px",
              color: "#34d399",
            }}
          >
            <CheckCircle2 size={13} /> 60 FPS Target Met
          </div>
        </div>

        <div className="glass-panel" style={{ padding: "24px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              color: "var(--text-muted)",
            }}
          >
            <span style={{ fontSize: "13px", fontWeight: 600 }}>
              LOAD FAILURE RATE
            </span>
            <ShieldCheck size={20} color="#10b981" />
          </div>
          <div
            style={{
              fontSize: "32px",
              fontWeight: 800,
              margin: "12px 0 4px",
              color: "#10b981",
            }}
          >
            0.08%
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "12px",
              color: "#34d399",
            }}
          >
            <span>Floor &lt; 0.5% (Optimal)</span>
          </div>
        </div>
      </div>

      {/* Game Cards Summary Grid */}
      <div>
        <h3
          style={{
            fontSize: "18px",
            fontWeight: 700,
            marginBottom: "16px",
          }}
        >
          Current Catalogue Running Order
        </h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "20px",
          }}
        >
          {games.map((game, idx) => (
            <div
              key={game.id}
              className="glass-panel-interactive"
              style={{ padding: "20px" }}
            >
              <div
                style={{
                  display: "flex",
                  gap: "16px",
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    width: "64px",
                    height: "80px",
                    borderRadius: "10px",
                    overflow: "hidden",
                    background: "#1e293b",
                    flexShrink: 0,
                  }}
                >
                  <img
                    src={game.thumbnailUrl}
                    alt={game.title}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                    onError={(e) => {
                      (e.target as any).src =
                        'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="80"><rect width="64" height="80" fill="%23334155"/></svg>';
                    }}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        color: "var(--accent-cyan)",
                      }}
                    >
                      #{idx + 1}
                    </span>
                    <span
                      className={`badge ${game.status === "published" ? "badge-published" : "badge-archived"}`}
                    >
                      {game.status}
                    </span>
                  </div>
                  <h4
                    style={{
                      fontSize: "16px",
                      fontWeight: 700,
                      margin: "4px 0",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {game.title}
                  </h4>
                  <p
                    style={{
                      fontSize: "12px",
                      color: "var(--text-muted)",
                    }}
                  >
                    Weight: {game.sortWeight} • {game.controls.join(", ")}
                  </p>
                </div>
              </div>

              <div
                style={{
                  marginTop: "16px",
                  display: "flex",
                  gap: "8px",
                }}
              >
                <button
                  className="btn-secondary"
                  style={{
                    flex: 1,
                    justifyContent: "center",
                    padding: "8px",
                  }}
                  onClick={() => onTestGame(game.slug)}
                >
                  <Smartphone size={14} /> Test
                </button>
                <button
                  className="btn-secondary"
                  style={{
                    flex: 1,
                    justifyContent: "center",
                    padding: "8px",
                  }}
                  onClick={() => onViewValidation(game.id)}
                >
                  <ShieldCheck size={14} /> Report
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
