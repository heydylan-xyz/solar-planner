// Inline planner engine to avoid script loading issues
export const initializePlanner = () => {
  // This will be populated by injecting the script content
  const script = document.createElement('script');
  script.id = 'jackery-planner-engine';
  
  // Fetch and inject the planner script
  fetch(new URL('../imports/jackery-planner.js', import.meta.url).href)
    .then(response => response.text())
    .then(code => {
      script.textContent = code;
      document.head.appendChild(script);
      
      // Dispatch ready event
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('planner:ready'));
      }, 100);
    })
    .catch(error => {
      console.error('Failed to load planner:', error);
    });
    
  return script;
};
