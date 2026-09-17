/**
 * Loads settings from a .env file next to the project, for running the game
 * by hand (`npm run dev`, `npm start`). Docker and hosting dashboards pass
 * these in themselves, and anything already set wins.
 *
 * This lives in its own file, and is imported first, because JavaScript runs
 * every import before the file that imports them: settings read at the top of
 * another file would otherwise be read before the .env file was opened.
 */
try {
  process.loadEnvFile?.();
} catch { /* no .env file, which is perfectly normal */ }
