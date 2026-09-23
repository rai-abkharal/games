import {REFERENCE_FOUR} from './reference-layout.ts';
export const COLORS = ['blue','yellow','red','green','pink','cyan','orange','purple'] as const;
export type ColorId = typeof COLORS[number];
export type ModelId = 'car'|'minibus'|'bus';
export const PALETTE: Record<ColorId,string> = {blue:'#379FFA',yellow:'#FFCB25',red:'#FF414A',green:'#42E62D',pink:'#F844CA',cyan:'#18DCEA',orange:'#FF831E',purple:'#A537E9'};
export const MODELS = {
  car: {width:.94,length:1.52,height:.55,capacity:16},
  minibus: {width:.94,length:1.91,height:.67,capacity:24},
  bus: {width:1.04,length:2.55,height:.73,capacity:40}
} as const;
export interface Pose {x:number;z:number;yaw:number;scale:number}
export interface VehicleSpec extends Pose {id:number;model:ModelId;color:ColorId}
export interface Level {id:number;seed:number;vehicles:VehicleSpec[];passengers:ColorId[];solution:number[];loopCapacity:number}
export const ELEVATION=70*Math.PI/180;
export function ground(sx:number,sy:number):{x:number;z:number} {return {x:(sx-296)/50,z:(640-sy)/(50*Math.sin(ELEVATION))};}
export function screen(p:{x:number;z:number;y?:number}) {return {x:296+p.x*50,y:640-(p.z*Math.sin(ELEVATION)+(p.y||0)*Math.cos(ELEVATION))*50};}
export function direction(yaw:number) {return {x:Math.sin(yaw),z:Math.cos(yaw)};}
export function footprint(v:VehicleSpec) {
  const d=direction(v.yaw), r={x:d.z,z:-d.x};
  const w=MODELS[v.model].width*v.scale*.5, l=MODELS[v.model].length*v.scale*.5;
  return [-1,1].flatMap(a=>[-1,1].map(b=>({x:v.x+r.x*w*a+d.x*l*b,z:v.z+r.z*w*a+d.z*l*b})));
}
function project(points:{x:number;z:number}[],a:{x:number;z:number}){let lo=Infinity,hi=-Infinity;for(const p of points){const q=p.x*a.x+p.z*a.z;lo=Math.min(lo,q);hi=Math.max(hi,q);}return [lo,hi];}
export function overlaps(a:VehicleSpec,b:VehicleSpec,gap=.025):boolean{
  const axes=[direction(a.yaw),direction(a.yaw+Math.PI/2),direction(b.yaw),direction(b.yaw+Math.PI/2)];
  const pa=footprint(a),pb=footprint(b);
  return axes.every(axis=>{const[al,ah]=project(pa,axis),[bl,bh]=project(pb,axis);return ah>bl-gap&&bh>al-gap;});
}
/** Exact swept-OBB test using SAT entry/exit intervals. A center ray misses bus corners. */
export function blocks(a:VehicleSpec,b:VehicleSpec,maxDistance=18):boolean{
  const d=direction(a.yaw),axes=[d,direction(a.yaw+Math.PI/2),direction(b.yaw),direction(b.yaw+Math.PI/2)];
  const pa=footprint(a),pb=footprint(b);let enter=0,leave=maxDistance;
  for(const axis of axes){const[al,ah]=project(pa,axis),[bl,bh]=project(pb,axis);const speed=d.x*axis.x+d.z*axis.z;
    if(Math.abs(speed)<1e-7){if(ah<bl+.025||bh<al+.025)return false;continue;}
    let t0=(bl-ah+.025)/speed,t1=(bh-al-.025)/speed;if(t0>t1)[t0,t1]=[t1,t0];enter=Math.max(enter,t0);leave=Math.min(leave,t1);if(enter>leave)return false;
  }return leave>=.015&&enter<=maxDistance;
}
export function canExit(v:VehicleSpec,others:VehicleSpec[]) {return !others.some(o=>o.id!==v.id&&blocks(v,o));}
export function rng(seed:number){return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t^=t+Math.imul(t^t>>>7,61|t);return((t^t>>>14)>>>0)/4294967296;};}

