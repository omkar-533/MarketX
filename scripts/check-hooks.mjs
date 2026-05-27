import fs from 'fs';
import path from 'path';

const hooks = ['useState', 'useEffect', 'useMemo', 'useCallback', 'useRef', 'useLayoutEffect'];

function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(f)) out.push(p);
  }
  return out;
}

for (const file of walk('src')) {
  const src = fs.readFileSync(file, 'utf8');
  const m = src.match(/import\s*\{([^}]+)\}\s*from\s*['"]react['"]/);
  const imported = m ? m[1] : '';
  for (const hook of hooks) {
    if (new RegExp(`\\b${hook}\\s*\\(`).test(src) && !imported.includes(hook)) {
      console.log(`${hook} used but not imported: ${file}`);
    }
  }
}
