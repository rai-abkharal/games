import React from "react";
import {
  Search,
  X,
  Pencil,
  Check,
  UploadCloud,
  ShieldCheck,
  Smartphone,
  Download,
  Power,
  Trash2,
} from "lucide-react";
import { GameItem, TabType, API_BASE } from "../../types/admin";

export interface CatalogTabProps {
  games: GameItem[];
  can: (perm: string) => boolean;
  gameSearch: string;
  setGameSearch: (val: string) => void;
  renamingGameId: string | null;
  renameDraft: string;
  setRenameDraft: (val: string) => void;
  renameSaving: boolean;
  renameError: string | null;
  startRename: (game: GameItem) => void;
  cancelRename: () => void;
  saveRename: (gameId: string, title: string | null) => void;
  updateRollout: (gameId: string, percent: number) => void;
  reorderGame: (
    gameId: string,
    direction: "up" | "down" | "top" | number,
  ) => void;
  setUpdateGameTarget: (game: GameItem) => void;
  setActiveTab: (tab: TabType) => void;
  toggleGameHint: (gameId: string, currentVal: boolean) => void;
  openGameAdsEditor: (game: GameItem) => void;
  openTouchEditor: (game: GameItem) => void;
  setSimGame: (slug: string) => void;
  viewValidation: (gameId: string) => void;
  downloadingGameId: string | null;
  downloadGame: (gameId: string, title: string) => void;
  toggleGameStatus: (gameId: string, currentStatus: string) => void;
  deleteGame: (gameId: string, title: string) => void;
}

