import {writeFileSync} from 'node:fs';
import {makeLevel} from '../src/logic.ts';
const levels=Array.from({length:50},(_,i)=>makeLevel(i+1));
writeFileSync(new URL('../public/levels.json',import.meta.url),JSON.stringify(levels));
console.log(`Exported ${levels.length} deterministic, playable level configurations.`);
