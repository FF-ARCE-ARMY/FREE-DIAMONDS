import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Zap, 
  Target, 
  Timer as Clock, 
  Shield, 
  TrendingUp, 
  Skull,
  RotateCcw,
  CheckCircle2,
  ChevronRight,
  Lock,
  LogOut,
  AlertTriangle
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { cn } from './lib/utils';

// Constants
const QUEST_DURATION_SEC = 5 * 60; // 5 minutes
const PENALTY_LEVEL_DROP = 20;

type Rank = 'F' | 'E' | 'D' | 'C' | 'B' | 'A' | 'S' | 'SS' | 'SSS' | 'DEMON KING';
type Difficulty = 'F' | 'E' | 'D' | 'C' | 'B' | 'A' | 'S';

interface PlayerState {
  name: string;
  isAwakened: boolean;
  level: number;
  xp: number; // 0-9 completions towards level up
  rank: Rank;
  questsCompletedByDifficulty: Record<Difficulty, number>;
  unlockedDifficulties: Difficulty[];
  selectedDifficulty: Difficulty;
}

interface Quest {
  id: string;
  title: string;
  description: string;
  requirements: { name: string; amount: number }[];
  xpReward: number;
}

const RANK_THRESHOLDS: { rank: Rank; level: number; hidden?: boolean }[] = [
  { rank: 'DEMON KING', level: 100000, hidden: true },
  { rank: 'SSS', level: 1000, hidden: true },
  { rank: 'SS', level: 600, hidden: true },
  { rank: 'S', level: 300 },
  { rank: 'A', level: 150 },
  { rank: 'B', level: 80 },
  { rank: 'C', level: 50 },
  { rank: 'D', level: 20 },
  { rank: 'E', level: 10 },
  { rank: 'F', level: 0 },
];

const DIFFICULTY_ORDER: Difficulty[] = ['F', 'E', 'D', 'C', 'B', 'A', 'S'];

