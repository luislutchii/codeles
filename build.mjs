#!/usr/bin/env node
// Build script for CodeLES monorepo - builds packages in dependency order

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

const packages = [
  'packages/core',
  'packages/providers', 
  'packages/tools',
  'packages/cli'
];

console.log('🔨 Building CodeLES monorepo...\n');

for (const pkg of packages) {
  const pkgPath = join(process.cwd(), pkg);
  const pkgJsonPath = join(pkgPath, 'package.json');
  
  if (!existsSync(pkgJsonPath)) {
    console.log(`⚠️  Skipping ${pkg} - package.json not found`);
    continue;
  }

  console.log(`📦 Building ${pkg}...`);
  
  try {
    execSync('npm run build', { 
      cwd: pkgPath, 
      stdio: 'inherit',
      env: { ...process.env, FORCE_COLOR: '1' }
    });
    console.log(`✅ ${pkg} built successfully\n`);
  } catch (error) {
    console.error(`❌ Failed to build ${pkg}`);
    process.exit(1);
  }
}

console.log('🎉 All packages built successfully!');
console.log('💡 Run with: node packages/cli/dist/cli.js');