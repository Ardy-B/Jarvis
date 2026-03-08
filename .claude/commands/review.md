Review jarvis.js and jarvis-ui.jsx before committing.

Check:
1. No new npm requires added beyond fs, path, child_process
2. No execSync calls: grep -n "execSync" jarvis.js
3. All analysis functions have try/catch wrappers
4. attachRoutes() registers /briefing, /dismiss, /action
5. jarvis-ui.jsx still exports on window.JarvisUI

If all pass, the module is safe to commit.
