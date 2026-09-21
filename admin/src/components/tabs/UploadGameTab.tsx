import React from "react";
import {
  UploadCloud,
  CheckCircle2,
  XCircle,
  RefreshCw,
  AlertTriangle,
  ShieldCheck,
} from "lucide-react";
import { ValidationReport, GameItem } from "../../types/admin";

export interface UploadGameTabProps {
  setSelectedGame: (game: GameItem | null) => void;
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  uploading: boolean;
  uploadSuccess: string | null;
  validationReport: ValidationReport | null;
}

export const UploadGameTab: React.FC<UploadGameTabProps> = ({
  setSelectedGame,
  handleFileUpload,
  uploading,
  uploadSuccess,
  validationReport,
}) => {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "24px",
      }}
    >
      {/* Upload Box */}
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
              background: "rgba(99, 102, 241, 0.2)",
              borderRadius: "8px",
            }}
          >
            <UploadCloud size={20} color="#818cf8" />
          </div>
          <h3 style={{ fontSize: "18px", fontWeight: 700 }}>
            Upload New Game Package
          </h3>
        </div>
        <p
          style={{
            fontSize: "13px",
            color: "var(--text-muted)",
            marginBottom: "20px",
          }}
        >
          Upload a .ZIP game package. Validated packages appear in Staged uploads
          for preview and authorized publication.
        </p>

        <div
          style={{
            border: "2px dashed var(--border-active)",
            borderRadius: "16px",
            padding: "44px 20px",
            textAlign: "center",
            background: "rgba(99, 102, 241, 0.03)",
            cursor: "pointer",
            position: "relative",
          }}
        >
          <input
            type="file"
            accept=".zip"
            onChange={(e) => {
              setSelectedGame(null);
              handleFileUpload(e);
            }}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              opacity: 0,
              cursor: "pointer",
            }}
          />
          <UploadCloud
            size={44}
            color="#818cf8"
            style={{ marginBottom: "12px" }}
          />
          <div style={{ fontWeight: 700, fontSize: "16px" }}>
            {uploading
              ? "Processing & Validating Build..."
              : "Drag and Drop New Game .ZIP Package Here"}
          </div>
          <div
            style={{
              fontSize: "12px",
              color: "var(--text-dim)",
              marginTop: "6px",
            }}
          >
            HTML5 / Canvas2D / Phaser bundle (.ZIP)
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
            {!uploadSuccess.startsWith("✨") && (
              <span
                style={{
                  fontSize: "12px",
                  color: "var(--text-muted)",
                  marginLeft: "26px",
                }}
              >
                👉 Please check the 7-Point Verification Checklist on the right
                to see which rule failed and fix your ZIP file.
              </span>
            )}
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
            7-Point Verification Report
          </h3>
          {validationReport && (
            <span
              className={`badge ${validationReport.allPassed ? "badge-published" : "badge-archived"}`}
            >
              {validationReport.allPassed ? "ALL CHECKS PASSED" : "CHECK FAILED"}
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
                color: "#818cf8",
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
              Auditing Game Package...
            </div>
            <div
              style={{
                fontSize: "12px",
                color: "var(--text-dim)",
                marginTop: "4px",
              }}
            >
              Running automatic 7-point validation audit
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
              Target:{" "}
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
                  Upload verification failed. See checklist below for details.
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
            <ShieldCheck
              size={40}
              style={{ margin: "0 auto 12px", opacity: 0.4 }}
            />
            <p>
              Upload a game package to run the automatic 7-point validation
              audit.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
