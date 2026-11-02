import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const required = ['index.html', 'styles.css', 'app.js', 'api/generate-scenes.js'];
for (const file of required) if (!existsSync(file)) throw new Error(`Arquivo obrigatório ausente: ${file}`);
for (const file of ['app.js', 'api/generate-scenes.js']) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || `Falha de sintaxe em ${file}`);
}
const html = readFileSync('index.html', 'utf8');
for (const token of ['id="map"', 'id="inspectorContent"', 'id="sceneStrip"', 'id="presentation"']) {
  if (!html.includes(token)) throw new Error(`Elemento principal ausente no HTML: ${token}`);
}
console.log('RAMILES INTELLIGENCE: verificação estrutural e sintática concluída.');
