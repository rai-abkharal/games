import React from "react";
import { GameItem, API_BASE } from "../../types/admin";

export interface FeedSequencerTabProps {
  games: GameItem[];
  can: (permission: string) => boolean;
  reorderGame: (
    gameId: string,
    direction: "up" | "down" | "top" | number,
  ) => void;
}

export const FeedSequencerTab: React.FC<FeedSequencerTabProps> = ({
  games,
  can,
  reorderGame,
}) => {
  return (
    <div className="glass-panel" style={{ padding: "28px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "20px",
        }}
      >
        <div>
          <h3
            style={{
              fontSize: "18px",
              fontWeight: 700,
              marginBottom: "6px",
            }}
          >
            App Swipe Feed Sequencer & Running Order
          </h3>
          <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>
            Control the exact order games appear in the mobile app feed.{" "}
            <strong>Position #1</strong> is the first game shown when the app
            opens. Newly uploaded games automatically start at{" "}
            <strong>#1</strong>.
          </p>
        </div>
        <div
          style={{
            background: "rgba(6, 182, 212, 0.1)",
            border: "1px solid rgba(6, 182, 212, 0.3)",
            padding: "8px 16px",
            borderRadius: "10px",
            fontSize: "13px",
            color: "var(--accent-cyan)",
            fontWeight: 600,
          }}
        >
          🎮 Total Games: {games.length}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        {games
          .slice()
          .sort((a, b) => (a.sortWeight ?? 0) - (b.sortWeight ?? 0))
          .map((game, idx) => (
            <div
              key={game.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 20px",
                background:
                  idx === 0 ? "rgba(6, 182, 212, 0.08)" : "rgba(0,0,0,0.3)",
                borderRadius: "12px",
                border:
                  idx === 0
                    ? "1px solid rgba(6, 182, 212, 0.4)"
                    : "1px solid var(--border-subtle)",
                transition: "all 0.2s ease",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "16px",
                }}
              >
                <div
                  style={{
                    fontSize: "16px",
                    fontWeight: 800,
                    color: idx === 0 ? "#fbbf24" : "var(--accent-cyan)",
                    background:
                      idx === 0
                        ? "rgba(251, 191, 36, 0.15)"
                        : "rgba(6, 182, 212, 0.12)",
                    padding: "6px 12px",
                    borderRadius: "8px",
                    border:
                      idx === 0
                        ? "1px solid rgba(251, 191, 36, 0.3)"
                        : "1px solid rgba(6, 182, 212, 0.2)",
                    minWidth: "46px",
                    textAlign: "center",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  #{idx + 1}
                </div>
                <div
                  style={{
                    width: "48px",
                    height: "60px",
                    borderRadius: "8px",
                    background: "#1e293b",
                    overflow: "hidden",
                  }}
                >
                  <img
                    src={
                      game.thumbnailUrl.startsWith("http")
                        ? game.thumbnailUrl
                        : `${API_BASE}${game.thumbnailUrl}`
                    }
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                </div>
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <h4 style={{ fontSize: "16px", fontWeight: 700 }}>
                      {game.title}
                    </h4>
                    {idx === 0 && (
                      <span
                        style={{
                          fontSize: "11px",
                          background: "rgba(251, 191, 36, 0.2)",
                          color: "#fbbf24",
                          border: "1px solid #f59e0b",
                          padding: "2px 8px",
                          borderRadius: "10px",
                          fontWeight: 700,
                        }}
                      >
                        🌟 FIRST ON APP LOAD
                      </span>
                    )}
                    <span
                      className={`badge ${game.status === "published" ? "badge-published" : "badge-archived"}`}
                      style={{ fontSize: "10px", padding: "2px 6px" }}
                    >
                      {game.status}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "var(--text-muted)",
                      marginTop: "2px",
                    }}
                  >
                    {game.slug} • Tags: {game.tags.join(", ")} • Engine:{" "}
                    {game.orientation}
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "12px",
                      color: "var(--text-muted)",
                      fontWeight: 600,
                    }}
                  >
                    Position:
                  </span>
                  <select
                    value={idx + 1}
                    disabled={!can("feed.manage")}
                    onChange={(e) =>
                      reorderGame(game.id, Number(e.target.value))
                    }
                    style={{
                      padding: "6px 10px",
                      fontSize: "13px",
                      fontWeight: 800,
                      color: "#38bdf8",
                      background: "rgba(56, 189, 248, 0.12)",
                      border: "1px solid rgba(56, 189, 248, 0.4)",
                      borderRadius: "8px",
                      cursor: "pointer",
                      fontFamily: "var(--font-mono)",
                    }}
                    title="Set exact running position number"
                  >
                    {games.map((_, i) => (
                      <option
                        key={i + 1}
                        value={i + 1}
                        style={{
                          background: "#0f172a",
                          color: "#fff",
                        }}
                      >
                        #{i + 1} {i === 0 ? "(First on App Load)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  className="btn-secondary"
                  style={{
                    padding: "8px 12px",
                    fontSize: "13px",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                  onClick={() => reorderGame(game.id, "up")}
                  disabled={idx === 0 || !can("feed.manage")}
                  title="Move Up 1 Position"
                >
                  ▲ Up
                </button>
                <button
                  className="btn-secondary"
                  style={{
                    padding: "8px 12px",
                    fontSize: "13px",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                  onClick={() => reorderGame(game.id, "down")}
                  disabled={idx === games.length - 1 || !can("feed.manage")}
                  title="Move Down 1 Position"
                >
                  ▼ Down
                </button>
                {idx !== 0 && (
                  <button
                    className="btn-secondary"
                    style={{
                      padding: "8px 14px",
                      fontSize: "13px",
                      color: "#fbbf24",
                      background: "rgba(251, 191, 36, 0.12)",
                      border: "1px solid rgba(251, 191, 36, 0.3)",
                      fontWeight: 600,
                    }}
                    disabled={!can("feed.manage")}
                    onClick={() => reorderGame(game.id, "top")}
                    title="Make this the #1 Game in App"
                  >
                    📌 Pin #1
                  </button>
                )}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
};
