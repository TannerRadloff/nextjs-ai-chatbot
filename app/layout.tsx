import type { Metadata } from 'next';
import { Toaster } from 'sonner';
import Script from 'next/script';

import { ThemeProvider } from '@/components/theme-provider';

import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://chat.vercel.ai'),
  title: 'Next.js Chatbot Template',
  description: 'Next.js chatbot template using the AI SDK.',
};

export const viewport = {
  maximumScale: 1, // Disable auto-zoom on mobile Safari
};

const LIGHT_THEME_COLOR = 'hsl(0 0% 100%)';
const DARK_THEME_COLOR = 'hsl(240deg 10% 3.92%)';
const THEME_COLOR_SCRIPT = `\
(function() {
  var html = document.documentElement;
  var meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', '${DARK_THEME_COLOR}');
})();`;

// Enhanced animation initialization script
const ANIMATION_INIT_SCRIPT = `\
(function() {
  // Set animation variables
  document.documentElement.style.setProperty('--animation-play-state', 'running');
  document.documentElement.style.setProperty('--animation-opacity', '1');
  document.documentElement.style.setProperty('--nebula-opacity', '0.9');
  document.documentElement.style.setProperty('--stars-opacity', '0.9');
  document.documentElement.style.setProperty('--shooting-stars-display', 'block');
  document.documentElement.style.setProperty('--body-before-opacity', '1');
  document.documentElement.style.setProperty('--body-after-opacity', '1');
  
  // Function to generate random stars
  function generateRandomStars() {
    // Generate a unique seed for this session
    const sessionSeed = Math.floor(Math.random() * 1000000);
    
    // Simple random function with seed
    function seededRandom() {
      const x = Math.sin(sessionSeed++) * 10000;
      return x - Math.floor(x);
    }
    
    // Create random star field
    const randomStars = document.createElement('div');
    randomStars.className = 'random-stars';
    
    // Generate stars in different regions with varying densities
    
    // Dense cluster region (50-80 stars)
    const clusterStarCount = 50 + Math.floor(seededRandom() * 30);
    const clusterCenterX = 20 + seededRandom() * 60; // 20-80% of screen width
    const clusterCenterY = 20 + seededRandom() * 60; // 20-80% of screen height
    
    for (let i = 0; i < clusterStarCount; i++) {
      const star = document.createElement('div');
      star.className = 'random-star';
      
      // Position within cluster (Gaussian-like distribution)
      const angle = seededRandom() * Math.PI * 2;
      const distance = seededRandom() * seededRandom() * 30; // Concentrate toward center
      const top = clusterCenterY + Math.sin(angle) * distance;
      const left = clusterCenterX + Math.cos(angle) * distance;
      
      // Random size (0.5px - 3px)
      const size = 0.5 + seededRandom() * 2.5;
      
      // Random brightness
      const brightness = 0.5 + seededRandom() * 0.5;
      
      // Random twinkle animation delay and duration
      const delay = seededRandom() * 10;
      const duration = 3 + seededRandom() * 4;
      
      // Apply styles
      star.style.top = \`\${top}%\`;
      star.style.left = \`\${left}%\`;
      star.style.width = \`\${size}px\`;
      star.style.height = \`\${size}px\`;
      star.style.opacity = brightness.toString();
      star.style.animationDelay = \`\${delay}s\`;
      star.style.animationDuration = \`\${duration}s\`;
      
      randomStars.appendChild(star);
    }
    
    // Scattered stars throughout (40-60 stars)
    const scatteredStarCount = 40 + Math.floor(seededRandom() * 20);
    
    for (let i = 0; i < scatteredStarCount; i++) {
      const star = document.createElement('div');
      star.className = 'random-star';
      
      // Random position across entire screen
      const top = seededRandom() * 100;
      const left = seededRandom() * 100;
      
      // Random size (0.5px - 2px)
      const size = 0.5 + seededRandom() * 1.5;
      
      // Random brightness
      const brightness = 0.4 + seededRandom() * 0.6;
      
      // Random twinkle animation delay and duration
      const delay = seededRandom() * 10;
      const duration = 3 + seededRandom() * 4;
      
      // Apply styles
      star.style.top = \`\${top}%\`;
      star.style.left = \`\${left}%\`;
      star.style.width = \`\${size}px\`;
      star.style.height = \`\${size}px\`;
      star.style.opacity = brightness.toString();
      star.style.animationDelay = \`\${delay}s\`;
      star.style.animationDuration = \`\${duration}s\`;
      
      randomStars.appendChild(star);
    }
    
    // Bright highlight stars (10-15 stars)
    const brightStarCount = 10 + Math.floor(seededRandom() * 5);
    
    for (let i = 0; i < brightStarCount; i++) {
      const star = document.createElement('div');
      star.className = 'random-star bright';
      
      // Random position across entire screen
      const top = seededRandom() * 100;
      const left = seededRandom() * 100;
      
      // Larger size (2px - 4px)
      const size = 2 + seededRandom() * 2;
      
      // High brightness
      const brightness = 0.8 + seededRandom() * 0.2;
      
      // Random twinkle animation delay and duration
      const delay = seededRandom() * 10;
      const duration = 4 + seededRandom() * 3;
      
      // Apply styles
      star.style.top = \`\${top}%\`;
      star.style.left = \`\${left}%\`;
      star.style.width = \`\${size}px\`;
      star.style.height = \`\${size}px\`;
      star.style.opacity = brightness.toString();
      star.style.animationDelay = \`\${delay}s\`;
      star.style.animationDuration = \`\${duration}s\`;
      star.style.boxShadow = \`0 0 \${Math.floor(size * 2)}px \${Math.floor(size)}px rgba(255, 255, 255, 0.8)\`;
      
      randomStars.appendChild(star);
    }
    
    return randomStars;
  }
  
  // Check if animation elements exist, if not, create them
  const body = document.body;
  
  function createAnimationElements() {
    // Create the cosmic animation container if it doesn't exist
    let cosmicContainer = document.querySelector('.cosmic-animation-container');
    if (!cosmicContainer) {
      cosmicContainer = document.createElement('div');
      cosmicContainer.className = 'cosmic-animation-container';
      
      // Create the messages background if it doesn't exist
      let messagesBackground = document.querySelector('.messages-background');
      if (!messagesBackground) {
        messagesBackground = document.createElement('div');
        messagesBackground.className = 'messages-background';
        body.prepend(messagesBackground);
      }
      
      // Add the cosmic container to the messages background
      messagesBackground.appendChild(cosmicContainer);
      
      // Add random stars to the cosmic container
      const randomStars = generateRandomStars();
      cosmicContainer.appendChild(randomStars);
    }
    
    // Create aurora if it doesn't exist
    if (!document.querySelector('.cosmic-animation-container .aurora')) {
      const aurora = document.createElement('div');
      aurora.className = 'aurora';
      
      const light1 = document.createElement('div');
      light1.className = 'light';
      
      const light2 = document.createElement('div');
      light2.className = 'light light-2';
      
      const light3 = document.createElement('div');
      light3.className = 'light light-3';
      
      aurora.appendChild(light1);
      aurora.appendChild(light2);
      aurora.appendChild(light3);
      
      cosmicContainer.appendChild(aurora);
    }
    
    // Create shooting star if it doesn't exist
    if (!document.querySelector('.cosmic-animation-container .shooting-star')) {
      const shootingStar = document.createElement('div');
      shootingStar.className = 'shooting-star';
      
      const star1 = document.createElement('div');
      star1.className = 'star-1';
      
      const star2 = document.createElement('div');
      star2.className = 'star-2';
      
      const star3 = document.createElement('div');
      star3.className = 'star-3';
      
      shootingStar.appendChild(star1);
      shootingStar.appendChild(star2);
      shootingStar.appendChild(star3);
      
      cosmicContainer.appendChild(shootingStar);
    }
    
    // Create cosmic dust if it doesn't exist
    if (!document.querySelector('.cosmic-animation-container .cosmic-dust')) {
      const cosmicDust = document.createElement('div');
      cosmicDust.className = 'cosmic-dust';
      cosmicContainer.appendChild(cosmicDust);
    }
    
    // Create pulsating stars if they don't exist
    if (!document.querySelector('.cosmic-animation-container .pulsating-stars')) {
      const pulsatingStars = document.createElement('div');
      pulsatingStars.className = 'pulsating-stars';
      
      for (let i = 1; i <= 6; i++) {
        const star = document.createElement('div');
        star.className = 'star star-' + i;
        pulsatingStars.appendChild(star);
      }
      
      cosmicContainer.appendChild(pulsatingStars);
    }
    
    // Create parallax stars if they don't exist
    if (!document.querySelector('.cosmic-animation-container .parallax-stars')) {
      const parallaxStars = document.createElement('div');
      parallaxStars.className = 'parallax-stars';
      
      for (let i = 1; i <= 3; i++) {
        const layer = document.createElement('div');
        layer.className = 'layer layer-' + i;
        parallaxStars.appendChild(layer);
      }
      
      cosmicContainer.appendChild(parallaxStars);
    }
  }
  
  // Create animation elements immediately
  createAnimationElements();
  
  // Also try again after a short delay to handle any race conditions
  setTimeout(function() {
    createAnimationElements();
    
    // Force animation restart by briefly pausing and resuming
    document.documentElement.style.setProperty('--animation-play-state', 'paused');
    setTimeout(function() {
      document.documentElement.style.setProperty('--animation-play-state', 'running');
    }, 50);
  }, 100);
  
  // And try one more time after the page has fully loaded
  window.addEventListener('load', function() {
    createAnimationElements();
    
    // Force animation restart
    document.documentElement.style.setProperty('--animation-play-state', 'paused');
    setTimeout(function() {
      document.documentElement.style.setProperty('--animation-play-state', 'running');
    }, 50);
  });
})();`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // We can't use usePathname in a Server Component, so we'll use a client component wrapper
  // to conditionally render the AnimationToggle

  return (
    <html
      lang="en"
      // `next-themes` injects an extra classname to the body element to avoid
      // visual flicker before hydration. Hence the `suppressHydrationWarning`
      // prop is necessary to avoid the React hydration mismatch warning.
      // https://github.com/pacocoursey/next-themes?tab=readme-ov-file#with-app
      suppressHydrationWarning
    >
      <head>
        <Script id="theme-color-script" strategy="beforeInteractive">
          {THEME_COLOR_SCRIPT}
        </Script>
        <Script id="animation-init-script" strategy="afterInteractive">
          {ANIMATION_INIT_SCRIPT}
        </Script>
        <Script
          id="nextjs-core"
          strategy="beforeInteractive"
          src="/_next/static/chunks/webpack.js"
        />
      </head>
      <body className="antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          {/* Animation elements are now created by the script */}
          <Script src="/animation-diagnostic.js" strategy="afterInteractive" />
          <Toaster position="top-center" />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
