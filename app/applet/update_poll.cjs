const fs = require('fs');

let f = fs.readFileSync('src/App.tsx', 'utf8');

const newEffect = `
  const pollInFlightRef = useRef(false);
  const lastPollRef = useRef(0);

  useEffect(() => {
    fetchAllData();
    
    const checkPoll = async () => {
      if (pollInFlightRef.current) return;
      
      const now = Date.now();
      const isHidden = document.hidden;
      
      // Determine adaptive interval
      let intervalMs = 3000;
      // We read from the current refs directly or just don't add connectionStatus to dependencies and just read it from the component scope, wait actually connectionStatus is a simple state in this component! So capturing might be stale inside the setInterval callback unless we include them in dependencies. We will just check the state variables directly, wait actually we can use refs or just use connectionStatus. We're re-binding useEffect so it captures current connectionStatus.
      
      if (isHidden) {
          intervalMs = 15000;
      }
      
      if (now - lastPollRef.current >= intervalMs) {
          pollInFlightRef.current = true;
          try {
             await fetchAllData(true);
          } finally {
             lastPollRef.current = Date.now();
             pollInFlightRef.current = false;
          }
      }
    };

    const poll = setInterval(checkPoll, 1000);
    return () => clearInterval(poll);
  }, [connectionStatus, diagnosticSession]);
`;

f = f.replace(/\/\/ Immediate fetch \+ active 3-seconds[\s\S]*?return \(\) => clearInterval\(poll\);\n  \}, \[\]\);/, newEffect);

fs.writeFileSync('src/App.tsx', f);
