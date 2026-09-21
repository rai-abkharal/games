import React from "react";
import { CheckCircle2 } from "lucide-react";

export interface ReportsTabProps {
  reports: any[];
}

export const ReportsTab: React.FC<ReportsTabProps> = ({ reports }) => {
  return (
    <div className="glass-panel" style={{ padding: "28px" }}>
      <h3
        style={{
          fontSize: "18px",
          fontWeight: 700,
          marginBottom: "8px",
        }}
      >
        User Game Moderation Reports
      </h3>
      <p
        style={{
          fontSize: "13px",
          color: "var(--text-muted)",
          marginBottom: "24px",
        }}
      >
        Review reports submitted by players during gameplay.
      </p>

      {reports.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "60px",
            color: "var(--text-dim)",
          }}
        >
          <CheckCircle2
            size={40}
            color="#34d399"
            style={{ margin: "0 auto 12px" }}
          />
          <p>All clean! Zero pending moderation reports.</p>
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          {reports.map((rep) => (
            <div
              key={rep.id}
              style={{
                padding: "16px 20px",
                background: "rgba(0,0,0,0.3)",
                borderRadius: "12px",
                border: "1px solid var(--border-subtle)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
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
                  <span style={{ fontWeight: 700, fontSize: "15px" }}>
                    {rep.game?.title || rep.gameId}
                  </span>
                  <span className="badge badge-archived">{rep.reason}</span>
                </div>
                <p
                  style={{
                    fontSize: "13px",
                    color: "var(--text-muted)",
                  }}
                >
                  {rep.note || "No user note provided."}
                </p>
              </div>
              <button
                className="btn-secondary"
                style={{ fontSize: "12px" }}
              >
                Dismiss
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
