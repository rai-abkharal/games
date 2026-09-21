import React, { useState, useEffect, useRef } from "react";
import { adminFetch as fetch, api } from "./api/adminClient";
import { useAdmin } from "./auth/AdminSession";
import {
  GameItem,
  TouchZone,
  ValidationReport,
  BridgeLogItem,
  AdsConfig,
  PreloadConfig,
  TabType,
  API_BASE,
} from "./types/admin";

// Layout components
import { Sidebar } from "./components/layout/Sidebar";
import { Header } from "./components/layout/Header";

// Tab components
import { DashboardTab } from "./components/tabs/DashboardTab";
import { AnalyticsTab } from "./components/tabs/AnalyticsTab";
import { CatalogTab } from "./components/tabs/CatalogTab";
import { UploadGameTab } from "./components/tabs/UploadGameTab";
import { UpdateGameTab } from "./components/tabs/UpdateGameTab";
import { SimulatorTab } from "./components/tabs/SimulatorTab";
import { FeedSequencerTab } from "./components/tabs/FeedSequencerTab";
import { ReportsTab } from "./components/tabs/ReportsTab";
import { GesturesTab } from "./components/tabs/GesturesTab";
import { AdsTab } from "./components/tabs/AdsTab";
import { PreloadTab } from "./components/tabs/PreloadTab";

// Modal dialogs
import { PerGameAdsModal } from "./components/modals/PerGameAdsModal";