export default function App() {
  const [player, setPlayer] = useState<PlayerState>(() => {
    const saved = localStorage.getItem('shadow_monarch_system_final');
    return saved ? JSON.parse(saved) : { 
      name: '', 
      isAwakened: false,
      level: 1, 
      xp: 0, 
      rank: 'F',
      questsCompletedByDifficulty: { F: 0, E: 0, D: 0, C: 0, B: 0, A: 0, S: 0 },
      unlockedDifficulties: ['F'],
      selectedDifficulty: 'F'
    };
  });

  const [currentQuest, setCurrentQuest] = useState<Quest | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showPenaltyModal, setShowPenaltyModal] = useState(false);
  const [showLevelUp, setShowLevelUp] = useState<{from: number, to: number} | null>(null);
  const [invitationState, setInvitationState] = useState<'invite' | 'name'>('invite');

  // Persistence
  useEffect(() => {
    localStorage.setItem('shadow_monarch_system_final', JSON.stringify(player));
  }, [player]);

  const calculateRank = (level: number): Rank => {
    for (const threshold of RANK_THRESHOLDS) {
      if (level >= threshold.level) return threshold.rank;
    }
    return 'F';
  };

  const generateQuest = async () => {
    setIsGenerating(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const playerDisplayName = player.name || "Shadow Monarch";
      const prompt = `You are the "System" from Solo Leveling. 
      Generate a physically challenging daily quest for the Shadow Monarch (${playerDisplayName}).
      Current Level: ${player.level >= 100000 ? 'Unknown' : player.level}.
      Requested Difficulty: ${player.selectedDifficulty} Rank.
      
      The quest should focus on bodyweight exercises: Push-ups, Pull-ups, Sit-ups, or Squats.
      The counts should reflect the ${player.selectedDifficulty} difficulty.
      F: 10-20 reps. S: 100+ reps.
      
      Format the response as a valid JSON object:
      {
        "id": "quest_${Date.now()}",
        "title": "A Epic Quest Title",
        "description": "A motivational system prompt.",
        "requirements": [{"name": "Exercise Name", "amount": number}],
        "xpReward": 1 // This is always 1 completion point
      }
      Return ONLY the JSON.`;

      const result = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: { responseMimeType: "application/json" }
      });

      const questData = JSON.parse(result.text || '{}');
      setCurrentQuest(questData);
      setTimeLeft(QUEST_DURATION_SEC);
      setIsTimerRunning(true);
    } catch (error) {
      console.error("System Error: Quest generation failed", error);
      setCurrentQuest({
        id: 'fallback',
        title: 'Emergency Training',
        description: 'Sync lost. Maintain the Vessel\'s strength.',
        requirements: [{ name: 'Push-ups', amount: 30 }],
        xpReward: 1
      });
      setTimeLeft(QUEST_DURATION_SEC);
      setIsTimerRunning(true);
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    let interval: number;
    if (isTimerRunning && timeLeft > 0) {
      interval = window.setInterval(() => setTimeLeft(prev => prev - 1), 1000);
    } else if (timeLeft === 0 && isTimerRunning) {
      handlePenalty();
    }
    return () => clearInterval(interval);
  }, [isTimerRunning, timeLeft]);

  const handlePenalty = () => {
    setIsTimerRunning(false);
    setCurrentQuest(null);
    setShowPenaltyModal(true);
    setPlayer(prev => {
      const newLevel = Math.max(1, prev.level - PENALTY_LEVEL_DROP);
      return { ...prev, level: newLevel, rank: calculateRank(newLevel) };
    });
  };

  const completeQuest = () => {
    if (!currentQuest) return;
    setIsTimerRunning(false);
    
    const currentDiff = player.selectedDifficulty;
    const completionsForDiff = (player.questsCompletedByDifficulty[currentDiff] || 0) + 1;
    const updatedCompletionsByDiff = { ...player.questsCompletedByDifficulty, [currentDiff]: completionsForDiff };
    
    // Level Up: 10 quests = 1 Level
    const newXP = player.xp + 1;
    let finalLevel = player.level;
    let finalXP = newXP;

    if (newXP >= 10) {
      finalLevel = Math.min(player.level + 1, 100000);
      finalXP = 0;
      setShowLevelUp({ from: player.level, to: finalLevel });
    }

    // Difficulty Unlock: 10 quests of current difficulty to unlock next
    let unlocked = [...player.unlockedDifficulties];
    if (completionsForDiff >= 10) {
      const nextIdx = DIFFICULTY_ORDER.indexOf(currentDiff) + 1;
      if (nextIdx < DIFFICULTY_ORDER.length) {
        const nextDiff = DIFFICULTY_ORDER[nextIdx];
        if (!unlocked.includes(nextDiff)) {
          unlocked.push(nextDiff);
        }
      }
    }

    setPlayer(prev => ({
      ...prev,
      level: finalLevel,
      xp: finalXP,
      rank: calculateRank(finalLevel),
      questsCompletedByDifficulty: updatedCompletionsByDiff,
      unlockedDifficulties: unlocked
    }));
    
    setCurrentQuest(null);
    setTimeLeft(0);
  };

  const handleLogout = () => {
    if (confirm("Seal your powers and return to the shadows? (Progress is saved)")) {
      setPlayer(prev => ({ ...prev, isAwakened: false }));
      setInvitationState('invite');
      setCurrentQuest(null);
      setIsTimerRunning(false);
      setTimeLeft(0);
    }
  };

  const isDemonKing = player.level >= 100000;
  const isHighRank = player.level >= 600;

  if (!player.isAwakened) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center p-6 text-center select-none overflow-hidden relative">
        {/* Background Atmosphere */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-[20%] left-[10%] w-[50%] h-[50%] bg-system-cyan/5 blur-[150px] rounded-full animate-pulse" />
          <div className="absolute bottom-[20%] right-[10%] w-[50%] h-[50%] bg-system-blue/5 blur-[150px] rounded-full animate-pulse" style={{ animationDelay: '2s' }} />
        </div>

        <AnimatePresence mode="wait">
          {invitationState === 'invite' ? (
            <motion.div 
              key="invite"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 1.05, y: -20 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="max-w-2xl space-y-16 z-10"
            >
              <div className="space-y-6">
                <motion.div 
                  animate={{ opacity: [0.3, 1, 0.3] }} 
                  transition={{ repeat: Infinity, duration: 3 }} 
                  className="text-system-cyan font-mono text-[10px] tracking-[0.6em] uppercase font-bold"
                >
                  System Notification Received
                </motion.div>
                <h1 className="text-4xl md:text-7xl font-mono font-bold tracking-tighter system-glow italic uppercase leading-[0.9] text-white">
                  If you are bored from your old life... <br/>
                  <span className="text-white/20 italic font-mono block mt-4">just accept our invitation.</span>
                </h1>
              </div>
              
              <button 
                onClick={() => setInvitationState('name')}
                className="group relative px-20 py-8 bg-transparent border border-system-cyan/30 overflow-hidden transition-all hover:border-system-cyan hover:scale-105 active:scale-95"
              >
                <div className="absolute inset-0 bg-system-cyan/5 group-hover:bg-system-cyan/10 transition-colors" />
                <span className="relative z-10 text-system-cyan font-mono font-bold uppercase tracking-[0.5em] text-xl">Accept Invitation</span>
                <div className="absolute bottom-0 left-0 h-[2px] bg-system-cyan w-0 group-hover:w-full transition-all duration-500" />
              </button>
            </motion.div>
          ) : (
            <motion.div 
              key="name"
              initial={{ opacity: 0, x: 100 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -100 }}
              className="w-full max-w-md bg-slate-900/10 p-12 border border-slate-800/50 rounded-[40px] space-y-10 z-10 backdrop-blur-xl"
            >
              <div className="space-y-3">
                <h2 className="text-3xl font-mono font-bold italic system-glow text-system-cyan uppercase tracking-tighter">Enter Resonance</h2>
                <p className="text-slate-500 font-mono text-[10px] uppercase tracking-[0.3em]">Declare your name to the system</p>
              </div>
              
              <form onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const name = formData.get('hunterName') as string;
                if (name.trim()) setPlayer(p => ({ ...p, name: name.trim(), isAwakened: true }));
              }} className="space-y-8">
                <div className="relative group">
                  <input 
                    autoFocus 
                    required 
                    name="hunterName" 
                    maxLength={20}
                    className="w-full bg-transparent border-b-2 border-slate-800 focus:border-system-cyan p-6 font-mono text-3xl outline-none transition-all uppercase text-center text-white placeholder:text-slate-800" 
                    placeholder="NAME..." 
                  />
                  <div className="absolute bottom-0 left-0 h-0.5 bg-system-cyan w-0 group-focus-within:w-full transition-all duration-700" />
                </div>
                
                <div className="flex flex-col gap-4 pt-4">
                  <button className="w-full py-5 bg-system-cyan text-black font-mono font-bold uppercase tracking-[0.4em] flex items-center justify-center gap-3 group overflow-hidden relative">
                    <span className="relative z-10">Awaken Powers</span>
                    <ChevronRight className="w-5 h-5 relative z-10 group-hover:translate-x-2 transition-transform" />
                    <div className="absolute inset-0 bg-white translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setInvitationState('invite')} 
                    className="text-slate-600 font-mono text-[10px] uppercase tracking-widest hover:text-white transition-colors"
                  >
                    Return to Void
                  </button>
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col items-center p-4 md:p-12 overflow-x-hidden selection:bg-system-cyan selection:text-black font-sans relative">
      {/* HUD Background Effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[30vh] bg-[radial-gradient(ellipse_at_top,#00e5ff10_0%,transparent_70%)]" />
        <div className="absolute inset-0 border-[40px] border-black/80 z-0" />
      </div>

      {/* Main HUD Header */}
      <header className="w-full max-w-6xl flex flex-col lg:flex-row justify-between items-start lg:items-end mb-16 z-10 border-b border-slate-900/50 pb-12 gap-10">
        <div className="space-y-4">
          <div className="flex items-center gap-3 text-system-cyan">
             <Zap className="w-4 h-4 animate-pulse" />
             <span className="text-[10px] font-mono uppercase font-bold tracking-[0.5em]">Class: Shadow Monarch</span>
          </div>
          <h1 className="text-5xl md:text-7xl font-mono font-bold tracking-tighter system-glow italic uppercase leading-none">
            {player.name}
          </h1>
          
          <div className="flex flex-wrap gap-6 pt-4">
            <div className="bg-slate-900/20 border border-slate-800/40 px-8 py-4 rounded-2xl flex flex-col shadow-inner backdrop-blur-sm min-w-[140px]">
              <span className="text-[10px] text-slate-500 font-mono uppercase tracking-[0.2em] mb-1">Level</span>
              <span className={cn(
                "text-4xl font-mono font-bold tracking-tight",
                isDemonKing ? "text-system-penalty animate-pulse blur-[1px]" : "text-system-cyan"
              )}>
                {isDemonKing ? "???" : player.level}
              </span>
            </div>
            <div className="bg-slate-900/20 border border-slate-800/40 px-8 py-4 rounded-2xl flex flex-col shadow-inner backdrop-blur-sm min-w-[140px]">
              <span className="text-[10px] text-slate-500 font-mono uppercase tracking-[0.2em] mb-1">Rank</span>
              <span className={cn(
                "text-4xl font-mono font-bold tracking-tight",
                isDemonKing ? "text-system-penalty blur-[1px]" : "text-system-cyan"
              )}>
                {isDemonKing ? "UNKNOWN" : player.rank}
              </span>
            </div>
            <div className="bg-slate-900/20 border border-slate-800/40 px-8 py-4 rounded-2xl flex flex-col shadow-inner backdrop-blur-sm min-w-[140px]">
              <span className="text-[10px] text-slate-500 font-mono uppercase tracking-[0.2em] mb-1">Growth</span>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-mono font-bold text-system-cyan">{player.xp}</span>
                <span className="text-sm font-mono text-slate-600">/ 10</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-6 w-full lg:w-auto">
          {/* Difficulty Selector */}
          <div className="flex flex-col items-end gap-3 w-full">
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-[0.3em]">Select Difficulty</span>
            <div className="flex gap-1.5 p-1.5 bg-black/50 rounded-xl border border-slate-900/50 w-full lg:w-auto overflow-x-auto no-scrollbar">
              {DIFFICULTY_ORDER.map(d => {
                const unlocked = player.unlockedDifficulties.includes(d);
                const selected = player.selectedDifficulty === d;
                return (
                  <button
                    key={d}
                    disabled={!unlocked}
                    onClick={() => setPlayer(p => ({ ...p, selectedDifficulty: d }))}
                    className={cn(
                      "flex-1 lg:w-12 h-12 rounded-lg font-mono text-xs font-bold transition-all flex items-center justify-center relative min-w-[40px]",
                      !unlocked ? "opacity-10 cursor-not-allowed bg-slate-950" : 
                      selected ? "bg-system-cyan text-black shadow-[0_0_20px_#00e5ff]" : "text-slate-500 hover:text-white hover:bg-white/5"
                    )}
                  >
                    {d}
                    {!unlocked && <Lock className="w-2.5 h-2.5 absolute top-1 right-1" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap justify-end items-center gap-6 w-full">
             <div className="flex items-center gap-3 pr-4 border-r border-slate-900">
               <span className="text-[10px] text-slate-600 font-mono uppercase tracking-[0.2em]">
                 Quests: {player.questsCompletedByDifficulty[player.selectedDifficulty] || 0} / 10 to Unlock
               </span>
             </div>
             <div className="flex gap-4">
                <button 
                  onClick={handleLogout}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-900/40 border border-slate-800/60 rounded-xl text-slate-500 hover:text-system-cyan hover:border-system-cyan/50 hover:bg-system-cyan/5 transition-all text-[11px] font-mono uppercase tracking-widest font-bold group"
                >
                  <LogOut className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> 
                  <span>Seal Monarch</span>
                </button>
                <button 
                  onClick={() => { if(confirm("RESTART SYSTEM? This will permanently wipe all hunter records.")) { localStorage.clear(); window.location.reload(); }}} 
                  className="flex items-center gap-2 px-4 py-2 bg-slate-900/40 border border-slate-800/60 rounded-xl text-slate-500 hover:text-system-penalty hover:border-system-penalty/50 hover:bg-system-penalty/5 transition-all text-[11px] font-mono uppercase tracking-widest font-bold group"
                >
                  <RotateCcw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" /> 
                  <span>Wipe Logs</span>
                </button>
             </div>
          </div>
        </div>
      </header>

      {/* Primary Operation Center */}
      <main className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-12 z-10 flex-1">
        
        {/* Left HUD: System Registry */}
        <aside className="lg:col-span-4 space-y-8">
          <section className="bg-slate-900/10 border border-slate-800/30 p-8 rounded-[32px] backdrop-blur-sm">
             <div className="flex items-center gap-3 mb-8">
               <TrendingUp className="w-5 h-5 text-system-cyan" />
               <h2 className="text-[11px] font-mono font-bold uppercase tracking-[0.4em] text-slate-500">Hunter Registry</h2>
             </div>
             
             <div className="space-y-1.5">
                {[...RANK_THRESHOLDS].filter(t => !t.hidden || isHighRank || t.rank === 'DEMON KING').reverse().map((t) => {
                  const reached = player.level >= t.level;
                  const current = player.rank === t.rank;
                  const isDK = t.rank === 'DEMON KING';
                  
                  return (
                    <div 
                      key={t.rank} 
                      className={cn(
                        "flex items-center justify-between p-3.5 rounded-xl transition-all duration-500",
                        current ? "bg-system-cyan/10 border border-system-cyan/30 system-border-glow scale-[1.02]" : "border border-transparent",
                        reached ? "opacity-100" : "opacity-15"
                      )}
                    >
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "w-10 h-10 rounded-lg flex items-center justify-center font-mono font-black text-sm",
                          reached ? "bg-system-cyan text-black" : "bg-slate-900 text-slate-700"
                        )}>
                          {t.rank.slice(0, 3)}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[11px] font-mono uppercase font-black text-white italic tracking-tighter">
                            {isDK && !reached ? "UNKNOWN ORIGIN" : t.rank}
                          </span>
                          <span className="text-[9px] font-mono text-slate-500 tracking-widest uppercase">
                            {isDK && !reached ? "LVL ???" : `Level ${t.level}+`}
                          </span>
                        </div>
                      </div>
                      {current && (
                        <motion.div 
                          animate={{ opacity: [0.3, 1, 0.3], scale: [1, 1.2, 1] }} 
                          transition={{ repeat: Infinity, duration: 2 }} 
                          className="w-2.5 h-2.5 rounded-full bg-system-cyan shadow-[0_0_15px_#00e5ff]" 
                        />
                      )}
                      {!reached && <Lock className="w-3 h-3 text-slate-700" />}
                    </div>
                  );
                })}
             </div>
          </section>

          <section className="bg-slate-900/10 border border-slate-900/30 p-8 rounded-[32px] flex flex-col gap-6">
             <div className="flex gap-5 items-start">
               <div className="p-3 bg-black border border-slate-800 rounded-xl">
                 <AlertTriangle className="w-5 h-5 text-slate-700" />
               </div>
               <div className="space-y-2">
                 <h2 className="text-[10px] font-mono font-bold uppercase tracking-[0.3em] text-slate-600">Integrity Check</h2>
                 <p className="text-[11px] text-slate-700 leading-relaxed font-mono italic">
                   "Strength is not given, it is taken. The Abyss does not wait for the hesitant."
                 </p>
               </div>
             </div>
             
             <button 
               onClick={handleLogout}
               className="w-full py-4 bg-slate-950 border border-slate-900 hover:border-system-cyan/50 hover:bg-system-cyan/5 text-slate-500 hover:text-system-cyan transition-all rounded-2xl font-mono text-[11px] uppercase tracking-[0.4em] font-bold flex items-center justify-center gap-3"
             >
               <LogOut className="w-4 h-4" /> Seal Monarch
             </button>
          </section>
        </aside>

        {/* Right HUD: Mission Deployment */}
        <div className="lg:col-span-8 flex flex-col">
          <AnimatePresence mode="wait">
            {!currentQuest ? (
              <motion.div 
                key="wait" 
                initial={{ opacity: 0, scale: 0.98 }} 
                animate={{ opacity: 1, scale: 1 }} 
                className="flex-1 bg-slate-900/5 border-2 border-dashed border-slate-900/50 p-20 rounded-[40px] text-center space-y-10 flex flex-col items-center justify-center group"
              >
                <div className="relative">
                  <Target className="w-20 h-20 text-slate-800 group-hover:text-system-cyan/30 transition-all duration-700" />
                  <motion.div 
                    initial={{ rotate: 0 }}
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 20, ease: "linear" }}
                    className="absolute -inset-8 border border-slate-800/30 rounded-full border-dashed"
                  />
                </div>
                
                <div className="space-y-4">
                  <h3 className="text-4xl font-mono font-bold italic text-slate-700 uppercase tracking-tighter">Manifest Mission</h3>
                  <p className="text-[10px] font-mono text-slate-700 uppercase tracking-[0.4em] max-w-sm mx-auto leading-relaxed">
                    Selected Rank: {player.selectedDifficulty} <br/> 
                    Physical resonance required for level gain.
                  </p>
                </div>
                
                <div className="flex flex-col gap-4 w-full max-w-sm">
                  <button 
                    onClick={generateQuest} 
                    disabled={isGenerating} 
                    className="w-full py-6 bg-system-cyan text-black font-mono font-bold uppercase tracking-[0.4em] text-lg hover:scale-105 active:scale-95 transition-all disabled:opacity-50 relative overflow-hidden group/btn"
                  >
                    <span className="relative z-10">{isGenerating ? "Connecting..." : "Begin Quest"}</span>
                    <div className="absolute inset-0 bg-white translate-x-[-100%] group-hover/btn:translate-x-0 transition-transform duration-300" />
                  </button>
                  <button 
                    onClick={handleLogout}
                    className="w-full py-4 bg-transparent border border-slate-900 text-slate-700 hover:text-system-cyan hover:border-system-cyan/30 transition-all font-mono text-[10px] uppercase tracking-[0.5em] font-bold"
                  >
                    Seal Monarch Protocol
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="active" 
                initial={{ opacity: 0, scale: 0.9, y: 50 }} 
                animate={{ opacity: 1, scale: 1, y: 0 }} 
                className="bg-black border-2 border-system-cyan p-10 md:p-14 rounded-[40px] space-y-12 shadow-[0_0_80px_rgba(0,229,255,0.08)] relative overflow-hidden"
              >
                {/* HUD Details */}
                <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                  <Zap className="w-48 h-48 text-system-cyan" />
                </div>
                
                <div className="flex flex-col md:flex-row justify-between items-start gap-8 relative z-10">
                   <div className="space-y-5">
                     <div className="flex items-center gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-system-cyan animate-ping" />
                        <div className="bg-system-cyan/10 text-system-cyan px-4 py-1 text-[10px] font-mono font-bold tracking-[0.5em] uppercase w-fit rounded-full border border-system-cyan/20">
                          {player.selectedDifficulty} Rank Mission
                        </div>
                     </div>
                     <h3 className="text-5xl md:text-6xl font-mono font-bold italic system-glow uppercase tracking-tighter leading-[0.9]">
                       {currentQuest.title}
                     </h3>
                   </div>
                   
                   <div className={cn(
                     "p-6 md:p-8 rounded-3xl border-2 backdrop-blur-xl bg-black/40 font-mono text-5xl font-bold tabular-nums min-w-[200px] flex flex-col items-center",
                     timeLeft < 60 ? "border-system-penalty text-system-penalty animate-pulse" : "border-slate-800 text-system-cyan shadow-[inset_0_0_20px_rgba(0,229,255,0.05)]"
                   )}>
                      <span className="text-[10px] uppercase tracking-[0.4em] mb-2 text-slate-500 font-bold">Time Limit</span>
                      {Math.floor(timeLeft/60)}:{(timeLeft%60).toString().padStart(2, '0')}
                   </div>
                </div>

                <div className="bg-slate-900/30 border-l-4 border-system-cyan p-8 rounded-r-2xl z-10 relative">
                   <p className="text-slate-300 font-mono italic text-sm md:text-base leading-relaxed">
                     "{currentQuest.description}"
                   </p>
                </div>

                <div className="space-y-8 z-10 relative">
                  <h4 className="text-[10px] font-mono font-bold uppercase tracking-[0.5em] text-slate-500">Objectives</h4>
                  <div className="grid grid-cols-1 gap-5">
                    {currentQuest.requirements.map((req, i) => (
                      <div key={i} className="flex items-center justify-between bg-slate-900/20 p-8 border border-slate-800/50 rounded-3xl group transition-all duration-500 hover:border-system-cyan/40 hover:bg-slate-900/40">
                        <div className="flex items-center gap-6">
                           <div className="w-14 h-14 rounded-2xl bg-black border border-slate-800 flex items-center justify-center font-mono text-system-cyan font-black text-xl">
                             0{i + 1}
                           </div>
                           <span className="font-mono text-2xl md:text-3xl uppercase font-bold tracking-tighter text-slate-100">{req.name}</span>
                        </div>
                        <div className="text-right">
                          <span className="font-mono text-5xl text-system-cyan font-black tracking-tighter">{req.amount}</span>
                          <span className="text-[10px] block text-slate-600 font-mono font-bold uppercase mt-1 tracking-widest text-white/40">Target Reps</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-6 relative z-10 flex flex-col gap-8">
                  <div className="flex flex-col gap-4">
                    <button 
                      onClick={completeQuest} 
                      className="w-full py-8 bg-white text-black font-mono font-bold uppercase tracking-[0.5em] hover:bg-system-cyan transition-all text-xl md:text-2xl shadow-[0_20px_40px_rgba(255,255,255,0.05)] flex items-center justify-center gap-4 group"
                    >
                      <CheckCircle2 className="w-8 h-8 group-hover:scale-110 transition-transform" />
                      Mission Complete
                    </button>
                    <button 
                      onClick={handleLogout}
                      className="w-full py-3 bg-transparent border border-slate-900/50 text-slate-800 hover:text-system-penalty hover:border-system-penalty/30 transition-all font-mono text-[10px] uppercase tracking-[0.4em]"
                    >
                      ABANDON MISSION & SEAL POWERS
                    </button>
                  </div>
                  <p className="text-center text-slate-600 font-mono text-[10px] uppercase tracking-[0.2em] italic">
                    Note: Progress will not clear unless system is reset. Failure results in level drain.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* System Modals */}
      <AnimatePresence>
        {showPenaltyModal && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-4"
          >
            <motion.div 
              initial={{ scale: 0.8, y: 100 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-black border-4 border-system-penalty p-20 max-w-lg w-full rounded-[40px] text-center space-y-12 shadow-[0_0_120px_rgba(255,0,85,0.25)] relative overflow-hidden"
            >
               <div className="absolute top-0 left-0 w-full h-1.5 bg-system-penalty/20">
                 <motion.div 
                  initial={{ width: 0 }} 
                  animate={{ width: '100%' }} 
                  transition={{ duration: 1, repeat: Infinity }} 
                  className="h-full bg-system-penalty" 
                 />
               </div>
               <Skull className="w-32 h-32 text-system-penalty mx-auto animate-pulse" />
               <div className="space-y-4">
                 <h2 className="text-6xl font-mono font-bold italic text-system-penalty penalty-glow uppercase tracking-tighter">PENALTY ZONE</h2>
                 <p className="text-slate-400 font-mono text-sm uppercase tracking-tight">Contract Violation Detected</p>
               </div>
               <div className="bg-system-penalty/10 p-10 rounded-3xl border border-system-penalty/20">
                  <span className="text-slate-400 text-xs font-mono block uppercase tracking-widest mb-4">Level Reduction</span>
                  <span className="text-system-penalty text-7xl font-mono font-black italic">-{PENALTY_LEVEL_DROP}</span>
               </div>
               <button 
                onClick={() => setShowPenaltyModal(false)} 
                className="w-full py-6 bg-system-penalty text-white font-mono font-bold uppercase tracking-[0.5em] transition-all hover:bg-white hover:text-black text-xl"
               >
                 Acknowledge & Resurrect
               </button>
            </motion.div>
          </motion.div>
        )}

        {showLevelUp && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/98 pointer-events-none"
          >
            <motion.div 
              initial={{ scale: 0.5, opacity: 0, rotate: -5 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 1.5, opacity: 0 }}
              onAnimationComplete={() => setTimeout(() => setShowLevelUp(null), 3000)}
              className="text-center space-y-12"
            >
               <motion.div
                animate={{ scale: [1, 1.05, 1], rotate: [-1, 1, -1] }}
                transition={{ repeat: Infinity, duration: 2 }}
               >
                 <h2 className="text-[10rem] md:text-[14rem] font-mono font-bold italic system-glow text-system-cyan uppercase tracking-tighter leading-none select-none">
                   LEVEL UP
                 </h2>
               </motion.div>
               <div className="flex items-center justify-center gap-16 font-mono">
                  <span className="text-7xl md:text-8xl text-slate-800 font-black tracking-tighter">{showLevelUp.from}</span>
                  <div className="w-48 h-1.5 bg-system-cyan shadow-[0_0_30px_#00e5ff] rounded-full" />
                  <span className="text-9xl md:text-[12rem] text-white font-black tracking-tighter">
                    {showLevelUp.to >= 100000 ? '???' : showLevelUp.to}
                  </span>
               </div>
               <div className="bg-system-cyan text-black px-12 py-3 font-mono font-bold tracking-[1.5em] uppercase text-2xl mx-auto w-fit italic">
                 ASCENDED
               </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <footer className="mt-24 py-12 border-t border-slate-900 w-full max-w-6xl flex flex-col md:flex-row justify-between items-center text-slate-800 font-mono text-[10px] tracking-[0.5em] uppercase z-10 gap-8">
        <div className="flex items-center gap-4">
          <CheckCircle2 className="w-4 h-4" />
          <span>© SHADOW MONARCH SYSTEM {new Date().getFullYear()}</span>
        </div>
        <div className="flex gap-12 text-center md:text-left">
          <span>Awakening Phase: 3.0.0-FINAL</span>
          <span className="text-system-cyan/20">Sync Code: {player.name.substring(0,3).toUpperCase()}X-SYST</span>
        </div>
      </footer>
    </div>
  );
}
