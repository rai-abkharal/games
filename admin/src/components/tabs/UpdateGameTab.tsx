import React from "react";
import {
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { GameItem, ValidationReport, API_BASE } from "../../types/admin";

export interface UpdateGameTabProps {
  games: GameItem[];
  updateGameTarget: GameItem | null;
  setUpdateGameTarget: (game: GameItem | null) => void;
  selectedGame: GameItem | null;
  setSelectedGame: (game: GameItem | null) => void;
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  uploading: boolean;
  uploadSuccess: string | null;
  validationReport: ValidationReport | null;
}

export const UpdateGameTab: React.FC<UpdateGameTabProps> = ({
  games,
  updateGameTarget,
  setUpdateGameTarget,
  selectedGame,
  setSelectedGame,
  handleFileUpload,
  uploading,
  uploadSuccess,
  validationReport,
}) => {
  const currentTarget = updateGameTarget || selectedGame;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "24px",
      }}
    >
      <div className="glass-panel" style={{ padding: "28px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            marginBottom: "8px",
          }}
        >
          <div
            style={{
              padding: "8px",
              background: "rgba(245, 158, 11, 0.2)",
              borderRadius: "8px",
            }}
          >
            <RefreshCw size={20} color="#f59e0b" />
          </div>
          <h3 style={{ fontSize: "18px", fontWeight: 700 }}>
            Update Existing Game Code
          </h3>
        </div>
        <p
          style={{
            fontSize: "13px",
            color: "var(--text-muted)",
            marginBottom: "20px",
          }}
        >
          Replace game code or release a new version for an existing game
          without deleting its stats, ratings, or ID.
        </p>

        {/* Game Selector Dropdown */}
        <div style={{ marginBottom: "20px" }}>
          <label
            style={{
              fontSize: "13px",
              fontWeight: 700,
              display: "block",
              marginBottom: "8px",
              color: "#e2e8f0",
            }}
          >
            Select Game to Update:
          </label>
          <select
            value={currentTarget?.id || ""}
            onChange={(e) => {
              const found = games.find((g) => g.id === e.target.value);
              setUpdateGameTarget(found || null);
              setSelectedGame(found || null);
            }}
            style={{
              width: "100%",
              padding: "12px 16px",
              background: "rgba(0,0,0,0.5)",
              border: "1px solid var(--border-active)",
              borderRadius: "10px",
              color: "#fff",
              fontSize: "14px",
              fontWeight: 600,
            }}
          >
            <option value="">
              -- Choose a Game from Catalog ({games.length} available) --
            </option>
            {games.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title} ({g.slug}) — v{g.versions[0]?.version || "1.0.0"}
              </option>
            ))}
          </select>
        </div>

        {/* Target Game Summary Card */}
        {currentTarget && (
          <div
            style={{
              padding: "16px",
              background: "rgba(99, 102, 241, 0.08)",
              border: "1px solid rgba(99, 102, 241, 0.3)",
              borderRadius: "12px",
              marginBottom: "20px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
              }}
            >
              <div
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "10px",
                  background: "#1e293b",
                  overflow: "hidden",
                }}
              >
                <img
                  src={
                    currentTarget.thumbnailUrl.startsWith("http")
                      ? currentTarget.thumbnailUrl
                      : `${API_BASE}${currentTarget.thumbnailUrl}`
                  }
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: "15px" }}>
                  {currentTarget.title}
                </div>
                <div
                  style={{
                    fontSize: "12px",
                    color: "var(--text-muted)",
                    marginTop: "2px",
                  }}
                >
                  ID:{" "}
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      color: "#818cf8",
                    }}
                  >
                    {currentTarget.id}
                  </span>{" "}
                  • Current:{" "}
                  <span style={{ color: "#34d399", fontWeight: 700 }}>
                    v{currentTarget.versions[0]?.version || "1.0.0"}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: "11px",
                    color: "var(--text-dim)",
                    marginTop: "3px",
                  }}
                >
                  Last Updated:{" "}
                  {currentTarget.updatedAt
                    ? new Date(currentTarget.updatedAt).toLocaleString()
                    : "Pre-installed"}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Update Dropzone */}
        <div
          style={{
            border: "2px dashed #f59e0b",
            borderRadius: "16px",
            padding: "36px 20px",
            textAlign: "center",
            background: "rgba(245, 158, 11, 0.03)",
            cursor: currentTarget ? "pointer" : "not-allowed",
            opacity: currentTarget ? 1 : 0.6,
            position: "relative",
          }}
        >
          <input
            type="file"
            accept=".zip"
            disabled={!currentTarget}
            onChange={handleFileUpload}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              opacity: 0,
              cursor: currentTarget ? "pointer" : "not-allowed",
            }}
          />
          <RefreshCw
            size={40}
            color="#f59e0b"
            style={{ marginBottom: "12px" }}
          />
          <div style={{ fontWeight: 700, fontSize: "15px" }}>
            {currentTarget
              ? `Upload New ZIP for "${currentTarget.title}"`
              : "Please select a game first above"}
          </div>
          <div
            style={{
              fontSize: "12px",
              color: "var(--text-dim)",
              marginTop: "6px",
            }}
          >
            Replaces game assets &amp; code live on the server
          </div>
        </div>

        {uploadSuccess && (
          <div
            style={{
              marginTop: "16px",
              padding: "14px 18px",
              background: uploadSuccess.startsWith("✨")
                ? "rgba(16, 185, 129, 0.15)"
                : "rgba(239, 68, 68, 0.15)",
              border: `1px solid ${uploadSuccess.startsWith("✨") ? "#10b981" : "#ef4444"}`,
              borderRadius: "10px",
              color: uploadSuccess.startsWith("✨") ? "#34d399" : "#f87171",
              fontSize: "13px",
              display: "flex",
              flexDirection: "column",
              gap: "4px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontWeight: 700,
              }}
            >
              {uploadSuccess.startsWith("✨") ? (
                <CheckCircle2 size={18} />
              ) : (
                <XCircle size={18} />
              )}
              {uploadSuccess}
            </div>
          </div>
        )}
      </div>

      {/* 7-Point Automatic Validation Report */}
      <div className="glass-panel" style={{ padding: "28px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "16px",
          }}
        >
          <h3 style={{ fontSize: "18px", fontWeight: 700 }}>
            Update Verification Report
          </h3>
          {validationReport && (
            <span
              className={`badge ${validationReport.allPassed ? "badge-published" : "badge-archived"}`}
            >
              {validationReport.allPassed ? "UPDATE READY" : "CHECK FAILED"}
            </span>
          )}
        </div>

        {uploading ? (
          <div
            style={{
              textAlign: "center",
              padding: "60px 20px",
              color: "var(--text-muted)",
            }}
          >
            <RefreshCw
              size={40}
              style={{
                margin: "0 auto 12px",
                color: "#f59e0b",
                animation: "spin 1s linear infinite",
              }}
            />
            <div
              style={{
                fontWeight: 600,
                color: "#fff",
                fontSize: "15px",
              }}
            >
              Auditing Update Package...
            </div>
            <div
              style={{
                fontSize: "12px",
                color: "var(--text-dim)",
                marginTop: "4px",
              }}
            >
              Running automatic package validation audit
            </div>
          </div>
        ) : validationReport ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            <div
              style={{
                fontSize: "13px",
                color: "var(--text-muted)",
                marginBottom: "4px",
              }}
            >
              Updated Target:{" "}
              <strong style={{ color: "#fff" }}>
                {validationReport.slug} (v{validationReport.version})
              </strong>
            </div>

            {!validationReport.allPassed && (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: "8px",
                  background: "rgba(239, 68, 68, 0.15)",
                  border: "1px solid #ef4444",
                  color: "#f87171",
                  fontSize: "13px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "4px",
                }}
              >
                <AlertTriangle
                  size={16}
                  color="#ef4444"
                  style={{ flexShrink: 0 }}
                />
                <span>
                  Update verification failed. See checklist below for details.
                </span>
              </div>
            )}

            {validationReport.checks.map((check, idx) => (
              <div
                key={idx}
                style={{
                  padding: "12px 16px",
                  borderRadius: "10px",
                  background: check.passed
                    ? "rgba(0,0,0,0.25)"
                    : "rgba(239, 68, 68, 0.1)",
                  border: `1px solid ${check.passed ? "var(--border-subtle)" : "rgba(239, 68, 68, 0.35)"}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    minWidth: "180px",
                    flexShrink: 0,
                  }}
                >
                  {check.passed ? (
                    <CheckCircle2
                      size={18}
                      color="#34d399"
                      style={{ flexShrink: 0 }}
                    />
                  ) : (
                    <XCircle
                      size={18}
                      color="#ef4444"
                      style={{ flexShrink: 0 }}
                    />
                  )}
                  <span
                    style={{
                      fontSize: "14px",
                      fontWeight: 600,
                      color: check.passed ? "inherit" : "#fca5a5",
                    }}
                  >
                    {check.rule}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: "12px",
                    color: check.passed ? "var(--text-muted)" : "#f87171",
                    fontFamily: "var(--font-mono)",
                    textAlign: "right",
                    wordBreak: "break-word",
                  }}
                >
                  {check.message}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div
            style={{
              textAlign: "center",
              padding: "60px 20px",
              color: "var(--text-dim)",
            }}
          >
            <RefreshCw
              size={40}
              style={{ margin: "0 auto 12px", opacity: 0.4 }}
            />
            <p>
              Select a game and drop a new build to inspect the update validation
              checklist.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
