import {readFileSync,writeFileSync} from 'node:fs';
import {makeLevel,type Level,type VehicleSpec} from '../src/logic.ts';
const levels:Level[]=JSON.parse(readFileSync(new URL('../public/levels.json',import.meta.url),'utf8'));
const shuffles:Record<string,VehicleSpec[]>={};
for(const level of levels.filter(l=>l.id>=13)){
  let alternate:Level|undefined;
  for(let variant=100;variant<150;variant++){
    try{alternate=makeLevel(level.id,variant);break;}catch{}
  }
  if(!alternate)throw new Error(`No alternate layout for level ${level.id}`);
  if(!level.vehicles.every(v=>alternate!.vehicles.some(a=>a.id===v.id&&a.model===v.model&&a.scale===v.scale)))throw new Error('Vehicle archetype changed');
  shuffles[level.id]=alternate.vehicles;
}
writeFileSync(new URL('../public/vehicle-shuffles.json',import.meta.url),JSON.stringify(shuffles));
console.log(`Exported ${Object.keys(shuffles).length} alternate layouts preserving vehicle geometry and removal order.`);