/** Pull parked vehicles together without breaking any step of the departure witness.
 * Export-time only: phones load the finished positions from the campaign JSON. */
function compactParking(vehicles:VehicleSpec[],solution:number[]){
  const order=new Map(solution.map((id,i)=>[id,i]));
  const center={x:vehicles.reduce((n,v)=>n+v.x,0)/vehicles.length,z:vehicles.reduce((n,v)=>n+v.z,0)/vehicles.length};
  const legal=(v:VehicleSpec)=>vehicles.every(o=>o.id===v.id||!overlaps(v,o,.10)&&
    !(order.get(v.id)!<order.get(o.id)!?blocks(v,o):blocks(o,v)));
  for(const step of [.18,.09,.035])for(let pass=0;pass<18;pass++){
    let moved=false;
    // Alternate traversal so one edge does not absorb all of the clearance.
    for(const v of pass%2?[...vehicles].reverse():vehicles){
      const dx=center.x-v.x,dz=center.z-v.z,len=Math.hypot(dx,dz);if(len<step)continue;
      const moves=[{x:dx/len*step,z:dz/len*step},{x:Math.sign(dx)*Math.min(step,Math.abs(dx)),z:0},{x:0,z:Math.sign(dz)*Math.min(step,Math.abs(dz))}];
      for(const move of moves){const next={...v,x:v.x+move.x,z:v.z+move.z};if(Math.hypot(next.x-center.x,next.z-center.z)>=len||!legal(next))continue;v.x=next.x;v.z=next.z;moved=true;break;}
    }
    if(!moved)break;
  }
}

