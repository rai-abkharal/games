import React from "react";
import { Megaphone } from "lucide-react";
import { AdsConfig, GameItem } from "../../types/admin";

export interface AdsTabProps {
  adsConfig: AdsConfig;
  setAdsConfig: React.Dispatch<React.SetStateAction<AdsConfig>>;
  adsSavedMsg: string | null;
  savingAds: boolean;
  saveAdsConfig: () => void;
  games: GameItem[];
  openGameAdsEditor: (game: GameItem) => void;
}

export const AdsTab: React.FC<AdsTabProps> = ({
  adsConfig,
  setAdsConfig,
  adsSavedMsg,
  savingAds,
  saveAdsConfig,
  games,
  openGameAdsEditor,
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
              background: "rgba(99, 102, 241, 0.2)",
              borderRadius: "12px",
              color: "#818cf8",
            }}
          >
            <Megaphone size={24} />
          </div>
          <div>
            <h3 style={{ fontSize: "20px", fontWeight: 800 }}>
              Ads &amp; Monetization Remote Config
            </h3>
            <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>
              Control AdMob unit IDs, swipe frequency, and rewarded hint rules
              live without app rebuilds.
            </p>
          </div>
        </div>

        {adsSavedMsg && (
          <div
            style={{
              padding: "14px 18px",
              borderRadius: "10px",
              background: adsSavedMsg.includes("✅")
                ? "rgba(52, 211, 153, 0.15)"
                : "rgba(239, 68, 68, 0.15)",
              border: `1px solid ${adsSavedMsg.includes("✅") ? "#34d399" : "#ef4444"}`,
              color: adsSavedMsg.includes("✅") ? "#34d399" : "#f87171",
              marginBottom: "24px",
              fontWeight: 600,
              fontSize: "14px",
            }}
          >
            {adsSavedMsg}
          </div>
        )}

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "24px",
          }}
        >
          {/* Banner Switch */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "16px",
              background: "rgba(0,0,0,0.3)",
              borderRadius: "12px",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div>
              <h4 style={{ fontSize: "15px", fontWeight: 700 }}>
                Top Ad Banner
              </h4>
              <p
                style={{
                  fontSize: "12px",
                  color: "var(--text-muted)",
                }}
              >
                Show adaptive banner ad at the top of game feed
              </p>
            </div>
            <input
              type="checkbox"
              checked={adsConfig.bannerEnabled}
              onChange={(e) =>
                setAdsConfig({
                  ...adsConfig,
                  bannerEnabled: e.target.checked,
                })
              }
              style={{
                width: "22px",
                height: "22px",
                accentColor: "#6366f1",
                cursor: "pointer",
              }}
            />
          </div>

          {/* Interstitial Switch */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "16px",
              background: "rgba(0,0,0,0.3)",
              borderRadius: "12px",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div>
              <h4 style={{ fontSize: "15px", fontWeight: 700 }}>
                Interstitial Ads (Timer &amp; Events)
              </h4>
              <p
                style={{
                  fontSize: "12px",
                  color: "var(--text-muted)",
                }}
              >
                Show full-screen ad after a certain number of game swipes
              </p>
            </div>
            <input
              type="checkbox"
              checked={adsConfig.interstitialEnabled}
              onChange={(e) =>
                setAdsConfig({
                  ...adsConfig,
                  interstitialEnabled: e.target.checked,
                })
              }
              style={{
                width: "22px",
                height: "22px",
                accentColor: "#6366f1",
                cursor: "pointer",
              }}
            />
          </div>

          {/* Swipe Frequency Slider */}
          <div
            style={{
              padding: "16px",
              background: "rgba(0,0,0,0.3)",
              borderRadius: "12px",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "8px",
              }}
            >
              <span style={{ fontSize: "14px", fontWeight: 700 }}>
                Swipe Frequency Interval
              </span>
              <span
                style={{
                  fontSize: "14px",
                  color: "var(--accent-cyan)",
                  fontWeight: 800,
                  fontFamily: "var(--font-mono)",
                }}
              >
                Every {adsConfig.swipeInterval} Swipes
              </span>
            </div>
            <input
              type="range"
              min="3"
              max="25"
              value={adsConfig.swipeInterval}
              onChange={(e) =>
                setAdsConfig({
                  ...adsConfig,
                  swipeInterval: parseInt(e.target.value) || 10,
                })
              }
              style={{ width: "100%" }}
            />
            <p
              style={{
                fontSize: "11px",
                color: "var(--text-muted)",
                marginTop: "6px",
              }}
            >
              Controls how often full-screen ads appear when users swipe
              between games. Recommended: 10.
            </p>
          </div>

          {/* Level Complete Ad Switch */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "16px",
              background: "rgba(0,0,0,0.3)",
              borderRadius: "12px",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div>
              <h4 style={{ fontSize: "15px", fontWeight: 700 }}>
                Ad on Level Complete / Next Level
              </h4>
              <p
                style={{
                  fontSize: "12px",
                  color: "var(--text-muted)",
                }}
              >
                Trigger interstitial ad when player completes levels in
                multi-level games
              </p>
            </div>
            <input
              type="checkbox"
              checked={adsConfig.levelCompleteAd}
              onChange={(e) =>
                setAdsConfig({
                  ...adsConfig,
                  levelCompleteAd: e.target.checked,
                })
              }
              style={{
                width: "22px",
                height: "22px",
                accentColor: "#6366f1",
                cursor: "pointer",
              }}
            />
          </div>

          {/* Level Win Interval Slider */}
          <div
            style={{
              padding: "16px",
              background: "rgba(0,0,0,0.3)",
              borderRadius: "12px",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "8px",
              }}
            >
              <span style={{ fontSize: "14px", fontWeight: 700 }}>
                Level Win Ad Frequency
              </span>
              <span
                style={{
                  fontSize: "14px",
                  color: "#34d399",
                  fontWeight: 800,
                  fontFamily: "var(--font-mono)",
                }}
              >
                Every {adsConfig.levelWinInterval} Wins
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="5"
              value={adsConfig.levelWinInterval}
              onChange={(e) =>
                setAdsConfig({
                  ...adsConfig,
                  levelWinInterval: parseInt(e.target.value) || 2,
                })
              }
              style={{ width: "100%" }}
            />
            <p
              style={{
                fontSize: "11px",
                color: "var(--text-muted)",
                marginTop: "6px",
              }}
            >
              Show interstitial ad after player wins N levels (e.g. every 2
              wins or 3 wins, not on every single win).
            </p>
          </div>

          {/* Game Over / Loss Ad Switch */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "16px",
              background: "rgba(0,0,0,0.3)",
              borderRadius: "12px",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div>
              <h4 style={{ fontSize: "15px", fontWeight: 700 }}>
                Ad on Game Over / Loss
              </h4>
              <p
                style={{
                  fontSize: "12px",
                  color: "var(--text-muted)",
                }}
              >
                Trigger interstitial ad when player loses or runs out of
                lives/time
              </p>
            </div>
            <input
              type="checkbox"
              checked={adsConfig.gameOverAdEnabled}
              onChange={(e) =>
                setAdsConfig({
                  ...adsConfig,
                  gameOverAdEnabled: e.target.checked,
                })
              }
              style={{
                width: "22px",
                height: "22px",
                accentColor: "#6366f1",
                cursor: "pointer",
              }}
            />
          </div>

          {/* Cooldown Timer */}
          <div
            style={{
              padding: "16px",
              background: "rgba(0,0,0,0.3)",
              borderRadius: "12px",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <label
              style={{
                display: "block",
                fontSize: "14px",
                fontWeight: 700,
                marginBottom: "6px",
              }}
            >
              Ad Cooldown Limit (Seconds)
            </label>
            <input
              type="number"
              value={adsConfig.cooldownSeconds}
              onChange={(e) =>
                setAdsConfig({
                  ...adsConfig,
                  cooldownSeconds: parseInt(e.target.value) || 0,
                })
              }
              style={{
                width: "100%",
                padding: "10px 14px",
                background: "rgba(0,0,0,0.4)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "8px",
                color: "#fff",
                fontFamily: "var(--font-mono)",
              }}
            />
            <p
              style={{
                fontSize: "11px",
                color: "var(--text-muted)",
                marginTop: "6px",
              }}
            >
              Minimum time required between interstitial ads to protect user
              retention and prevent ad fatigue.
            </p>
          </div>

          {/* Default Time-Based Ad Interval (Minutes) */}
          <div
            style={{
              padding: "16px",
              background: "rgba(0,0,0,0.3)",
              borderRadius: "12px",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "8px",
              }}
            >
              <span style={{ fontSize: "14px", fontWeight: 700 }}>
                Default Ad Frequency (Timer)
              </span>
              <span
                style={{
                  fontSize: "14px",
                  color: "#a78bfa",
                  fontWeight: 800,
                  fontFamily: "var(--font-mono)",
                }}
              >
                Every {adsConfig.defaultIntervalMinutes ?? 5} Minutes
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="15"
              value={adsConfig.defaultIntervalMinutes ?? 5}
              onChange={(e) =>
                setAdsConfig({
                  ...adsConfig,
                  defaultIntervalMinutes: parseInt(e.target.value) || 5,
                })
              }
              style={{ width: "100%", accentColor: "#a78bfa" }}
            />
            <p
              style={{
                fontSize: "11px",
                color: "var(--text-muted)",
                marginTop: "6px",
              }}
            >
              Interval between displayed interstitials. Requires the global
              interstitial switch and the current game's ads setting. The app
              checks time during play; a loaded ad and a foreground app are
              required.
            </p>
          </div>
        </div>

        <button
          className="btn-primary"
          style={{
            marginTop: "28px",
            width: "100%",
            padding: "16px",
            fontSize: "15px",
            justifyContent: "center",
          }}
          onClick={saveAdsConfig}
          disabled={savingAds}
        >
          {savingAds
            ? "Deploying to Mobile App..."
            : "💾 Save & Deploy Ads Configuration"}
        </button>
      </div>

      {/* AdMob IDs Box */}
      <div className="glass-panel" style={{ padding: "28px" }}>
        <h3
          style={{
            fontSize: "18px",
            fontWeight: 700,
            marginBottom: "8px",
          }}
        >
          Google AdMob Unit IDs
        </h3>
        <p
          style={{
            fontSize: "12px",
            color: "var(--text-muted)",
            marginBottom: "20px",
          }}
        >
          Update production or test AdMob unit IDs remotely.
        </p>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "16px",
          }}
        >
          <div>
            <label
              style={{
                display: "block",
                fontSize: "12px",
                fontWeight: 700,
                color: "var(--text-muted)",
                marginBottom: "4px",
              }}
            >
              AdMob App ID
            </label>
            <input
              type="text"
              value={adsConfig.adMobAppId}
              onChange={(e) =>
                setAdsConfig({
                  ...adsConfig,
                  adMobAppId: e.target.value,
                })
              }
              style={{
                width: "100%",
                padding: "10px 12px",
                background: "rgba(0,0,0,0.4)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "8px",
                color: "#fff",
                fontFamily: "var(--font-mono)",
                fontSize: "12px",
              }}
            />
          </div>

          <div>
            <label
              style={{
                display: "block",
                fontSize: "12px",
                fontWeight: 700,
                color: "var(--text-muted)",
                marginBottom: "4px",
              }}
            >
              Banner Ad Unit ID
            </label>
            <input
              type="text"
              value={adsConfig.bannerUnitId}
              onChange={(e) =>
                setAdsConfig({
                  ...adsConfig,
                  bannerUnitId: e.target.value,
                })
              }
              style={{
                width: "100%",
                padding: "10px 12px",
                background: "rgba(0,0,0,0.4)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "8px",
                color: "#fff",
                fontFamily: "var(--font-mono)",
                fontSize: "12px",
              }}
            />
          </div>

          <div>
            <label
              style={{
                display: "block",
                fontSize: "12px",
                fontWeight: 700,
                color: "var(--text-muted)",
                marginBottom: "4px",
              }}
            >
              Interstitial Ad Unit ID
            </label>
            <input
              type="text"
              value={adsConfig.interstitialUnitId}
              onChange={(e) =>
                setAdsConfig({
                  ...adsConfig,
                  interstitialUnitId: e.target.value,
                })
              }
              style={{
                width: "100%",
                padding: "10px 12px",
                background: "rgba(0,0,0,0.4)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "8px",
                color: "#fff",
                fontFamily: "var(--font-mono)",
                fontSize: "12px",
              }}
            />
          </div>

          <div>
            <label
              style={{
                display: "block",
                fontSize: "12px",
                fontWeight: 700,
                color: "var(--text-muted)",
                marginBottom: "4px",
              }}
            >
              Rewarded Video Hint Ad Unit ID
            </label>
            <input
              type="text"
              value={adsConfig.rewardedUnitId}
              onChange={(e) =>
                setAdsConfig({
                  ...adsConfig,
                  rewardedUnitId: e.target.value,
                })
              }
              style={{
                width: "100%",
                padding: "10px 12px",
                background: "rgba(0,0,0,0.4)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "8px",
                color: "#fff",
                fontFamily: "var(--font-mono)",
                fontSize: "12px",
              }}
            />
          </div>
        </div>

        {/* Per-Game Ad Overrides Panel */}
        <div
          style={{
            marginTop: "28px",
            borderTop: "1px solid var(--border-subtle)",
            paddingTop: "20px",
          }}
        >
          <h4
            style={{
              fontSize: "15px",
              fontWeight: 700,
              marginBottom: "4px",
            }}
          >
            Per-Game Ad Controls
          </h4>
          <p
            style={{
              fontSize: "12px",
              color: "var(--text-muted)",
              marginBottom: "14px",
            }}
          >
            Enable/disable ads or set custom timers for specific games.
          </p>

          <div
            style={{
              maxHeight: "320px",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            {games.map((g) => {
              const isOff = g.ads?.enabled === false;
              const isCustom = g.ads?.useCustomInterval;
              const customMins = g.ads?.intervalMinutes || 5;

              return (
                <div
                  key={g.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "10px 12px",
                    background: "rgba(0,0,0,0.3)",
                    borderRadius: "8px",
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  <div>
                    <div style={{ fontSize: "13px", fontWeight: 600 }}>
                      {g.title}
                    </div>
                    <div style={{ fontSize: "11px" }}>
                      {isOff ? (
                        <span style={{ color: "#ef4444" }}>
                          🚫 Ads Disabled
                        </span>
                      ) : isCustom ? (
                        <span style={{ color: "#c084fc" }}>
                          ⏱ Custom: Every {customMins}m
                        </span>
                      ) : (
                        <span style={{ color: "#34d399" }}>
                          Default (~{adsConfig.defaultIntervalMinutes ?? 5}m)
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    className="btn-secondary"
                    style={{ padding: "4px 10px", fontSize: "11px" }}
                    onClick={() => openGameAdsEditor(g)}
                  >
                    Configure
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
