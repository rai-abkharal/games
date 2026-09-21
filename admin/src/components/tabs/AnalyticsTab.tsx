import React, { useState, useEffect } from "react";
import {
  RefreshCw,
  Flame,
  Clock,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  Zap,
  Sparkles,
  Smartphone,
} from "lucide-react";
import type { GameItem } from "../../types/admin";
import { formatDuration } from "../../types/admin";
import {
  fetchAnalyticsSummary,
  sendGa4TestEvent,
} from "../../api/analyticsApi";

interface AnalyticsTabProps {
  games: GameItem[];
  gaMeasurementId?: string;
  onOpenGameAdsEditor: (game: GameItem) => void;
  onTestGame: (gameSlug: string) => void;
}

export const AnalyticsTab: React.FC<AnalyticsTabProps> = ({
  games,
  gaMeasurementId,
  onOpenGameAdsEditor,
  onTestGame,
}) => {
  const [analyticsRange, setAnalyticsRange] = useState<
    "today" | "7d" | "30d" | "all"
  >("all");
  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [testEventStatus, setTestEventStatus] = useState<{
    running: boolean;
    msg: string | null;
    error: boolean;
    details?: any;
  }>({ running: false, msg: null, error: false });

  const fetchAnalytics = async (
    range: "today" | "7d" | "30d" | "all" = analyticsRange,
  ) => {
    try {
      setLoadingAnalytics(true);
      const data = await fetchAnalyticsSummary(range);
      setAnalyticsData(data);
      setAnalyticsError(null);
    } catch (err) {
      setAnalyticsError(
        err instanceof Error ? err.message : "Unable to load analytics.",
      );
      console.error("Failed to fetch analytics", err);
    } finally {
      setLoadingAnalytics(false);
    }
  };

  useEffect(() => {
    void fetchAnalytics(analyticsRange);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible")
        void fetchAnalytics(analyticsRange);
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [analyticsRange]);

  const runGa4Test = async () => {
    try {
      setTestEventStatus({
        running: true,
        msg: "Sending test event to Google Analytics 4 DebugView...",
        error: false,
      });
      const data = await sendGa4TestEvent({
        gameId: games[0]?.slug || "crown-chase",
      });
      if (data.success) {
        setTestEventStatus({
          running: false,
          msg: data.message,
          error: false,
          details: data.ga4,
        });
      } else {
        setTestEventStatus({
          running: false,
          msg: data.error || "Failed to deliver event",
          error: true,
          details: data.ga4,
        });
      }
    } catch (err: any) {
      setTestEventStatus({
        running: false,
        msg: err.message,
        error: true,
      });
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "28px",
      }}
    >
      {/* Header Controls: Range Picker & Actions */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "16px",
        }}
      >
        <div>
          <h3 style={{ fontSize: "20px", fontWeight: 800 }}>
            Gameplay Usage &amp; Engagement Telemetry
          </h3>
          <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>
            Gameplay events recorded by this server. Refreshes every 15
            seconds. Google Analytics configuration is not required.
          </p>
          <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>
            Interstitial impressions:{" "}
            {analyticsData?.summary?.totalAdImpressions ?? 0}. Play duration is
            recorded when a game is exited or the app is paused.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          {/* Date Range Selector */}
          <div
            style={{
              display: "flex",
              background: "rgba(0,0,0,0.4)",
              borderRadius: "10px",
              padding: "4px",
              border: "1px solid var(--border-subtle)",
            }}
          >
            {[
              { id: "today", label: "Today" },
              { id: "7d", label: "Last 7 Days" },
              { id: "30d", label: "Last 30 Days" },
              { id: "all", label: "All Time" },
            ].map((r) => {
              const isSelected = analyticsRange === r.id;
              return (
                <button
                  key={r.id}
                  onClick={() => {
                    const newRange = r.id as any;
                    setAnalyticsRange(newRange);
                    fetchAnalytics(newRange);
                  }}
                  style={{
                    padding: "6px 14px",
                    fontSize: "12px",
                    fontWeight: isSelected ? 700 : 500,
                    background: isSelected
                      ? "linear-gradient(135deg, #6366f1, #4f46e5)"
                      : "transparent",
                    color: isSelected ? "#fff" : "var(--text-muted)",
                    borderRadius: "8px",
                    border: "none",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  {r.label}
                </button>
              );
            })}
          </div>

          <button
            className="btn-secondary"
            onClick={() => fetchAnalytics(analyticsRange)}
            disabled={loadingAnalytics}
            title="Refresh Analytics"
          >
            <RefreshCw
              size={14}
              className={loadingAnalytics ? "animate-spin" : ""}
            />{" "}
            Refresh
          </button>
        </div>
      </div>

      {analyticsError && (
        <p role="alert">{analyticsError} Displayed values may be out of date.</p>
      )}

      {/* KPI Cards Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(6, 1fr)",
          gap: "16px",
        }}
      >
        <div className="glass-panel" style={{ padding: "20px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              color: "var(--text-muted)",
            }}
          >
            <span style={{ fontSize: "12px", fontWeight: 600 }}>
              TOTAL PLAYS
            </span>
            <Flame size={18} color="#6366f1" />
          </div>
          <div
            style={{
              fontSize: "28px",
              fontWeight: 800,
              margin: "10px 0 4px",
              color: "#fff",
            }}
          >
            {analyticsData?.summary?.totalPlays ?? 0}
          </div>
          <div style={{ fontSize: "11px", color: "#818cf8" }}>
            Game launches
          </div>
        </div>

        <div className="glass-panel" style={{ padding: "20px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              color: "var(--text-muted)",
            }}
          >
            <span style={{ fontSize: "12px", fontWeight: 600 }}>
              TOTAL PLAY TIME
            </span>
            <Clock size={18} color="#06b6d4" />
          </div>
          <div
            style={{
              fontSize: "28px",
              fontWeight: 800,
              margin: "10px 0 4px",
              color: "#06b6d4",
            }}
          >
            {formatDuration(analyticsData?.summary?.totalPlayTimeSeconds ?? 0)}
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-dim)" }}>
            Across all players
          </div>
        </div>

        <div className="glass-panel" style={{ padding: "20px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              color: "var(--text-muted)",
            }}
          >
            <span style={{ fontSize: "12px", fontWeight: 600 }}>
              AVG SESSION
            </span>
            <TrendingUp size={18} color="#10b981" />
          </div>
          <div
            style={{
              fontSize: "28px",
              fontWeight: 800,
              margin: "10px 0 4px",
              color: "#10b981",
            }}
          >
            {formatDuration(analyticsData?.summary?.avgSessionDuration ?? 0)}
          </div>
          <div style={{ fontSize: "11px", color: "#34d399" }}>
            Per play session
          </div>
        </div>

        <div className="glass-panel" style={{ padding: "20px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              color: "var(--text-muted)",
            }}
          >
            <span style={{ fontSize: "12px", fontWeight: 600 }}>
              ABANDONED (&lt;10S)
            </span>
            <AlertTriangle size={18} color="#f59e0b" />
          </div>
          <div
            style={{
              fontSize: "28px",
              fontWeight: 800,
              margin: "10px 0 4px",
              color: "#f59e0b",
            }}
          >
            {analyticsData?.summary?.abandonedSessions ?? 0}
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-dim)" }}>
            {analyticsData?.summary?.totalPlays > 0
              ? `${Math.round(((analyticsData?.summary?.abandonedSessions || 0) / analyticsData.summary.totalPlays) * 100)}% exit rate`
              : "0% exit rate"}
          </div>
        </div>

        <div className="glass-panel" style={{ padding: "20px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              color: "var(--text-muted)",
            }}
          >
            <span style={{ fontSize: "12px", fontWeight: 600 }}>
              COMPLETIONS
            </span>
            <CheckCircle2 size={18} color="#a855f7" />
          </div>
          <div
            style={{
              fontSize: "28px",
              fontWeight: 800,
              margin: "10px 0 4px",
              color: "#a855f7",
            }}
          >
            {analyticsData?.summary?.totalCompletions ?? 0}
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-dim)" }}>
            Levels cleared
          </div>
        </div>

        <div className="glass-panel" style={{ padding: "20px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              color: "var(--text-muted)",
            }}
          >
            <span style={{ fontSize: "12px", fontWeight: 600 }}>
              GAME OVERS
            </span>
            <RotateCcw size={18} color="#ef4444" />
          </div>
          <div
            style={{
              fontSize: "28px",
              fontWeight: 800,
              margin: "10px 0 4px",
              color: "#ef4444",
            }}
          >
            {analyticsData?.summary?.totalGameOvers ?? 0}
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-dim)" }}>
            Restarts triggered
          </div>
        </div>
      </div>

      {/* Rankings Grid: Most Played vs Highest Engagement */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "24px",
        }}
      >
        {/* Most Played Games Ranking */}
        <div className="glass-panel" style={{ padding: "24px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              marginBottom: "16px",
            }}
          >
            <Flame size={20} color="#f97316" />
            <h4 style={{ fontSize: "16px", fontWeight: 700 }}>
              Most Played Games
            </h4>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            {(!analyticsData?.summary?.mostPlayed ||
              analyticsData.summary.mostPlayed.length === 0) && (
              <div
                style={{
                  textAlign: "center",
                  padding: "32px",
                  color: "var(--text-muted)",
                  fontSize: "13px",
                }}
              >
                No gameplay events recorded in this date range yet.
              </div>
            )}
            {(analyticsData?.summary?.mostPlayed || [])
              .slice(0, 5)
              .map((stat: any, i: number) => {
                const matchingGame = games.find((g) => g.id === stat.gameId);
                const totalPlays = analyticsData?.summary?.totalPlays || 1;
                const pct = Math.round((stat.plays / totalPlays) * 100);
                return (
                  <div
                    key={stat.gameId}
                    style={{
                      padding: "12px 16px",
                      background: "rgba(0,0,0,0.25)",
                      borderRadius: "10px",
                      border: "1px solid var(--border-subtle)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "6px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                        }}
                      >
                        <span
                          style={{
                            fontWeight: 800,
                            fontSize: "14px",
                            color:
                              i === 0
                                ? "#fbbf24"
                                : i === 1
                                  ? "#94a3b8"
                                  : i === 2
                                    ? "#d97706"
                                    : "var(--text-muted)",
                            fontFamily: "var(--font-mono)",
                          }}
                        >
                          #{i + 1}
                        </span>
                        <span
                          style={{
                            fontWeight: 700,
                            fontSize: "14px",
                          }}
                        >
                          {matchingGame?.title || stat.gameId}
                        </span>
                      </div>
                      <span
                        style={{
                          fontWeight: 800,
                          color: "#818cf8",
                          fontFamily: "var(--font-mono)",
                          fontSize: "14px",
                        }}
                      >
                        {stat.plays} plays ({pct}%)
                      </span>
                    </div>
                    <div
                      style={{
                        width: "100%",
                        height: "6px",
                        background: "rgba(255,255,255,0.06)",
                        borderRadius: "3px",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${pct}%`,
                          height: "100%",
                          background:
                            "linear-gradient(90deg, #6366f1, #06b6d4)",
                          borderRadius: "3px",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Highest Engagement Games Ranking */}
        <div className="glass-panel" style={{ padding: "24px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              marginBottom: "16px",
            }}
          >
            <TrendingUp size={20} color="#10b981" />
            <h4 style={{ fontSize: "16px", fontWeight: 700 }}>
              Highest Engagement Games (Total Time)
            </h4>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            {(!analyticsData?.summary?.highestEngagement ||
              analyticsData.summary.highestEngagement.length === 0) && (
              <div
                style={{
                  textAlign: "center",
                  padding: "32px",
                  color: "var(--text-muted)",
                  fontSize: "13px",
                }}
              >
                No playtime recorded in this date range yet.
              </div>
            )}
            {(analyticsData?.summary?.highestEngagement || [])
              .slice(0, 5)
              .map((stat: any, i: number) => {
                const matchingGame = games.find((g) => g.id === stat.gameId);
                return (
                  <div
                    key={stat.gameId}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "14px 16px",
                      background: "rgba(0,0,0,0.25)",
                      borderRadius: "10px",
                      border: "1px solid var(--border-subtle)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 800,
                          fontSize: "14px",
                          color: i === 0 ? "#fbbf24" : "var(--text-muted)",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        #{i + 1}
                      </span>
                      <div>
                        <div
                          style={{
                            fontWeight: 700,
                            fontSize: "14px",
                          }}
                        >
                          {matchingGame?.title || stat.gameId}
                        </div>
                        <div
                          style={{
                            fontSize: "12px",
                            color: "var(--text-dim)",
                          }}
                        >
                          Avg session: {formatDuration(stat.avgSessionDuration)}
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div
                        style={{
                          fontWeight: 800,
                          color: "#10b981",
                          fontFamily: "var(--font-mono)",
                          fontSize: "14px",
                        }}
                      >
                        {formatDuration(stat.totalPlayTimeSeconds)}
                      </div>
                      <div
                        style={{
                          fontSize: "11px",
                          color: "var(--text-dim)",
                        }}
                      >
                        Total Play Time
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      {/* Complete Per-Game Performance Breakdown Table */}
      <div className="glass-panel" style={{ padding: "24px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "16px",
          }}
        >
          <h4 style={{ fontSize: "16px", fontWeight: 700 }}>
            Per-Game Engagement &amp; Usage Breakdown
          </h4>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            {games.length} Total Games
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
                fontSize: "12px",
              }}
            >
              <th style={{ padding: "10px 14px" }}>GAME</th>
              <th style={{ padding: "10px 14px" }}>TOTAL PLAYS</th>
              <th style={{ padding: "10px 14px" }}>TOTAL PLAY TIME</th>
              <th style={{ padding: "10px 14px" }}>AVG DURATION</th>
              <th style={{ padding: "10px 14px" }}>COMPLETIONS</th>
              <th style={{ padding: "10px 14px" }}>GAME OVERS</th>
              <th style={{ padding: "10px 14px" }}>ABANDONMENTS</th>
              <th style={{ padding: "10px 14px" }}>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {games.map((game) => {
              const stat = (analyticsData?.summary?.gameStats || []).find(
                (s: any) => s.gameId === game.id,
              ) || {
                plays: 0,
                totalPlayTimeSeconds: 0,
                avgSessionDuration: 0,
                completions: 0,
                gameOvers: 0,
                abandonments: 0,
              };
              return (
                <tr
                  key={game.id}
                  style={{
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                    fontSize: "13px",
                  }}
                >
                  <td style={{ padding: "12px 14px" }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                      }}
                    >
                      <div
                        style={{
                          width: "32px",
                          height: "40px",
                          borderRadius: "6px",
                          background: "#1e293b",
                          overflow: "hidden",
                        }}
                      >
                        <img
                          src={game.thumbnailUrl}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                          }}
                        />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700 }}>{game.title}</div>
                        <div
                          style={{
                            fontSize: "11px",
                            color: "var(--text-dim)",
                            fontFamily: "var(--font-mono)",
                          }}
                        >
                          {game.slug}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td
                    style={{
                      padding: "12px 14px",
                      fontFamily: "var(--font-mono)",
                      fontWeight: 700,
                      color: "#818cf8",
                    }}
                  >
                    {stat.plays}
                  </td>

                  <td
                    style={{
                      padding: "12px 14px",
                      fontFamily: "var(--font-mono)",
                      color: "#06b6d4",
                    }}
                  >
                    {formatDuration(stat.totalPlayTimeSeconds)}
                  </td>

                  <td
                    style={{
                      padding: "12px 14px",
                      fontFamily: "var(--font-mono)",
                      color: "#10b981",
                    }}
                  >
                    {formatDuration(stat.avgSessionDuration)}
                  </td>

                  <td
                    style={{
                      padding: "12px 14px",
                      fontFamily: "var(--font-mono)",
                      color: "#a855f7",
                    }}
                  >
                    {stat.completions}
                  </td>

                  <td
                    style={{
                      padding: "12px 14px",
                      fontFamily: "var(--font-mono)",
                      color: "#ef4444",
                    }}
                  >
                    {stat.gameOvers}
                  </td>

                  <td
                    style={{
                      padding: "12px 14px",
                      fontFamily: "var(--font-mono)",
                      color:
                        stat.abandonments > 0
                          ? "#f59e0b"
                          : "var(--text-muted)",
                    }}
                  >
                    {stat.abandonments}
                  </td>

                  <td style={{ padding: "12px 14px" }}>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button
                        className="btn-secondary"
                        style={{
                          padding: "4px 8px",
                          fontSize: "11px",
                          color:
                            game.ads?.enabled === false
                              ? "#f87171"
                              : "#a5b4fc",
                          background:
                            game.ads?.enabled === false
                              ? "rgba(239, 68, 68, 0.15)"
                              : undefined,
                          border:
                            game.ads?.enabled === false
                              ? "1px solid #ef4444"
                              : undefined,
                        }}
                        onClick={() => onOpenGameAdsEditor(game)}
                        title="Configure Ad Rules for this game"
                      >
                        📢{" "}
                        {game.ads?.enabled === false
                          ? "Ads OFF"
                          : game.ads?.useCustomInterval
                            ? `Ads (${game.ads.intervalMinutes}m)`
                            : "Ads"}
                      </button>
                      <button
                        className="btn-secondary"
                        style={{
                          padding: "4px 8px",
                          fontSize: "11px",
                        }}
                        onClick={() => onTestGame(game.slug)}
                        title="Test in Simulator"
                      >
                        <Smartphone size={12} /> Test
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* GA4 Diagnostic & Verification Section */}
      <div
        className="glass-panel"
        style={{
          padding: "24px",
          border: "1px solid rgba(99, 102, 241, 0.3)",
          background:
            "linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(6, 182, 212, 0.04))",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: "16px",
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginBottom: "4px",
              }}
            >
              <Zap size={18} color="#818cf8" />
              <h4 style={{ fontSize: "16px", fontWeight: 700 }}>
                Google Analytics 4 Pipeline Verification &amp; DebugView
              </h4>
            </div>
            <p
              style={{
                fontSize: "13px",
                color: "var(--text-muted)",
                maxWidth: "680px",
              }}
            >
              Verify that game events are received by the server, recorded in
              SQLite, and validated by the GA4 Measurement Protocol Debug
              endpoint.
            </p>

            <div
              style={{
                display: "flex",
                gap: "16px",
                marginTop: "12px",
                fontSize: "12px",
              }}
            >
              <div>
                <span style={{ color: "var(--text-muted)" }}>
                  Measurement ID:{" "}
                </span>
                <span
                  style={{
                    color: "var(--accent-cyan)",
                    fontFamily: "var(--font-mono)",
                    fontWeight: 700,
                  }}
                >
                  {analyticsData?.ga4?.measurementId ||
                    gaMeasurementId ||
                    "G-SWIPEPLAY1"}
                </span>
              </div>
              <div>
                <span style={{ color: "var(--text-muted)" }}>
                  Server API Secret:{" "}
                </span>
                <span
                  style={{
                    color: analyticsData?.ga4?.configured
                      ? "#34d399"
                      : "#f87171",
                    fontWeight: 700,
                  }}
                >
                  {analyticsData?.ga4?.configured
                    ? "✅ Active on Server (Protected in .env)"
                    : "⚠️ GA4_API_SECRET not set in server .env"}
                </span>
              </div>
            </div>
          </div>

          <button
            className="btn-primary"
            onClick={runGa4Test}
            disabled={testEventStatus.running}
            style={{ padding: "10px 18px", fontSize: "13px" }}
          >
            <Sparkles
              size={16}
              className={testEventStatus.running ? "animate-spin" : ""}
            />
            {testEventStatus.running
              ? "Forwarding to GA4..."
              : "Send Test Event to GA4 DebugView"}
          </button>
        </div>

        {testEventStatus.msg && (
          <div
            style={{
              marginTop: "16px",
              padding: "14px 18px",
              borderRadius: "10px",
              background: testEventStatus.error
                ? "rgba(239, 68, 68, 0.15)"
                : "rgba(52, 211, 153, 0.15)",
              border: `1px solid ${testEventStatus.error ? "#ef4444" : "#34d399"}`,
              color: testEventStatus.error ? "#f87171" : "#34d399",
              fontSize: "13px",
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: "4px" }}>
              {testEventStatus.msg}
            </div>
            {testEventStatus.details?.result?.body && (
              <div
                style={{
                  marginTop: "6px",
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                  color: "var(--text-muted)",
                }}
              >
                GA4 Debug Response:{" "}
                {JSON.stringify(testEventStatus.details.result.body)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