export function makeLevel(id:number,variant=0):Level {
  id=Math.max(1,Math.min(50,Math.floor(id)));const seed=9112026+id*1777+variant*7919;const random=rng(seed);
  const progression=Math.max(0,id-10);
  const count=id===1?6:id===2?12:id===3?23:id===4?30:id<=10?30+Math.floor((id-5)/4):31+Math.floor(progression/2);
  const numColors=id<=3?3:id<=10?Math.min(7,5+Math.floor((id-5)/15)):Math.min(8,5+Math.floor(progression/10));
  let vehicles:VehicleSpec[]=[];let solution:number[]=[];
  if(id===1){
    const data:[number,number,number,ColorId][]=[[410,756,-1.10,'blue'],[334,816,.42,'yellow'],[411,843,.42,'yellow'],[164,861,.42,'blue'],[248,891,-1.10,'red'],[221,939,-1.10,'red']];
    vehicles=data.map((v,i)=>({id:i,...ground(v[0],v[1]),yaw:v[2],scale:.82,model:'bus',color:v[3]}));
    // Keep the familiar six-bus silhouette, deriving a valid departure order from actual geometry.
  }else if(id===2){
    const colors:ColorId[]=['purple','orange','pink','green'];
    const coords:[number,number,number][]=[[210,671,Math.PI/2],[391,671,Math.PI/2],[156,764,0],[247,764,0],[336,764,0],[428,764,0],[204,849,-Math.PI/2],[386,849,-Math.PI/2],[156,940,0],[247,940,0],[336,940,0],[428,940,0]];
    vehicles=coords.map((v,i)=>({id:i,...ground(v[0],v[1]),yaw:v[2],scale:.87,model:'bus',color:colors[[0,0,0,1,2,1,3,3,1,2,1,3][i]]}));
  }else if(id===4){
    const headings={up:0,down:Math.PI,left:-Math.PI/2,right:Math.PI/2};
    vehicles=REFERENCE_FOUR.map((p,i)=>({id:i,...ground(p[0],p[1]+8-(i>=8&&i<=11?8:0)),yaw:headings[p[2]],scale:p[4]==='bus_long'?.91:p[4]==='car_short'?1.01:.78,model:p[4]==='bus_long'?'bus':p[4]==='car_short'?'car':'minibus',color:p[3]}));
  }else{
    const scale=id===3?.77:id<=10?.73-(id-5)/45*.07:.73+progression*.0005;
    // Reverse construction: each newly inserted car has a clear exit through all earlier cars.
    // Removing in reverse insertion order is consequently a constructive solution witness.
    for(let i=0;i<count;i++){
      let placed=false;
      for(let attempt=0;attempt<12000;attempt++){
        // On intervening levels, a 24-seat minibus replaces a 16-seat car.
        // Passenger demand therefore rises on every level after ten, not only when count rises.
        const model:ModelId=i%5===0?'bus':i%3===0||i===1&&progression%2===1?'minibus':'car';
        const sx=75+random()*442,sy=658+random()*396;
        const diagonal=id>=9&&id<=10;
        const yaw=Math.floor(random()*(diagonal?8:4))*(diagonal?Math.PI/4:Math.PI/2);
        const v:VehicleSpec={id:i,...ground(sx,sy),yaw,scale,model,color:COLORS[Math.floor(random()*numColors)]};
        if(footprint(v).some(p=>{const s=screen(p);return s.x<40||s.x>550||s.y<616||s.y>1090;}))continue;
        if(vehicles.some(o=>overlaps(v,o,.06))||!canExit(v,vehicles))continue;
        vehicles.push(v);placed=true;
        // Keep an open outer insertion area as the yard grows instead of scattering
        // small groups across the full lot and leaving unusable holes between them.
        if(vehicles.length%5===0)compactParking(vehicles,vehicles.map(v=>v.id).reverse());
        break;
      }
      if(!placed){if(variant<32)return makeLevel(id,variant+1);throw new Error(`Could not construct level ${id} vehicle ${i}`);}
    }
    solution=vehicles.map(v=>v.id).reverse();
  }
  if(!solution.length){const pending=[...vehicles];while(pending.length){const v=pending.find(v=>canExit(v,pending));if(!v)throw new Error(`Reference arrangement ${id} has no exit`);solution.push(v.id);pending.splice(pending.indexOf(v),1);}}
  compactParking(vehicles,solution);
  const passengers:ColorId[]=[];
  // Later levels mix more upcoming vehicles' demand, within the reachable 200-person loop.
  // This changes queue planning only; connected passengers still board in one continuous stream.
  const groupSize=id<=2?1:id<=10?2:id<30?3:4,portions=id<=2?1:id<=10?2:4;
  for(let i=0;i<solution.length;i+=groupSize){const group=solution.slice(i,i+groupSize).map(x=>vehicles.find(v=>v.id===x)!);
    for(let part=0;part<portions;part++)for(const v of group){
      const rows=MODELS[v.model].capacity/4;
      const people=(Math.floor((part+1)*rows/portions)-Math.floor(part*rows/portions))*4;
      for(let j=0;j<people;j++)passengers.push(v.color);
    }
  }
  return{id,seed,vehicles,passengers,solution,loopCapacity:200};
}

