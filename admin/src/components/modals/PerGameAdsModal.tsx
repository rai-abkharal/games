import React, { useState, useEffect } from "react";
import type { GameItem } from "../../types/admin";

interface PerGameAdsModalProps {
  game: GameItem | null;
  defaultIntervalMinutes: number;
  onClose: () => void;
  onSave: (
    gameId: string,
    ads: {
      enabled: boolean;
      useCustomInterval: boolean;
      intervalMinutes: number;
    },
  ) => Promise<void>;
}

export const PerGameAdsModal: React.FC<PerGameAdsModalProps> = ({
  game,
  defaultIntervalMinutes,
  onClose,
  onSave,
}) => {
  if (!game) return null;

  const [form, setForm] = useState({
    enabled: game.ads?.enabled ?? true,
    useCustomInterval: game.ads?.useCustomInterval ?? false,
    intervalMinutes: game.ads?.intervalMinutes || 5,
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setForm({
      enabled: game.ads?.enabled ?? true,
      useCustomInterval: game.ads?.useCustomInterval ?? false,
      intervalMinutes: game.ads?.intervalMinutes || 5,
    });
  }, [game]);

  const handleSave = async () => {
    try {
      setSaving(true);
      await onSave(game.id, form);
      setMsg("✅ Game ad settings saved successfully!");
      setTimeout(() => {
        setMsg(null);
        onClose();
      }, 1200);
    } catch (err: any) {
      setMsg(`❌ Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "20px",
      }}
    >
      <div
        className="glass-panel"
        style={{
          maxWidth: "500px",
          width: "100%",
          padding: "28px",
          borderRadius: "16px",
          border: "1px solid rgba(255, 255, 255, 0.15)",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "20px",
          }}
        >
          <div>
            <h3 style={{ fontSize: "18px", fontWeight: 800 }}>
              Per-Game Ad Settings
            </h3>
            <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>
              Configure ads for <strong>{game.title}</strong>
            </p>
          </div>
          <button
            className="btn-secondary"
            style={{ padding: "6px 10px", fontSize: "13px" }}
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {msg && (
          <div
            style={{
              padding: "12px",
              borderRadius: "8px",
              marginBottom: "18px",
              fontSize: "13px",
              fontWeight: 600,
              background: msg.includes("✅")
                ? "rgba(52, 211, 153, 0.15)"
                : "rgba(239, 68, 68, 0.15)",
              border: `1px solid ${msg.includes("✅") ? "#34d399" : "#ef4444"}`,
              color: msg.includes("✅") ? "#34d399" : "#f87171",
            }}
          >
            {msg}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          {/* Toggle Ads Enabled */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "14px",
              background: "rgba(0,0,0,0.3)",
              borderRadius: "10px",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div>
              <div style={{ fontSize: "14px", fontWeight: 700 }}>
                Allow Ads for This Game
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                If disabled, no ads will trigger while this game is active.
              </div>
            </div>
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
              style={{
                width: "20px",
                height: "20px",
                accentColor: "#6366f1",
                cursor: "pointer",
              }}
            />
          </div>

          {form.enabled && (
            <>
              {/* Custom Interval Toggle */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "14px",
                  background: "rgba(0,0,0,0.3)",
                  borderRadius: "10px",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <div>
                  <div style={{ fontSize: "14px", fontWeight: 700 }}>
                    Custom Ad Frequency
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                    Override default interval (~{defaultIntervalMinutes ?? 5}{" "}
                    min).
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={form.useCustomInterval}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      useCustomInterval: e.target.checked,
                    })
                  }
                  style={{
                    width: "20px",
                    height: "20px",
                    accentColor: "#a855f7",
                    cursor: "pointer",
                  }}
                />
              </div>

              {/* Custom Interval Slider */}
              {form.useCustomInterval && (
                <div
                  style={{
                    padding: "14px",
                    background: "rgba(0,0,0,0.3)",
                    borderRadius: "10px",
                    border: "1px solid rgba(168, 85, 247, 0.4)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: "8px",
                    }}
                  >
                    <span style={{ fontSize: "13px", fontWeight: 700 }}>
                      Interval Duration
                    </span>
                    <span
                      style={{
                        fontSize: "13px",
                        color: "#c084fc",
                        fontWeight: 800,
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      Every {form.intervalMinutes} Minutes
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="15"
                    value={form.intervalMinutes}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        intervalMinutes: parseInt(e.target.value) || 5,
                      })
                    }
                    style={{ width: "100%", accentColor: "#c084fc" }}
                  />
                </div>
              )}
            </>
          )}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "10px",
            marginTop: "24px",
          }}
        >
          <button
            className="btn-secondary"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save Ad Settings"}
          </button>
        </div>
      </div>
    </div>
  );
};
