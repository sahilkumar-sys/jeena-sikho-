#!/usr/bin/env node
// FFmpeg renderer for approved 1080x1920 presenter framing and mixed local B-roll.
const fs=require('fs'),path=require('path'),{spawn,spawnSync}=require('child_process');
const {TRANSITION_EFFECTS}=require('./broll-transitions');
function run(command,args){const p=spawnSync(command,args,{encoding:'utf8'});if(p.error||p.status!==0)throw Error(`${command}: ${p.error||p.stderr||p.status}`);return p.stdout}
function probe(file){const j=JSON.parse(run('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type,width,height,sample_aspect_ratio:stream_tags=rotate:stream_side_data=rotation','-of','json',file]));const v=j.streams.find(x=>x.width&&x.height);if(!v)throw Error(`No video stream: ${file}`);const rot=Number((v.side_data_list||[]).find(x=>x.rotation!==undefined)?.rotation??v.tags?.rotate??0);const sar=String(v.sample_aspect_ratio||'1:1').split(':').map(Number);const ratio=sar[0]>0&&sar[1]>0?sar[0]/sar[1]:1;const turn=Math.abs(rot)%180===90;return {duration:Number(j.format.duration),width:v.width,height:v.height,displayWidth:turn?v.height:v.width*ratio,displayHeight:turn?v.width*ratio:v.height,rotation:rot,sar:ratio,audio:j.streams.some(x=>x.codec_type==='audio')}}
function filterPath(value){return String(value).replace(/\\/g,'/').replace(/:/g,'\\:').replace(/'/g,"\\'").replace(/,/g,'\\,')}
function validate(m,info){if(!Array.isArray(m.placements)||!m.placements.length)throw Error('Manifest needs B-roll placements.');let previous=null;for(const [i,p] of m.placements.entries()){if(!fs.existsSync(p.path))throw Error(`Missing media ${p.path}`);if(!['video','image'].includes(p.type))throw Error(`Invalid media type ${p.type}`);if(!TRANSITION_EFFECTS.includes(p.transition))throw Error(`Unsupported transition ${p.transition}`);if(!(p.start>=0&&p.duration>=2.5&&p.duration<=3.001&&p.start+p.duration<=info.duration+.02))throw Error(`Invalid 2.5–3.0 second timing at shot ${i+1}`);if(previous){const presenterGap=p.start-previous.start-previous.duration;if(presenterGap<1.98||presenterGap>5.02)throw Error(`Presenter gap outside 2-5 seconds: ${i+1}, ${presenterGap.toFixed(2)}`)}previous=p}}
async function render(m,onProgress=()=>{}){
  const info=probe(m.base_video);if(!info.audio)throw Error('Source must contain audio');validate(m,info);
  const orientation=info.displayWidth>info.displayHeight?'horizontal':'vertical';if(info.displayWidth===info.displayHeight)throw Error('Square source needs a framing choice');
  const portrait=orientation==='horizontal'
    ?(Math.abs(info.displayWidth/info.displayHeight-16/9)<.01?'scale=1080:608:flags=lanczos':'scale=1080:608:flags=lanczos:force_original_aspect_ratio=increase,crop=1080:608')+',pad=1080:1920:0:656:color=white,setsar=1'
    :(info.width===1080&&info.height===1920&&info.rotation===0&&Math.abs(info.sar-1)<.001?'null':'scale=1080:1920:flags=lanczos:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1');
  const sw=Math.round(1080*3.01),sh=Math.round(606*3),x=Math.round((1080-sw)/2-30),y=Math.round((1920-sh)/2+48);
  const filters=m.avatar_composite?.enabled===false
    ?[`[0:v]${portrait},setsar=1[base]`]
    :[`color=c=0xB69966:s=1080x1920:r=25:d=${info.duration},format=rgba[bg]`,
      `[0:v]${portrait},crop=1080:606:0:657,despill=type=green:mix=0.65,scale=${sw}:${sh},format=yuva420p,colorchannelmixer=aa=1,chromakey=0x88b943:0.075:0.025,format=yuva420p[fg]`,
      `[bg][fg]overlay=x=${x}:y=${y}:shortest=1:eof_action=pass,setsar=1[base]`];
  const args=['-y','-hide_banner','-loglevel','error','-filter_complex_threads','2','-progress','pipe:1','-stats_period','2','-i',m.base_video];
  const reused={},infos={};let current='base';
  for(const [i,p] of m.placements.entries()){
    const meta=infos[p.path]||=probe(p.path),n=i+1;
    if(p.type==='video'){
      const used=reused[p.path]||0;reused[p.path]=used+1;
      const maxSeek=Math.max(0,meta.duration-p.duration-.1);
      const seek=maxSeek>0?(used*2.31)%maxSeek:0;
      args.push('-ss',seek.toFixed(3),'-i',p.path);
      filters.push(`[${n}:v]fps=25,scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos,crop=1080:1920,setsar=1,trim=duration=${p.duration},settb=AVTB,setpts=PTS-STARTPTS,format=rgba[src${i}]`);
    }else{
      args.push('-loop','1','-framerate','25','-i',p.path);
      const bg=p.category==='social'?'0x161616':'0xF4EEE3';
      const zoomTo=Number(p.zoom_to || (p.category==='social'?1.035:p.category==='product'?1.045:p.category==='hospital'?1.065:1.12));
      const frames=Math.max(1,Math.round(p.duration*25)-1);
      const fillPortrait=meta.width/meta.height<=0.72&&!['product','social','hospital'].includes(p.category);
      const fit=fillPortrait?'scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos,crop=1080:1920'
        :`scale=1080:1300:force_original_aspect_ratio=decrease:flags=lanczos,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=${bg}`;
      filters.push(`[${n}:v]fps=25,${fit},setsar=1,zoompan=z='min(${zoomTo},1+${(zoomTo-1).toFixed(4)}*on/${frames})':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=1080x1920:fps=25,trim=duration=${p.duration},settb=AVTB,setpts=PTS-STARTPTS,format=rgba[src${i}]`);
    }
    const td=Math.min(.35,p.duration/3),out=Math.max(0,p.duration-.25);
    filters.push(`color=c=black:s=1080x1920:r=25:d=${td},format=rgba,colorchannelmixer=aa=0,settb=AVTB,setpts=PTS-STARTPTS[blank${i}]`);
    filters.push(`[blank${i}][src${i}]xfade=transition=${p.transition}:duration=${td}:offset=0,format=rgba,fade=t=out:st=${out}:d=0.25:alpha=1,setpts=PTS-STARTPTS+${p.start}/TB[roll${i}]`);
    filters.push(`[${current}][roll${i}]overlay=0:0:shortest=0:eof_action=pass:enable='between(t,${p.start},${(p.start+p.duration).toFixed(3)})'[mix${i}]`);
    current=`mix${i}`;
  }
  for(const [i,o] of (m.phone_overlays||[]).entries()){
    if(o.start<0||o.end<=o.start||o.end>info.duration)throw Error('Invalid phone overlay timing');
    filters.push(`[${current}]drawtext=fontfile='${filterPath(m.phone_font)}':text='82704-82704':fontsize=106:fontcolor=white:borderw=3:bordercolor=0x263626:box=1:boxcolor=0x18442CE0:boxborderw=24:x=(w-text_w)/2:y=220:enable='between(t,${o.start},${o.end})'[phone${i}]`);
    current=`phone${i}`;
  }
  filters.push(`[${current}]subtitles=filename='${filterPath(m.subtitles_ass)}':fontsdir='${filterPath(m.fonts_dir)}'[captioned]`);
  const temp=m.output_video.replace(/\.mp4$/i,'.partial.mp4');fs.mkdirSync(path.dirname(temp),{recursive:true});
  const encoder=process.env.VIDEO_ENCODER||'libx264';
  const videoOptions=encoder==='h264_nvenc'?['-c:v','h264_nvenc','-preset','p4','-cq','21','-b:v','5M']:['-c:v','libx264','-preset','veryfast','-crf','20'];
  args.push('-filter_complex',filters.join(';'),'-map','[captioned]','-map','0:a:0','-t',String(info.duration),...videoOptions,'-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart',temp);
  const log=fs.createWriteStream(m.output_video.replace(/\.mp4$/i,'.ffmpeg.log'));
  await new Promise((resolve,reject)=>{const proc=spawn('ffmpeg',args,{stdio:['ignore','pipe','pipe']});let pending='';proc.stdout.on('data',d=>{pending+=d;const lines=pending.split(/\r?\n/);pending=lines.pop();for(const line of lines){const hit=/^out_time=(\d\d):(\d\d):(\d\d(?:\.\d+)?)$/.exec(line);if(hit)onProgress(Math.min(99.5,(Number(hit[1])*3600+Number(hit[2])*60+Number(hit[3]))/info.duration*100))}});proc.stderr.on('data',d=>log.write(d));proc.on('error',reject);proc.on('close',code=>{log.end();if(code===0)resolve();else reject(Error(`FFmpeg exit ${code}; inspect ${m.output_video.replace(/\.mp4$/i,'.ffmpeg.log')}`))})});
  fs.renameSync(temp,m.output_video);const out=probe(m.output_video);if(out.width!==1080||out.height!==1920||!out.audio||Math.abs(out.duration-info.duration)>.5)throw Error(`Output verification failed: ${JSON.stringify(out)}`);
  onProgress(100);return {orientation,duration:info.duration,width:out.width,height:out.height,shots:m.placements.length};
}
module.exports={render,probe};
if(require.main===module){const file=process.argv[2];if(!file)throw Error('Usage: node render-mixed-broll.js <manifest.json>');const m=JSON.parse(fs.readFileSync(file,'utf8'));render(m,p=>process.stdout.write(`PROGRESS=${p.toFixed(1)}\n`)).then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error(e.stack||e);process.exitCode=1})}
