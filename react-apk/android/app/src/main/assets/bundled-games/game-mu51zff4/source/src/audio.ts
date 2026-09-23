/** Reconstructed, lightweight procedural SFX. No mixed screen-recording audio is used as a sound effect. */
export class GameAudio {
  context?:AudioContext;master?:GainNode;enabled=true;music=false;private musicClock=0;private noteIndex=0;private lastBoard=0;
  unlock(){if(!this.context){const Audio=window.AudioContext||(window as unknown as {webkitAudioContext:typeof AudioContext}).webkitAudioContext;if(!Audio)return;this.context=new Audio();this.master=this.context.createGain();this.master.gain.value=.80;const limiter=this.context.createDynamicsCompressor();limiter.threshold.value=-6;limiter.knee.value=6;limiter.ratio.value=8;limiter.attack.value=.003;limiter.release.value=.15;this.master.connect(limiter);limiter.connect(this.context.destination);}if(this.context.state==='suspended')void this.context.resume();}
  private tone(freq:number,duration:number,volume:number,type:OscillatorType='sine',delay=0,to?:number){if(!this.context||!this.master||!this.enabled)return;const t=this.context.currentTime+delay,o=this.context.createOscillator(),g=this.context.createGain();o.type=type;o.frequency.setValueAtTime(freq,t);if(to)o.frequency.exponentialRampToValueAtTime(to,t+duration);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(volume,t+.007);g.gain.exponentialRampToValueAtTime(.0001,t+duration);o.connect(g);g.connect(this.master);o.start(t);o.stop(t+duration+.01);o.onended=()=>{o.disconnect();g.disconnect();};}
  private departure(){if(!this.context||!this.master||!this.enabled)return;const ctx=this.context,t=ctx.currentTime,length=.28,buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*length),ctx.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*.4;const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();source.buffer=buffer;filter.type='lowpass';filter.frequency.setValueAtTime(340,t);filter.frequency.linearRampToValueAtTime(1100,t+.12);filter.frequency.linearRampToValueAtTime(220,t+length);gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(.28,t+.04);gain.gain.exponentialRampToValueAtTime(.0001,t+length);source.connect(filter);filter.connect(gain);gain.connect(this.master);source.start(t);source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};this.tone(115,.27,.19,'triangle',0,280);this.tone(230,.20,.07,'sine',.03,460);}
  play(event:string){if(!this.context)this.unlock();switch(event){
    case'tap':this.tone(720,.065,.17,'sine',0,450);break;
    case'blocked':this.tone(145,.12,.24,'triangle',0,95);break;
    case'dispatch':this.departure();break;
    case'board':{const now=this.context?.currentTime||0;if(now-this.lastBoard<.06)break;this.lastBoard=now;this.tone(700+(this.noteIndex++%5)*80,.048,.09);break;}
    case'full':[740,990,1245].forEach((f,i)=>this.tone(f,.18,.11,'sine',i*.045));break;
    case'win':[523,659,784,1047,1319].forEach((f,i)=>this.tone(f,.48,.18,'triangle',i*.12));break;
    case'fail':[392,330,247,196].forEach((f,i)=>this.tone(f,.27,.17,'triangle',i*.13));break;
    case'arrange':case'shuffle':[440,587,784].forEach((f,i)=>this.tone(f,.20,.14,'sine',i*.06));break;
    case'vip':[440,660,880,1320].forEach((f,i)=>this.tone(f,.23,.12,'sine',i*.07));break;
  }}
  tick(dt:number,paused:boolean){if(paused||!this.music||!this.enabled)return;this.musicClock+=dt;if(this.musicClock>.45){this.musicClock=0;const melody=[523,659,784,659,587,698,880,698];this.tone(melody[this.noteIndex++%8],.42,.028,'sine');}}
  suspend(){if(this.context?.state==='running')void this.context.suspend();}
}
