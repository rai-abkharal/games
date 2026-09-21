import React from "react";
import {
  RefreshCw,
  RotateCcw,
  Activity,
  Pause,
  Play,
  Volume2,
  VolumeX,
  Lightbulb,
} from "lucide-react";
import { GameItem, BridgeLogItem } from "../../types/admin";

export interface SimulatorTabProps {
  games: GameItem[];
  simGame: string;
  setSimGame: (slug: string) => void;
  simRefreshKey: number;
  setSimRefreshKey: (key: number) => void;
  simScore: number;
  setSimScore: (score: number) => void;
  simLevel: number;
  setSimLevel: (level: number) => void;
  simIsMuted: boolean;
  setSimIsMuted: React.Dispatch<React.SetStateAction<boolean>>;
  bridgeLogs: BridgeLogItem[];
  setBridgeLogs: React.Dispatch<React.SetStateAction<BridgeLogItem[]>>;
  sendSimulatorEvent: (type: string, payload?: any) => void;
  simIframeRef: React.RefObject<HTMLIFrameElement | null>;
  previewOrigin: string;
}

export const SimulatorTab: React.FC<SimulatorTabProps> = ({
  games,
  simGame,
  setSimGame,
  simRefreshKey,
  setSimRefreshKey,
  simScore,
  setSimScore,
  simLevel,
  setSimLevel,
  simIsMuted,
  setSimIsMuted,
  bridgeLogs,
  setBridgeLogs,
  sendSimulatorEvent,
  simIframeRef,
  previewOrigin,
}) => {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "420px 1fr",
        gap: "32px",
        alignItems: "flex-start",
      }}
    >
      {/* Phone Frame */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "16px",
        }}
      >
        <div style={{ width: "100%", display: "flex", gap: "12px" }}>
          <select
            value={simGame}
            onChange={(e) => {
              setSimGame(e.target.value);
              setSimScore(0);
              setSimLevel(1);
              setSimRefreshKey(Date.now());
            }}
            style={{
              flex: 1,
              padding: "10px 14px",
              background: "rgba(0,0,0,0.4)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "10px",
              color: "#fff",
              fontSize: "14px",
              fontWeight: 600,
            }}
          >
            {games.map((g) => (
              <option key={g.slug} value={g.slug}>
                {g.title} ({g.slug})
              </option>
            ))}
          </select>

          <button
            className="btn-secondary"
            style={{
              padding: "10px 14px",
              borderRadius: "10px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
            onClick={() => setSimRefreshKey(Date.now())}
            title="Force reload game canvas without cache"
          >
            <RefreshCw size={14} /> Reload
          </button>

          <button
            className="btn-secondary"
            style={{
              padding: "10px 14px",
              borderRadius: "10px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              color: "#fca5a5",
              background: "rgba(239, 68, 68, 0.15)",
              borderColor: "rgba(239, 68, 68, 0.4)",
              fontWeight: 700,
            }}
            onClick={() => sendSimulatorEvent("RESET_PROGRESS")}
            title="Reset game progress from Level 1 / 0 Score"
          >
            <RotateCcw size={14} color="#f87171" /> RESET (Level 1)
          </button>
        </div>

        {/* Device Bezel */}
        <div className="device-frame">
          <div className="device-notch" />
          <iframe
            ref={simIframeRef}
            key={`${simGame}-${simRefreshKey}`}
            src={`${previewOrigin}/games/${simGame}/${games.find((g) => g.slug === simGame || g.id === simGame)?.versions[0]?.version || "1.1.0"}/index.html?t=${simRefreshKey}`}
            className="device-screen"
            title="Game Preview"
            sandbox="allow-scripts allow-same-origin"
            referrerPolicy="no-referrer"
          />
        </div>
      </div>

      {/* Bridge Inspector Panel */}
      <div
        className="glass-panel"
        style={{
          padding: "24px",
          display: "flex",
          flexDirection: "column",
          height: "760px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "16px",
          }}
        >
          <h3
            style={{
              fontSize: "18px",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <Activity size={18} color="#818cf8" /> Live Bridge Protocol Stream
          </h3>
          <div style={{ display: "flex", gap: "8px" }}>
            <span
              style={{
                fontSize: "13px",
                color: "var(--accent-cyan)",
                fontWeight: 700,
              }}
            >
              Score: {simScore}
            </span>
            <span
              style={{
                fontSize: "13px",
                color: "#fbbf24",
                fontWeight: 700,
              }}
            >
              Level: {simLevel}
            </span>
          </div>
        </div>

        {/* Host Action Controls */}
        <div
          style={{
            display: "flex",
            gap: "8px",
            flexWrap: "wrap",
            paddingBottom: "16px",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <button
            className="btn-secondary"
            style={{
              padding: "8px 14px",
              fontSize: "12px",
              background: "rgba(239, 68, 68, 0.2)",
              borderColor: "rgba(239, 68, 68, 0.5)",
              color: "#fca5a5",
              fontWeight: 700,
            }}
            onClick={() => sendSimulatorEvent("RESET_PROGRESS")}
            title="Wipe all localStorage/cache progress and start from Level 1 / 0 Score"
          >
            <RotateCcw size={13} color="#f87171" /> RESET (Level 1 &amp;
            Storage)
          </button>
          <button
            className="btn-secondary"
            style={{ padding: "8px 12px", fontSize: "12px" }}
            onClick={() => sendSimulatorEvent("PAUSE_GAME")}
            title="Pause Game loop & blur focus"
          >
            <Pause size={13} /> PAUSE_GAME
          </button>
          <button
            className="btn-secondary"
            style={{ padding: "8px 12px", fontSize: "12px" }}
            onClick={() => sendSimulatorEvent("RESUME_GAME")}
            title="Resume Game loop & audio"
          >
            <Play size={13} /> RESUME_GAME
          </button>
          <button
            className="btn-secondary"
            style={{ padding: "8px 12px", fontSize: "12px" }}
            onClick={() => {
              const nextMute = !simIsMuted;
              setSimIsMuted(nextMute);
              sendSimulatorEvent(nextMute ? "MUTE_AUDIO" : "UNMUTE_AUDIO");
            }}
            title="Toggle Sound / Audio Context Mute"
          >
            {simIsMuted ? <Volume2 size={13} /> : <VolumeX size={13} />}{" "}
            {simIsMuted ? "UNMUTE_AUDIO" : "MUTE_AUDIO"}
          </button>
          <button
            className="btn-secondary"
            style={{
              padding: "8px 12px",
              fontSize: "12px",
              borderColor: "rgba(234, 179, 8, 0.4)",
              color: "#fef08a",
            }}
            onClick={() => sendSimulatorEvent("TRIGGER_HINT")}
            title="Simulate rewarded ad hint grant"
          >
            <Lightbulb size={13} color="#facc15" /> TRIGGER_HINT
          </button>
          <button
            className="btn-secondary"
            style={{ padding: "8px 12px", fontSize: "12px" }}
            onClick={() => setBridgeLogs([])}
            title="Clear stream history"
          >
            Clear Log
          </button>
        </div>

        {/* Live Event Log Stream */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            marginTop: "16px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          {bridgeLogs.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                color: "var(--text-dim)",
                padding: "40px",
              }}
            >
              Interact with the device simulator to inspect live JSON message
              envelopes.
            </div>
          ) : (
            bridgeLogs.map((log) => (
              <div
                key={log.id}
                style={{
                  padding: "10px 14px",
                  borderRadius: "8px",
                  background:
                    log.direction === "in"
                      ? "rgba(6, 182, 212, 0.06)"
                      : "rgba(99, 102, 241, 0.06)",
                  borderLeft:
                    log.direction === "in"
                      ? "3px solid #06b6d4"
                      : "3px solid #818cf8",
                  fontSize: "12px",
                  fontFamily: "var(--font-mono)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "4px",
                  }}
                >
                  <span
                    style={{
                      fontWeight: 700,
                      color:
                        log.direction === "in" ? "#06b6d4" : "#818cf8",
                    }}
                  >
                    {log.direction === "in"
                      ? "◀ GAME ➔ APP"
                      : "▶ APP ➔ GAME"}
                    : {log.type}
                  </span>
                  <span style={{ color: "var(--text-dim)" }}>{log.ts}</span>
                </div>
                <div
                  style={{
                    color: "var(--text-muted)",
                    overflowX: "auto",
                  }}
                >
                  {JSON.stringify(log.payload)}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