export type Status='yard'|'travel'|'boarding'|'leaving'|'gone';
export interface CarState {spec:VehicleSpec;status:Status;bay:number;remaining:number;reserved:number;clock:number;vip:boolean}
export const GROUP_SIZE=4, ENTRY_SECONDS=.65, BOARD_SECONDS=.45, CELEBRATION_SECONDS=1.5, DEPART_SECONDS=.68;
export interface Person {id:number;color:ColorId;slot:number;state:'entering'|'loop'|'running'|'boarded';vehicle:number;clock:number;startPhase:number;feedSide?:number;feedRow?:number}
export type GameEvent={type:'dispatch'|'board'|'full'|'win'|'fail'|'blocked'|'no-space'|'vip'|'arrange'|'shuffle';vehicle?:number;person?:number};
export class Simulation {
  readonly cars:CarState[]; readonly people:Person[]=[]; readonly events:GameEvent[]=[];
  readonly slots:(number|null)[]; readonly bays:(number|null)[]=Array(8).fill(null);
  feedIndex=0;phase=0;time=0;paused=false;state:'playing'|'win'|'fail'='playing';extraBays=0;extraBayIndex=5;vipUses=0;arrangeUses=0;shuffleUses=0;shuffleClock=0;boardClock=0;deadClock=0;winClock=0;
  /** Continuous queue row offsets keep the remaining feeder crowd walking forward. */
  feedRows=[0,0];private feedSides:number[]=[];private feedOrdinals:number[]=[];
  constructor(readonly level:Level){
    this.cars=level.vehicles.map(spec=>({spec,status:'yard',bay:-1,remaining:MODELS[spec.model].capacity,reserved:0,clock:0,vip:false}));
    this.slots=Array(level.loopCapacity).fill(null);
    let side=1,last:ColorId|undefined;const ordinal=[0,0];for(let i=0;i<level.passengers.length;i+=4){if(level.id>=3&&last!==undefined&&last!==level.passengers[i])side=1-side;this.feedSides.push(side);this.feedOrdinals.push(ordinal[side]++);last=level.passengers[i];}
    if(level.loopCapacity%4||level.passengers.length%4)throw new Error('Passenger counts must use complete four-person rows');
    for(let i=0;i<level.passengers.length;i+=4)if(level.passengers.slice(i,i+4).some(c=>c!==level.passengers[i]))throw new Error('Each passenger row must have one color');
    for(let s=0;s<this.slots.length&&this.feedIndex<level.passengers.length;s+=4)this.addRow(s,false);
    this.feedRows=[this.consumedRows(0),this.consumedRows(1)];
  }
  get unserved(){return this.level.passengers.length-this.people.filter(p=>p.state==='boarded').length;}
  get yard(){return this.cars.filter(c=>c.status==='yard').map(c=>c.spec);}
  consumedRows(side:number){let count=0;for(let i=0;i<this.feedIndex/4;i++)if(this.feedSides[i]===side)count++;return count;}
  feedSideAt(index:number){return this.feedSides[Math.floor(index/4)];}
  feedRowAt(index:number){return this.feedOrdinals[Math.floor(index/4)]-this.feedRows[this.feedSideAt(index)];}
  private addRow(slot:number,animate:boolean,waveIndex=0){
    const side=this.feedSideAt(this.feedIndex),row=this.feedRowAt(this.feedIndex);
    for(let lane=0;lane<4;lane++){const id=this.people.length;this.people.push({id,color:this.level.passengers[this.feedIndex++],slot:slot+lane,state:animate?'entering':'loop',vehicle:-1,clock:animate?-(waveIndex+lane)*.012:0,startPhase:0,feedSide:side,feedRow:row});this.slots[slot+lane]=id;}
  }
  personPhase(p:Person){return ((Math.floor(p.slot/4)/(this.slots.length/4))+this.phase)%1;}
  isOpenBay(i:number){return i>=1&&i<=4||this.extraBays===1&&i===this.extraBayIndex;}
  unlockExtraBay(index=5){if(this.extraBays>=1||this.state!=='playing'||index<5||index>7)return false;this.extraBays=1;this.extraBayIndex=index;return true;}
  dispatch(id:number,vip=false):boolean{
    if(this.paused||this.state!=='playing'||this.shuffleClock>0)return false;if(vip&&(this.level.id<4||this.vipUses>=2))return false;const car=this.cars.find(c=>c.spec.id===id);if(!car||car.status!=='yard')return false;
    if(!vip&&!canExit(car.spec,this.yard)){this.events.push({type:'blocked',vehicle:id});return false;}
    const bay=vip?(this.bays[0]===null?0:-1):this.bays.findIndex((b,i)=>this.isOpenBay(i)&&b===null);
    if(bay<0){this.events.push({type:'no-space'});return false;}
    if(vip)this.vipUses++;this.bays[bay]=id;car.bay=bay;car.status='travel';car.clock=0;car.vip=vip;this.deadClock=0;this.events.push({type:vip?'vip':'dispatch',vehicle:id});return true;
  }
  arrange():boolean{if(this.level.id<8||this.arrangeUses>=1||this.state!=='playing'||this.paused||this.shuffleClock>0)return false;
    const random=rng(this.level.seed+Math.floor(this.time*1000)+381),waiting:number[]=[];
    for(let i=this.feedIndex;i<Math.min(this.level.passengers.length,this.feedIndex+128);i+=4)waiting.push(i);
    for(let i=waiting.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[waiting[i],waiting[j]]=[waiting[j],waiting[i]];}
    const rows=Array.from({length:this.slots.length/4},(_,i)=>i*4);for(let i=rows.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[rows[i],rows[j]]=[rows[j],rows[i]];}
    let changed=false;for(const slot of rows){const row=this.rowAt(slot);if(row.length!==4||row.some(p=>p.state!=='loop'))continue;
      const match=waiting.findIndex(index=>this.level.passengers[index]!==row[0].color);if(match<0)continue;const index=waiting.splice(match,1)[0],color=row[0].color;
      for(let lane=0;lane<4;lane++){row[lane].color=this.level.passengers[index+lane];this.level.passengers[index+lane]=color;}changed=true;
    }
    if(changed){this.arrangeUses++;this.deadClock=0;this.events.push({type:'arrange'});}return changed;
  }
  shuffleVehicles(layout:VehicleSpec[]):boolean{
    if(this.level.id<13||this.shuffleUses>=1||this.state!=='playing'||this.paused||this.shuffleClock>0||this.yard.length<2||this.cars.some(c=>c.status==='travel'))return false;
    const pending=this.yard.map(v=>{const pose=layout.find(p=>p.id===v.id);if(!pose||pose.model!==v.model||pose.scale!==v.scale)throw new Error('Invalid vehicle shuffle layout');return{...v,x:pose.x,z:pose.z,yaw:pose.yaw};});
    for(let i=0;i<pending.length;i++)for(let j=i+1;j<pending.length;j++)if(overlaps(pending[i],pending[j],0))return false;
    const witness=[...pending];for(const id of this.level.solution){const index=witness.findIndex(v=>v.id===id);if(index<0)continue;if(!canExit(witness[index],witness))return false;witness.splice(index,1);}
    for(const pose of pending){const spec=this.cars[pose.id].spec;spec.x=pose.x;spec.z=pose.z;spec.yaw=pose.yaw;}
    this.shuffleUses++;this.shuffleClock=.65;this.deadClock=0;this.events.push({type:'shuffle'});return true;
  }
  private rowAt(slot:number){return this.slots.slice(slot,slot+4).filter((id):id is number=>id!==null).map(id=>this.people[id]);}
  private full(c:CarState){if(c.remaining===0&&c.reserved===0){c.status='leaving';c.clock=0;this.events.push({type:'full',vehicle:c.spec.id});}}
  recover(){if(this.state!=='fail')return;this.state='playing';this.deadClock=0;this.unlockExtraBay();
    for(const c of this.cars.filter(c=>c.status==='boarding')){
      // Recovery also consumes complete rows, preserving every color's total demand.
      for(let slot=0;slot<this.slots.length&&c.remaining>=4;slot+=4){const row=this.rowAt(slot);if(row.length!==4||row.some(p=>p.state!=='loop'&&p.state!=='entering')||row[0].color!==c.spec.color)continue;for(const p of row){this.slots[p.slot]=null;p.state='boarded';p.vehicle=c.spec.id;}c.remaining-=4;}
      while(c.remaining>=4){let found=-1;for(let i=this.feedIndex;i<this.level.passengers.length;i+=4)if(this.level.passengers[i]===c.spec.color){found=i;break;}if(found<0)break;
        for(let k=0;k<4;k++){[this.level.passengers[found+k],this.level.passengers[this.feedIndex+k]]=[this.level.passengers[this.feedIndex+k],this.level.passengers[found+k]];this.people.push({id:this.people.length,color:c.spec.color,slot:-1,state:'boarded',vehicle:c.spec.id,clock:0,startPhase:0});}this.feedIndex+=4;c.remaining-=4;
      }
      this.full(c);
    }
  }
  tick(dt:number){
    if(this.paused||this.state!=='playing')return;dt=Math.max(0,Math.min(dt,.1));this.time+=dt;this.shuffleClock=Math.max(0,this.shuffleClock-dt);this.phase=(this.phase+dt*.12)%1;
    for(let side=0;side<2;side++)this.feedRows[side]=Math.min(this.consumedRows(side),this.feedRows[side]+dt*3.5);
    for(const car of this.cars){car.clock+=dt;if(car.status==='travel'&&car.clock>=.95){car.status='boarding';car.clock=0;}if(car.status==='leaving'&&car.clock>=CELEBRATION_SECONDS+DEPART_SECONDS){car.status='gone';this.bays[car.bay]=null;}}
    for(const p of this.people){
      if(p.state==='entering'){p.clock+=dt;if(p.clock>=ENTRY_SECONDS)p.state='loop';}
      else if(p.state==='running'){p.clock+=dt;if(p.clock>=BOARD_SECONDS){p.state='boarded';const c=this.cars[p.vehicle];c.reserved--;c.remaining--;this.events.push({type:'board',vehicle:p.vehicle,person:p.id});this.full(c);}}
    }
    // Admit a continuous stream into contiguous reserved vacancies, from one feeder at a time.
    for(let slot=0;slot<this.slots.length&&this.feedIndex<this.level.passengers.length;slot+=4){
      if(this.slots.slice(slot,slot+4).some(id=>id!==null))continue;
      const side=this.feedSideAt(this.feedIndex),mergePhase=side===1?.90:.60,phase=(slot/this.slots.length+this.phase)%1;
      if(phase<mergePhase-.02||phase>=mergePhase-.004)continue;
      let wave=0;for(let n=0;n<10&&this.feedIndex<this.level.passengers.length;n++){const next=(slot+n*4)%this.slots.length;if(this.feedSideAt(this.feedIndex)!==side||this.slots.slice(next,next+4).some(id=>id!==null))break;this.addRow(next,true,wave);wave+=4;}
    }
    this.boardClock+=dt;
    while(this.boardClock>=.08){this.boardClock-=.08;
      for(let slot=0;slot<this.slots.length;slot+=4){const row=this.rowAt(slot);if(row.length!==4||row.some(p=>p.state!=='loop'))continue;
        const phase=this.personPhase(row[0]);if(phase<.18||phase>.34)continue;
        const car=this.cars.find(c=>c.status==='boarding'&&c.remaining-c.reserved>=4&&c.spec.color===row[0].color);if(!car)continue;
        const connected=(index:number)=>{const group=this.rowAt(index);return group.length===4&&group.every(p=>p.state==='loop'&&p.color===car.spec.color);};
        const slots=[slot];for(const sign of [-1,1])for(let n=1;n<this.slots.length/4;n++){const index=(slot+sign*n*4+this.slots.length)%this.slots.length;if(slots.includes(index)||!connected(index))break;if(sign===-1)slots.unshift(index);else slots.push(index);}
        const people=slots.flatMap(index=>this.rowAt(index)).slice(0,Math.floor((car.remaining-car.reserved)/4)*4);
        people.forEach((p,index)=>{p.startPhase=this.personPhase(p);p.state='running';p.clock=-index*.012;p.vehicle=car.spec.id;this.slots[p.slot]=null;});car.reserved+=people.length;this.deadClock=0;break;
      }
    }
    const busy=this.shuffleClock>0||this.cars.some(c=>c.status==='travel'||c.status==='leaving'||c.reserved>0)||this.people.some(p=>p.state==='entering');
    const room=this.bays.some((b,i)=>this.isOpenBay(i)&&b===null);
    const reachable=new Set(this.people.filter(p=>p.state==='loop').map(p=>p.color));
    const useful=this.cars.some(c=>c.status==='boarding'&&c.remaining>0&&reachable.has(c.spec.color));
    const incomingCanAdvance=this.slots.some(x=>x===null)&&this.feedIndex<this.level.passengers.length;
    if(!busy&&!room&&!useful&&!incomingCanAdvance){this.deadClock+=dt;if(this.deadClock>2.5){this.state='fail';this.events.push({type:'fail'});}}else this.deadClock=0;
    if(this.cars.every(c=>c.status==='gone')){this.winClock+=dt;if(this.winClock>.25){this.state='win';this.events.push({type:'win'});}}
  }
}