export default function App() {
  const { account, previewOrigin } = useAdmin();
  const can = (permission: string) => account.permissions.includes(permission);

  // Staged uploads & preview
  const [stagedUploads, setStagedUploads] = useState<
    { id: string; game: string; version: string }[]
  >([]);
  const [stagedPreview, setStagedPreview] = useState("");
  const refreshUploads = async () => {
    if (can("games.read")) setStagedUploads((await api("/uploads")).uploads);
  };

  // Active navigation tab
  const [activeTab, setActiveTab] = useState<TabType>(
    can("analytics.read") ? "dashboard" : "games",
  );

  // Core games catalog state
  const [games, setGames] = useState<GameItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedGame, setSelectedGame] = useState<GameItem | null>(null);

  // Touch Lock Gesture Configuration State
  const [editingTouchGame, setEditingTouchGame] = useState<GameItem | null>(null);
  const [touchZonesList, setTouchZonesList] = useState<TouchZone[]>([]);
  const [savingTouch, setSavingTouch] = useState(false);
  const [touchSaveMsg, setTouchSaveMsg] = useState<string | null>(null);

  // Simulator state
  const [simGame, setSimGame] = useState<string>("crown-chase");
  const [simIsMuted, setSimIsMuted] = useState(false);
  const [bridgeLogs, setBridgeLogs] = useState<BridgeLogItem[]>([]);
  const [simScore, setSimScore] = useState(0);
  const [simLevel, setSimLevel] = useState(1);
  const [simRefreshKey, setSimRefreshKey] = useState(Date.now());
  const [updateGameTarget, setUpdateGameTarget] = useState<GameItem | null>(null);
  const simIframeRef = useRef<HTMLIFrameElement | null>(null);

  // Validation report state
  const [validationReport, setValidationReport] =
    useState<ValidationReport | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  // Ads remote configuration state
  const [adsConfig, setAdsConfig] = useState<AdsConfig>({
    bannerEnabled: true,
    interstitialEnabled: true,
    swipeInterval: 10,
    defaultIntervalMinutes: 5,
    levelCompleteAd: true,
    levelWinInterval: 2,
    gameOverAdEnabled: true,
    cooldownSeconds: 60,
    adMobAppId: "ca-app-pub-3940256099942544~3347511713",
    bannerUnitId: "ca-app-pub-3940256099942544/6300978111",
    interstitialUnitId: "ca-app-pub-3940256099942544/1033173712",
    rewardedUnitId: "ca-app-pub-3940256099942544/5224354917",
    gaMeasurementId: "G-SWIPEPLAY1",
  });
  const [savingAds, setSavingAds] = useState(false);
  const [adsSavedMsg, setAdsSavedMsg] = useState<string | null>(null);

  // Startup preload remote configuration state
  const [preloadConfig, setPreloadConfig] = useState<PreloadConfig>({
    initialPreloadGameCount: 5,
  });
  const [savingPreload, setSavingPreload] = useState(false);
  const [preloadSavedMsg, setPreloadSavedMsg] = useState<string | null>(null);

  // Analytics Dashboard & GA4 Pipeline State
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

  // Per-game Ad Config Modal
  const [editingGameAds, setEditingGameAds] = useState<GameItem | null>(null);

  // Catalog search + inline rename state
  const [gameSearch, setGameSearch] = useState("");
  const [renamingGameId, setRenamingGameId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  // Reports state
  const [reports, setReports] = useState<any[]>([]);
  const [downloadingGameId, setDownloadingGameId] = useState<string | null>(null);

  // Fetch games
  const fetchGames = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/v1/admin/games`);
      if (res.ok) {
        const data = await res.json();
        setGames(data.games || []);
        if (
          data.games?.length &&
          !data.games.some((game: GameItem) => game.id === simGame)
        ) {
          setSimGame(data.games[0].slug);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch ads config
  const fetchAdsConfig = async () => {
    try {
      const res = await fetch(`${API_BASE}/v1/admin/ads-config`);
      if (res.ok) {
        const data = await res.json();
        if (data.config) setAdsConfig(data.config);
      }
    } catch (_) {}
  };

  // Save ads config
  const saveAdsConfig = async () => {
    try {
      setSavingAds(true);
      const res = await fetch(`${API_BASE}/v1/admin/ads-config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(adsConfig),
      });
      if (res.ok) {
        setAdsSavedMsg("✅ Ads Configuration saved & deployed live to mobile app!");
        setTimeout(() => setAdsSavedMsg(null), 4000);
      } else {
        setAdsSavedMsg("❌ Failed to save ads configuration.");
      }
    } catch (err: any) {
      setAdsSavedMsg(`❌ Error: ${err.message}`);
    } finally {
      setSavingAds(false);
    }
  };

  // Fetch preload config
  const fetchPreloadConfig = async () => {
    try {
      const res = await fetch(`${API_BASE}/v1/admin/preload-config`);
      if (res.ok) {
        const data = await res.json();
        if (data.config) setPreloadConfig(data.config);
      }
    } catch (_) {}
  };

  // Save preload config
  const savePreloadConfig = async () => {
    try {
      setSavingPreload(true);
      const res = await fetch(`${API_BASE}/v1/admin/preload-config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initialPreloadGameCount:
            Number(preloadConfig.initialPreloadGameCount) || 5,
        }),
      });
      if (res.ok) {
        setPreloadSavedMsg(
          "✅ Startup Preload configuration saved & deployed live to mobile app!",
        );
        setTimeout(() => setPreloadSavedMsg(null), 4000);
      } else {
        const data = await res.json().catch(() => ({}));
        setPreloadSavedMsg(
          `❌ Failed to save preload config: ${data.details || data.error || "Server error"}`,
        );
      }
    } catch (err: any) {
      setPreloadSavedMsg(`❌ Error: ${err.message}`);
    } finally {
      setSavingPreload(false);
    }
  };

  // Fetch reports
  const fetchReports = async () => {
    try {
      const res = await fetch(`${API_BASE}/v1/admin/reports`);
      if (res.ok) {
        const data = await res.json();
        setReports(data.reports || []);
      }
    } catch (err) {}
  };

  // Fetch analytics summary
  const fetchAnalytics = async (
    range: "today" | "7d" | "30d" | "all" = analyticsRange,
  ) => {
    try {
      setLoadingAnalytics(true);
      const res = await fetch(
        `${API_BASE}/v1/admin/analytics/summary?range=${range}`,
      );
      if (!res.ok)
        throw new Error(`Analytics request failed (HTTP ${res.status}).`);
      const data = await res.json();
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

  // Run GA4 Diagnostic Test Event
  const runGa4Test = async () => {
    try {
      setTestEventStatus({
        running: true,
        msg: "Sending test event to Google Analytics 4 DebugView...",
        error: false,
      });
      const res = await fetch(`${API_BASE}/v1/admin/analytics/test-event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId: simGame || "crown-chase" }),
      });
      const data = await res.json();
      if (data.success) {
        setTestEventStatus({
          running: false,
          msg: data.message,
          error: false,
          details: data.ga4,
        });
        fetchAnalytics(analyticsRange);
      } else {
        setTestEventStatus({
          running: false,
          msg: data.error || "Failed to trigger test event.",
          error: true,
        });
      }
    } catch (err: any) {
      setTestEventStatus({
        running: false,
        msg: `Error: ${err.message}`,
        error: true,
      });
    }
  };

  // Open & Save Game Ad Settings
  const openGameAdsEditor = (game: GameItem) => {
    setEditingGameAds(game);
  };

  const saveGameAds = async (
    gameId: string,
    formValues: {
      enabled: boolean;
      useCustomInterval: boolean;
      intervalMinutes: number;
    },
  ) => {
    const res = await fetch(`${API_BASE}/v1/admin/games/${gameId}/ads`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ads: formValues }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Failed to update game ads.");
    }
    await fetchGames();
  };

  useEffect(() => {
    fetchGames();
    if (can("reports.read")) fetchReports();
    if (can("ads.configure")) fetchAdsConfig();
    if (can("games.configure")) fetchPreloadConfig();
    if (can("analytics.read")) fetchAnalytics(analyticsRange);
    void refreshUploads().catch(console.error);
  }, []);

  useEffect(() => {
    if (activeTab !== "analytics" || !can("analytics.read")) return;
    void fetchAnalytics(analyticsRange);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible")
        void fetchAnalytics(analyticsRange);
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [activeTab, analyticsRange]);

  // Bridge Message listener for Simulator
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      try {
        if (
          e.source !== simIframeRef.current?.contentWindow ||
          e.origin !== previewOrigin
        )
          return;
        if (typeof e.data === "string" && e.data.length > 8192) return;
        const data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        if (!data || (data.v !== 1 && data.source !== "GameBridge")) return;
        if (typeof data.type !== "string") data.type = data.action;
        if (
          ![
            "SCORE_UPDATED",
            "LEVEL_COMPLETED",
            "GAME_OVER",
            "HINT_REQUESTED",
            "ready",
            "gameStarted",
            "gameOver",
            "completed",
            "paused",
            "resumed",
            "metrics",
            "haptic",
            "setSwipeEnabled",
          ].includes(data.type)
        )
          return;
        for (const field of ["score", "level"])
          if (
            data.payload?.[field] !== undefined &&
            (typeof data.payload[field] !== "number" ||
              !Number.isFinite(data.payload[field]))
          )
            return;
        if (JSON.stringify(data).length > 8192) return;

        const newLog: BridgeLogItem = {
          id: Math.random().toString(36).substring(7),
          direction: "in",
          type: data.type,
          payload: data.payload || {},
          ts: new Date().toLocaleTimeString(),
        };

        setBridgeLogs((prev) => [newLog, ...prev.slice(0, 49)]);

        if (data.type === "SCORE_UPDATED" && data.payload) {
          setSimScore(data.payload.score || 0);
          if (data.payload.level) setSimLevel(data.payload.level);
        } else if (data.type === "GAME_OVER" && data.payload) {
          setSimScore(data.payload.score || 0);
        }
      } catch (err) {}
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Simulator command dispatch
  const sendSimulatorEvent = (type: string, payload?: any) => {
    const envelope = {
      v: 1,
      type,
      gameId: simGame,
      sessionId: "admin-sim-" + Date.now(),
      ts: Date.now(),
      payload,
    };

    if (simIframeRef.current && simIframeRef.current.contentWindow) {
      const cw = simIframeRef.current.contentWindow as any;
      let actionResult = payload;

      cw.postMessage(envelope, previewOrigin);

      const newLog: BridgeLogItem = {
        id: Math.random().toString(36).substring(7),
        direction: "out",
        type,
        payload: actionResult || {},
        ts: new Date().toLocaleTimeString(),
      };
      setBridgeLogs((prev) => [newLog, ...prev.slice(0, 49)]);
    }
  };

  // Toggle kill switch
  const toggleGameStatus = async (gameId: string, currentStatus: string) => {
    const newStatus = currentStatus === "published" ? "archived" : "published";
    try {
      const res = await fetch(`${API_BASE}/v1/admin/games/${gameId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        fetchGames();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Toggle Hint Feature
  const toggleGameHint = async (gameId: string, currentHint: boolean) => {
    try {
      const res = await fetch(`${API_BASE}/v1/admin/games/${gameId}/features`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ features: { hint: !currentHint } }),
      });
      if (res.ok) {
        fetchGames();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Rename Game
  const startRename = (game: GameItem) => {
    setRenamingGameId(game.id);
    setRenameDraft(game.title);
    setRenameError(null);
  };

  const cancelRename = () => {
    setRenamingGameId(null);
    setRenameDraft("");
    setRenameError(null);
  };

  const saveRename = async (gameId: string, nextTitle: string | null) => {
    const trimmed = nextTitle === null ? null : nextTitle.trim();
    if (trimmed !== null && !trimmed) {
      setRenameError("Name cannot be empty");
      return;
    }
    try {
      setRenameSaving(true);
      setRenameError(null);
      const res = await fetch(`${API_BASE}/v1/admin/games/${gameId}/title`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to rename game");
      await fetchGames();
      cancelRename();
    } catch (err: any) {
      setRenameError(err.message || "Failed to rename game");
    } finally {
      setRenameSaving(false);
    }
  };

  // Permanently Delete Game from Catalog & Server
  const deleteGame = async (gameId: string, gameTitle: string) => {
    if (
      !window.confirm(
        `⚠️ Permanently Delete "${gameTitle}"?\n\nThis will remove the game from the catalog, app feed, and delete all files from the server.`,
      )
    ) {
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/v1/admin/games/${gameId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        await fetchGames();
      } else {
        alert("Failed to delete game from server.");
      }
    } catch (err: any) {
      alert(`Error deleting game: ${err.message}`);
    }
  };

  // Download a game's deployed code
  const downloadGame = async (gameId: string, gameTitle: string) => {
    setDownloadingGameId(gameId);
    try {
      const res = await fetch(`${API_BASE}/v1/admin/games/${gameId}/download`);
      if (!res.ok) {
        let message = "Failed to download game code.";
        try {
          message = (await res.json()).error || message;
        } catch {}
        alert(`"${gameTitle}": ${message}`);
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const filename =
        disposition.match(/filename="([^"]+)"/)?.[1] || `${gameId}.zip`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Error downloading game: ${err.message}`);
    } finally {
      setDownloadingGameId(null);
    }
  };

  // Update Rollout Percentage
  const updateRollout = async (gameId: string, percent: number) => {
    try {
      await fetch(`${API_BASE}/v1/admin/games/${gameId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rolloutPercent: percent }),
      });
      fetchGames();
    } catch (err) {}
  };

  // Fetch validation report
  const viewValidation = async (gameId: string) => {
    try {
      const res = await fetch(
        `${API_BASE}/v1/admin/games/${gameId}/validation`,
      );
      if (res.ok) {
        const data = await res.json();
        setValidationReport(data);
        setActiveTab("upload");
      }
    } catch (err) {}
  };

  // Handle Zip Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadSuccess(null);
    setValidationReport(null);
    const formData = new FormData();
    formData.append("file", file);

    const targetGame =
      activeTab === "update" ? updateGameTarget || selectedGame : null;
    const uploadUrl = targetGame?.id
      ? `${API_BASE}/v1/admin/games/${targetGame.id}/upload`
      : `${API_BASE}/v1/admin/games/upload`;

    try {
      const res = await fetch(uploadUrl, {
        method: "POST",
        body: formData,
      });

      const resText = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(resText);
      } catch {
        data = {
          details:
            resText || `Server returned HTTP ${res.status} ${res.statusText}`,
        };
      }

      if (res.ok && data.success !== false) {
        const msg =
          data.message || "Upload staged. Review it above before publishing.";
        setUploadSuccess(msg.startsWith("✨") ? msg : `✨ ${msg}`);
        await refreshUploads();
        if (data.validationReport) {
          setValidationReport(data.validationReport);
        }
        await fetchGames();
      } else {
        const failureReason =
          data.details ||
          data.error ||
          `Upload failed (HTTP ${res.status}): Please check package contents.`;
        setUploadSuccess(`❌ Upload failed: ${failureReason}`);
        setValidationReport(
          data.validationReport || {
            gameId: targetGame?.id || "unknown",
            slug: targetGame?.id || "unknown",
            version: "1.0.0",
            allPassed: false,
            checks: [
              {
                rule: "Package Verification",
                passed: false,
                message: failureReason,
              },
            ],
          },
        );
      }
    } catch (err: any) {
      console.error("Upload failed:", err);
      const networkMsg = `Network error: ${err.message}. Please verify the server is running on ${API_BASE}.`;
      setUploadSuccess(`❌ ${networkMsg}`);
      setValidationReport({
        gameId: targetGame?.id || "unknown",
        slug: targetGame?.id || "unknown",
        version: "1.0.0",
        allPassed: false,
        checks: [
          {
            rule: "Network Connection",
            passed: false,
            message: networkMsg,
          },
        ],
      });
    } finally {
      setUploading(false);
      if (e.target) e.target.value = "";
    }
  };

  // Move game up, down, pin to top (#1), or set exact position
  const reorderGame = async (
    gameId: string,
    action: "up" | "down" | "top" | number,
  ) => {
    const currentList = [...games].sort(
      (a, b) => (a.sortWeight ?? 0) - (b.sortWeight ?? 0),
    );
    const index = currentList.findIndex((g) => g.id === gameId);
    if (index < 0) return;

    const item = currentList.splice(index, 1)[0];

    if (action === "top") {
      currentList.unshift(item);
    } else if (action === "up") {
      const newIdx = Math.max(0, index - 1);
      currentList.splice(newIdx, 0, item);
    } else if (action === "down") {
      const newIdx = Math.min(currentList.length, index + 1);
      currentList.splice(newIdx, 0, item);
    } else if (typeof action === "number") {
      const targetIdx = Math.max(0, Math.min(currentList.length, action - 1));
      currentList.splice(targetIdx, 0, item);
    }

    const payload = currentList.map((g, idx) => ({
      id: g.id,
      sortWeight: idx + 1,
    }));

    try {
      await fetch(`${API_BASE}/v1/admin/feed/order`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: payload }),
      });
      await fetchGames();
    } catch (err) {}
  };

  // Open Touch Zone Configuration for a Game
  const openTouchEditor = (game: GameItem) => {
    setEditingTouchGame(game);
    setTouchZonesList(
      game.touchZones ? JSON.parse(JSON.stringify(game.touchZones)) : [],
    );
    setTouchSaveMsg(null);
    setActiveTab("gestures");
  };

  // Save Touch Configuration to Server API
  const saveTouchZones = async () => {
    if (!editingTouchGame) return;
    setSavingTouch(true);
    try {
      const res = await fetch(
        `${API_BASE}/v1/admin/games/${editingTouchGame.id}/touch-zones`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ touchZones: touchZonesList }),
        },
      );
      if (res.ok) {
        setTouchSaveMsg(
          `✨ Touch block area for "${editingTouchGame.title}" saved to live catalog!`,
        );
        await fetchGames();
      } else {
        setTouchSaveMsg("❌ Failed to save touch configuration.");
      }
    } catch (err: any) {
      setTouchSaveMsg(`❌ Network Error: ${err.message}`);
    } finally {
      setSavingTouch(false);
    }
  };

  return (
    <>
      {/* Staged game uploads bar */}
      <section className="auth-bar" aria-label="Staged game uploads">
        <strong>Staged uploads</strong>
        {stagedUploads.length === 0 ? (
          <span>No pending uploads</span>
        ) : (
          stagedUploads.map((u) => (
            <span key={u.id}>
              {u.game} v{u.version}{" "}
              <button
                onClick={async () => {
                  try {
                    setStagedPreview(
                      (await api("/preview-grants", { uploadId: u.id })).url,
                    );
                  } catch (e) {
                    alert((e as Error).message);
                  }
                }}
              >
                Preview
              </button>
              {can("games.publish") && (
                <button
                  onClick={async () => {
                    try {
                      await api("/uploads/" + u.id + "/publish", {});
                      await refreshUploads();
                      await fetchGames();
                    } catch (e) {
                      alert((e as Error).message);
                    }
                  }}
                >
                  Publish
                </button>
              )}
              {can("games.update") && (
                <button
                  onClick={async () => {
                    try {
                      await api("/uploads/" + u.id, undefined, "DELETE");
                      await refreshUploads();
                    } catch (e) {
                      alert((e as Error).message);
                    }
                  }}
                >
                  Discard
                </button>
              )}
            </span>
          ))
        )}
        {stagedPreview && (
          <div>
            <button onClick={() => setStagedPreview("")}>Close preview</button>
            <iframe
              title="Staged game preview"
              src={stagedPreview}
              sandbox="allow-scripts allow-same-origin"
              referrerPolicy="no-referrer"
              style={{ width: 360, height: 600, border: 0 }}
            />
          </div>
        )}
      </section>

      {/* Main Admin Layout */}
      <div
        style={{
          display: "flex",
          minHeight: "100vh",
          background: "var(--bg-main)",
        }}
      >
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          can={can}
          gamesCount={games.length}
          reportsCount={reports.length}
        />

        <main style={{ flex: 1, padding: "32px", overflowY: "auto" }}>
          <Header
            activeTab={activeTab}
            loading={loading}
            onRefresh={() => {
              fetchGames();
              if (can("reports.read")) fetchReports();
              if (can("ads.configure")) fetchAdsConfig();
              if (can("games.configure")) fetchPreloadConfig();
              if (can("analytics.read")) fetchAnalytics(analyticsRange);
            }}
            onOpenSimulator={() => setActiveTab("simulator")}
          />

          {/* 1. DASHBOARD VIEW */}
          {activeTab === "dashboard" && can("analytics.read") && (
            <DashboardTab
              games={games}
              onTestGame={(slug) => {
                setSimGame(slug);
                setActiveTab("simulator");
              }}
              onViewValidation={viewValidation}
            />
          )}

          {/* 1.1 ANALYTICS DEEP DIVE & GA4 VIEW */}
          {activeTab === "analytics" && can("analytics.read") && (
            <AnalyticsTab
              games={games}
              gaMeasurementId={adsConfig.gaMeasurementId}
              onOpenGameAdsEditor={openGameAdsEditor}
              onTestGame={(slug) => {
                setSimGame(slug);
                setActiveTab("simulator");
              }}
            />
          )}


          {/* 2. GAME CATALOG VIEW */}
          {activeTab === "games" && (
            <CatalogTab
              games={games}
              can={can}
              gameSearch={gameSearch}
              setGameSearch={setGameSearch}
              renamingGameId={renamingGameId}
              renameDraft={renameDraft}
              setRenameDraft={setRenameDraft}
              renameSaving={renameSaving}
              renameError={renameError}
              startRename={startRename}
              cancelRename={cancelRename}
              saveRename={saveRename}
              updateRollout={updateRollout}
              reorderGame={reorderGame}
              setUpdateGameTarget={setUpdateGameTarget}
              setActiveTab={setActiveTab}
              toggleGameHint={toggleGameHint}
              openGameAdsEditor={openGameAdsEditor}
              openTouchEditor={openTouchEditor}
              setSimGame={setSimGame}
              viewValidation={viewValidation}
              downloadingGameId={downloadingGameId}
              downloadGame={downloadGame}
              toggleGameStatus={toggleGameStatus}
              deleteGame={deleteGame}
            />
          )}

          {/* 3. UPLOAD NEW GAME VIEW */}
          {activeTab === "upload" && (
            <UploadGameTab
              setSelectedGame={setSelectedGame}
              handleFileUpload={handleFileUpload}
              uploading={uploading}
              uploadSuccess={uploadSuccess}
              validationReport={validationReport}
            />
          )}

          {/* 3.1 UPDATE EXISTING GAME CODE VIEW */}
          {activeTab === "update" && (
            <UpdateGameTab
              games={games}
              updateGameTarget={updateGameTarget}
              setUpdateGameTarget={setUpdateGameTarget}
              selectedGame={selectedGame}
              setSelectedGame={setSelectedGame}
              handleFileUpload={handleFileUpload}
              uploading={uploading}
              uploadSuccess={uploadSuccess}
              validationReport={validationReport}
            />
          )}

          {/* 4. SIMULATOR & BRIDGE INSPECTOR VIEW */}
          {activeTab === "simulator" && (
            <SimulatorTab
              games={games}
              simGame={simGame}
              setSimGame={setSimGame}
              simRefreshKey={simRefreshKey}
              setSimRefreshKey={setSimRefreshKey}
              simScore={simScore}
              setSimScore={setSimScore}
              simLevel={simLevel}
              setSimLevel={setSimLevel}
              simIsMuted={simIsMuted}
              setSimIsMuted={setSimIsMuted}
              bridgeLogs={bridgeLogs}
              setBridgeLogs={setBridgeLogs}
              sendSimulatorEvent={sendSimulatorEvent}
              simIframeRef={simIframeRef}
              previewOrigin={previewOrigin}
            />
          )}

          {/* 5. FEED SEQUENCER VIEW */}
          {activeTab === "feed" && (
            <FeedSequencerTab
              games={games}
              can={can}
              reorderGame={reorderGame}
            />
          )}

          {/* 6. REPORTS QUEUE VIEW */}
          {activeTab === "reports" && (
            <ReportsTab reports={reports} />
          )}

          {/* 7. DYNAMIC TOUCH & SWIPE LOCKS VIEW */}
          {activeTab === "gestures" && (
            <GesturesTab
              games={games}
              editingTouchGame={editingTouchGame}
              openTouchEditor={openTouchEditor}
              previewOrigin={previewOrigin}
              touchZonesList={touchZonesList}
              setTouchZonesList={setTouchZonesList}
              touchSaveMsg={touchSaveMsg}
              savingTouch={savingTouch}
              saveTouchZones={saveTouchZones}
            />
          )}

          {/* 8. ADS & MONETIZATION REMOTE CONFIG VIEW */}
          {activeTab === "ads" && (
            <AdsTab
              adsConfig={adsConfig}
              setAdsConfig={setAdsConfig}
              adsSavedMsg={adsSavedMsg}
              savingAds={savingAds}
              saveAdsConfig={saveAdsConfig}
              games={games}
              openGameAdsEditor={openGameAdsEditor}
            />
          )}

          {/* 9. STARTUP PRELOAD REMOTE CONFIG VIEW */}
          {activeTab === "preload" && (
            <PreloadTab
              preloadConfig={preloadConfig}
              setPreloadConfig={setPreloadConfig}
              preloadSavedMsg={preloadSavedMsg}
              savingPreload={savingPreload}
              savePreloadConfig={savePreloadConfig}
              games={games}
            />
          )}

          {/* Per-Game Ads Configuration Modal */}
          {editingGameAds && (
            <PerGameAdsModal
              game={editingGameAds}
              defaultIntervalMinutes={adsConfig.defaultIntervalMinutes ?? 5}
              onClose={() => setEditingGameAds(null)}
              onSave={saveGameAds}
            />
          )}
        </main>
      </div>
    </>
  );
}
