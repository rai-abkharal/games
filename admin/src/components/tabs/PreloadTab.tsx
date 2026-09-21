import React from "react";
import { Zap } from "lucide-react";
import { PreloadConfig, GameItem } from "../../types/admin";

export interface PreloadTabProps {
  preloadConfig: PreloadConfig;
  setPreloadConfig: React.Dispatch<React.SetStateAction<PreloadConfig>>;
  preloadSavedMsg: string | null;
  savingPreload: boolean;
  savePreloadConfig: () => void;
  games: GameItem[];
}

export const PreloadTab: React.FC<PreloadTabProps> = ({
  preloadConfig,
  setPreloadConfig,
  preloadSavedMsg,
  savingPreload,
  savePreloadConfig,
  games,
}) => {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1.2fr 1fr",
        gap: "32px",
        alignItems: "flex-start",
      }}
    >
      {/* Left Card: Slider & Configuration */}
      <div className="glass-panel" style={{ padding: "32px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            marginBottom: "20px",
          }}
        >
          <div
            style={{
              padding: "10px",
              background:
                "linear-gradient(135deg, rgba(234, 179, 8, 0.2), rgba(56, 189, 248, 0.2))",
              borderRadius: "12px",
              border: "1px solid rgba(234, 179, 8, 0.4)",
            }}
          >
            <Zap size={24} color="#facc15" />
          </div>
          <div>
            <h3 style={{ fontSize: "18px", fontWeight: 800 }}>
              Startup Preload Configuration
            </h3>
            <p
              style={{
                fontSize: "12px",
                color: "var(--text-muted)",
              }}
            >
              Adjust background cache count during initial app startup
            </p>
          </div>
        </div>

        {preloadSavedMsg && (
          <div
            style={{
              padding: "12px 16px",
              borderRadius: "10px",
              marginBottom: "20px",
              fontSize: "13px",
              fontWeight: 600,
              background: preloadSavedMsg.startsWith("✅")
                ? "rgba(16, 185, 129, 0.15)"
                : "rgba(239, 68, 68, 0.15)",
              border: preloadSavedMsg.startsWith("✅")
                ? "1px solid rgba(16, 185, 129, 0.3)"
                : "1px solid rgba(239, 68, 68, 0.3)",
              color: preloadSavedMsg.startsWith("✅") ? "#34d399" : "#f87171",
            }}
          >
            {preloadSavedMsg}
          </div>
        )}

        {/* Slider Box */}
        <div
          style={{
            padding: "24px",
            background: "rgba(0,0,0,0.3)",
            borderRadius: "16px",
            border: "1px solid var(--border-subtle)",
            marginBottom: "24px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "12px",
            }}
          >
            <span style={{ fontSize: "15px", fontWeight: 700 }}>
              Preloaded Games Count
            </span>
            <span
              style={{
                fontSize: "18px",
                color: "#38bdf8",
                fontWeight: 900,
                fontFamily: "var(--font-mono)",
                background: "rgba(56, 189, 248, 0.15)",
                padding: "4px 14px",
                borderRadius: "20px",
                border: "1px solid rgba(56, 189, 248, 0.3)",
              }}
            >
              {preloadConfig.initialPreloadGameCount ?? 5} Games
            </span>
          </div>

          <input
            type="range"
            min="1"
            max="15"
            value={preloadConfig.initialPreloadGameCount ?? 5}
            onChange={(e) =>
              setPreloadConfig({
                ...preloadConfig,
                initialPreloadGameCount: parseInt(e.target.value) || 5,
              })
            }
            style={{
              width: "100%",
              accentColor: "#38bdf8",
              height: "8px",
              cursor: "pointer",
            }}
          />

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "11px",
              color: "var(--text-muted)",
              marginTop: "8px",
              fontFamily: "var(--font-mono)",
            }}
          >
            <span>1 (Fastest Boot)</span>
            <span>5 (Recommended)</span>
            <span>15 (Full Deep Cache)</span>
          </div>

          <p
            style={{
              fontSize: "12px",
              color: "var(--text-muted)",
              marginTop: "16px",
              lineHeight: 1.5,
            }}
          >
            While players enjoy the animated startup loading screen, the mobile
            app automatically downloads this number of games silently into local
            permanent device storage. Once they finish the tutorial and swipe
            into the feed, these games open{" "}
            <strong>instantly with zero latency</strong>.
          </p>
        </div>

        {/* Latency & Network Impact Cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: "12px",
            marginBottom: "28px",
          }}
        >
          <div
            style={{
              padding: "14px",
              background:
                preloadConfig.initialPreloadGameCount <= 3
                  ? "rgba(56, 189, 248, 0.12)"
                  : "rgba(0,0,0,0.2)",
              border:
                preloadConfig.initialPreloadGameCount <= 3
                  ? "1px solid #38bdf8"
                  : "1px solid var(--border-subtle)",
              borderRadius: "12px",
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: "11px",
                fontWeight: 700,
                color: "#38bdf8",
                textTransform: "uppercase",
              }}
            >
              1 – 3 Games
            </div>
            <div
              style={{
                fontSize: "13px",
                fontWeight: 700,
                marginTop: "4px",
              }}
            >
              Ultra Fast Boot
            </div>
            <div
              style={{
                fontSize: "11px",
                color: "var(--text-muted)",
                marginTop: "4px",
              }}
            >
              ~1.2s screen time
            </div>
          </div>

          <div
            style={{
              padding: "14px",
              background:
                preloadConfig.initialPreloadGameCount >= 4 &&
                preloadConfig.initialPreloadGameCount <= 7
                  ? "rgba(99, 102, 241, 0.15)"
                  : "rgba(0,0,0,0.2)",
              border:
                preloadConfig.initialPreloadGameCount >= 4 &&
                preloadConfig.initialPreloadGameCount <= 7
                  ? "1px solid #818cf8"
                  : "1px solid var(--border-subtle)",
              borderRadius: "12px",
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: "11px",
                fontWeight: 700,
                color: "#818cf8",
                textTransform: "uppercase",
              }}
            >
              4 – 7 Games ⭐
            </div>
            <div
              style={{
                fontSize: "13px",
                fontWeight: 700,
                marginTop: "4px",
              }}
            >
              Ideal Balance
            </div>
            <div
              style={{
                fontSize: "11px",
                color: "var(--text-muted)",
                marginTop: "4px",
              }}
            >
              ~2.5s screen time
            </div>
          </div>

          <div
            style={{
              padding: "14px",
              background:
                preloadConfig.initialPreloadGameCount >= 8
                  ? "rgba(168, 85, 247, 0.15)"
                  : "rgba(0,0,0,0.2)",
              border:
                preloadConfig.initialPreloadGameCount >= 8
                  ? "1px solid #a855f7"
                  : "1px solid var(--border-subtle)",
              borderRadius: "12px",
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: "11px",
                fontWeight: 700,
                color: "#a855f7",
                textTransform: "uppercase",
              }}
            >
              8 – 15 Games
            </div>
            <div
              style={{
                fontSize: "13px",
                fontWeight: 700,
                marginTop: "4px",
              }}
            >
              Heavy Cache
            </div>
            <div
              style={{
                fontSize: "11px",
                color: "var(--text-muted)",
                marginTop: "4px",
              }}
            >
              ~4.5s screen time
            </div>
          </div>
        </div>

        <button
          className="btn-primary"
          style={{
            width: "100%",
            padding: "16px",
            fontSize: "15px",
            justifyContent: "center",
          }}
          onClick={savePreloadConfig}
          disabled={savingPreload}
        >
          {savingPreload
            ? "Deploying Preload Setting..."
            : "⚡ Save & Deploy Preload Setting"}
        </button>
      </div>

      {/* Right Card: Live Queue Preview */}
      <div className="glass-panel" style={{ padding: "28px" }}>
        <h3
          style={{
            fontSize: "18px",
            fontWeight: 700,
            marginBottom: "8px",
          }}
        >
          Startup Priority Queue
        </h3>
        <p
          style={{
            fontSize: "12px",
            color: "var(--text-muted)",
            marginBottom: "20px",
          }}
        >
          These first {preloadConfig.initialPreloadGameCount ?? 5} games will
          download silently during launch:
        </p>

        <div
          style={{
            maxHeight: "420px",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          {games
            .slice(0, preloadConfig.initialPreloadGameCount ?? 5)
            .map((g, idx) => (
              <div
                key={g.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "10px 14px",
                  background: "rgba(0,0,0,0.3)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "10px",
                }}
              >
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: 800,
                    color: "#38bdf8",
                    fontFamily: "var(--font-mono)",
                    width: "22px",
                  }}
                >
                  #{idx + 1}
                </span>
                {g.thumbnailUrl && (
                  <img
                    src={g.thumbnailUrl}
                    alt={g.title}
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "6px",
                      objectFit: "cover",
                    }}
                  />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: "13px",
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {g.title}
                  </div>
                  <div
                    style={{
                      fontSize: "11px",
                      color: "var(--text-muted)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {g.id}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: "11px",
                    color: "#34d399",
                    fontWeight: 700,
                    background: "rgba(52, 211, 153, 0.15)",
                    padding: "2px 8px",
                    borderRadius: "6px",
                  }}
                >
                  Instant Ready
                </span>
              </div>
            ))}
          {games.length === 0 && (
            <div
              style={{
                fontSize: "12px",
                color: "var(--text-muted)",
                padding: "20px",
                textAlign: "center",
              }}
            >
              No games currently available in catalog.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
