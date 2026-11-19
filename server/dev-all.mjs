import { spawn } from 'node:child_process';
const npm=process.platform==='win32'?'npm.cmd':'npm';
const children=[spawn(npm,['run','dev'],{stdio:'inherit',shell:process.platform==='win32'}),spawn(process.execPath,['server/server.mjs'],{stdio:'inherit'})];
const stop=()=>{for(const child of children)if(!child.killed)child.kill('SIGTERM');};
process.on('SIGINT',()=>{stop();process.exit(0)});process.on('SIGTERM',()=>{stop();process.exit(0)});
for(const child of children)child.on('exit',(code)=>{if(code&&code!==0){stop();process.exit(code)}});
