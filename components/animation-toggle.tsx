'use client';

import { useState, useEffect } from 'react';
import { Button } from './ui/button';

export function AnimationToggle() {
  const [animationsEnabled, setAnimationsEnabled] = useState(true);
  const [nebulaEnabled, setNebulaEnabled] = useState(true);
  const [starsEnabled, setStarsEnabled] = useState(true);
  const [shootingStarsEnabled, setShootingStarsEnabled] = useState(true);

  useEffect(() => {
    // Initialize state based on current CSS variables
    const root = document.documentElement;
    const computedStyle = getComputedStyle(root);
    
    setAnimationsEnabled(computedStyle.getPropertyValue('--animation-play-state') !== 'paused');
    setNebulaEnabled(parseFloat(computedStyle.getPropertyValue('--nebula-opacity') || '0') > 0);
    setStarsEnabled(parseFloat(computedStyle.getPropertyValue('--stars-opacity') || '0') > 0);
    setShootingStarsEnabled(computedStyle.getPropertyValue('--shooting-stars-display') !== 'none');
  }, []);

  // Helper function to find all animation elements
  const findAllAnimationElements = () => {
    // Get the consolidated animation container
    const animationContainer = document.querySelector('.cosmic-animation-container') as HTMLElement | null;
    
    // Get all animation elements from the container
    const auroras = document.querySelectorAll('.cosmic-animation-container .aurora') as NodeListOf<HTMLElement>;
    const shootingStars = document.querySelectorAll('.cosmic-animation-container .shooting-star') as NodeListOf<HTMLElement>;
    const cosmicDusts = document.querySelectorAll('.cosmic-animation-container .cosmic-dust') as NodeListOf<HTMLElement>;
    const pulsatingStars = document.querySelectorAll('.cosmic-animation-container .pulsating-stars') as NodeListOf<HTMLElement>;
    const parallaxStars = document.querySelectorAll('.cosmic-animation-container .parallax-stars') as NodeListOf<HTMLElement>;
    const randomStars = document.querySelectorAll('.cosmic-animation-container .random-stars') as NodeListOf<HTMLElement>;
    
    return {
      animationContainer,
      auroras,
      shootingStars,
      cosmicDusts,
      pulsatingStars,
      parallaxStars,
      randomStars
    };
  };

  const toggleAnimations = () => {
    const newState = !animationsEnabled;
    setAnimationsEnabled(newState);
    
    // Set CSS variable for animation play state - controls all animations
    document.documentElement.style.setProperty(
      '--animation-play-state',
      newState ? 'running' : 'paused'
    );
    
    // Set animation opacity variable
    document.documentElement.style.setProperty(
      '--animation-opacity',
      newState ? '1' : '0'
    );
    
    // Toggle the messages background visibility
    const messagesBackground = document.querySelector('.messages-background') as HTMLElement | null;
    if (messagesBackground) {
      // When animations are off, completely hide the background
      messagesBackground.style.opacity = newState ? '1' : '0';
      
      // Also hide the background gradients when animations are off
      messagesBackground.style.backgroundImage = newState ? '' : 'none';
    }
    
    // Control the consolidated animation container
    const { animationContainer, randomStars } = findAllAnimationElements();
    if (animationContainer) {
      animationContainer.style.display = newState ? 'block' : 'none';
    }
    
    // Ensure random stars are properly handled
    randomStars.forEach(element => {
      element.style.display = newState ? 'block' : 'none';
      element.style.opacity = newState ? '1' : '0';
      
      // Also pause/play the animations
      const stars = element.querySelectorAll('.random-star');
      stars.forEach(star => {
        (star as HTMLElement).style.animationPlayState = newState ? 'running' : 'paused';
      });
    });
    
    // Also check for any body pseudo-elements that might have animations
    document.documentElement.style.setProperty(
      '--body-before-opacity',
      newState ? '1' : '0'
    );
    document.documentElement.style.setProperty(
      '--body-after-opacity',
      newState ? '1' : '0'
    );
  };

  const toggleNebula = () => {
    const newState = !nebulaEnabled;
    setNebulaEnabled(newState);
    
    // Set CSS variable for nebula opacity
    document.documentElement.style.setProperty(
      '--nebula-opacity',
      newState ? '0.9' : '0'
    );
    
    // Toggle all aurora elements
    const { auroras } = findAllAnimationElements();
    auroras.forEach(aurora => {
      aurora.style.display = newState ? 'block' : 'none';
    });
  };

  const toggleStars = () => {
    const newState = !starsEnabled;
    setStarsEnabled(newState);
    
    // Set CSS variable for stars opacity
    document.documentElement.style.setProperty(
      '--stars-opacity',
      newState ? '0.9' : '0'
    );
    
    // Toggle all star-related elements
    const { pulsatingStars, parallaxStars, cosmicDusts, randomStars } = findAllAnimationElements();
    
    const allStarElements = [...pulsatingStars, ...parallaxStars, ...cosmicDusts];
    allStarElements.forEach(element => {
      element.style.display = newState ? 'block' : 'none';
    });
    
    // Handle random stars separately with higher visibility
    randomStars.forEach(element => {
      element.style.display = newState ? 'block' : 'none';
      element.style.opacity = newState ? '1' : '0';
    });
  };

  const toggleShootingStars = () => {
    const newState = !shootingStarsEnabled;
    setShootingStarsEnabled(newState);
    
    // Set CSS variable for shooting stars display
    document.documentElement.style.setProperty(
      '--shooting-stars-display',
      newState ? 'block' : 'none'
    );
    
    // Toggle all shooting star elements
    const { shootingStars } = findAllAnimationElements();
    shootingStars.forEach(element => {
      element.style.display = newState ? 'block' : 'none';
    });
  };

  const resetAnimations = () => {
    setAnimationsEnabled(true);
    setNebulaEnabled(true);
    setStarsEnabled(true);
    setShootingStarsEnabled(true);
    
    // Reset all CSS variables
    document.documentElement.style.setProperty('--animation-play-state', 'running');
    document.documentElement.style.setProperty('--animation-opacity', '1');
    document.documentElement.style.setProperty('--nebula-opacity', '0.9');
    document.documentElement.style.setProperty('--stars-opacity', '0.9');
    document.documentElement.style.setProperty('--shooting-stars-display', 'block');
    document.documentElement.style.setProperty('--body-before-opacity', '1');
    document.documentElement.style.setProperty('--body-after-opacity', '1');
    
    // Get all animation elements
    const { 
      animationContainer, 
      auroras, 
      shootingStars, 
      cosmicDusts, 
      pulsatingStars, 
      parallaxStars,
      randomStars
    } = findAllAnimationElements();
    
    // Make sure the animation container is visible
    if (animationContainer) {
      animationContainer.style.display = 'block';
    }
    
    // Make sure all elements are visible
    const allElements = [...auroras, ...shootingStars, ...cosmicDusts, ...pulsatingStars, ...parallaxStars, ...randomStars];
    allElements.forEach(element => { 
      element.style.display = 'block';
      element.style.animationPlayState = 'running';
      
      // Reset animation play state for all child elements
      const animatedChildren = element.querySelectorAll('*');
      animatedChildren.forEach(child => {
        (child as HTMLElement).style.animationPlayState = 'running';
      });
    });
    
    // Make sure the messages background is visible
    const messagesBackground = document.querySelector('.messages-background') as HTMLElement | null;
    if (messagesBackground) {
      messagesBackground.style.opacity = '1';
      messagesBackground.style.backgroundImage = '';
    }
    
    // Force animation restart
    setTimeout(() => {
      document.documentElement.style.setProperty('--animation-play-state', 'paused');
      setTimeout(() => {
        document.documentElement.style.setProperty('--animation-play-state', 'running');
      }, 50);
    }, 100);
  };

  // Function to regenerate random stars
  const regenerateStars = () => {
    // Find the chat component's generateRandomStars function
    const chatComponent = document.querySelector('.messages-container');
    if (chatComponent && 'generateRandomStars' in window) {
      // @ts-ignore - Call the global function
      window.generateRandomStars();
    } else {
      console.error('Could not find generateRandomStars function');
      
      // Alternative: Clear existing stars and let them regenerate
      const randomStars = document.querySelector('.cosmic-animation-container .random-stars') as HTMLElement | null;
      if (randomStars) {
        randomStars.innerHTML = '';
        
        // Force a refresh by toggling display
        randomStars.style.display = 'none';
        setTimeout(() => {
          randomStars.style.display = 'block';
          
          // Reload the page to regenerate stars
          window.location.reload();
        }, 100);
      }
    }
  };

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 bg-background/80 backdrop-blur-sm p-2 rounded-lg border border-border shadow-lg">
      <Button
        variant={animationsEnabled ? "default" : "outline"}
        size="sm"
        onClick={toggleAnimations}
        className="w-full"
      >
        {animationsEnabled ? "Pause" : "Play"}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={regenerateStars}
        className="w-full"
      >
        New Stars
      </Button>
    </div>
  );
} 