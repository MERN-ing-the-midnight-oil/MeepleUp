import React, { useEffect, useRef, useState } from 'react';
import './ParallaxBackground.css';

const MEEPLE_PATH = 'M9 20h-5a1 1 0 0 1 -1 -1c0 -2 3.378 -4.907 4 -6c-1 0 -4 -.5 -4 -2c0 -2 4 -3.5 6 -4c0 -1.5 .5 -4 3 -4s3 2.5 3 4c2 .5 6 2 6 4c0 1.5 -3 2 -4 2c.622 1.093 4 4 4 6a1 1 0 0 1 -1 1h-5c-1 0 -2 -4 -3 -4s-2 4 -3 4z';

// Layer configurations
const LAYER_CONFIGS = {
  background: {
    sizeRange: [25, 45],
    speedRange: [6, 10], // seconds
    opacityRange: [0.7, 0.9], // Inverted: smallest figures are darkest
    tiltRange: [-20, 20],
    spawnWeight: 0.55, // 50-60% of meeples
  },
  midground: {
    sizeRange: [50, 70],
    speedRange: [10, 15],
    opacityRange: [0.4, 0.6], // Medium opacity for medium size
    tiltRange: [-35, 35],
    spawnWeight: 0.35, // 30-40% of meeples
  },
  foreground: {
    sizeRange: [80, 120],
    speedRange: [15, 20],
    opacityRange: [0.15, 0.25], // Inverted: largest figures are most transparent
    tiltRange: [-20, 20],
    spawnWeight: 0.10, // 10-15% of meeples
  },
};

// Helper to get random value in range
const randomInRange = (min, max) => min + Math.random() * (max - min);

// Helper to select layer based on weights
const selectLayer = () => {
  const rand = Math.random();
  if (rand < LAYER_CONFIGS.background.spawnWeight) return 'background';
  if (rand < LAYER_CONFIGS.background.spawnWeight + LAYER_CONFIGS.midground.spawnWeight) return 'midground';
  return 'foreground';
};

// Stratified randomness: divide viewport into segments
const SEGMENT_COUNT = 10;
const getStratifiedX = (width, usedSegments) => {
  // Find available segments
  const availableSegments = [];
  for (let i = 0; i < SEGMENT_COUNT; i++) {
    if (!usedSegments.has(i)) {
      availableSegments.push(i);
    }
  }
  
  // If all segments used, reset
  if (availableSegments.length === 0) {
    usedSegments.clear();
    for (let i = 0; i < SEGMENT_COUNT; i++) {
      availableSegments.push(i);
    }
  }
  
  // Select random segment from available
  const segmentIndex = availableSegments[Math.floor(Math.random() * availableSegments.length)];
  usedSegments.add(segmentIndex);
  
  // Randomize within segment
  const segmentWidth = width / SEGMENT_COUNT;
  const segmentStart = segmentIndex * segmentWidth;
  return segmentStart + Math.random() * segmentWidth;
};

