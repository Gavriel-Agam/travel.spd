// Adds the release number to app.json's settings at build time, so Settings,
// feedback and error reports show the version that is really running.
// Version = 1.<number of commits on main>, build = the short commit id. Both
// come from git (the deploy workflow checks out the full history); without
// git the version in app.json is used.
const { execSync } = require('child_process');

function git(cmd) {
  try {
    return execSync(`git ${cmd}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return null;
  }
}

module.exports = ({ config }) => {
  const count = git('rev-list --count HEAD');
  const sha = (process.env.GITHUB_SHA || git('rev-parse HEAD') || '').slice(0, 7);
  const major = String(config.version || '1.0.0').split('.')[0];
  return {
    ...config,
    version: count ? `${major}.${count}` : config.version,
    extra: { ...config.extra, build: sha || null },
  };
};
