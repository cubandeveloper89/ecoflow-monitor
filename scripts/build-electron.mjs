// Compila electron/main.ts y electron/preload.ts (con el servidor incluido) a dist-electron/*.cjs
import * as esbuild from 'esbuild'

const watch = process.argv.includes('--watch')

const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  sourcemap: watch ? 'inline' : false,
  minify: !watch,
  logLevel: 'warning',
  // electron y electron-updater se cargan de node_modules; bufferutil/utf-8-validate son opcionales de ws
  external: ['electron', 'electron-updater', 'bufferutil', 'utf-8-validate'],
  logOverride: { 'empty-import-meta': 'silent' },
}

const configs = [
  { ...common, entryPoints: ['electron/main.ts'], outfile: 'dist-electron/main.cjs' },
  { ...common, entryPoints: ['electron/preload.ts'], outfile: 'dist-electron/preload.cjs' },
]

if (watch) {
  for (const c of configs) {
    const ctx = await esbuild.context({
      ...c,
      plugins: [{ name: 'notify', setup: (b) => b.onEnd((r) => {
        if (!r.errors.length) process.send?.('built')
      }) }],
    })
    await ctx.watch()
  }
} else {
  await Promise.all(configs.map((c) => esbuild.build(c)))
  console.log('dist-electron listo')
}