export const CatalogTab: React.FC<CatalogTabProps> = ({
  games,
  can,
  gameSearch,
  setGameSearch,
  renamingGameId,
  renameDraft,
  setRenameDraft,
  renameSaving,
  renameError,
  startRename,
  cancelRename,
  saveRename,
  updateRollout,
  reorderGame,
  setUpdateGameTarget,
  setActiveTab,
  toggleGameHint,
  openGameAdsEditor,
  openTouchEditor,
  setSimGame,
  viewValidation,
  downloadingGameId,
  downloadGame,
  toggleGameStatus,
  deleteGame,
}) => {
  const gameSearchTerm = gameSearch.trim().toLowerCase();
  const visibleGames = games.filter((g) => {
    if (!gameSearchTerm) return true;
    return (
      g.title.toLowerCase().includes(gameSearchTerm) ||
      g.slug.toLowerCase().includes(gameSearchTerm) ||
      g.id.toLowerCase().includes(gameSearchTerm)
    );
  });

  return (
    <div className="glass-panel" style={{ padding: "24px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          flexWrap: "wrap",
          marginBottom: "18px",
        }}
      >
        <div style={{ position: "relative", flex: "1 1 320px" }}>
          <Search
            size={15}
            style={{
              position: "absolute",
              left: "12px",
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--text-dim)",
              pointerEvents: "none",
            }}
          />
          <input
            type="text"
            value={gameSearch}
            onChange={(e) => setGameSearch(e.target.value)}
            placeholder="Search games by name or ID…"
            aria-label="Search game catalog"
            style={{
              width: "100%",
              padding: "10px 34px 10px 34px",
              fontSize: "14px",
              color: "#e2e8f0",
              background: "rgba(15, 23, 42, 0.6)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "10px",
              outline: "none",
            }}
          />
          {gameSearch && (
            <button
              type="button"
              onClick={() => setGameSearch("")}
              aria-label="Clear search"
              title="Clear search"
              style={{
                position: "absolute",
                right: "8px",
                top: "50%",
                transform: "translateY(-50%)",
                display: "flex",
                alignItems: "center",
                padding: "4px",
                color: "var(--text-dim)",
                background: "transparent",
                border: "none",
                cursor: "pointer",
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>
        <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
          {gameSearchTerm
            ? `${visibleGames.length} of ${games.length} games`
            : `${games.length} games`}
        </span>
      </div>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          textAlign: "left",
        }}
      >
        <thead>
          <tr
            style={{
              borderBottom: "1px solid var(--border-subtle)",
              color: "var(--text-muted)",
              fontSize: "13px",
            }}
          >
            <th style={{ padding: "12px 16px" }}>GAME</th>
            <th style={{ padding: "12px 16px" }}>STATUS</th>
            <th style={{ padding: "12px 16px" }}>ROLLOUT</th>
            <th style={{ padding: "12px 16px" }}>FEED POSITION</th>
            <th style={{ padding: "12px 16px" }}>PACKAGE SIZE</th>
            <th style={{ padding: "12px 16px" }}>UPDATED</th>
            <th style={{ padding: "12px 16px" }}>ACTIONS</th>
          </tr>
        </thead>
        <tbody>
          {visibleGames.length === 0 && (
            <tr>
              <td
                colSpan={7}
                style={{
                  padding: "28px 16px",
                  textAlign: "center",
                  color: "var(--text-muted)",
                  fontSize: "14px",
                }}
              >
                {gameSearchTerm
                  ? `No games match "${gameSearch.trim()}"`
                  : "No games in the catalog yet."}
              </td>
            </tr>
          )}
          {visibleGames
            .slice()
            .sort((a, b) => (a.sortWeight ?? 0) - (b.sortWeight ?? 0))
            .map((game) => {
              const latest = game.versions[0];
              return (
                <tr
                  key={game.id}
                  style={{
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                    fontSize: "14px",
                  }}
                >
                  <td style={{ padding: "16px" }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                      }}
                    >
                      <div
                        style={{
                          width: "40px",
                          height: "50px",
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
                      <div style={{ minWidth: 0 }}>
                        {renamingGameId === game.id ? (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                            }}
                          >
                            <input
                              autoFocus
                              value={renameDraft}
                              maxLength={80}
                              disabled={renameSaving}
                              onChange={(e) => setRenameDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter")
                                  saveRename(game.id, renameDraft);
                                if (e.key === "Escape") cancelRename();
                              }}
                              aria-label="Game display name"
                              style={{
                                width: "190px",
                                padding: "6px 8px",
                                fontSize: "14px",
                                fontWeight: 700,
                                color: "#e2e8f0",
                                background: "rgba(15, 23, 42, 0.8)",
                                border: "1px solid var(--accent-cyan)",
                                borderRadius: "6px",
                                outline: "none",
                              }}
                            />
                            <button
                              className="btn-primary"
                              style={{
                                padding: "5px 7px",
                                fontSize: "11px",
                              }}
                              disabled={renameSaving}
                              onClick={() => saveRename(game.id, renameDraft)}
                              title="Save new name"
                            >
                              <Check size={13} />
                            </button>
                            <button
                              className="btn-secondary"
                              style={{
                                padding: "5px 7px",
                                fontSize: "11px",
                              }}
                              disabled={renameSaving}
                              onClick={cancelRename}
                              title="Cancel"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        ) : (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                            }}
                          >
                            <div style={{ fontWeight: 700 }}>{game.title}</div>
                            {can("games.configure") && (
                              <button
                                className="btn-secondary"
                                style={{
                                  padding: "3px 5px",
                                  fontSize: "10px",
                                  lineHeight: 1,
                                }}
                                onClick={() => startRename(game)}
                                title="Edit game name"
                                aria-label={`Edit name of ${game.title}`}
                              >
                                <Pencil size={12} />
                              </button>
                            )}
                          </div>
                        )}
                        {renamingGameId === game.id && renameError && (
                          <div
                            style={{
                              fontSize: "11px",
                              color: "#fca5a5",
                              marginTop: "4px",
                            }}
                          >
                            {renameError}
                          </div>
                        )}
                        {game.titleOverride &&
                          game.sourceTitle !== game.title && (
                            <div
                              style={{
                                fontSize: "11px",
                                color: "var(--text-dim)",
                                marginTop: "2px",
                              }}
                            >
                              Renamed from "{game.sourceTitle}"
                              {can("games.configure") && (
                                <button
                                  onClick={() => saveRename(game.id, null)}
                                  disabled={renameSaving}
                                  title="Restore the original packaged name"
                                  style={{
                                    marginLeft: "6px",
                                    padding: 0,
                                    fontSize: "11px",
                                    color: "var(--accent-cyan)",
                                    background: "transparent",
                                    border: "none",
                                    cursor: "pointer",
                                    textDecoration: "underline",
                                  }}
                                >
                                  reset
                                </button>
                              )}
                            </div>
                          )}
                        <div
                          style={{
                            fontSize: "12px",
                            color: "var(--text-dim)",
                            fontFamily: "var(--font-mono)",
                          }}
                        >
                          {game.slug} (v{latest?.version || "1.0.0"})
                        </div>
                      </div>
                    </div>
                  </td>

                  <td style={{ padding: "16px" }}>
                    <span
                      className={`badge ${game.status === "published" ? "badge-published" : "badge-archived"}`}
                    >
                      {game.status === "published"
                        ? "PUBLISHED"
                        : "DEACTIVATED"}
                    </span>
                  </td>

                  <td style={{ padding: "16px" }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <input
                        type="range"
                        min="1"
                        max="100"
                        value={latest?.rolloutPercent || 100}
                        disabled={!can("games.publish")}
                        onChange={(e) =>
                          updateRollout(game.id, parseInt(e.target.value))
                        }
                        style={{ width: "90px" }}
                      />
                      <span
                        style={{
                          fontSize: "13px",
                          fontWeight: 600,
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        {latest?.rolloutPercent || 100}%
                      </span>
                    </div>
                  </td>

                  <td style={{ padding: "16px" }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <select
                        value={game.sortWeight}
                        disabled={!can("feed.manage")}
                        onChange={(e) =>
                          reorderGame(game.id, Number(e.target.value))
                        }
                        style={{
                          padding: "4px 8px",
                          fontSize: "13px",
                          fontWeight: 800,
                          color: "var(--accent-cyan)",
                          background: "rgba(6, 182, 212, 0.15)",
                          border: "1px solid rgba(6, 182, 212, 0.4)",
                          borderRadius: "6px",
                          cursor: "pointer",
                          fontFamily: "var(--font-mono)",
                        }}
                        title="Set Exact Feed Position Number for App"
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
                            #{i + 1} {i === 0 ? "(Top #1)" : ""}
                          </option>
                        ))}
                      </select>
                      <button
                        className="btn-secondary"
                        style={{
                          padding: "4px 6px",
                          fontSize: "10px",
                        }}
                        disabled={!can("feed.manage")}
                        onClick={() => reorderGame(game.id, "up")}
                        title="Move Up in Feed"
                      >
                        ▲
                      </button>
                      <button
                        className="btn-secondary"
                        style={{
                          padding: "4px 6px",
                          fontSize: "10px",
                        }}
                        disabled={!can("feed.manage")}
                        onClick={() => reorderGame(game.id, "down")}
                        title="Move Down in Feed"
                      >
                        ▼
                      </button>
                      <button
                        className="btn-secondary"
                        style={{
                          padding: "4px 8px",
                          fontSize: "11px",
                          color: "#fbbf24",
                          background: "rgba(251, 191, 36, 0.1)",
                        }}
                        disabled={!can("feed.manage")}
                        onClick={() => reorderGame(game.id, "top")}
                        title="Pin to Top (#1 Position on App Feed)"
                      >
                        📌 #1
                      </button>
                    </div>
                  </td>

                  <td
                    style={{
                      padding: "16px",
                      fontFamily: "var(--font-mono)",
                      color: "var(--text-muted)",
                    }}
                  >
                    {latest
                      ? `${(latest.sizeBytes / 1024).toFixed(1)} KB`
                      : "N/A"}
                  </td>

                  <td
                    style={{
                      padding: "16px",
                      fontSize: "12px",
                      color: "var(--text-muted)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {game.updatedAt ? (
                      <div>
                        <div
                          style={{
                            color: "#e2e8f0",
                            fontWeight: 600,
                          }}
                        >
                          {new Date(game.updatedAt).toLocaleDateString(
                            undefined,
                            {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            },
                          )}
                        </div>
                        <div
                          style={{
                            fontSize: "11px",
                            color: "var(--text-dim)",
                          }}
                        >
                          {new Date(game.updatedAt).toLocaleTimeString(
                            undefined,
                            {
                              hour: "2-digit",
                              minute: "2-digit",
                            },
                          )}
                        </div>
                      </div>
                    ) : (
                      <span style={{ color: "var(--text-dim)" }}>
                        Pre-installed
                      </span>
                    )}
                  </td>

                  <td style={{ padding: "16px" }}>
                    <div
                      style={{
                        display: "flex",
                        gap: "6px",
                        flexWrap: "wrap",
                      }}
                    >
                      <button
                        className="btn-secondary"
                        style={{
                          padding: "6px 10px",
                          fontSize: "12px",
                          background: "rgba(99, 102, 241, 0.2)",
                          border: "1px solid #6366f1",
                          color: "#a5b4fc",
                        }}
                        onClick={() => {
                          setUpdateGameTarget(game);
                          setActiveTab("update");
                        }}
                        title="Upload New Code / Version for this game"
                      >
                        <UploadCloud size={13} /> Update
                      </button>
                      <button
                        className={
                          game.features?.hint ? "btn-primary" : "btn-secondary"
                        }
                        style={{
                          padding: "6px 10px",
                          fontSize: "12px",
                          background: game.features?.hint
                            ? "rgba(251, 191, 36, 0.2)"
                            : undefined,
                          border: game.features?.hint
                            ? "1px solid #f59e0b"
                            : undefined,
                          color: game.features?.hint ? "#fbbf24" : undefined,
                        }}
                        disabled={!can("games.configure")}
                        onClick={() =>
                          toggleGameHint(game.id, !!game.features?.hint)
                        }
                        title="Toggle Rewarded Hint Button for this game"
                      >
                        💡 Hint: {game.features?.hint ? "ON" : "OFF"}
                      </button>
                      <button
                        className="btn-secondary"
                        style={{
                          padding: "6px 10px",
                          fontSize: "12px",
                          background:
                            game.ads?.enabled === false
                              ? "rgba(239, 68, 68, 0.15)"
                              : game.ads?.useCustomInterval
                                ? "rgba(147, 51, 234, 0.2)"
                                : "rgba(59, 130, 246, 0.15)",
                          border:
                            game.ads?.enabled === false
                              ? "1px solid #ef4444"
                              : game.ads?.useCustomInterval
                                ? "1px solid #a855f7"
                                : "1px solid #3b82f6",
                          color:
                            game.ads?.enabled === false
                              ? "#fca5a5"
                              : game.ads?.useCustomInterval
                                ? "#d8b4fe"
                                : "#93c5fd",
                        }}
                        disabled={!can("games.configure")}
                        onClick={() => openGameAdsEditor(game)}
                        title="Configure Ad frequency and settings for this game"
                      >
                        📢 Ads:{" "}
                        {game.ads?.enabled === false
                          ? "Off"
                          : game.ads?.useCustomInterval
                            ? `${game.ads?.intervalMinutes || 5}m`
                            : "Default"}
                      </button>
                      <button
                        className="btn-secondary"
                        style={{
                          padding: "6px 10px",
                          fontSize: "12px",
                        }}
                        disabled={!can("games.configure")}
                        onClick={() => openTouchEditor(game)}
                      >
                        <ShieldCheck size={13} /> Touch
                      </button>
                      <button
                        className="btn-secondary"
                        style={{
                          padding: "6px 10px",
                          fontSize: "12px",
                        }}
                        onClick={() => {
                          setSimGame(game.slug);
                          setActiveTab("simulator");
                        }}
                      >
                        <Smartphone size={13} /> Test
                      </button>
                      <button
                        className="btn-secondary"
                        style={{
                          padding: "6px 10px",
                          fontSize: "12px",
                        }}
                        onClick={() => viewValidation(game.id)}
                      >
                        <ShieldCheck size={13} /> Check
                      </button>
                      <button
                        className="btn-secondary"
                        style={{
                          padding: "6px 10px",
                          fontSize: "12px",
                        }}
                        disabled={downloadingGameId === game.id}
                        onClick={() => downloadGame(game.id, game.title)}
                        title="Download this game's code as a zip"
                      >
                        <Download size={13} />{" "}
                        {downloadingGameId === game.id ? "..." : "ZIP"}
                      </button>
                      <button
                        className={
                          game.status === "published"
                            ? "btn-danger"
                            : "btn-primary"
                        }
                        style={{
                          padding: "6px 10px",
                          fontSize: "12px",
                        }}
                        disabled={!can("games.publish")}
                        onClick={() => toggleGameStatus(game.id, game.status)}
                      >
                        <Power size={13} />{" "}
                        {game.status === "published"
                          ? "Deactivate"
                          : "Activate"}
                      </button>
                      <button
                        className="btn-danger"
                        style={{
                          padding: "6px 10px",
                          fontSize: "12px",
                          background: "rgba(239, 68, 68, 0.2)",
                          border: "1px solid #ef4444",
                        }}
                        disabled={!can("games.delete")}
                        onClick={() => deleteGame(game.id, game.title)}
                        title="Permanently Delete Game"
                      >
                        <Trash2 size={13} /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
};
