import React, { useEffect, useRef, useState } from 'react';

import './ParallaxBackground.css';



const ParallaxBackground = ({ children }) => {

  const containerRef = useRef(null);

  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [scrollY, setScrollY] = useState(0);



  useEffect(() => {

    const handleMouseMove = (e) => {

      const { clientX, clientY } = e;

      const { innerWidth, innerHeight } = window;

      

      // Normalize to -1 to 1 range

      const x = (clientX / innerWidth - 0.5) * 2;

      const y = (clientY / innerHeight - 0.5) * 2;

      

      setMousePosition({ x, y });

    };



    const handleScroll = () => {

      setScrollY(window.scrollY);

    };



    window.addEventListener('mousemove', handleMouseMove);

    window.addEventListener('scroll', handleScroll);

    

    return () => {

      window.removeEventListener('mousemove', handleMouseMove);

      window.removeEventListener('scroll', handleScroll);

    };

  }, []);



  // Meeple configuration - adjust these to customize your background

  const meeples = [

    // Layer 1 - Slowest, largest, most transparent (far background)

    { x: 10, y: 15, size: 120, opacity: 0.15, speed: 0.1, layer: 1, rotation: 15 },

    { x: 70, y: 45, size: 140, opacity: 0.12, speed: 0.1, layer: 1, rotation: -20 },

    { x: 40, y: 75, size: 100, opacity: 0.1, speed: 0.1, layer: 1, rotation: 30 },

    { x: 85, y: 10, size: 110, opacity: 0.13, speed: 0.1, layer: 1, rotation: -15 },

    { x: 5, y: 50, size: 130, opacity: 0.11, speed: 0.1, layer: 1, rotation: 25 },

    { x: 60, y: 85, size: 95, opacity: 0.14, speed: 0.1, layer: 1, rotation: -30 },

    

    // Layer 2 - Medium speed (middle ground)

    { x: 25, y: 30, size: 80, opacity: 0.18, speed: 0.3, layer: 2, rotation: -10 },

    { x: 80, y: 20, size: 90, opacity: 0.2, speed: 0.3, layer: 2, rotation: 25 },

    { x: 15, y: 60, size: 70, opacity: 0.15, speed: 0.3, layer: 2, rotation: -15 },

    { x: 55, y: 85, size: 85, opacity: 0.17, speed: 0.3, layer: 2, rotation: 10 },

    { x: 90, y: 70, size: 75, opacity: 0.2, speed: 0.3, layer: 2, rotation: -25 },

    { x: 45, y: 10, size: 82, opacity: 0.19, speed: 0.3, layer: 2, rotation: 20 },

    { x: 8, y: 88, size: 78, opacity: 0.16, speed: 0.3, layer: 2, rotation: -18 },

    { x: 68, y: 55, size: 88, opacity: 0.18, speed: 0.3, layer: 2, rotation: 12 },

    { x: 92, y: 35, size: 72, opacity: 0.21, speed: 0.3, layer: 2, rotation: -22 },

    

    // Layer 3 - Fastest, smallest, most visible (foreground)

    { x: 30, y: 10, size: 50, opacity: 0.25, speed: 0.5, layer: 3, rotation: 20 },

    { x: 60, y: 25, size: 55, opacity: 0.28, speed: 0.5, layer: 3, rotation: -30 },

    { x: 85, y: 50, size: 45, opacity: 0.22, speed: 0.5, layer: 3, rotation: 15 },

    { x: 20, y: 80, size: 60, opacity: 0.3, speed: 0.5, layer: 3, rotation: -20 },

    { x: 50, y: 55, size: 50, opacity: 0.25, speed: 0.5, layer: 3, rotation: 35 },

    { x: 75, y: 90, size: 55, opacity: 0.28, speed: 0.5, layer: 3, rotation: -10 },

    { x: 12, y: 42, size: 48, opacity: 0.27, speed: 0.5, layer: 3, rotation: 18 },

    { x: 38, y: 68, size: 52, opacity: 0.29, speed: 0.5, layer: 3, rotation: -25 },

    { x: 65, y: 8, size: 46, opacity: 0.24, speed: 0.5, layer: 3, rotation: 28 },

    { x: 88, y: 78, size: 58, opacity: 0.31, speed: 0.5, layer: 3, rotation: -15 },

    { x: 42, y: 35, size: 51, opacity: 0.26, speed: 0.5, layer: 3, rotation: 22 },

    { x: 72, y: 62, size: 49, opacity: 0.28, speed: 0.5, layer: 3, rotation: -32 },

    { x: 95, y: 92, size: 54, opacity: 0.3, speed: 0.5, layer: 3, rotation: 16 },

  ];



  return (

    <div className="parallax-wrapper">

      <div className="parallax-container" ref={containerRef}>

        {[1, 2, 3].map((layerNum) => {

          const speed = layerNum === 1 ? 0.1 : layerNum === 2 ? 0.3 : 0.5;

          const scrollOffset = -(scrollY * speed);

          const mouseX = mousePosition.x * layerNum * 3;

          const mouseY = mousePosition.y * layerNum * 3;

          

          return (

          <div

            key={layerNum}

            className="parallax-layer"

            data-speed={speed}

            style={{

              transform: `translate(${mouseX}px, ${mouseY + scrollOffset}px)`

            }}

          >

            {meeples

              .filter(m => m.layer === layerNum)

              .map((meeple, idx) => (

                <div

                  key={`${layerNum}-${idx}`}

                  className="meeple"

                  style={{

                    left: `${meeple.x}%`,

                    top: `${meeple.y}%`,

                    width: `${meeple.size}px`,

                    height: `${meeple.size}px`,

                    opacity: meeple.opacity,

                    transform: `rotate(${meeple.rotation}deg)`

                  }}

                >

                  <svg viewBox="0 0 24 24" fill="currentColor">

                    <path d="M9 20h-5a1 1 0 0 1 -1 -1c0 -2 3.378 -4.907 4 -6c-1 0 -4 -.5 -4 -2c0 -2 4 -3.5 6 -4c0 -1.5 .5 -4 3 -4s3 2.5 3 4c2 .5 6 2 6 4c0 1.5 -3 2 -4 2c.622 1.093 4 4 4 6a1 1 0 0 1 -1 1h-5c-1 0 -2 -4 -3 -4s-2 4 -3 4z" />

                  </svg>

                </div>

              ))}

          </div>

          );

        })}

      </div>

      

      {/* Your app content goes here */}

      <div className="parallax-content">

        {children}

      </div>

    </div>

  );

};



export default ParallaxBackground;
