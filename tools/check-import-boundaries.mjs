import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.[cm]?[jt]sx?$/.test(entry.name) ? [path] : [];
  }));
  return nested.flat();
}

export async function findBoundaryViolations(root) {
  const apps = join(root, 'apps');
  const directories = (await readdir(apps, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && /^(agent|field)-/.test(entry.name));
  const violations = [];
  for (const directory of directories) {
    const product = directory.name.startsWith('agent-') ? 'agent' : 'field';
    const forbidden = product === 'agent' ? 'field' : 'agent';
    const source = join(apps, directory.name, 'src');
    for (const file of await sourceFiles(source)) {
      const content = await readFile(file, 'utf8');
      const imports = /(?:\b(?:import|export)\s+(?:[^'"`]*?\s+from\s*)?|\bimport\s*\(\s*)['"]([^'"]+)['"]/g;
      for (const match of content.matchAll(imports)) {
        const specifier = match[1];
        if (!specifier) continue;
        const target = specifier.startsWith('.') ? resolve(dirname(file), specifier) : '';
        const otherAppPath = join(apps, `${forbidden}-`);
        const crossesApp = target.startsWith(otherAppPath) && target.includes(`${sep}src${sep}`);
        const crossesPackage = specifier.startsWith(`@fieldai/${forbidden}-`)
          || target.includes(`${sep}packages${sep}${forbidden}-`);
        if (crossesApp || crossesPackage) violations.push(`${relative(root, file)}: ${specifier}`);
      }
    }
  }
  return violations;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const violations = await findBoundaryViolations(process.cwd());
  if (violations.length) {
    process.stderr.write(`${violations.join('\n')}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write('No direct cross-product internal imports found.\n');
  }
}