const ParallaxBackground = ({ children, enabled = true }) => {
  const containerRef = useRef(null);
  const [particles, setParticles] = useState([]);
  const particleIdRef = useRef(0);
  const usedSegmentsRef = useRef(new Set());
  const spawnIntervalRef = useRef(null);
  const animationFrameRef = useRef(null);
  
  const getViewportSize = () => {
    if (containerRef.current) {
      return {
        width: containerRef.current.offsetWidth || window.innerWidth,
        height: containerRef.current.offsetHeight || window.innerHeight,
      };
    }
    return {
      width: window.innerWidth,
      height: window.innerHeight,
    };
  };
  
  // Spawn rate: faster for smaller screens, slower for larger
  const getSpawnInterval = () => {
    const { width, height } = getViewportSize();
    const baseInterval = 800; // milliseconds
    const screenArea = width * height;
    const normalizedArea = screenArea / (1920 * 1080); // Normalize to 1080p
    return baseInterval * (1 + normalizedArea * 0.5); // Scale up for larger screens
  };
  
  const spawnMeeple = () => {
    if (!enabled || !containerRef.current) return;
    
    const { width, height } = getViewportSize();
    if (width === 0 || height === 0) return;
    
    const layer = selectLayer();
    const config = LAYER_CONFIGS[layer];
    const size = randomInRange(config.sizeRange[0], config.sizeRange[1]);
    const speed = randomInRange(config.speedRange[0], config.speedRange[1]);
    const opacity = randomInRange(config.opacityRange[0], config.opacityRange[1]);
    const tilt = randomInRange(config.tiltRange[0], config.tiltRange[1]);
    const x = getStratifiedX(width, usedSegmentsRef.current);
    const id = particleIdRef.current++;
    
    const particle = {
      id,
      layer,
      x: x - size / 2, // Center the meeple
      y: height + size, // Start below viewport
      size,
      speed,
      opacity,
      tilt,
      startTime: Date.now(),
    };
    
    setParticles(prev => [...prev, particle]);
    
    // Remove segment from used set after a delay to allow reuse
    setTimeout(() => {
      // Find which segment this x belongs to
      const segmentIndex = Math.floor((x / width) * SEGMENT_COUNT);
      usedSegmentsRef.current.delete(segmentIndex);
    }, 2000);
  };
  
  const removeParticle = (id) => {
    setParticles(prev => prev.filter(p => p.id !== id));
  };
  
  // Animation loop using requestAnimationFrame
  useEffect(() => {
    if (!enabled) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }
    
    const animate = () => {
      const now = Date.now();
      const { height } = getViewportSize();
      
      setParticles(prev => {
        return prev.map(particle => {
          const elapsed = (now - particle.startTime) / 1000; // Convert to seconds
          const progress = elapsed / particle.speed;
          
          if (progress >= 1) {
            // Particle has completed its journey
            setTimeout(() => removeParticle(particle.id), 0);
            return particle;
          }
          
          // Calculate new Y position
          const startY = height + particle.size;
          const endY = -particle.size;
          const currentY = startY + (endY - startY) * progress;
          
          return {
            ...particle,
            y: currentY,
          };
        }).filter(particle => {
          // Keep particles that haven't completed
          const elapsed = (now - particle.startTime) / 1000;
          return elapsed < particle.speed;
        });
      });
      
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    
    animationFrameRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [enabled]);
  
  useEffect(() => {
    if (!enabled) {
      if (spawnIntervalRef.current) {
        clearInterval(spawnIntervalRef.current);
        spawnIntervalRef.current = null;
      }
      return;
    }
    
    // Initial spawn
    spawnMeeple();
    
    // Set up spawn interval
    const interval = getSpawnInterval();
    spawnIntervalRef.current = setInterval(spawnMeeple, interval);
    
    // Handle window resize
    const handleResize = () => {
      // Clear used segments on resize to prevent issues
      usedSegmentsRef.current.clear();
    };
    
    window.addEventListener('resize', handleResize);
    
    return () => {
      if (spawnIntervalRef.current) {
        clearInterval(spawnIntervalRef.current);
        spawnIntervalRef.current = null;
      }
      window.removeEventListener('resize', handleResize);
    };
  }, [enabled]);
  
  return (
    <div ref={containerRef} className="parallax-background">
      {/* Background layers */}
      {enabled && (
        <div className="parallax-background-layers">
          {particles.map(particle => {
            // Calculate rotation with subtle animation
            const now = Date.now();
            const elapsed = (now - particle.startTime) / 1000;
            const rotationProgress = elapsed / particle.speed;
            const rotationOffset = Math.sin(rotationProgress * Math.PI * 2) * 5;
            const rotation = particle.tilt + rotationOffset;
            
            return (
              <svg
                key={particle.id}
                className={`meeple-particle meeple-${particle.layer}`}
                style={{
                  position: 'absolute',
                  left: `${particle.x}px`,
                  top: `${particle.y}px`,
                  width: `${particle.size}px`,
                  height: `${particle.size}px`,
                  minWidth: `${particle.size}px`, // Prevent shrinking
                  minHeight: `${particle.size}px`, // Prevent shrinking
                  maxWidth: `${particle.size}px`, // Prevent growing
                  maxHeight: `${particle.size}px`, // Prevent growing
                  opacity: particle.opacity,
                  transform: `rotate(${rotation}deg) scale(1)`, // Explicitly set scale to 1
                  willChange: 'transform',
                  // Prevent any opacity transitions or animations
                  transition: 'none',
                }}
                viewBox="0 0 24 24"
                preserveAspectRatio="xMidYMid meet"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d={MEEPLE_PATH}
                  fill="var(--meeple-red)"
                  style={{ opacity: 1 }} // Ensure path itself has full opacity
                />
              </svg>
            );
          })}
        </div>
      )}
      
      {/* Content */}
      <div className="parallax-background-content">
        {children}
      </div>
    </div>
  );
};

export default ParallaxBackground;

