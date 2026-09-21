import React from "react";
import { GameItem, TouchZone } from "../../types/admin";

export interface GesturesTabProps {
  games: GameItem[];
  editingTouchGame: GameItem | null;
  openTouchEditor: (game: GameItem) => void;
  previewOrigin: string;
  touchZonesList: TouchZone[];
  setTouchZonesList: React.Dispatch<React.SetStateAction<TouchZone[]>>;
  touchSaveMsg: string | null;
  savingTouch: boolean;
  saveTouchZones: () => void;
}

export const GesturesTab: React.FC<GesturesTabProps> = ({
  games,
  editingTouchGame,
  openTouchEditor,
  previewOrigin,
  touchZonesList,
  setTouchZonesList,
  touchSaveMsg,
  savingTouch,
  saveTouchZones,
}) => {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "400px 1fr",
        gap: "32px",
        alignItems: "flex-start",
      }}
    >
      {/* Left Column: Phone Frame with Superimposed Touch Bounding Box */}
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
            value={editingTouchGame?.id || games[0]?.id || ""}
            onChange={(e) => {
              const found = games.find((g) => g.id === e.target.value);
              if (found) openTouchEditor(found);
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
              <option key={g.id} value={g.id}>
                {g.title} ({g.slug})
              </option>
            ))}
          </select>
        </div>

        <div className="device-frame" style={{ position: "relative" }}>
          <div className="device-notch" />
          <iframe
            key={editingTouchGame?.slug || "preview"}
            src={`${previewOrigin}/games/${editingTouchGame?.slug || games[0]?.slug || "tap-cannon"}/${editingTouchGame?.versions[0]?.version || "1.1.0"}/index.html`}
            className="device-screen"
            title="Touch Preview"
            sandbox="allow-scripts allow-same-origin"
            referrerPolicy="no-referrer"
          />

          {/* Visual Translucent Bounding Box Overlays */}
          {touchZonesList.map((zone, idx) => (
            <div
              key={idx}
              style={{
                position: "absolute",
                left: `${zone.x * 100}%`,
                top: `${zone.y * 100}%`,
                width: `${zone.width * 100}%`,
                height: `${zone.height * 100}%`,
                background: "rgba(239, 68, 68, 0.35)",
                border: "2px solid #ef4444",
                boxShadow: "0 0 15px rgba(239, 68, 68, 0.6)",
                borderRadius: "8px",
                pointerEvents: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 30,
              }}
            >
              <span
                style={{
                  background: "#ef4444",
                  color: "#fff",
                  fontSize: "10px",
                  fontWeight: 800,
                  padding: "2px 6px",
                  borderRadius: "4px",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                🚫 {zone.name} (LOCKED)
              </span>
            </div>
          ))}

          {touchZonesList.length === 0 && (
            <div
              style={{
                position: "absolute",
                top: "12px",
                right: "12px",
                background: "rgba(16, 185, 129, 0.9)",
                color: "#fff",
                fontSize: "11px",
                fontWeight: 700,
                padding: "4px 8px",
                borderRadius: "6px",
                zIndex: 30,
              }}
            >
              🟢 100% FREE SWIPE
            </div>
          )}
        </div>
      </div>

      {/* Right Column: Configuration & Presets */}
      <div
        className="glass-panel"
        style={{
          padding: "28px",
          display: "flex",
          flexDirection: "column",
          gap: "20px",
        }}
      >
        <div>
          <h3 style={{ fontSize: "20px", fontWeight: 800 }}>
            Configure Blocked Touch Portion:{" "}
            <span style={{ color: "#818cf8" }}>
              {editingTouchGame?.title || "Game"}
            </span>
          </h3>
          <p
            style={{
              fontSize: "13px",
              color: "var(--text-muted)",
              marginTop: "4px",
            }}
          >
            Select which exact portion of the game screen blocks ViewPager2 from
            scrolling. Outside this box, the user can swipe to the next game
            freely!
          </p>
        </div>

        {touchSaveMsg && (
          <div
            style={{
              padding: "12px 16px",
              borderRadius: "8px",
              background:
                touchSaveMsg.startsWith("✨") || touchSaveMsg.startsWith("✅")
                  ? "rgba(16, 185, 129, 0.2)"
                  : "rgba(239, 68, 68, 0.2)",
              border: "1px solid currentColor",
              color:
                touchSaveMsg.startsWith("✨") || touchSaveMsg.startsWith("✅")
                  ? "#34d399"
                  : "#f87171",
              fontSize: "13px",
              fontWeight: 600,
            }}
          >
            {touchSaveMsg}
          </div>
        )}

        {/* Fast Presets */}
        <div>
          <label
            style={{
              fontSize: "13px",
              fontWeight: 700,
              display: "block",
              marginBottom: "8px",
            }}
          >
            Quick Preset Configurations:
          </label>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: "10px",
            }}
          >
            <button
              className="btn-secondary"
              style={{
                justifyContent: "flex-start",
                padding: "10px 14px",
              }}
              onClick={() => setTouchZonesList([])}
            >
              🚫 <strong>None (100% Free Scroll)</strong>
            </button>
            <button
              className="btn-secondary"
              style={{
                justifyContent: "flex-start",
                padding: "10px 14px",
              }}
              onClick={() =>
                setTouchZonesList([
                  {
                    name: "Virtual Joystick",
                    x: 0.0,
                    y: 0.5,
                    width: 0.55,
                    height: 0.5,
                  },
                  {
                    name: "Buttons",
                    x: 0.65,
                    y: 0.55,
                    width: 0.35,
                    height: 0.45,
                  },
                ])
              }
            >
              🕹️ <strong>Bottom Left Joystick</strong>
            </button>
            <button
              className="btn-secondary"
              style={{
                justifyContent: "flex-start",
                padding: "10px 14px",
              }}
              onClick={() =>
                setTouchZonesList([
                  {
                    name: "4x4 Grid Board",
                    x: 0.08,
                    y: 0.2,
                    width: 0.84,
                    height: 0.54,
                  },
                ])
              }
            >
              ⚪ <strong>Center 4x4 Grid</strong>
            </button>
            <button
              className="btn-secondary"
              style={{
                justifyContent: "flex-start",
                padding: "10px 14px",
              }}
              onClick={() =>
                setTouchZonesList([
                  {
                    name: "Bow Aim Pull",
                    x: 0.0,
                    y: 0.4,
                    width: 0.45,
                    height: 0.4,
                  },
                ])
              }
            >
              🏹 <strong>Bow Pull Area</strong>
            </button>
            <button
              className="btn-secondary"
              style={{
                justifyContent: "flex-start",
                padding: "10px 14px",
              }}
              onClick={() =>
                setTouchZonesList([
                  {
                    name: "Blade Slicing Arena",
                    x: 0.0,
                    y: 0.15,
                    width: 1.0,
                    height: 0.75,
                  },
                ])
              }
            >
              ⚔️ <strong>Blade Slicing Arena</strong>
            </button>
            <button
              className="btn-secondary"
              style={{
                justifyContent: "flex-start",
                padding: "10px 14px",
              }}
              onClick={() =>
                setTouchZonesList([
                  {
                    name: "Basket Slider",
                    x: 0.0,
                    y: 0.65,
                    width: 1.0,
                    height: 0.35,
                  },
                ])
              }
            >
              🍎 <strong>Bottom Basket Area</strong>
            </button>
          </div>
        </div>

        {/* Active Zones Editor */}
        <div
          style={{
            borderTop: "1px solid var(--border-subtle)",
            paddingTop: "16px",
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
            <label style={{ fontSize: "14px", fontWeight: 700 }}>
              Custom Bounding Box Controls ({touchZonesList.length}):
            </label>
            <button
              className="btn-secondary"
              style={{ fontSize: "12px", padding: "6px 12px" }}
              onClick={() =>
                setTouchZonesList([
                  ...touchZonesList,
                  {
                    name: `Zone ${touchZonesList.length + 1}`,
                    x: 0.1,
                    y: 0.3,
                    width: 0.8,
                    height: 0.4,
                  },
                ])
              }
            >
              + Add Box
            </button>
          </div>

          {touchZonesList.map((zone, idx) => (
            <div
              key={idx}
              style={{
                padding: "16px",
                background: "rgba(0,0,0,0.3)",
                borderRadius: "10px",
                marginBottom: "12px",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "10px",
                }}
              >
                <input
                  type="text"
                  value={zone.name}
                  onChange={(e) => {
                    const updated = [...touchZonesList];
                    updated[idx].name = e.target.value;
                    setTouchZonesList(updated);
                  }}
                  style={{
                    background: "rgba(0,0,0,0.5)",
                    border: "1px solid var(--border-subtle)",
                    color: "#fff",
                    padding: "4px 8px",
                    borderRadius: "6px",
                    fontWeight: 700,
                  }}
                />
                <button
                  className="btn-danger"
                  style={{ fontSize: "11px", padding: "4px 8px" }}
                  onClick={() =>
                    setTouchZonesList(touchZonesList.filter((_, i) => i !== idx))
                  }
                >
                  Remove
                </button>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, 1fr)",
                  gap: "12px",
                  fontSize: "12px",
                }}
              >
                <div>
                  <label style={{ color: "var(--text-muted)" }}>
                    X (Left): {Math.round(zone.x * 100)}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={zone.x}
                    onChange={(e) => {
                      const updated = [...touchZonesList];
                      updated[idx].x = parseFloat(e.target.value);
                      setTouchZonesList(updated);
                    }}
                    style={{ width: "100%" }}
                  />
                </div>
                <div>
                  <label style={{ color: "var(--text-muted)" }}>
                    Y (Top): {Math.round(zone.y * 100)}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={zone.y}
                    onChange={(e) => {
                      const updated = [...touchZonesList];
                      updated[idx].y = parseFloat(e.target.value);
                      setTouchZonesList(updated);
                    }}
                    style={{ width: "100%" }}
                  />
                </div>
                <div>
                  <label style={{ color: "var(--text-muted)" }}>
                    Width: {Math.round(zone.width * 100)}%
                  </label>
                  <input
                    type="range"
                    min="0.05"
                    max="1"
                    step="0.01"
                    value={zone.width}
                    onChange={(e) => {
                      const updated = [...touchZonesList];
                      updated[idx].width = parseFloat(e.target.value);
                      setTouchZonesList(updated);
                    }}
                    style={{ width: "100%" }}
                  />
                </div>
                <div>
                  <label style={{ color: "var(--text-muted)" }}>
                    Height: {Math.round(zone.height * 100)}%
                  </label>
                  <input
                    type="range"
                    min="0.05"
                    max="1"
                    step="0.01"
                    value={zone.height}
                    onChange={(e) => {
                      const updated = [...touchZonesList];
                      updated[idx].height = parseFloat(e.target.value);
                      setTouchZonesList(updated);
                    }}
                    style={{ width: "100%" }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Save Button */}
        <div style={{ marginTop: "auto", display: "flex", gap: "12px" }}>
          <button
            className="btn-primary"
            style={{
              flex: 1,
              justifyContent: "center",
              padding: "14px",
              fontSize: "15px",
            }}
            onClick={saveTouchZones}
            disabled={savingTouch}
          >
            {savingTouch
              ? "Saving to Server..."
              : "💾 Save Touch Configuration to Live Catalog"}
          </button>
        </div>
      </div>
    </div>
  );
};
