import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Play, Link as LinkIcon, Dice1, Dice2, Dice3, Dice4, Dice5, Dice6, Map, Swords, User, Users, Shield, Plus, Search, FileText, Eye, Volume2, EyeOff } from "lucide-react";
import { motion } from "framer-motion";

// NOTE: This file is a client-side React SPA mockup for the Arcadia Hub + Dragon's Keep feature-set.
// It includes placeholders for real-time multiplayer (WebSocket/Socket.IO) and demonstrates injury overlays,
// mini-map, DM console scaffolding, character sheet uploading, sound triggers, fog of war, and graphics quality toggles.

// --- Utility helpers ---
const cn = (...classes) => classes.filter(Boolean).join(" ");
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

// --- Simple local store for persistence ---
const useLocal = (key, init) => {
  const [val, setVal] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : init;
    } catch { return init; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }, [key, val]);
  return [val, setVal];
};

// --- Dice roller ---
const roll = (sides) => 1 + Math.floor(Math.random() * sides);

// --- Character Sheet Manager ---
function CharacterSheetManager({ onSelect }) {
  const [sheets, setSheets] = useLocal("dk.sheets", []);
  const addSheet = (file) => {
    const reader = new FileReader();
    reader.onload = () => { setSheets((prev) => [...prev, { name: file.name, content: reader.result }]); };
    reader.readAsText(file);
  };
  return (
    <Card>
      <CardHeader><CardTitle>Character Sheets</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <input type="file" accept=".txt,.json,.pdf" onChange={(e)=>e.target.files[0] && addSheet(e.target.files[0])} />
        <ScrollArea className="h-48 border rounded p-2">
          {sheets.length === 0 && <div className="text-sm text-muted-foreground">No character sheets uploaded.</div>}
          {sheets.map((s,i)=> (
            <div key={i} className="mb-2 p-2 border rounded bg-slate-800 flex items-start justify-between">
              <div>
                <div className="font-semibold text-slate-100">{s.name}</div>
                <pre className="text-xs whitespace-pre-wrap text-slate-300">{String(s.content).slice(0,200)}{String(s.content).length>200? '...': ''}</pre>
              </div>
              <div className="flex flex-col gap-2">
                <Button size="sm" onClick={()=>onSelect && onSelect(s)}>Select</Button>
              </div>
            </div>
          ))}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// --- Mini Map (shows simplified mini-map view) ---
function MiniMap({ pos, zoom=10, markers=[] }) {
  const ref = useRef(null);
  useEffect(()=>{
    const c = ref.current; if (!c) return; const ctx = c.getContext("2d"); const W=c.width; const H=c.height;
    ctx.clearRect(0,0,W,H); ctx.fillStyle="#0b1220"; ctx.fillRect(0,0,W,H);
    // Draw markers
    markers.forEach(m=>{ ctx.fillStyle = m.color||"#10b981"; ctx.beginPath(); ctx.arc((m.x/zoom), (m.y/zoom), 3, 0, Math.PI*2); ctx.fill(); });
    // Player
    ctx.fillStyle = "#f59e0b"; ctx.beginPath(); ctx.arc(pos.x/zoom, pos.y/zoom, 4, 0, Math.PI*2); ctx.fill();
  }, [pos, markers, zoom]);
  return <canvas ref={ref} width={128} height={128} className="w-32 h-32 border-2 border-slate-700 rounded bg-slate-900" />;
}

// --- Sound helper ---
const playSfx = (url) => { try { const a = new Audio(url); a.play(); } catch(e){ console.warn(e); } };

// --- Simple placeholder list of real games (external links or self-hosted) ---
const REAL_GAMES = [
  { id: 'block_blast', name: 'Block Blast', url: 'https://block-blast.io/' },
  { id: 'krunker', name: 'Krunker (external)', url: 'https://krunker.io/' },
  { id: 'slither', name: 'Slither.io', url: 'https://slither.io/' },
  { id: '2048', name: '2048', url: 'https://play2048.co/' },
  // Add more verified web games here
];

// --- Dragon's Keep core component ---
function DragonsKeep({ socketUrl = null }) {
  // State
  const [view, setView] = useLocal("dk.view", "home"); // home | start | join | dm
  const [campaignId, setCampaignId] = useLocal("dk.campaign", "");
  const [name, setName] = useLocal("dk.name", "Adventurer");
  const [speed, setSpeed] = useLocal("dk.speed", 30);
  const [round, setRound] = useLocal("dk.round", 1);
  const [remaining, setRemaining] = useState(speed);
  const [fogEnabled, setFogEnabled] = useLocal("dk.fog", false);
  const [graphicsQuality, setGraphicsQuality] = useLocal("dk.graphics", 'simple'); // simple | balanced | ultra

  // Multiplayer sockets (optional) - placeholder using native WebSocket
  const socketRef = useRef(null);
  const [players, setPlayers] = useState({}); // id -> {name, pos, remaining, status}
  const clientIdRef = useRef(Math.random().toString(36).slice(2,9));

  useEffect(()=>{ setRemaining(speed); }, [speed, round]);

  // connect to socket if socketUrl provided
  useEffect(()=>{
    if (!socketUrl) return;
    const ws = new WebSocket(socketUrl);
    socketRef.current = ws;
    ws.onopen = () => { ws.send(JSON.stringify({type:'join', id: clientIdRef.current, name, campaignId})); };
    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'state') setPlayers(msg.players || {});
        if (msg.type === 'announce') console.log('announce', msg.text);
      } catch(e){}
    };
    ws.onclose = ()=>{ socketRef.current = null; };
    return () => { ws.close(); };
  }, [socketUrl, campaignId, name]);

  // Map & movement refs
  const canvasRef = useRef(null);
  const posRef = useRef({ x: 0, y: 0 });
  const lastRef = useRef({ x: 0, y: 0 });
  const dragging = useRef(false);

  // Injury state for this player
  const [status, setStatus] = useState({ blinded: false, bright: false, bleeding: 0 }); // bleeding: 0-100

  // send local state to server
  const sendState = (extra={}) => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;
    const payload = {
      type: 'update', id: clientIdRef.current, campaignId, name,
      pos: posRef.current, remaining, status, round, graphicsQuality,
      ...extra
    };
    socketRef.current.send(JSON.stringify(payload));
  };

  // Drawing loop: top-down map + first-person overlay mock
  useEffect(()=>{
    if (view !== "start") return;
    const c = canvasRef.current; const ctx = c.getContext("2d");
    const W = c.width = c.clientWidth; const H = c.height = 480;

    function draw() {
      ctx.clearRect(0,0,W,H);
      // background style depends on graphicsQuality
      if (graphicsQuality === 'ultra') {
        // nicer gradient
        const g = ctx.createLinearGradient(0,0,W,H); g.addColorStop(0,'#061021'); g.addColorStop(1,'#08131f'); ctx.fillStyle = g;
      } else if (graphicsQuality === 'balanced') ctx.fillStyle = '#071023'; else ctx.fillStyle = '#0b1020';
      ctx.fillRect(0,0,W,H);

      // simple decorations (shadows, walls) - density based on quality
      if (graphicsQuality !== 'simple') {
        ctx.fillStyle = 'rgba(255,255,255,0.02)'; for (let i=0;i<30;i++){ ctx.fillRect((i*37)%W, ((i*73)%H), 6, 6); }
      }

      // Fog overlay if enabled (darken everything then cut circle)
      if (fogEnabled) {
        ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0,0,W,H);
        // clear circle around player according to sight (example: 40 ft)
        const sightPx = 40 * 4; // 1ft=4px
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath(); ctx.arc(posRef.current.x, posRef.current.y, sightPx, 0, Math.PI*2); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }

      // Movement reach circle
      const ftToPx = 4; const rPx = Math.max(0, remaining) * ftToPx;
      ctx.beginPath(); ctx.arc(posRef.current.x, posRef.current.y, rPx, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(0,200,120,0.12)'; ctx.fill(); ctx.strokeStyle = 'rgba(0,200,120,0.3)'; ctx.stroke();

      // Draw player marker
      ctx.save(); ctx.translate(posRef.current.x, posRef.current.y);
      ctx.fillStyle = '#e5e7eb'; ctx.beginPath(); ctx.moveTo(0,-10); ctx.lineTo(6,6); ctx.lineTo(-6,6); ctx.closePath(); ctx.fill(); ctx.restore();

      // HUD text
      ctx.fillStyle = '#e5e7eb'; ctx.font = '14px ui-sans-serif'; ctx.fillText(`Round ${round} — Remaining: ${remaining.toFixed(1)} ft`, 12, 22);

      // Injury visual effects overlays will be applied via DOM (CSS) for full-screen first-person look
    }
    let raf; const loop = ()=>{ draw(); raf = requestAnimationFrame(loop); };
    loop();
    return ()=> cancelAnimationFrame(raf);
  }, [view, remaining, round, fogEnabled, graphicsQuality]);

  // Free-form dragging movement
  useEffect(()=>{
    if (view !== 'start') return;
    const c = canvasRef.current; const ftToPx = 4;
    const getPos = (e)=>{ const rect=c.getBoundingClientRect(); const x=(e.touches?e.touches[0].clientX:e.clientX)-rect.left; const y=(e.touches?e.touches[0].clientY:e.clientY)-rect.top; return {x: clamp(x,0,c.clientWidth), y: clamp(y,0,480)}; };
    const onDown = (e)=>{ dragging.current=true; lastRef.current = getPos(e); };
    const onMove = (e)=>{ if(!dragging.current) return; const p=getPos(e); const dx=p.x-lastRef.current.x; const dy=p.y-lastRef.current.y; const distPx=Math.hypot(dx,dy); const distFt = distPx/ftToPx; if (distFt<=0) return; if (remaining<=0) return; if (distFt<=remaining){ posRef.current.x+=dx; posRef.current.y+=dy; setRemaining(r=>{ const next = Math.max(0, r-distFt); setTimeout(()=>sendState(),0); return next; }); lastRef.current=p; } else { const ratio=remaining/distFt; posRef.current.x+=dx*ratio; posRef.current.y+=dy*ratio; setRemaining(0); dragging.current=false; sendState(); } };
    const onUp = ()=>{ dragging.current=false; };
    c.addEventListener('mousedown', onDown); c.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
    c.addEventListener('touchstart', onDown, {passive:true}); c.addEventListener('touchmove', onMove, {passive:true}); window.addEventListener('touchend', onUp);
    // center start
    posRef.current = { x: c.clientWidth/2, y: 240 };
    // broadcast initial state
    sendState();
    return ()=>{ c.removeEventListener('mousedown', onDown); c.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); c.removeEventListener('touchstart', onDown); c.removeEventListener('touchmove', onMove); window.removeEventListener('touchend', onUp); };
  }, [view, remaining]);

  // DM actions (simple placeholder functions)
  const generateCampaign = () => { const code = `DRGN-${Math.random().toString(36).slice(2,6).toUpperCase()}`; setCampaignId(code); if (socketRef.current) socketRef.current.send(JSON.stringify({type:'dm_create', campaignId: code})); };
  const resetRound = ()=>{ setRound(r=>r+1); setRemaining(speed); if (socketRef.current) socketRef.current.send(JSON.stringify({type:'round_reset', campaignId})); };

  // Injury state helpers
  const applyBlind = (on) => { setStatus(s => ({ ...s, blinded: on })); sendState({ status: { ...status, blinded: on }}); };
  const applyBright = (on) => { setStatus(s => ({ ...s, bright: on })); sendState({ status: { ...status, bright: on }}); };
  const applyBleed = (amount) => { setStatus(s => { const nb = clamp((s.bleeding||0)+amount, 0, 100); sendState({ status: { ...s, bleeding: nb }}); return { ...s, bleeding: nb }; }); };

  // Graphics selector
  const GraphicsSelector = () => (
    <div className="flex items-center gap-2">
      <div className="text-sm">Graphics:</div>
      <Select value={graphicsQuality} onValueChange={(v)=>setGraphicsQuality(v)}>
        <SelectTrigger className="w-[160px]"><SelectValue placeholder="Quality"/></SelectTrigger>
        <SelectContent>
          <SelectItem value="simple">Simple (Low)</SelectItem>
          <SelectItem value="balanced">Balanced</SelectItem>
          <SelectItem value="ultra">Ultra (High)</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  // Home / Start / Join / DM views
  const Home = () => (
    <div className="space-y-4">
      <motion.h2 layout className="text-3xl font-bold">Dragon's Keep</motion.h2>
      <p className="text-muted-foreground">Welcome to Dragon's Keep! What would you like to do?</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Button size="lg" className="h-20" onClick={()=>setView('start')}>Start a New Campaign</Button>
        <Button size="lg" className="h-20" onClick={()=>setView('join')}>Join a Campaign</Button>
        <Button size="lg" className="h-20" onClick={()=>setView('dm')}>Be the DM of a Campaign</Button>
      </div>
      <Card>
        <CardHeader><CardTitle>Quick Settings</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-3 gap-3">
          <div>
            <div className="text-sm mb-1">Display Name</div>
            <Input value={name} onChange={(e)=>setName(e.target.value)} />
          </div>
          <div>
            <div className="text-sm mb-1">Walking Speed (ft/round)</div>
            <Slider value={[Number(speed)]} min={5} max={60} step={5} onValueChange={(v)=>setSpeed(v[0])} />
            <div className="text-xs text-muted-foreground mt-1">{speed} ft</div>
          </div>
          <div>
            <div className="text-sm mb-1">Campaign Code</div>
            <Input placeholder="e.g. DRGN-AB12" value={campaignId} onChange={(e)=>setCampaignId(e.target.value)}/>
          </div>
        </CardContent>
      </Card>
      <div className="flex gap-3 items-center">
        <CharacterSheetManager onSelect={(s)=>alert(`Selected sheet ${s.name}`)}/>
        <div className="flex flex-col gap-2">
          <GraphicsSelector/>
          <div className="flex gap-2">
            <Button variant="outline" onClick={()=>playSfx('https://actions.google.com/sounds/v1/ambiences/witchy_wind.ogg')}>Play Ambience</Button>
            <Button variant="outline" onClick={()=>setFogEnabled(!fogEnabled)}>{fogEnabled? 'Disable Fog':'Enable Fog'}</Button>
          </div>
        </div>
      </div>
    </div>
  );

  const Start = () => (
    <div className="space-y-4 relative">
      <div className="flex items-center justify-between">
        <h3 className="text-2xl font-semibold">Player View</h3>
        <div className="flex items-center gap-2">
          <Badge>Round {round}</Badge>
          <Button variant="outline" onClick={resetRound}>Start New Round</Button>
          <Button onClick={()=>setView('home')}>Exit</Button>
        </div>
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        <Card className="sm:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>First-Person Free Movement</CardTitle>
            <div className="flex items-center gap-2"><MiniMap pos={posRef.current} markers={Object.values(players).map(p=>({x:p.pos?.x||0,y:p.pos?.y||0,color:'#3b82f6'}))} /></div>
          </CardHeader>
          <CardContent>
            <div className="h-[480px] w-full border rounded overflow-hidden bg-black relative">
              <canvas ref={canvasRef} className="w-full h-[480px]" />
              {/* First-person injury overlays */}
              <div style={{pointerEvents:'none'}} className="absolute inset-0">
                {/* Bright/blinding effect */}
                <div style={{ position:'absolute', inset:0, mixBlendMode: 'screen', opacity: status.bright?0.9:0, background:'radial-gradient(circle at 50% 40%, rgba(255,255,230,0.95), rgba(255,255,255,0.8) 30%, rgba(255,255,255,0.0) 60%)', transition:'opacity 200ms' }} />
                {/* Blindfold (half cloth) */}
                <div style={{ position:'absolute', left:'25%', right:'25%', top:'40%', height:'20%', opacity: status.blinded?0.95:0, background:'linear-gradient(to bottom, rgba(80,60,50,0.95), rgba(60,40,30,0.95))', borderRadius:8, transition:'opacity 200ms' }} />
                {/* Bleeding blur + vignette */}
                <div style={{ position:'absolute', inset:0, backdropFilter: status.bleeding>0? `blur(${Math.min(12, status.bleeding/10)}px)` : 'none', transition:'backdrop-filter 200ms' }} />
                <div style={{ position:'absolute', inset:0, background: status.bleeding>0 ? 'radial-gradient(ellipse at center, rgba(0,0,0,0.0), rgba(0,0,0,0.5))' : 'transparent', pointerEvents:'none' }} />
                {/* Blood streaks (subtle) */}
                <svg style={{ position:'absolute', inset:0, width:'100%', height:'100%', opacity: status.bleeding>0? Math.min(0.9,status.bleeding/100):0, transition:'opacity 200ms', pointerEvents:'none' }}>
                  <defs></defs>
                  <g fill="none" stroke="rgba(150,10,10,0.6)" strokeWidth="4">
                    <path d="M20 120 C60 160, 80 240, 40 320"/>
                    <path d="M420 100 C380 140, 360 220, 400 300"/>
                  </g>
                </svg>
              </div>
            </div>
            <div className="text-sm text-muted-foreground mt-2">Drag to move. You can move in any direction until your remaining movement reaches 0 ft. New round resets to your Walking Speed.</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Actions & Status</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm">Remaining Movement: <span className="font-semibold">{remaining.toFixed(1)} ft</span></div>
            <div className="grid grid-cols-3 gap-2">
              <Button variant="outline" onClick={()=>alert(`Rolled d4: ${roll(4)}`)}><Dice4 className="h-4 w-4"/></Button>
              <Button variant="outline" onClick={()=>alert(`Rolled d6: ${roll(6)}`)}><Dice6 className="h-4 w-4"/></Button>
              <Button variant="outline" onClick={()=>alert(`Rolled d8: ${roll(8)}`)}><Dice1 className="h-4 w-4"/></Button>
              <Button variant="outline" onClick={()=>alert(`Rolled d10: ${roll(10)}`)}><Dice2 className="h-4 w-4"/></Button>
              <Button variant="outline" onClick={()=>alert(`Rolled d12: ${roll(12)}`)}><Dice3 className="h-4 w-4"/></Button>
              <Button variant="default" onClick={()=>alert(`Rolled d20: ${roll(20)}`)}><Dice5 className="h-4 w-4 mr-1"/>d20</Button>
            </div>
            <div className="space-y-2">
              <div className="text-sm">Injury Effects (DM or self)</div>
              <div className="flex gap-2">
                <Button onClick={()=>{ applyBlind(!status.blinded); }}>{status.blinded? 'Remove Blind':'Apply Blind'}</Button>
                <Button onClick={()=>{ applyBright(!status.bright); }}>{status.bright? 'Remove Flash':'Apply Flash'}</Button>
                <Button onClick={()=>{ applyBleed(15); }}>Add Bleed</Button>
              </div>
              <div className="text-xs text-muted-foreground">Bleeding increases blur/vignette. Blind = cloth; Bright = flash overlay.</div>
            </div>
            <div className="pt-2">
              <GraphicsSelector />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  const Join = () => (
    <div className="space-y-4">
      <h3 className="text-2xl font-semibold">Join a Campaign</h3>
      <p className="text-muted-foreground">Enter your campaign code to join. (Realtime sync requires a backend WebSocket server.)</p>
      <div className="flex gap-2 max-w-md">
        <Input value={campaignId} onChange={(e)=>setCampaignId(e.target.value)} placeholder="e.g. DRGN-AB12"/>
        <Button onClick={()=>setView('start')}>Join</Button>
      </div>
    </div>
  );

  const DM = () => (
    <div className="space-y-4">
      <h3 className="text-2xl font-semibold">DM Console</h3>
      <p className="text-muted-foreground">Create and manage campaigns in real-time. Drop encounters, reveal areas, and broadcast messages that appear on players' screens.</p>
      <div className="flex gap-2 max-w-md">
        <Button onClick={generateCampaign}>Generate Campaign Code</Button>
        <Input readOnly value={campaignId} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card>
          <CardHeader><CardTitle>Live Players</CardTitle></CardHeader>
          <CardContent>
            <ScrollArea className="h-40">
              {Object.entries(players).length === 0 && <div className="text-sm text-muted-foreground">No players connected.</div>}
              {Object.entries(players).map(([id,p])=> (
                <div key={id} className="flex items-center justify-between p-2 border-b">
                  <div>
                    <div className="font-medium">{p.name || id}</div>
                    <div className="text-xs text-muted-foreground">{p.pos? `${(p.pos.x/4).toFixed(1)}ft, ${(p.pos.y/4).toFixed(1)}ft` : 'no pos'}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={()=>{ if (!socketRef.current) return; socketRef.current.send(JSON.stringify({type:'dm_private', to:id, action:'apply_blind'})); }}>Blind</Button>
                    <Button size="sm" onClick={()=>{ if (!socketRef.current) return; socketRef.current.send(JSON.stringify({type:'dm_private', to:id, action:'apply_bleed', amount:20})); }}>Bleed</Button>
                  </div>
                </div>
              ))}
            </ScrollArea>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Map Tools (Preview)</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="text-sm">(Simple map editing is available in the full build.)</div>
            <div className="flex gap-2">
              <Button onClick={()=>{ if (socketRef.current) socketRef.current.send(JSON.stringify({type:'dm_broadcast', campaignId, text:'A chill wind blows...'})); }}>Broadcast</Button>
              <Button onClick={()=>{ if (socketRef.current) socketRef.current.send(JSON.stringify({type:'dm_reveal', campaignId, area:{x:posRef.current.x,y:posRef.current.y,r:60}})); }}>Reveal Area</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {view === 'home' && <Home/>}
      {view === 'start' && <Start/>}
      {view === 'join' && <Join/>}
      {view === 'dm' && <DM/>}
    </div>
  );
}

// --- Games Library Component (adds more real games) ---
const GAME_LIST = [
  { id: "dragons_keep", name: "Dragon's Keep", genre: "RPG", component: "dragonskeep", description: "DnD-style campaigns with first-person free movement per round.", featured: true },
  { id: "snake", name: "Snake Classic", genre: "Arcade", component: "snake", description: "Eat apples, avoid yourself.", featured: false },
  { id: "breakout", name: "Breakout", genre: "Arcade", component: "breakout", description: "Bounce the ball, break the bricks.", featured: false },
  // External real-game links (opened in new tab to respect cross-origin policies)
  ...REAL_GAMES.map(g=>({ id: g.id, name: g.name, genre: 'Arcade', url: g.url, description: 'External game', featured: false })),
];

function GamesLibrary() {
  const [filter, setFilter] = useState("all");
  const games = useMemo(() => GAME_LIST.filter(g => filter === "all" || g.genre === filter), [filter]);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Games Library</h2>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Filter by genre"/></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="RPG">RPG</SelectItem>
            <SelectItem value="Arcade">Arcade</SelectItem>
            <SelectItem value="Puzzle">Puzzle</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {games.map(g => (
          <Card key={g.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{g.name}</span>
                {g.featured && <Badge>Featured</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-sm text-muted-foreground">{g.description}</div>
              {g.component === "dragonskeep" && (
                <Dialog>
                  <DialogTrigger asChild><Button><Play className="h-4 w-4 mr-1"/>Play</Button></DialogTrigger>
                  <DialogContent className="max-w-5xl">
                    <DialogHeader><DialogTitle>Dragon's Keep</DialogTitle></DialogHeader>
                    <DragonsKeep socketUrl={null} />
                  </DialogContent>
                </Dialog>
              )}
              {g.component === "snake" && (
                <Dialog>
                  <DialogTrigger asChild><Button><Play className="h-4 w-4 mr-1"/>Play</Button></DialogTrigger>
                  <DialogContent className="max-w-3xl">
                    <DialogHeader><DialogTitle>Snake</DialogTitle></DialogHeader>
                    <SnakeGame/>
                  </DialogContent>
                </Dialog>
              )}
              {g.component === "breakout" && (
                <Dialog>
                  <DialogTrigger asChild><Button><Play className="h-4 w-4 mr-1"/>Play</Button></DialogTrigger>
                  <DialogContent className="max-w-3xl">
                    <DialogHeader><DialogTitle>Breakout</DialogTitle></DialogHeader>
                    <BreakoutGame/>
                  </DialogContent>
                </Dialog>
              )}
              {g.url && (
                <Button variant="outline" asChild>
                  <a href={g.url} target="_blank" rel="noreferrer">
                    Open External Game
                  </a>
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// --- Mini-Browser (note: some sites block iframes; this is a basic viewer) ---
function MiniBrowser() {
  const [url, setUrl] = useLocal("mb.url", "https://wikipedia.org");
  const [current, setCurrent] = useState(url);
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><LinkIcon className="h-5 w-5"/>Mini Browser</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input value={url} onChange={(e)=>setUrl(e.target.value)} placeholder="Enter URL (https://...)"/>
          <Button onClick={()=>setCurrent(url)}><Search className="h-4 w-4 mr-1"/>Go</Button>
        </div>
        <div className="text-sm text-muted-foreground">Note: Some sites set security headers that prevent embedding. Use direct links when that happens.</div>
        <div className="h-[480px] w-full border rounded overflow-hidden bg-muted">
          <iframe title="viewer" src={current} className="w-full h-full" sandbox="allow-same-origin allow-scripts allow-forms allow-popups" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function App() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-slate-100 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <motion.h1 layout className="text-3xl md:text-4xl font-extrabold tracking-tight">Arcadia Hub</motion.h1>
          <div className="text-sm opacity-80">A mini-browser + games portal • Includes <span className="font-semibold">Dragon's Keep</span></div>
        </header>

        <Tabs defaultValue="browse" className="w-full">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="browse">Browse</TabsTrigger>
            <TabsTrigger value="games">Games</TabsTrigger>
            <TabsTrigger value="about">About</TabsTrigger>
          </TabsList>

          <TabsContent value="browse">
            <MiniBrowser/>
          </TabsContent>

          <TabsContent value="games">
            <GamesLibrary/>
          </TabsContent>

          <TabsContent value="about">
            <Card>
              <CardHeader>
                <CardTitle>About this Site</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>
                  This is a single-page React app designed to host a lightweight mini-browser and a library of HTML5 games. One of the games is <span className="text-slate-200 font-semibold">Dragon's Keep</span>, a DnD-style experience with free-form first-person movement measured in feet per round (no grids).
                </p>
                <p>
                  Multiplayer sync (players + DM) is supported by WebSockets. The DragonsKeep component includes a simple WebSocket client example (native WebSocket). For production use you should run a Socket.IO or WebSocket server that manages campaigns and relays state between DM and players.
                </p>
                <ul className="list-disc ml-6">
                  <li>Free-form movement: drag anywhere; movement consumed continuously until 0 ft.</li>
                  <li>New Round resets movement to the configured walking speed.</li>
                  <li>Upload character sheets, choose graphics quality, enable fog-of-war, and test injury visuals.</li>
                </ul>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

/* =====================
   Backend Server (server.js)
   Place this file in a Node.js project (e.g., Replit or your VPS).
   Run: `npm init -y && npm install express socket.io cors` then `node server.js`
   ===================== */

// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// In-memory store for campaigns (replace with DB for production)
const campaigns = {}; // campaignId -> { dmId, players: {id: {name,pos,remaining,status}}, created }

app.get('/', (req, res) => res.send({ ok: true, server: 'Dragon\'s Keep Hub' }));

// Optional: create campaign REST endpoint (DM can use or client via websocket)
app.post('/create-campaign', (req, res) => {
  const code = (req.body.code) || (`DRGN-${Math.random().toString(36).slice(2,6).toUpperCase()}`);
  campaigns[code] = { dmId: null, players: {}, created: Date.now(), meta: {} };
  res.json({ ok: true, campaignId: code });
});

// Health
app.get('/campaigns', (req,res)=>{
  res.json(Object.keys(campaigns));
});

// Socket.IO realtime handlers
io.on('connection', (socket) => {
  console.log('socket connected', socket.id);

  socket.on('message', (m) => console.log('raw message', m));

  socket.on('join', (data) => {
    const { id, name, campaignId } = data || {};
    socket.data.clientId = id || socket.id;
    socket.data.name = name || 'Player';
    socket.data.campaignId = campaignId || 'lobby';
    const camp = campaigns[socket.data.campaignId] = campaigns[socket.data.campaignId] || { dmId: null, players: {}, meta: {} };
    camp.players[socket.data.clientId] = { name: socket.data.name, pos: { x: 0, y: 0 }, remaining: 0, status: {} };
    socket.join(socket.data.campaignId);
    // broadcast full state to room
    io.to(socket.data.campaignId).emit('state', { players: camp.players, campaignId: socket.data.campaignId });
  });

  socket.on('update', (payload) => {
    const { id, campaignId, pos, remaining, status, name } = payload || {};
    const camp = campaigns[campaignId] = campaigns[campaignId] || { dmId: null, players: {}, meta: {} };
    camp.players[id] = camp.players[id] || {};
    camp.players[id].pos = pos || camp.players[id].pos;
    camp.players[id].remaining = remaining != null ? remaining : camp.players[id].remaining;
    camp.players[id].status = status || camp.players[id].status;
    camp.players[id].name = name || camp.players[id].name;
    // broadcast state to all in campaign
    io.to(campaignId).emit('state', { players: camp.players, campaignId });
  });

  socket.on('dm_create', (data) => {
    const { campaignId } = data || {};
    campaigns[campaignId] = campaigns[campaignId] || { dmId: socket.id, players: {}, meta: {} };
    campaigns[campaignId].dmId = socket.id;
    socket.join(campaignId);
    io.to(campaignId).emit('announce', { text: `DM has started campaign ${campaignId}` });
  });

  socket.on('dm_broadcast', (data) => {
    const { campaignId, text } = data || {};
    io.to(campaignId).emit('announce', { text });
  });

  socket.on('dm_private', (data) => {
    const { to, action, amount } = data || {};
    // send a private command to a specific player socket id
    io.to(to).emit('dm_private', { action, amount });
  });

  socket.on('round_reset', (data) => {
    const { campaignId } = data || {};
    const camp = campaigns[campaignId];
    if (!camp) return;
    Object.keys(camp.players||{}).forEach(pid => {
      // sample: reset remaining to 30 (clients should control real movement but this lets server inform)
      camp.players[pid].remaining = camp.meta.defaultSpeed || 30;
    });
    io.to(campaignId).emit('state', { players: camp.players, campaignId, roundReset: true });
  });

  socket.on('disconnecting', () => {
    const rooms = Array.from(socket.rooms);
    rooms.forEach((r) => {
      if (campaigns[r]) {
        // remove player by socket.data.clientId if present
        const id = socket.data.clientId;
        if (campaigns[r].players && campaigns[r].players[id]) delete campaigns[r].players[id];
        io.to(r).emit('state', { players: campaigns[r].players || {}, campaignId: r });
      }
    });
  });

});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Dragon's Keep server listening on ${PORT}`));

/* =====================
   package.json (example)
   =====================
{
  "name": "dragons-keep-server",
  "version": "1.0.0",
  "main": "server.js",
  "scripts": { "start": "node server.js" },
  "dependencies": { "cors": "^2.8.5", "express": "^4.18.2", "socket.io": "^4.5.4" }
}

=====================
Deployment & Publishing Guide
=====================
1) Quick local test (Node):
   - Save server.js and package.json in a folder.
   - Run `npm install` then `npm start`.
   - Visit http://localhost:3000/ to check health.

2) Deploy on Replit (fast, free for prototyping):
   - Create a new Replit, Node.js.
   - Upload server.js and package.json. Replit will auto-install deps.
   - Run, copy the Replit URL (e.g., https://my-repl.repl.co) and use it as the socketUrl in your React app (pass to DragonsKeep as `socketUrl="wss://my-repl.repl.co/socket.io"` or the WebSocket path).

3) Deploy on Render / Railway / Fly / Vercel Serverless (recommended for production):
   - Create a new service (Docker or Node) and point to your repo.
   - Set PORT env var if needed. Use the provided HTTPS domain as your socketUrl.

4) Frontend (React) deployment options:
   - Vercel: connect your GitHub repo, build command `npm run build`, output `build/` for CRA or `dist/` for Vite. Set public env `REACT_APP_SOCKET_URL` to your server URL.
   - Netlify: similar process.
   - Replit: you can host both frontend and backend in Replit by using separate repls or a monorepo.

5) Connecting frontend to server:
   - In your React app, open the DragonsKeep component and pass `socketUrl` prop:
     `<DragonsKeep socketUrl={process.env.REACT_APP_SOCKET_URL || 'wss://your-server.example.com'} />`
   - Or set `const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'https://your-server.example.com';` and use it to open `new WebSocket(SOCKET_URL)` or `io(SOCKET_URL)`.

6) Production notes:
   - Use HTTPS and secure WebSocket (wss://).
   - Add authentication (JWT/session) to prevent account hijacking.
   - Use a persistent DB (Postgres/Mongo/Redis) instead of in-memory store.
   - Rate-limit DM actions to prevent abuse.

If you want, I can:
- Create the GitHub repo structure with `server/` and `client/` files and push the code (you'd need to give access or create the repo and I can give commands).
- Generate a ready-to-deploy Dockerfile and Render/Heroku config.
- Walk you through deploying step-by-step to Replit or Vercel and wiring the socket URL into your React app.

Tell me which deployment target you want first (Replit for speed, or Vercel + Render for production), and I will give precise commands and edits to your project to finish the integration.
