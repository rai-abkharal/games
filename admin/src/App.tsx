import React, { useState, useEffect, useRef } from 'react';
import {
  Gamepad2,
  LayoutDashboard,
  UploadCloud,
  Smartphone,
  ListOrdered,
  AlertTriangle,
  Play,
  Pause,
  Volume2,
  VolumeX,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldCheck,
  Zap,
  TrendingUp,
  Flame,
  Activity,
  Layers,
  ArrowRight,
  Sparkles,
  RefreshCw,
  Power,
  Trash2,
  Megaphone
} from 'lucide-react';

interface TouchZone {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface GameItem {
  id: string;
  slug: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  orientation: string;
  controls: string[];
  tags: string[];
  status: 'published' | 'draft' | 'archived';
  sortWeight: number;
  ageRating: string;
  totalPlays: number;
  totalReports: number;
  touchZones?: TouchZone[];
  features?: { sound?: boolean; vibration?: boolean; hint?: boolean };
  createdAt?: string;
  updatedAt?: string;
  versions: {
    id: string;
    version: string;
    sizeBytes: number;
    sha256: string;
    status: string;
    rolloutPercent: number;
  }[];
}

interface ValidationReport {
  gameId: string;
  slug: string;
  version: string;
  allPassed: boolean;
  checks: {
    rule: string;
    passed: boolean;
    message: string;
  }[];
}

interface BridgeLogItem {
  id: string;
  direction: 'in' | 'out';
  type: string;
  payload: any;
  ts: string;
}

const API_BASE = typeof window !== 'undefined' && window.location.origin.includes('5173') ? 'http://localhost:3000' : '';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'games' | 'upload' | 'update' | 'simulator' | 'feed' | 'reports' | 'gestures' | 'ads'>('dashboard');
  const [games, setGames] = useState<GameItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedGame, setSelectedGame] = useState<GameItem | null>(null);
  
  // Touch Lock Gesture Configuration State
  const [editingTouchGame, setEditingTouchGame] = useState<GameItem | null>(null);
  const [touchZonesList, setTouchZonesList] = useState<TouchZone[]>([]);
  const [savingTouch, setSavingTouch] = useState(false);
  const [touchSaveMsg, setTouchSaveMsg] = useState<string | null>(null);
  
  // Simulator states
  const [simGame, setSimGame] = useState<string>('crown-chase');
  const [simIsMuted, setSimIsMuted] = useState(false);
  const [bridgeLogs, setBridgeLogs] = useState<BridgeLogItem[]>([]);
  const [simScore, setSimScore] = useState(0);
  const [simLevel, setSimLevel] = useState(1);
  const [simRefreshKey, setSimRefreshKey] = useState(Date.now());
  const [updateGameTarget, setUpdateGameTarget] = useState<GameItem | null>(null);
  const simIframeRef = useRef<HTMLIFrameElement | null>(null);

  // Validation report state
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  // Ads remote configuration state
  const [adsConfig, setAdsConfig] = useState({
    bannerEnabled: true,
    interstitialEnabled: true,
    swipeInterval: 10,
    levelCompleteAd: true,
    levelWinInterval: 2,
    gameOverAdEnabled: true,
    cooldownSeconds: 60,
    adMobAppId: 'ca-app-pub-3940256099942544~3347511713',
    bannerUnitId: 'ca-app-pub-3940256099942544/6300978111',
    interstitialUnitId: 'ca-app-pub-3940256099942544/1033173712',
    rewardedUnitId: 'ca-app-pub-3940256099942544/5224354917',
  });
  const [savingAds, setSavingAds] = useState(false);
  const [adsSavedMsg, setAdsSavedMsg] = useState<string | null>(null);

  // Reports state
  const [reports, setReports] = useState<any[]>([]);

  // Fetch games
  const fetchGames = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/v1/admin/games`);
      if (res.ok) {
        const data = await res.json();
        setGames(data.games || []);
        if (data.games?.length && !simGame) {
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
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(adsConfig),
      });
      if (res.ok) {
        setAdsSavedMsg('✅ Ads Configuration saved & deployed live to mobile app!');
        setTimeout(() => setAdsSavedMsg(null), 4000);
      } else {
        setAdsSavedMsg('❌ Failed to save ads configuration.');
      }
    } catch (err: any) {
      setAdsSavedMsg(`❌ Error: ${err.message}`);
    } finally {
      setSavingAds(false);
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

  useEffect(() => {
    fetchGames();
    fetchReports();
    fetchAdsConfig();
  }, []);

  // Bridge Message listener for Simulator
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        if (!data || data.v !== 1) return;

        const newLog: BridgeLogItem = {
          id: Math.random().toString(36).substring(7),
          direction: 'in',
          type: data.type,
          payload: data.payload || {},
          ts: new Date().toLocaleTimeString(),
        };

        setBridgeLogs((prev) => [newLog, ...prev.slice(0, 49)]);

        if (data.type === 'SCORE_UPDATED' && data.payload) {
          setSimScore(data.payload.score || 0);
          if (data.payload.level) setSimLevel(data.payload.level);
        } else if (data.type === 'GAME_OVER' && data.payload) {
          setSimScore(data.payload.score || 0);
        }
      } catch (err) {}
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Simulator host action sender
  const sendSimulatorEvent = (type: string, payload?: any) => {
    const envelope = {
      v: 1,
      type,
      gameId: simGame,
      sessionId: 'admin-sim-' + Date.now(),
      ts: Date.now(),
      payload,
    };

    if (simIframeRef.current && simIframeRef.current.contentWindow) {
      simIframeRef.current.contentWindow.postMessage(JSON.stringify(envelope), '*');
      
      const newLog: BridgeLogItem = {
        id: Math.random().toString(36).substring(7),
        direction: 'out',
        type,
        payload: payload || {},
        ts: new Date().toLocaleTimeString(),
      };
      setBridgeLogs((prev) => [newLog, ...prev.slice(0, 49)]);
    }
  };

  // Toggle kill switch
  const toggleGameStatus = async (gameId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'published' ? 'archived' : 'published';
    try {
      const res = await fetch(`${API_BASE}/v1/admin/games/${gameId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ features: { hint: !currentHint } }),
      });
      if (res.ok) {
        fetchGames();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Permanently Delete Game from Catalog & Server
  const deleteGame = async (gameId: string, gameTitle: string) => {
    if (!window.confirm(`⚠️ Permanently Delete "${gameTitle}"?\n\nThis will remove the game from the catalog, app feed, and delete all files from the server.`)) {
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/v1/admin/games/${gameId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        await fetchGames();
      } else {
        alert('Failed to delete game from server.');
      }
    } catch (err: any) {
      alert(`Error deleting game: ${err.message}`);
    }
  };

  // Update Rollout Percentage
  const updateRollout = async (gameId: string, percent: number) => {
    try {
      await fetch(`${API_BASE}/v1/admin/games/${gameId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rolloutPercent: percent }),
      });
      fetchGames();
    } catch (err) {}
  };

  // Fetch validation report
  const viewValidation = async (gameId: string) => {
    try {
      const res = await fetch(`${API_BASE}/v1/admin/games/${gameId}/validation`);
      if (res.ok) {
        const data = await res.json();
        setValidationReport(data);
        setActiveTab('upload');
      }
    } catch (err) {}
  };

  // Handle Zip Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadSuccess(null);
    const formData = new FormData();
    formData.append('file', file);

    const targetGame = activeTab === 'update' ? (updateGameTarget || selectedGame) : null;
    const uploadUrl = targetGame?.id
      ? `${API_BASE}/v1/admin/games/${targetGame.id}/upload`
      : `${API_BASE}/v1/admin/games/upload`;

    try {
      const res = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
      });

      const resText = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(resText);
      } catch {
        data = { details: resText || `Server returned HTTP ${res.status} ${res.statusText}` };
      }

      if (res.ok && data.success !== false) {
        const gameName = data.game?.title || targetGame?.title || 'Game';
        const versionStr = data.game?.version || data.version?.version || '1.0.0';
        setUploadSuccess(`✨ "${gameName}" (v${versionStr}) ${targetGame ? 'updated and deployed live' : 'published to top of feed'} successfully!`);
        if (data.validationReport) {
          setValidationReport(data.validationReport);
        }
        await fetchGames();
      } else {
        const failureReason = data.details || data.error || `Upload failed (HTTP ${res.status}): Please check package contents.`;
        setUploadSuccess(`❌ Upload failed: ${failureReason}`);
        if (data.validationReport) {
          setValidationReport(data.validationReport);
        }
      }
    } catch (err: any) {
      console.error('Upload failed:', err);
      setUploadSuccess(`❌ Network error: ${err.message}. Please verify the server is running on ${API_BASE}.`);
    } finally {
      setUploading(false);
      // Reset input element value so same file can be re-uploaded if modified
      if (e.target) e.target.value = '';
    }
  };

  // Move game up, down, pin to top (#1), or set exact position
  const reorderGame = async (gameId: string, action: 'up' | 'down' | 'top' | number) => {
    const currentList = [...games].sort((a, b) => (a.sortWeight ?? 0) - (b.sortWeight ?? 0));
    const index = currentList.findIndex((g) => g.id === gameId);
    if (index < 0) return;

    const item = currentList.splice(index, 1)[0];

    if (action === 'top') {
      currentList.unshift(item);
    } else if (action === 'up') {
      const newIdx = Math.max(0, index - 1);
      currentList.splice(newIdx, 0, item);
    } else if (action === 'down') {
      const newIdx = Math.min(currentList.length, index + 1);
      currentList.splice(newIdx, 0, item);
    } else if (typeof action === 'number') {
      const targetIdx = Math.max(0, Math.min(currentList.length, action - 1));
      currentList.splice(targetIdx, 0, item);
    }

    const payload = currentList.map((g, idx) => ({
      id: g.id,
      sortWeight: idx + 1,
    }));

    try {
      await fetch(`${API_BASE}/v1/admin/feed/order`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: payload }),
      });
      await fetchGames();
    } catch (err) {}
  };

  // Handle Feed Sort Weight Change
  const updateFeedWeight = async (gameId: string, weight: number) => {
    await reorderGame(gameId, weight);
  };

  // Open Touch Zone Configuration for a Game
  const openTouchEditor = (game: GameItem) => {
    setEditingTouchGame(game);
    setTouchZonesList(game.touchZones ? JSON.parse(JSON.stringify(game.touchZones)) : []);
    setTouchSaveMsg(null);
    setActiveTab('gestures');
  };

  // Save Touch Configuration to Server API
  const saveTouchZones = async () => {
    if (!editingTouchGame) return;
    setSavingTouch(true);
    try {
      const res = await fetch(`${API_BASE}/v1/admin/games/${editingTouchGame.id}/touch-zones`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ touchZones: touchZonesList }),
      });
      if (res.ok) {
        setTouchSaveMsg(`✨ Touch block area for "${editingTouchGame.title}" saved to live catalog!`);
        await fetchGames();
      } else {
        setTouchSaveMsg('❌ Failed to save touch configuration.');
      }
    } catch (err: any) {
      setTouchSaveMsg(`❌ Network Error: ${err.message}`);
    } finally {
      setSavingTouch(false);
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-main)' }}>
      {/* Sidebar */}
      <aside style={{
        width: '260px',
        borderRight: '1px solid var(--border-subtle)',
        background: 'rgba(15, 23, 42, 0.6)',
        backdropFilter: 'blur(20px)',
        display: 'flex',
        flexDirection: 'column',
        padding: '24px 16px',
        gap: '24px'
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '0 8px' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #6366f1, #ec4899)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 20px rgba(99, 102, 241, 0.4)'
          }}>
            <Gamepad2 size={22} color="#fff" />
          </div>
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: '800', letterSpacing: '-0.5px' }}>SWIPE PLAY</h1>
            <p style={{ fontSize: '11px', color: 'var(--accent-cyan)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px' }}>
              Operator Studio
            </p>
          </div>
        </div>

        {/* Navigation */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {[
            { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
            { id: 'games', label: 'Game Catalog', icon: Layers },
            { id: 'upload', label: 'Upload New Game', icon: UploadCloud },
            { id: 'update', label: 'Update Game Code', icon: RefreshCw },
            { id: 'gestures', label: 'Touch & Swipe Locks', icon: ShieldCheck },
            { id: 'ads', label: 'Ads & Monetization', icon: Megaphone },
            { id: 'simulator', label: 'Device Simulator', icon: Smartphone },
            { id: 'feed', label: 'Feed Sequencer', icon: ListOrdered },
            { id: 'reports', label: 'Reports Queue', icon: AlertTriangle, count: reports.length },
          ].map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as any)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 16px',
                  borderRadius: '12px',
                  border: 'none',
                  background: isActive ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(99, 102, 241, 0.05))' : 'transparent',
                  color: isActive ? '#818cf8' : 'var(--text-muted)',
                  borderLeft: isActive ? '3px solid #6366f1' : '3px solid transparent',
                  fontWeight: isActive ? 600 : 500,
                  fontSize: '14px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                }}
              >
                <Icon size={18} color={isActive ? '#818cf8' : 'currentColor'} />
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.count !== undefined && item.count > 0 && (
                  <span style={{
                    background: 'rgba(239, 68, 68, 0.2)',
                    color: '#f87171',
                    fontSize: '11px',
                    padding: '2px 8px',
                    borderRadius: '10px',
                    fontWeight: 700
                  }}>
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* System Health Status Footer */}
        <div style={{ marginTop: 'auto', padding: '16px', borderRadius: '12px', background: 'rgba(0, 0, 0, 0.3)', border: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981' }} />
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#34d399' }}>Fastify + CDN Online</span>
          </div>
          <p style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
            Port 3000 • Localhost Storage
          </p>
        </div>
      </aside>

      {/* Main Content Area */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        {/* Top Header */}
        <header style={{
          height: '70px',
          borderBottom: '1px solid var(--border-subtle)',
          padding: '0 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(15, 23, 42, 0.3)',
          backdropFilter: 'blur(10px)',
          position: 'sticky',
          top: 0,
          zIndex: 40
        }}>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: '700' }}>
              {activeTab === 'dashboard' && 'Platform Performance & Metrics'}
              {activeTab === 'games' && 'Game Catalog & Staged Rollouts'}
              {activeTab === 'upload' && 'Package Ingestion & 7-Point Validator'}
              {activeTab === 'simulator' && 'Interactive Device Simulator & Bridge Debugger'}
              {activeTab === 'feed' && 'TikTok Feed Sequencer & Weights'}
              {activeTab === 'reports' && 'User Reports & Moderation'}
            </h2>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button className="btn-secondary" onClick={fetchGames}>
              <RefreshCw size={15} /> Refresh
            </button>
            <button className="btn-primary" onClick={() => setActiveTab('simulator')}>
              <Smartphone size={16} /> Open Simulator
            </button>
          </div>
        </header>

        {/* Tab Views */}
        <div style={{ padding: '32px', flex: 1 }}>
          {/* 1. DASHBOARD VIEW */}
          {activeTab === 'dashboard' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
              {/* Stat Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
                <div className="glass-panel" style={{ padding: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', color: 'var(--text-muted)' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>ACTIVE GAMES</span>
                    <Gamepad2 size={20} color="#818cf8" />
                  </div>
                  <div style={{ fontSize: '32px', fontWeight: 800, margin: '12px 0 4px', color: '#fff' }}>
                    {games.filter((g) => g.status === 'published').length} / {games.length}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#34d399' }}>
                    <Sparkles size={13} /> Ready for instant swipe
                  </div>
                </div>

                <div className="glass-panel" style={{ padding: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', color: 'var(--text-muted)' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>SWIPE-THROUGH RATE</span>
                    <TrendingUp size={20} color="#06b6d4" />
                  </div>
                  <div style={{ fontSize: '32px', fontWeight: 800, margin: '12px 0 4px', color: '#06b6d4' }}>
                    18.4%
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#34d399' }}>
                    <span>Target &lt; 35% (Healthy)</span>
                  </div>
                </div>

                <div className="glass-panel" style={{ padding: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', color: 'var(--text-muted)' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>AVG GAMEPLAY FPS</span>
                    <Zap size={20} color="#f59e0b" />
                  </div>
                  <div style={{ fontSize: '32px', fontWeight: 800, margin: '12px 0 4px', color: '#f59e0b' }}>
                    59.8
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#34d399' }}>
                    <CheckCircle2 size={13} /> 60 FPS Target Met
                  </div>
                </div>

                <div className="glass-panel" style={{ padding: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', color: 'var(--text-muted)' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>LOAD FAILURE RATE</span>
                    <ShieldCheck size={20} color="#10b981" />
                  </div>
                  <div style={{ fontSize: '32px', fontWeight: 800, margin: '12px 0 4px', color: '#10b981' }}>
                    0.08%
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#34d399' }}>
                    <span>Floor &lt; 0.5% (Optimal)</span>
                  </div>
                </div>
              </div>

              {/* Game Cards Summary Grid */}
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px' }}>Current Catalogue Running Order</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
                  {games.map((game, idx) => (
                    <div key={game.id} className="glass-panel-interactive" style={{ padding: '20px' }}>
                      <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                        <div style={{
                          width: '64px',
                          height: '80px',
                          borderRadius: '10px',
                          overflow: 'hidden',
                          background: '#1e293b',
                          flexShrink: 0
                        }}>
                          <img
                            src={game.thumbnailUrl.startsWith('http') ? game.thumbnailUrl : `${API_BASE}${game.thumbnailUrl}`}
                            alt={game.title}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={(e) => {
                              (e.target as any).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="80"><rect width="64" height="80" fill="%23334155"/></svg>';
                            }}
                          />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent-cyan)' }}>#{idx + 1}</span>
                            <span className={`badge ${game.status === 'published' ? 'badge-published' : 'badge-archived'}`}>
                              {game.status}
                            </span>
                          </div>
                          <h4 style={{ fontSize: '16px', fontWeight: 700, margin: '4px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {game.title}
                          </h4>
                          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            Weight: {game.sortWeight} • {game.controls.join(', ')}
                          </p>
                        </div>
                      </div>

                      <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                        <button
                          className="btn-secondary"
                          style={{ flex: 1, justifyContent: 'center', padding: '8px' }}
                          onClick={() => {
                            setSimGame(game.slug);
                            setActiveTab('simulator');
                          }}
                        >
                          <Smartphone size={14} /> Test
                        </button>
                        <button
                          className="btn-secondary"
                          style={{ flex: 1, justifyContent: 'center', padding: '8px' }}
                          onClick={() => viewValidation(game.id)}
                        >
                          <ShieldCheck size={14} /> Report
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 2. GAME CATALOG VIEW */}
          {activeTab === 'games' && (
            <div className="glass-panel" style={{ padding: '24px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontSize: '13px' }}>
                    <th style={{ padding: '12px 16px' }}>GAME</th>
                    <th style={{ padding: '12px 16px' }}>STATUS</th>
                    <th style={{ padding: '12px 16px' }}>ROLLOUT</th>
                    <th style={{ padding: '12px 16px' }}>FEED POSITION</th>
                    <th style={{ padding: '12px 16px' }}>PACKAGE SIZE</th>
                    <th style={{ padding: '12px 16px' }}>UPDATED</th>
                    <th style={{ padding: '12px 16px' }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {games.slice().sort((a, b) => (a.sortWeight ?? 0) - (b.sortWeight ?? 0)).map((game) => {
                    const latest = game.versions[0];
                    return (
                      <tr key={game.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '14px' }}>
                        <td style={{ padding: '16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ width: '40px', height: '50px', borderRadius: '8px', background: '#1e293b', overflow: 'hidden' }}>
                              <img src={game.thumbnailUrl.startsWith('http') ? game.thumbnailUrl : `${API_BASE}${game.thumbnailUrl}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            </div>
                            <div>
                              <div style={{ fontWeight: 700 }}>{game.title}</div>
                              <div style={{ fontSize: '12px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>{game.slug} (v{latest?.version || '1.0.0'})</div>
                            </div>
                          </div>
                        </td>

                        <td style={{ padding: '16px' }}>
                          <span className={`badge ${game.status === 'published' ? 'badge-published' : 'badge-archived'}`}>
                            {game.status === 'published' ? 'PUBLISHED' : 'DEACTIVATED'}
                          </span>
                        </td>

                        <td style={{ padding: '16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <input
                              type="range"
                              min="1"
                              max="100"
                              value={latest?.rolloutPercent || 100}
                              onChange={(e) => updateRollout(game.id, parseInt(e.target.value))}
                              style={{ width: '90px' }}
                            />
                            <span style={{ fontSize: '13px', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                              {latest?.rolloutPercent || 100}%
                            </span>
                          </div>
                        </td>

                        <td style={{ padding: '16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{
                              fontSize: '13px',
                              fontWeight: 800,
                              color: 'var(--accent-cyan)',
                              background: 'rgba(6, 182, 212, 0.15)',
                              padding: '3px 8px',
                              borderRadius: '6px',
                              border: '1px solid rgba(6, 182, 212, 0.3)',
                              fontFamily: 'var(--font-mono)',
                              minWidth: '32px',
                              textAlign: 'center'
                            }}>
                              #{game.sortWeight}
                            </span>
                            <button
                              className="btn-secondary"
                              style={{ padding: '4px 6px', fontSize: '10px' }}
                              onClick={() => reorderGame(game.id, 'up')}
                              title="Move Up in Feed"
                            >
                              ▲
                            </button>
                            <button
                              className="btn-secondary"
                              style={{ padding: '4px 6px', fontSize: '10px' }}
                              onClick={() => reorderGame(game.id, 'down')}
                              title="Move Down in Feed"
                            >
                              ▼
                            </button>
                            <button
                              className="btn-secondary"
                              style={{ padding: '4px 8px', fontSize: '11px', color: '#fbbf24', background: 'rgba(251, 191, 36, 0.1)' }}
                              onClick={() => reorderGame(game.id, 'top')}
                              title="Pin to Top (#1 Position on App Feed)"
                            >
                              📌 #1
                            </button>
                          </div>
                        </td>

                        <td style={{ padding: '16px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                          {latest ? `${(latest.sizeBytes / 1024).toFixed(1)} KB` : 'N/A'}
                        </td>

                        <td style={{ padding: '16px', fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          {game.updatedAt ? (
                            <div>
                              <div style={{ color: '#e2e8f0', fontWeight: 600 }}>
                                {new Date(game.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                                {new Date(game.updatedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </div>
                          ) : (
                            <span style={{ color: 'var(--text-dim)' }}>Pre-installed</span>
                          )}
                        </td>

                        <td style={{ padding: '16px' }}>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            <button
                              className="btn-secondary"
                              style={{ padding: '6px 10px', fontSize: '12px', background: 'rgba(99, 102, 241, 0.2)', border: '1px solid #6366f1', color: '#a5b4fc' }}
                              onClick={() => {
                                setUpdateGameTarget(game);
                                setActiveTab('update');
                              }}
                              title="Upload New Code / Version for this game"
                            >
                              <UploadCloud size={13} /> Update
                            </button>
                            <button
                              className={game.features?.hint ? 'btn-primary' : 'btn-secondary'}
                              style={{ padding: '6px 10px', fontSize: '12px', background: game.features?.hint ? 'rgba(251, 191, 36, 0.2)' : undefined, border: game.features?.hint ? '1px solid #f59e0b' : undefined, color: game.features?.hint ? '#fbbf24' : undefined }}
                              onClick={() => toggleGameHint(game.id, !!game.features?.hint)}
                              title="Toggle Rewarded Hint Button for this game"
                            >
                              💡 Hint: {game.features?.hint ? 'ON' : 'OFF'}
                            </button>
                            <button
                              className="btn-secondary"
                              style={{ padding: '6px 10px', fontSize: '12px' }}
                              onClick={() => openTouchEditor(game)}
                            >
                              <ShieldCheck size={13} /> Touch
                            </button>
                            <button
                              className="btn-secondary"
                              style={{ padding: '6px 10px', fontSize: '12px' }}
                              onClick={() => {
                                setSimGame(game.slug);
                                setActiveTab('simulator');
                              }}
                            >
                              <Smartphone size={13} /> Test
                            </button>
                            <button
                              className="btn-secondary"
                              style={{ padding: '6px 10px', fontSize: '12px' }}
                              onClick={() => viewValidation(game.id)}
                            >
                              <ShieldCheck size={13} /> Check
                            </button>
                            <button
                              className={game.status === 'published' ? 'btn-danger' : 'btn-primary'}
                              style={{ padding: '6px 10px', fontSize: '12px' }}
                              onClick={() => toggleGameStatus(game.id, game.status)}
                            >
                              <Power size={13} /> {game.status === 'published' ? 'Deactivate' : 'Activate'}
                            </button>
                            <button
                              className="btn-danger"
                              style={{ padding: '6px 10px', fontSize: '12px', background: 'rgba(239, 68, 68, 0.2)', border: '1px solid #ef4444' }}
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
          )}

          {/* 3. UPLOAD NEW GAME VIEW */}
          {activeTab === 'upload' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
              {/* Upload Box */}
              <div className="glass-panel" style={{ padding: '28px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <div style={{ padding: '8px', background: 'rgba(99, 102, 241, 0.2)', borderRadius: '8px' }}>
                    <UploadCloud size={20} color="#818cf8" />
                  </div>
                  <h3 style={{ fontSize: '18px', fontWeight: 700 }}>Upload New Game Package</h3>
                </div>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px' }}>
                  Upload a fresh .ZIP game package. The system auto-extracts manifest metadata, builds SHA-256 signatures, and publishes it into the catalog.
                </p>

                <div style={{
                  border: '2px dashed var(--border-active)',
                  borderRadius: '16px',
                  padding: '44px 20px',
                  textAlign: 'center',
                  background: 'rgba(99, 102, 241, 0.03)',
                  cursor: 'pointer',
                  position: 'relative'
                }}>
                  <input
                    type="file"
                    accept=".zip"
                    onChange={(e) => {
                      setSelectedGame(null);
                      handleFileUpload(e);
                    }}
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
                  />
                  <UploadCloud size={44} color="#818cf8" style={{ marginBottom: '12px' }} />
                  <div style={{ fontWeight: 700, fontSize: '16px' }}>
                    {uploading ? 'Processing & Validating Build...' : 'Drag and Drop New Game .ZIP Package Here'}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '6px' }}>
                    HTML5 / Canvas2D / Phaser bundle (&lt; 10 MB)
                  </div>
                </div>

                {uploadSuccess && (
                  <div style={{
                    marginTop: '16px',
                    padding: '14px 18px',
                    background: uploadSuccess.startsWith('✨') ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    border: `1px solid ${uploadSuccess.startsWith('✨') ? '#10b981' : '#ef4444'}`,
                    borderRadius: '10px',
                    color: uploadSuccess.startsWith('✨') ? '#34d399' : '#f87171',
                    fontSize: '13px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}>
                      {uploadSuccess.startsWith('✨') ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                      {uploadSuccess}
                    </div>
                    {!uploadSuccess.startsWith('✨') && (
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '26px' }}>
                        👉 Please check the 7-Point Verification Checklist on the right to see which rule failed and fix your ZIP file.
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* 7-Point Automatic Validation Report */}
              <div className="glass-panel" style={{ padding: '28px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: 700 }}>7-Point Verification Report</h3>
                  {validationReport && (
                    <span className={`badge ${validationReport.allPassed ? 'badge-published' : 'badge-archived'}`}>
                      {validationReport.allPassed ? 'ALL CHECKS PASSED' : 'CHECK FAILED'}
                    </span>
                  )}
                </div>

                {validationReport ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                      Target: <strong style={{ color: '#fff' }}>{validationReport.slug} (v{validationReport.version})</strong>
                    </div>

                    {validationReport.checks.map((check, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: '12px 16px',
                          borderRadius: '10px',
                          background: 'rgba(0,0,0,0.25)',
                          border: '1px solid var(--border-subtle)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          {check.passed ? <CheckCircle2 size={18} color="#34d399" /> : <XCircle size={18} color="#ef4444" />}
                          <span style={{ fontSize: '14px', fontWeight: 600 }}>{check.rule}</span>
                        </div>
                        <span style={{ fontSize: '12px', color: check.passed ? 'var(--text-muted)' : '#f87171', fontFamily: 'var(--font-mono)' }}>
                          {check.message}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-dim)' }}>
                    <ShieldCheck size={40} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
                    <p>Upload a game package to run the automatic 7-point validation audit.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 3.1 UPDATE EXISTING GAME CODE VIEW */}
          {activeTab === 'update' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
              <div className="glass-panel" style={{ padding: '28px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <div style={{ padding: '8px', background: 'rgba(245, 158, 11, 0.2)', borderRadius: '8px' }}>
                    <RefreshCw size={20} color="#f59e0b" />
                  </div>
                  <h3 style={{ fontSize: '18px', fontWeight: 700 }}>Update Existing Game Code</h3>
                </div>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px' }}>
                  Replace game code or release a new version for an existing game without deleting its stats, ratings, or ID.
                </p>

                {/* Game Selector Dropdown */}
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 700, display: 'block', marginBottom: '8px', color: '#e2e8f0' }}>
                    Select Game to Update:
                  </label>
                  <select
                    value={updateGameTarget?.id || selectedGame?.id || ''}
                    onChange={(e) => {
                      const found = games.find((g) => g.id === e.target.value);
                      setUpdateGameTarget(found || null);
                      setSelectedGame(found || null);
                    }}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      background: 'rgba(0,0,0,0.5)',
                      border: '1px solid var(--border-active)',
                      borderRadius: '10px',
                      color: '#fff',
                      fontSize: '14px',
                      fontWeight: 600
                    }}
                  >
                    <option value="">-- Choose a Game from Catalog ({games.length} available) --</option>
                    {games.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.title} ({g.slug}) — v{g.versions[0]?.version || '1.0.0'}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Target Game Summary Card */}
                {(updateGameTarget || selectedGame) && (
                  <div style={{
                    padding: '16px',
                    background: 'rgba(99, 102, 241, 0.08)',
                    border: '1px solid rgba(99, 102, 241, 0.3)',
                    borderRadius: '12px',
                    marginBottom: '20px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '48px', height: '48px', borderRadius: '10px', background: '#1e293b', overflow: 'hidden' }}>
                        <img
                          src={(updateGameTarget || selectedGame)!.thumbnailUrl.startsWith('http') ? (updateGameTarget || selectedGame)!.thumbnailUrl : `${API_BASE}${(updateGameTarget || selectedGame)!.thumbnailUrl}`}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      </div>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '15px' }}>{(updateGameTarget || selectedGame)!.title}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          ID: <span style={{ fontFamily: 'var(--font-mono)', color: '#818cf8' }}>{(updateGameTarget || selectedGame)!.id}</span> • Current: <span style={{ color: '#34d399', fontWeight: 700 }}>v{(updateGameTarget || selectedGame)!.versions[0]?.version || '1.0.0'}</span>
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '3px' }}>
                          Last Updated: {(updateGameTarget || selectedGame)!.updatedAt ? new Date((updateGameTarget || selectedGame)!.updatedAt!).toLocaleString() : 'Pre-installed'}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Update Dropzone */}
                <div style={{
                  border: '2px dashed #f59e0b',
                  borderRadius: '16px',
                  padding: '36px 20px',
                  textAlign: 'center',
                  background: 'rgba(245, 158, 11, 0.03)',
                  cursor: (updateGameTarget || selectedGame) ? 'pointer' : 'not-allowed',
                  opacity: (updateGameTarget || selectedGame) ? 1 : 0.6,
                  position: 'relative'
                }}>
                  <input
                    type="file"
                    accept=".zip"
                    disabled={!updateGameTarget && !selectedGame}
                    onChange={handleFileUpload}
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: (updateGameTarget || selectedGame) ? 'pointer' : 'not-allowed' }}
                  />
                  <RefreshCw size={40} color="#f59e0b" style={{ marginBottom: '12px' }} />
                  <div style={{ fontWeight: 700, fontSize: '15px' }}>
                    {(updateGameTarget || selectedGame) ? `Upload New ZIP for "${(updateGameTarget || selectedGame)!.title}"` : 'Please select a game first above'}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '6px' }}>
                    Replaces game assets &amp; code live on the server
                  </div>
                </div>

                {uploadSuccess && (
                  <div style={{
                    marginTop: '16px',
                    padding: '14px 18px',
                    background: uploadSuccess.startsWith('✨') ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    border: `1px solid ${uploadSuccess.startsWith('✨') ? '#10b981' : '#ef4444'}`,
                    borderRadius: '10px',
                    color: uploadSuccess.startsWith('✨') ? '#34d399' : '#f87171',
                    fontSize: '13px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}>
                      {uploadSuccess.startsWith('✨') ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                      {uploadSuccess}
                    </div>
                  </div>
                )}
              </div>

              {/* 7-Point Automatic Validation Report */}
              <div className="glass-panel" style={{ padding: '28px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: 700 }}>Update Verification Report</h3>
                  {validationReport && (
                    <span className={`badge ${validationReport.allPassed ? 'badge-published' : 'badge-archived'}`}>
                      {validationReport.allPassed ? 'UPDATE READY' : 'CHECK FAILED'}
                    </span>
                  )}
                </div>

                {validationReport ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                      Updated Target: <strong style={{ color: '#fff' }}>{validationReport.slug} (v{validationReport.version})</strong>
                    </div>

                    {validationReport.checks.map((check, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: '12px 16px',
                          borderRadius: '10px',
                          background: 'rgba(0,0,0,0.25)',
                          border: '1px solid var(--border-subtle)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          {check.passed ? <CheckCircle2 size={18} color="#34d399" /> : <XCircle size={18} color="#ef4444" />}
                          <span style={{ fontSize: '14px', fontWeight: 600 }}>{check.rule}</span>
                        </div>
                        <span style={{ fontSize: '12px', color: check.passed ? 'var(--text-muted)' : '#f87171', fontFamily: 'var(--font-mono)' }}>
                          {check.message}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-dim)' }}>
                    <RefreshCw size={40} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
                    <p>Select a game and drop a new build to inspect the update validation checklist.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 4. SIMULATOR & BRIDGE INSPECTOR VIEW */}
          {activeTab === 'simulator' && (
            <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr', gap: '32px', alignItems: 'flex-start' }}>
              {/* Phone Frame */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                <div style={{ width: '100%', display: 'flex', gap: '12px' }}>
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
                      padding: '10px 14px',
                      background: 'rgba(0,0,0,0.4)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '10px',
                      color: '#fff',
                      fontSize: '14px',
                      fontWeight: 600
                    }}
                  >
                    {games.map((g) => (
                      <option key={g.slug} value={g.slug}>{g.title} ({g.slug})</option>
                    ))}
                  </select>

                  <button
                    className="btn-secondary"
                    style={{ padding: '10px 14px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}
                    onClick={() => setSimRefreshKey(Date.now())}
                    title="Force reload game canvas without cache"
                  >
                    <RefreshCw size={14} /> Reload
                  </button>
                </div>

                {/* Device Bezel */}
                <div className="device-frame">
                  <div className="device-notch" />
                  <iframe
                    ref={simIframeRef}
                    key={`${simGame}-${simRefreshKey}`}
                    src={`${API_BASE}/games/${simGame}/${games.find(g => g.slug === simGame || g.id === simGame)?.versions[0]?.version || '1.1.0'}/index.html?t=${simRefreshKey}`}
                    className="device-screen"
                    title="Game Preview"
                  />
                </div>
              </div>

              {/* Bridge Inspector Panel */}
              <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', height: '760px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Activity size={18} color="#818cf8" /> Live Bridge Protocol Stream
                  </h3>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <span style={{ fontSize: '13px', color: 'var(--accent-cyan)', fontWeight: 700 }}>
                      Score: {simScore}
                    </span>
                    <span style={{ fontSize: '13px', color: '#fbbf24', fontWeight: 700 }}>
                      Level: {simLevel}
                    </span>
                  </div>
                </div>

                {/* Host Action Controls */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', paddingBottom: '16px', borderBottom: '1px solid var(--border-subtle)' }}>
                  <button className="btn-secondary" style={{ padding: '8px 12px', fontSize: '12px' }} onClick={() => sendSimulatorEvent('PAUSE_GAME')}>
                    <Pause size={13} /> PAUSE_GAME
                  </button>
                  <button className="btn-secondary" style={{ padding: '8px 12px', fontSize: '12px' }} onClick={() => sendSimulatorEvent('RESUME_GAME')}>
                    <Play size={13} /> RESUME_GAME
                  </button>
                  <button className="btn-secondary" style={{ padding: '8px 12px', fontSize: '12px' }} onClick={() => {
                    const nextMute = !simIsMuted;
                    setSimIsMuted(nextMute);
                    sendSimulatorEvent(nextMute ? 'MUTE_AUDIO' : 'UNMUTE_AUDIO');
                  }}>
                    {simIsMuted ? <Volume2 size={13} /> : <VolumeX size={13} />} {simIsMuted ? 'UNMUTE_AUDIO' : 'MUTE_AUDIO'}
                  </button>
                  <button className="btn-secondary" style={{ padding: '8px 12px', fontSize: '12px' }} onClick={() => sendSimulatorEvent('RESTART_GAME')}>
                    <RotateCcw size={13} /> RESTART_GAME
                  </button>
                  <button className="btn-secondary" style={{ padding: '8px 12px', fontSize: '12px' }} onClick={() => setBridgeLogs([])}>
                    Clear Log
                  </button>
                </div>

                {/* Live Event Log Stream */}
                <div style={{ flex: 1, overflowY: 'auto', marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {bridgeLogs.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '40px' }}>
                      Interact with the device simulator to inspect live JSON message envelopes.
                    </div>
                  ) : (
                    bridgeLogs.map((log) => (
                      <div
                        key={log.id}
                        style={{
                          padding: '10px 14px',
                          borderRadius: '8px',
                          background: log.direction === 'in' ? 'rgba(6, 182, 212, 0.06)' : 'rgba(99, 102, 241, 0.06)',
                          borderLeft: log.direction === 'in' ? '3px solid #06b6d4' : '3px solid #818cf8',
                          fontSize: '12px',
                          fontFamily: 'var(--font-mono)'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ fontWeight: 700, color: log.direction === 'in' ? '#06b6d4' : '#818cf8' }}>
                            {log.direction === 'in' ? '◀ GAME ➔ APP' : '▶ APP ➔ GAME'}: {log.type}
                          </span>
                          <span style={{ color: 'var(--text-dim)' }}>{log.ts}</span>
                        </div>
                        <div style={{ color: 'var(--text-muted)', overflowX: 'auto' }}>
                          {JSON.stringify(log.payload)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 5. FEED SEQUENCER VIEW */}
          {activeTab === 'feed' && (
            <div className="glass-panel" style={{ padding: '28px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '6px' }}>App Swipe Feed Sequencer & Running Order</h3>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                    Control the exact order games appear in the mobile app feed. <strong>Position #1</strong> is the first game shown when the app opens. Newly uploaded games automatically start at <strong>#1</strong>.
                  </p>
                </div>
                <div style={{ background: 'rgba(6, 182, 212, 0.1)', border: '1px solid rgba(6, 182, 212, 0.3)', padding: '8px 16px', borderRadius: '10px', fontSize: '13px', color: 'var(--accent-cyan)', fontWeight: 600 }}>
                  🎮 Total Games: {games.length}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {games
                  .slice()
                  .sort((a, b) => (a.sortWeight ?? 0) - (b.sortWeight ?? 0))
                  .map((game, idx) => (
                    <div
                      key={game.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '16px 20px',
                        background: idx === 0 ? 'rgba(6, 182, 212, 0.08)' : 'rgba(0,0,0,0.3)',
                        borderRadius: '12px',
                        border: idx === 0 ? '1px solid rgba(6, 182, 212, 0.4)' : '1px solid var(--border-subtle)',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{
                          fontSize: '16px',
                          fontWeight: 800,
                          color: idx === 0 ? '#fbbf24' : 'var(--accent-cyan)',
                          background: idx === 0 ? 'rgba(251, 191, 36, 0.15)' : 'rgba(6, 182, 212, 0.12)',
                          padding: '6px 12px',
                          borderRadius: '8px',
                          border: idx === 0 ? '1px solid rgba(251, 191, 36, 0.3)' : '1px solid rgba(6, 182, 212, 0.2)',
                          minWidth: '46px',
                          textAlign: 'center',
                          fontFamily: 'var(--font-mono)'
                        }}>
                          #{idx + 1}
                        </div>
                        <div style={{ width: '48px', height: '60px', borderRadius: '8px', background: '#1e293b', overflow: 'hidden' }}>
                          <img src={game.thumbnailUrl.startsWith('http') ? game.thumbnailUrl : `${API_BASE}${game.thumbnailUrl}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h4 style={{ fontSize: '16px', fontWeight: 700 }}>{game.title}</h4>
                            {idx === 0 && (
                              <span style={{ fontSize: '11px', background: 'rgba(251, 191, 36, 0.2)', color: '#fbbf24', border: '1px solid #f59e0b', padding: '2px 8px', borderRadius: '10px', fontWeight: 700 }}>
                                🌟 FIRST ON APP LOAD
                              </span>
                            )}
                            <span className={`badge ${game.status === 'published' ? 'badge-published' : 'badge-archived'}`} style={{ fontSize: '10px', padding: '2px 6px' }}>
                              {game.status}
                            </span>
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                            {game.slug} • Tags: {game.tags.join(', ')} • Engine: {game.orientation}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <button
                          className="btn-secondary"
                          style={{ padding: '8px 12px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px' }}
                          onClick={() => reorderGame(game.id, 'up')}
                          disabled={idx === 0}
                          title="Move Up 1 Position"
                        >
                          ▲ Up
                        </button>
                        <button
                          className="btn-secondary"
                          style={{ padding: '8px 12px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px' }}
                          onClick={() => reorderGame(game.id, 'down')}
                          disabled={idx === games.length - 1}
                          title="Move Down 1 Position"
                        >
                          ▼ Down
                        </button>
                        {idx !== 0 && (
                          <button
                            className="btn-secondary"
                            style={{ padding: '8px 14px', fontSize: '13px', color: '#fbbf24', background: 'rgba(251, 191, 36, 0.12)', border: '1px solid rgba(251, 191, 36, 0.3)', fontWeight: 600 }}
                            onClick={() => reorderGame(game.id, 'top')}
                            title="Make this the #1 Game in App"
                          >
                            📌 Pin #1
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* 6. REPORTS QUEUE VIEW */}
          {activeTab === 'reports' && (
            <div className="glass-panel" style={{ padding: '28px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>User Game Moderation Reports</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '24px' }}>
                Review reports submitted by players during gameplay.
              </p>

              {reports.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-dim)' }}>
                  <CheckCircle2 size={40} color="#34d399" style={{ margin: '0 auto 12px' }} />
                  <p>All clean! Zero pending moderation reports.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {reports.map((rep) => (
                    <div
                      key={rep.id}
                      style={{
                        padding: '16px 20px',
                        background: 'rgba(0,0,0,0.3)',
                        borderRadius: '12px',
                        border: '1px solid var(--border-subtle)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <span style={{ fontWeight: 700, fontSize: '15px' }}>{rep.game?.title || rep.gameId}</span>
                          <span className="badge badge-archived">{rep.reason}</span>
                        </div>
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{rep.note || 'No user note provided.'}</p>
                      </div>
                      <button className="btn-secondary" style={{ fontSize: '12px' }}>
                        Dismiss
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 7. DYNAMIC TOUCH & SWIPE LOCKS VIEW */}
          {activeTab === 'gestures' && (
            <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: '32px', alignItems: 'flex-start' }}>
              {/* Left Column: Phone Frame with Superimposed Touch Bounding Box */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                <div style={{ width: '100%', display: 'flex', gap: '12px' }}>
                  <select
                    value={editingTouchGame?.id || (games[0]?.id || '')}
                    onChange={(e) => {
                      const found = games.find((g) => g.id === e.target.value);
                      if (found) openTouchEditor(found);
                    }}
                    style={{
                      flex: 1,
                      padding: '10px 14px',
                      background: 'rgba(0,0,0,0.4)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '10px',
                      color: '#fff',
                      fontSize: '14px',
                      fontWeight: 600
                    }}
                  >
                    {games.map((g) => (
                      <option key={g.id} value={g.id}>{g.title} ({g.slug})</option>
                    ))}
                  </select>
                </div>

                <div className="device-frame" style={{ position: 'relative' }}>
                  <div className="device-notch" />
                  <iframe
                    key={editingTouchGame?.slug || 'preview'}
                    src={`${API_BASE}/games/${editingTouchGame?.slug || games[0]?.slug || 'tap-cannon'}/${editingTouchGame?.versions[0]?.version || '1.1.0'}/index.html`}
                    className="device-screen"
                    title="Touch Preview"
                  />

                  {/* Visual Translucent Bounding Box Overlays */}
                  {touchZonesList.map((zone, idx) => (
                    <div
                      key={idx}
                      style={{
                        position: 'absolute',
                        left: `${zone.x * 100}%`,
                        top: `${zone.y * 100}%`,
                        width: `${zone.width * 100}%`,
                        height: `${zone.height * 100}%`,
                        background: 'rgba(239, 68, 68, 0.35)',
                        border: '2px solid #ef4444',
                        boxShadow: '0 0 15px rgba(239, 68, 68, 0.6)',
                        borderRadius: '8px',
                        pointerEvents: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 30
                      }}
                    >
                      <span style={{
                        background: '#ef4444',
                        color: '#fff',
                        fontSize: '10px',
                        fontWeight: 800,
                        padding: '2px 6px',
                        borderRadius: '4px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                      }}>
                        🚫 {zone.name} (LOCKED)
                      </span>
                    </div>
                  ))}

                  {touchZonesList.length === 0 && (
                    <div style={{
                      position: 'absolute',
                      top: '12px',
                      right: '12px',
                      background: 'rgba(16, 185, 129, 0.9)',
                      color: '#fff',
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '4px 8px',
                      borderRadius: '6px',
                      zIndex: 30
                    }}>
                      🟢 100% FREE SWIPE
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Configuration & Presets */}
              <div className="glass-panel" style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div>
                  <h3 style={{ fontSize: '20px', fontWeight: 800 }}>
                    Configure Blocked Touch Portion: <span style={{ color: '#818cf8' }}>{editingTouchGame?.title || 'Game'}</span>
                  </h3>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Select which exact portion of the game screen blocks ViewPager2 from scrolling. Outside this box, the user can swipe to the next game freely!
                  </p>
                </div>

                {touchSaveMsg && (
                  <div style={{
                    padding: '12px 16px',
                    borderRadius: '8px',
                    background: touchSaveMsg.startsWith('✨') || touchSaveMsg.startsWith('✅') ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                    border: '1px solid currentColor',
                    color: touchSaveMsg.startsWith('✨') || touchSaveMsg.startsWith('✅') ? '#34d399' : '#f87171',
                    fontSize: '13px',
                    fontWeight: 600
                  }}>
                    {touchSaveMsg}
                  </div>
                )}

                {/* Fast Presets */}
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 700, display: 'block', marginBottom: '8px' }}>
                    Quick Preset Configurations:
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                    <button
                      className="btn-secondary"
                      style={{ justifyContent: 'flex-start', padding: '10px 14px' }}
                      onClick={() => setTouchZonesList([])}
                    >
                      🚫 <strong>None (100% Free Scroll)</strong>
                    </button>
                    <button
                      className="btn-secondary"
                      style={{ justifyContent: 'flex-start', padding: '10px 14px' }}
                      onClick={() => setTouchZonesList([
                        { name: 'Virtual Joystick', x: 0.0, y: 0.50, width: 0.55, height: 0.50 },
                        { name: 'Buttons', x: 0.65, y: 0.55, width: 0.35, height: 0.45 }
                      ])}
                    >
                      🕹️ <strong>Bottom Left Joystick</strong>
                    </button>
                    <button
                      className="btn-secondary"
                      style={{ justifyContent: 'flex-start', padding: '10px 14px' }}
                      onClick={() => setTouchZonesList([
                        { name: '4x4 Grid Board', x: 0.08, y: 0.20, width: 0.84, height: 0.54 }
                      ])}
                    >
                      ⚪ <strong>Center 4x4 Grid</strong>
                    </button>
                    <button
                      className="btn-secondary"
                      style={{ justifyContent: 'flex-start', padding: '10px 14px' }}
                      onClick={() => setTouchZonesList([
                        { name: 'Bow Aim Pull', x: 0.0, y: 0.40, width: 0.45, height: 0.40 }
                      ])}
                    >
                      🏹 <strong>Bow Pull Area</strong>
                    </button>
                    <button
                      className="btn-secondary"
                      style={{ justifyContent: 'flex-start', padding: '10px 14px' }}
                      onClick={() => setTouchZonesList([
                        { name: 'Blade Slicing Arena', x: 0.0, y: 0.15, width: 1.0, height: 0.75 }
                      ])}
                    >
                      ⚔️ <strong>Blade Slicing Arena</strong>
                    </button>
                    <button
                      className="btn-secondary"
                      style={{ justifyContent: 'flex-start', padding: '10px 14px' }}
                      onClick={() => setTouchZonesList([
                        { name: 'Basket Slider', x: 0.0, y: 0.65, width: 1.0, height: 0.35 }
                      ])}
                    >
                      🍎 <strong>Bottom Basket Area</strong>
                    </button>
                  </div>
                </div>

                {/* Active Zones Editor */}
                <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <label style={{ fontSize: '14px', fontWeight: 700 }}>Custom Bounding Box Controls ({touchZonesList.length}):</label>
                    <button
                      className="btn-secondary"
                      style={{ fontSize: '12px', padding: '6px 12px' }}
                      onClick={() => setTouchZonesList([...touchZonesList, { name: `Zone ${touchZonesList.length + 1}`, x: 0.1, y: 0.3, width: 0.8, height: 0.4 }])}
                    >
                      + Add Box
                    </button>
                  </div>

                  {touchZonesList.map((zone, idx) => (
                    <div key={idx} style={{ padding: '16px', background: 'rgba(0,0,0,0.3)', borderRadius: '10px', marginBottom: '12px', border: '1px solid var(--border-subtle)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <input
                          type="text"
                          value={zone.name}
                          onChange={(e) => {
                            const updated = [...touchZonesList];
                            updated[idx].name = e.target.value;
                            setTouchZonesList(updated);
                          }}
                          style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border-subtle)', color: '#fff', padding: '4px 8px', borderRadius: '6px', fontWeight: 700 }}
                        />
                        <button
                          className="btn-danger"
                          style={{ fontSize: '11px', padding: '4px 8px' }}
                          onClick={() => setTouchZonesList(touchZonesList.filter((_, i) => i !== idx))}
                        >
                          Remove
                        </button>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', fontSize: '12px' }}>
                        <div>
                          <label style={{ color: 'var(--text-muted)' }}>X (Left): {Math.round(zone.x * 100)}%</label>
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
                            style={{ width: '100%' }}
                          />
                        </div>
                        <div>
                          <label style={{ color: 'var(--text-muted)' }}>Y (Top): {Math.round(zone.y * 100)}%</label>
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
                            style={{ width: '100%' }}
                          />
                        </div>
                        <div>
                          <label style={{ color: 'var(--text-muted)' }}>Width: {Math.round(zone.width * 100)}%</label>
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
                            style={{ width: '100%' }}
                          />
                        </div>
                        <div>
                          <label style={{ color: 'var(--text-muted)' }}>Height: {Math.round(zone.height * 100)}%</label>
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
                            style={{ width: '100%' }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                  {/* Save Button */}
                <div style={{ marginTop: 'auto', display: 'flex', gap: '12px' }}>
                  <button
                    className="btn-primary"
                    style={{ flex: 1, justifyContent: 'center', padding: '14px', fontSize: '15px' }}
                    onClick={saveTouchZones}
                    disabled={savingTouch}
                  >
                    {savingTouch ? 'Saving to Server...' : '💾 Save Touch Configuration to Live Catalog'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 7. ADS & MONETIZATION REMOTE CONFIG VIEW */}
          {activeTab === 'ads' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '32px', alignItems: 'flex-start' }}>
              <div className="glass-panel" style={{ padding: '32px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                  <div style={{ padding: '10px', background: 'rgba(99, 102, 241, 0.2)', borderRadius: '12px', color: '#818cf8' }}>
                    <Megaphone size={24} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '20px', fontWeight: 800 }}>Ads &amp; Monetization Remote Config</h3>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                      Control AdMob unit IDs, swipe frequency, and rewarded hint rules live without app rebuilds.
                    </p>
                  </div>
                </div>

                {adsSavedMsg && (
                  <div style={{
                    padding: '14px 18px',
                    borderRadius: '10px',
                    background: adsSavedMsg.includes('✅') ? 'rgba(52, 211, 153, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    border: `1px solid ${adsSavedMsg.includes('✅') ? '#34d399' : '#ef4444'}`,
                    color: adsSavedMsg.includes('✅') ? '#34d399' : '#f87171',
                    marginBottom: '24px',
                    fontWeight: 600,
                    fontSize: '14px'
                  }}>
                    {adsSavedMsg}
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  {/* Banner Switch */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: 'rgba(0,0,0,0.3)', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
                    <div>
                      <h4 style={{ fontSize: '15px', fontWeight: 700 }}>Top Ad Banner</h4>
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Show adaptive banner ad at the top of game feed</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={adsConfig.bannerEnabled}
                      onChange={(e) => setAdsConfig({ ...adsConfig, bannerEnabled: e.target.checked })}
                      style={{ width: '22px', height: '22px', accentColor: '#6366f1', cursor: 'pointer' }}
                    />
                  </div>

                  {/* Interstitial Switch */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: 'rgba(0,0,0,0.3)', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
                    <div>
                      <h4 style={{ fontSize: '15px', fontWeight: 700 }}>Interstitial Swipe Ads</h4>
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Show full-screen ad after a certain number of game swipes</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={adsConfig.interstitialEnabled}
                      onChange={(e) => setAdsConfig({ ...adsConfig, interstitialEnabled: e.target.checked })}
                      style={{ width: '22px', height: '22px', accentColor: '#6366f1', cursor: 'pointer' }}
                    />
                  </div>

                  {/* Swipe Frequency Slider */}
                  <div style={{ padding: '16px', background: 'rgba(0,0,0,0.3)', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 700 }}>Swipe Frequency Interval</span>
                      <span style={{ fontSize: '14px', color: 'var(--accent-cyan)', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
                        Every {adsConfig.swipeInterval} Swipes
                      </span>
                    </div>
                    <input
                      type="range"
                      min="3"
                      max="25"
                      value={adsConfig.swipeInterval}
                      onChange={(e) => setAdsConfig({ ...adsConfig, swipeInterval: parseInt(e.target.value) || 10 })}
                      style={{ width: '100%' }}
                    />
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                      Controls how often full-screen ads appear when users swipe between games. Recommended: 10.
                    </p>
                  </div>

                  {/* Level Complete Ad Switch */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: 'rgba(0,0,0,0.3)', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
                    <div>
                      <h4 style={{ fontSize: '15px', fontWeight: 700 }}>Ad on Level Complete / Next Level</h4>
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Trigger interstitial ad when player completes levels in multi-level games</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={adsConfig.levelCompleteAd}
                      onChange={(e) => setAdsConfig({ ...adsConfig, levelCompleteAd: e.target.checked })}
                      style={{ width: '22px', height: '22px', accentColor: '#6366f1', cursor: 'pointer' }}
                    />
                  </div>

                  {/* Level Win Interval Slider */}
                  <div style={{ padding: '16px', background: 'rgba(0,0,0,0.3)', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 700 }}>Level Win Ad Frequency</span>
                      <span style={{ fontSize: '14px', color: '#34d399', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
                        Every {adsConfig.levelWinInterval} Wins
                      </span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="5"
                      value={adsConfig.levelWinInterval}
                      onChange={(e) => setAdsConfig({ ...adsConfig, levelWinInterval: parseInt(e.target.value) || 2 })}
                      style={{ width: '100%' }}
                    />
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                      Show interstitial ad after player wins N levels (e.g. every 2 wins or 3 wins, not on every single win).
                    </p>
                  </div>

                  {/* Game Over / Loss Ad Switch */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: 'rgba(0,0,0,0.3)', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
                    <div>
                      <h4 style={{ fontSize: '15px', fontWeight: 700 }}>Ad on Game Over / Loss</h4>
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Trigger interstitial ad when player loses or runs out of lives/time</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={adsConfig.gameOverAdEnabled}
                      onChange={(e) => setAdsConfig({ ...adsConfig, gameOverAdEnabled: e.target.checked })}
                      style={{ width: '22px', height: '22px', accentColor: '#6366f1', cursor: 'pointer' }}
                    />
                  </div>

                  {/* Cooldown Timer */}
                  <div style={{ padding: '16px', background: 'rgba(0,0,0,0.3)', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>
                      Ad Cooldown Limit (Seconds)
                    </label>
                    <input
                      type="number"
                      value={adsConfig.cooldownSeconds}
                      onChange={(e) => setAdsConfig({ ...adsConfig, cooldownSeconds: parseInt(e.target.value) || 0 })}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        background: 'rgba(0,0,0,0.4)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '8px',
                        color: '#fff',
                        fontFamily: 'var(--font-mono)'
                      }}
                    />
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                      Minimum time required between interstitial ads to protect user retention and prevent ad fatigue.
                    </p>
                  </div>
                </div>

                <button
                  className="btn-primary"
                  style={{ marginTop: '28px', width: '100%', padding: '16px', fontSize: '15px', justifyContent: 'center' }}
                  onClick={saveAdsConfig}
                  disabled={savingAds}
                >
                  {savingAds ? 'Deploying to Mobile App...' : '💾 Save & Deploy Ads Configuration'}
                </button>
              </div>

              {/* AdMob IDs Box */}
              <div className="glass-panel" style={{ padding: '28px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>Google AdMob Unit IDs</h3>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '20px' }}>
                  Update production or test AdMob unit IDs remotely.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>
                      AdMob App ID
                    </label>
                    <input
                      type="text"
                      value={adsConfig.adMobAppId}
                      onChange={(e) => setAdsConfig({ ...adsConfig, adMobAppId: e.target.value })}
                      style={{ width: '100%', padding: '10px 12px', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)', borderRadius: '8px', color: '#fff', fontFamily: 'var(--font-mono)', fontSize: '12px' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>
                      Banner Ad Unit ID
                    </label>
                    <input
                      type="text"
                      value={adsConfig.bannerUnitId}
                      onChange={(e) => setAdsConfig({ ...adsConfig, bannerUnitId: e.target.value })}
                      style={{ width: '100%', padding: '10px 12px', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)', borderRadius: '8px', color: '#fff', fontFamily: 'var(--font-mono)', fontSize: '12px' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>
                      Interstitial Ad Unit ID
                    </label>
                    <input
                      type="text"
                      value={adsConfig.interstitialUnitId}
                      onChange={(e) => setAdsConfig({ ...adsConfig, interstitialUnitId: e.target.value })}
                      style={{ width: '100%', padding: '10px 12px', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)', borderRadius: '8px', color: '#fff', fontFamily: 'var(--font-mono)', fontSize: '12px' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>
                      Rewarded Video Hint Ad Unit ID
                    </label>
                    <input
                      type="text"
                      value={adsConfig.rewardedUnitId}
                      onChange={(e) => setAdsConfig({ ...adsConfig, rewardedUnitId: e.target.value })}
                      style={{ width: '100%', padding: '10px 12px', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)', borderRadius: '8px', color: '#fff', fontFamily: 'var(--font-mono)', fontSize: '12px' }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
