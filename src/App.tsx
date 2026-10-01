/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, type MouseEvent, type TouchEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';

// Stages definition
// 0: Inhale, 1: Hold, 2: Exhale, 3: Rest
const STAGE_NAMES = ["Inhala", "Mantén", "Exhala", "Reposa"];

export default function App() {
  // App Core States
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [hasStarted, setHasStarted] = useState<boolean>(false);
  const stageDuration = 4.0; // standard 4.0s box breathing cadence
  
  // Consolidate stage and progress to guarantee frame-level synchronization
  const [breathState, setBreathState] = useState({
    stage: 0,
    progress: 0, // 0.0 to 1.0
  });

  const { stage: currentStage, progress } = breathState;

  // Double-tap and single-tap tracking refs
  const lastTapTimeRef = useRef<number>(0);
  const tapTimeoutRef = useRef<number | null>(null);
  const [justRestarted, setJustRestarted] = useState<boolean>(false);
  const restartFeedbackTimeoutRef = useRef<number | null>(null);

  // 4-second visibility timer for dynamic action prompts (Toca para pausar / Toca para reanudar)
  const [showActionPrompt, setShowActionPrompt] = useState<boolean>(true);
  const actionPromptTimeoutRef = useRef<number | null>(null);

  // Trigger action prompt to be visible for exactly 4 seconds, then fade out
  const triggerActionPrompt = () => {
    setShowActionPrompt(true);
    if (actionPromptTimeoutRef.current) {
      clearTimeout(actionPromptTimeoutRef.current);
    }
    actionPromptTimeoutRef.current = window.setTimeout(() => {
      setShowActionPrompt(false);
      actionPromptTimeoutRef.current = null;
    }, 4000);
  };

  // Toggle play/pause state
  const togglePlay = () => {
    if (!isPlaying) {
      setHasStarted(true);
      setIsPlaying(true);
    } else {
      setIsPlaying(false);
    }
    triggerActionPrompt();
  };

  // Restart breathing cycle from stage 0 (Inhale)
  const handleRestart = () => {
    setBreathState({
      stage: 0,
      progress: 0,
    });
    setHasStarted(true);
    setIsPlaying(true);

    // Visual confirmation for restart
    setJustRestarted(true);
    triggerActionPrompt();
    if (restartFeedbackTimeoutRef.current) {
      clearTimeout(restartFeedbackTimeoutRef.current);
    }
    restartFeedbackTimeoutRef.current = window.setTimeout(() => {
      setJustRestarted(false);
    }, 650);
  };

  // Unified click/tap handler: single tap toggles play/pause, double tap restarts cycle
  const handleTap = (e?: MouseEvent | TouchEvent) => {
    if (e && 'stopPropagation' in e) {
      e.stopPropagation();
    }

    // Native double-click detection if available
    if (e && 'detail' in e && (e as MouseEvent).detail === 2) {
      if (tapTimeoutRef.current) {
        clearTimeout(tapTimeoutRef.current);
        tapTimeoutRef.current = null;
      }
      lastTapTimeRef.current = 0;
      handleRestart();
      return;
    }

    const now = performance.now();
    const timeSinceLastTap = now - lastTapTimeRef.current;

    if (timeSinceLastTap > 0 && timeSinceLastTap < 300) {
      // Double tap detected within 300ms
      if (tapTimeoutRef.current) {
        clearTimeout(tapTimeoutRef.current);
        tapTimeoutRef.current = null;
      }
      lastTapTimeRef.current = 0;
      handleRestart();
    } else {
      // First tap: buffer single-tap to allow detecting a second tap
      lastTapTimeRef.current = now;
      if (tapTimeoutRef.current) {
        clearTimeout(tapTimeoutRef.current);
      }
      tapTimeoutRef.current = window.setTimeout(() => {
        togglePlay();
        tapTimeoutRef.current = null;
      }, 280);
    }
  };

  // Clean up pending timeouts on unmount
  useEffect(() => {
    return () => {
      if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
      if (restartFeedbackTimeoutRef.current) clearTimeout(restartFeedbackTimeoutRef.current);
      if (actionPromptTimeoutRef.current) clearTimeout(actionPromptTimeoutRef.current);
    };
  }, []);

  // High-precision timing loop via requestAnimationFrame
  useEffect(() => {
    if (!isPlaying) return;

    let lastTime = performance.now();
    let frameId: number;

    const tick = (now: number) => {
      const elapsed = (now - lastTime) / 1000; // time in seconds
      lastTime = now;

      setBreathState((prev) => {
        let nextProgress = prev.progress + elapsed / stageDuration;
        let nextStage = prev.stage;
        
        if (nextProgress >= 1) {
          nextStage = (prev.stage + 1) % 4;
          nextProgress = nextProgress % 1;
        }
        
        return {
          stage: nextStage,
          progress: nextProgress,
        };
      });

      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [isPlaying, stageDuration]);

  // Helper to determine the stroke progress for each of the 4 edges
  const getLineProgress = (lineIndex: number) => {
    if (currentStage > lineIndex) return 1;
    if (currentStage === lineIndex) return progress;
    return 0;
  };

  // Calculate the scale for the central breathing square
  // Inhaling expands until touching the inner boundary of the progress border, Holding maintains contact, Exhaling contracts to center, Resting holds compact
  const MIN_SCALE = 1.0;
  const MAX_SCALE = 1.569; // 188px * 1.569 ≈ 295px (contact with the inner edge of the 300px border track)
  
  // Smooth respiratory easing curve
  const easeProgress = (1 - Math.cos(progress * Math.PI)) / 2;

  let activeScale = MIN_SCALE;
  if (currentStage === 0) {
    // Inhaling: expands from center to touching outer border
    activeScale = MIN_SCALE + easeProgress * (MAX_SCALE - MIN_SCALE);
  } else if (currentStage === 1) {
    // Holding: stays expanded touching outer border
    activeScale = MAX_SCALE;
  } else if (currentStage === 2) {
    // Exhaling: contracts back to center
    activeScale = MAX_SCALE - easeProgress * (MAX_SCALE - MIN_SCALE);
  } else if (currentStage === 3) {
    // Resting: stays compact in center
    activeScale = MIN_SCALE;
  }

  // Exact coordinates and dash arrays for clockwise square outline
  // Path length of each edge is exactly 300px inside a 320x320 SVG viewport
  const lineLength = 300;

  return (
    <div className="relative min-h-screen w-full bg-[#050301] text-amber-100 flex flex-col items-center justify-center overflow-hidden font-sans p-4 select-none">
      
      {/* Eye-Safe, Deep Moody Amber Ambience Background Waves */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-amber-950/20 blur-[130px] animate-wave-1" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-amber-900/10 blur-[150px] animate-wave-2" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-amber-950/5 blur-[180px]" />
      </div>

      {/* Global SVG Definitions for gradients */}
      <svg className="w-0 h-0 absolute pointer-events-none" aria-hidden="true">
        <defs>
          <linearGradient id="amberBrandGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#b45309" />
          </linearGradient>
        </defs>
      </svg>

      {/* MAIN BREATHING COORDINATOR */}
      <main className="relative flex flex-col items-center justify-center z-10">
        
        {/* Outer Frame with blurred static square surrounding the breathing mechanism */}
        <div
          onClick={handleTap}
          className="relative flex items-center justify-center w-80 h-80 touch-manipulation cursor-pointer"
        >
          
          {/* SURROUNDING BLURRED STATIC SQUARE (Serene visual anchor frame) */}
          <div className="absolute inset-0 bg-[#070402]/40 backdrop-blur-xl border border-amber-950/40 rounded-3xl shadow-[0_0_50px_rgba(69,26,3,0.15)]" />
          
          {/* Static border outline layout to give a sense of depth */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-20" viewBox="0 0 320 320">
            {/* Clockwise light background border track */}
            <line x1="10" y1="10" x2="310" y2="10" stroke="rgba(180, 83, 9, 0.15)" strokeWidth="4" strokeLinecap="round" />
            <line x1="310" y1="10" x2="310" y2="310" stroke="rgba(180, 83, 9, 0.15)" strokeWidth="4" strokeLinecap="round" />
            <line x1="310" y1="310" x2="10" y2="310" stroke="rgba(180, 83, 9, 0.15)" strokeWidth="4" strokeLinecap="round" />
            <line x1="10" y1="310" x2="10" y2="10" stroke="rgba(180, 83, 9, 0.15)" strokeWidth="4" strokeLinecap="round" />
          </svg>

          {/* CLOCKWISE SVG PROGRESS BORDER TRACK */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-20 rotate-0" viewBox="0 0 320 320">
            {/* Top edge fills during Inhale (Stage 0) */}
            <line
              x1="10"
              y1="10"
              x2="310"
              y2="10"
              stroke="#d97706"
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={lineLength}
              strokeDashoffset={lineLength * (1 - getLineProgress(0))}
              className="[filter:drop-shadow(0_0_6px_rgba(245,158,11,0.6))]"
            />

            {/* Right edge fills during Hold (Stage 1) */}
            <line
              x1="310"
              y1="10"
              x2="310"
              y2="310"
              stroke="#d97706"
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={lineLength}
              strokeDashoffset={lineLength * (1 - getLineProgress(1))}
              className="[filter:drop-shadow(0_0_6px_rgba(245,158,11,0.6))]"
            />

            {/* Bottom edge fills during Exhale (Stage 2) */}
            <line
              x1="310"
              y1="310"
              x2="10"
              y2="310"
              stroke="#d97706"
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={lineLength}
              strokeDashoffset={lineLength * (1 - getLineProgress(2))}
              className="[filter:drop-shadow(0_0_6px_rgba(245,158,11,0.6))]"
            />

            {/* Left edge fills during Rest (Stage 3) */}
            <line
              x1="10"
              y1="310"
              x2="10"
              y2="10"
              stroke="#d97706"
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={lineLength}
              strokeDashoffset={lineLength * (1 - getLineProgress(3))}
              className="[filter:drop-shadow(0_0_6px_rgba(245,158,11,0.6))]"
            />
          </svg>

          {/* CENTRAL PULSING SQUARE - Tap to Play/Pause, Double-Tap to Restart */}
          <motion.div
            onClick={handleTap}
            style={{ scale: activeScale }}
            whileTap={{ scale: activeScale * 0.97 }}
            role="button"
            tabIndex={0}
            aria-label={
              isPlaying
                ? "Pausar respiración. Doble toque para reiniciar."
                : hasStarted
                ? "Reanudar respiración. Doble toque para reiniciar."
                : "Iniciar respiración. Doble toque para reiniciar."
            }
            title="Toca para pausar o reanudar. Doble toque para reiniciar el ciclo."
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleTap();
              } else if (e.key === "r" || e.key === "R") {
                e.preventDefault();
                handleRestart();
              }
            }}
            className="w-[188px] h-[188px] bg-gradient-to-br from-[#1c0d03] via-[#0f0701] to-[#050301] border border-amber-900/40 hover:border-amber-600/60 rounded-2xl flex flex-col items-center justify-center p-5 shadow-[0_0_40px_rgba(120,53,4,0.25)] select-none z-10 cursor-pointer transition-colors duration-200 focus:outline-none focus:ring-1 focus:ring-amber-500/40 group relative overflow-hidden touch-manipulation"
          >
            {/* Subtle golden aura wave ripple on restart */}
            <AnimatePresence>
              {justRestarted && (
                <motion.div
                  key="restart-wave"
                  initial={{ scale: 0.85, opacity: 0.95 }}
                  animate={{ scale: 1.45, opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.65, ease: "easeOut" }}
                  className="absolute inset-0 rounded-2xl border-2 border-amber-400 pointer-events-none shadow-[0_0_25px_rgba(245,158,11,0.6)]"
                />
              )}
            </AnimatePresence>

            {/* Inner dynamic ring */}
            <div className="absolute inset-2 rounded-xl border border-amber-950/20 pointer-events-none group-hover:border-amber-700/20 transition-colors" />

            {/* Phase Name / State indicator */}
            <motion.div
              layout
              transition={{ layout: { duration: 0.35, ease: [0.25, 1, 0.5, 1] } }}
              className="text-center pointer-events-none flex flex-col items-center justify-center w-full"
            >
              <AnimatePresence mode="wait">
                <motion.h2
                  layout
                  key={isPlaying ? STAGE_NAMES[currentStage] : (hasStarted ? "Pausa" : "Inicia")}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  transition={{ duration: 0.3 }}
                  className="font-megrim text-3xl font-extrabold tracking-[0.2em] text-amber-500 drop-shadow-[0_0_12px_rgba(245,158,11,0.25)] group-hover:text-amber-400 transition-colors leading-none"
                >
                  {isPlaying ? STAGE_NAMES[currentStage] : (hasStarted ? "Pausa" : "Inicia")}
                </motion.h2>
              </AnimatePresence>

              {/* Dynamic Action Sub-Indicator - rendered only when present so heading stays dead-center otherwise */}
              <AnimatePresence>
                {(!hasStarted || showActionPrompt) && (
                  <motion.div
                    key={!hasStarted ? "initial" : (isPlaying ? "pause" : "resume")}
                    initial={{ opacity: 0, height: 0, marginTop: 0 }}
                    animate={{ opacity: 1, height: "auto", marginTop: 12 }}
                    exit={{ opacity: 0, height: 0, marginTop: 0 }}
                    transition={{ duration: 0.35, ease: "easeInOut" }}
                    className="overflow-hidden font-megrim text-sm font-semibold tracking-widest text-amber-700/80 group-hover:text-amber-500/90 transition-colors select-none"
                  >
                    <span>
                      {!hasStarted ? "Toca aquí" : (isPlaying ? "Toca para pausar" : "Toca para reanudar")}
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Small decorative corner accents inside the pulsing square */}
            <div className="absolute top-3 left-3 w-1.5 h-1.5 border-t border-l border-amber-700/40 group-hover:border-amber-500/60 transition-colors" />
            <div className="absolute top-3 right-3 w-1.5 h-1.5 border-t border-r border-amber-700/40 group-hover:border-amber-500/60 transition-colors" />
            <div className="absolute bottom-3 left-3 w-1.5 h-1.5 border-b border-l border-amber-700/40 group-hover:border-amber-500/60 transition-colors" />
            <div className="absolute bottom-3 right-3 w-1.5 h-1.5 border-b border-r border-amber-700/40 group-hover:border-amber-500/60 transition-colors" />
          </motion.div>
        </div>
      </main>

    </div>
  );
}
