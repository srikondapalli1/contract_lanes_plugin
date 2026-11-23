#!/usr/bin/env node
import { createRequire as __lanesRequire } from "node:module"; const require = __lanesRequire(import.meta.url);
import{VERSION_STR}from"./chunks/chunk-IUYGFEIA.mjs";import"./chunks/chunk-UMKASGBC.mjs";import"./chunks/chunk-D5NHXJC4.mjs";import"./chunks/chunk-5RTKHCUT.mjs";var BOOL=new Set(["json","fast","ci","file-blockers","labels","submit","cleanup","once","yes","no-serve","push","help","version","staged","install","force"]);function parseArgs(argv){let out={_:[]};for(let i=0;i<argv.length;i++){let a=argv[i];if(a==="--"){out._.push(...argv.slice(i+1));break}if(a.startsWith("--")){let eq=a.indexOf("="),key=eq>0?a.slice(2,eq):a.slice(2);eq>0?out[key]=a.slice(eq+1):BOOL.has(key)||argv[i+1]===void 0||argv[i+1].startsWith("--")?out[key]=!0:out[key]=argv[++i]}else a==="-h"?out.help=!0:out._.push(a)}return out}var str=v=>typeof v=="string"?v:void 0,num=v=>typeof v=="string"&&v!==""&&!Number.isNaN(Number(v))?Number(v):void 0;var HELP=`lanes ${VERSION_STR}: contract-first parallel development for coding agents

  lanes init [--laptops n --sessions n --hours n] [--lanes a,b,c] [--labels] [--yes]
  lanes join <lane>                     bind this worktree to a lane
  lanes check [--lane l] [--fast] [--ci] [--json] [--seed n|random] [--file-blockers] [--pr n]
  lanes lock [--allow-open n]           lock contracts (ends setup phase)
  lanes msg <lane> --type request|notice|blocker [--contract C] "<text>"
  lanes watch --lane <l> [--once]       wait for actionable issues (background)
  lanes fix <issue> [--submit | --escalate "reason" | --cleanup]
  lanes queue                           merge queue (CI)
  lanes graph [--port 4517] [--no-serve]
  lanes status
  lanes override <paths...> [--push] --reason "why"
  lanes invite @handle [--lane l]       add a teammate: collaborator, lane owner, their setup prompt
  lanes autopilot on|off
  lanes doctor
  lanes codeowners
  lanes hook <session-start|prompt|guard|stop>   (plugin internal)

Exit codes: 0 ok \xB7 1 failures \xB7 2 config/usage error.`;async function main(argv){let a=parseArgs(argv),[cmd,...rest]=a._,cwd=process.cwd(),print=s=>s&&process.stdout.write(s.endsWith(`
`)?s:s+`
`);if(a.version||cmd==="version")return print(VERSION_STR),0;if(!cmd||a.help||cmd==="help")return print(HELP),cmd||a.help?0:2;if(cmd==="hook"){let{runHook}=await import("./chunks/hooks-4KWO3AMR.mjs"),r=await runHook(rest[0]??"");return r.stdout&&process.stdout.write(r.stdout.endsWith(`
`)?r.stdout:r.stdout+`
`),r.stderr&&process.stderr.write(r.stderr),r.exit}if(cmd==="guard"){let{findRoot}=await import("./chunks/fs-GF3TD3XJ.mjs"),root=findRoot(cwd);if(!root)return 0;if(a.trailers!==void 0)return(await import("./chunks/commands-FLAQATLQ.mjs")).trailers(root,str(a.trailers)??rest[0]??""),0;let{guardStaged}=await import("./chunks/guard-GY4YVZWP.mjs"),{readBinding}=await import("./chunks/local-YNJP6BHC.mjs"),{currentBranch}=await import("./chunks/git-EII7FTE2.mjs");return guardStaged(root,readBinding(root),currentBranch(root))}let C=await import("./chunks/commands-FLAQATLQ.mjs");try{switch(cmd){case"init":{let{findRoot}=await import("./chunks/fs-GF3TD3XJ.mjs"),existing=findRoot(cwd);if(existing&&a.labels){let G=await import("./chunks/github-VLG5D4GL.mjs");return print(await G.initGitHub(existing)),0}let r=await C.init(cwd,{laptops:num(a.laptops),sessions:num(a.sessions),hours:num(a.hours),lanes:str(a.lanes),yes:!!a.yes,owner:str(a.owner),pkg:str(a.pkg)});if(print(`Initialized lanes in ${r.root}
${r.created.map(f=>`  + ${f}`).join(`
`)}`),r.warnings.forEach(w=>print(`  ! ${w}`)),a.labels){let G=await import("./chunks/github-VLG5D4GL.mjs");print(await G.initGitHub(r.root))}return print(`
Next:
  1. npm install                      (installs contract-lanes, vitest, zod)
  2. npx lanes check                  (green on the first run)
  3. git add -A && git commit -m "lanes init"
  4. npx lanes invite @teammate --lane <lane>   (sends them a copy-paste setup prompt)
  5. npx lanes join <lane>            (one lane per session/worktree), build, then npx lanes lock`),0}case"join":return print(C.join_(cwd,rest[0])),0;case"check":{let{runCheck,formatReport}=await import("./chunks/check-R2HZJIQD.mjs"),seed=a.seed==="random"?void 0:num(a.seed),r=await runCheck({cwd,lane:str(a.lane),fast:!!a.fast,ci:!!a.ci,seed});if(r.root&&!r.configError&&(a["file-blockers"]||a.pr)){let G=await import("./chunks/github-VLG5D4GL.mjs");a["file-blockers"]&&print(await G.fileBlockers(r.root,r.cfg,r.report)),a.pr&&print(await G.prCheck(r.root,r.cfg,r.report,Number(a.pr)))}return print(a.json?JSON.stringify(r.report,null,2):formatReport(r.report,r.exit)),r.exit}case"lock":{let r=await C.lock(cwd,num(a["allow-open"])??0);return print(r.text),r.exit}case"override":return print(C.override(cwd,rest,str(a.reason),!!a.push)),0;case"codeowners":{let{findRoot}=await import("./chunks/fs-GF3TD3XJ.mjs"),{loadConfig}=await import("./chunks/config-DD765HRF.mjs"),root=findRoot(cwd),cfg=root&&loadConfig(root).cfg;if(!root||!cfg)throw new C.UsageError("no valid lanes.yaml");return C.writeCodeowners(root,cfg),print("wrote .github/CODEOWNERS"),0}case"doctor":{let r=await C.doctor(cwd);return print(r.text),r.exit}case"graph":{let{graph}=await import("./chunks/server-7Y5CO7ME.mjs");return graph(cwd,{port:num(a.port)??4517,serve:!a["no-serve"]})}case"msg":{let G=await import("./chunks/github-VLG5D4GL.mjs");return print(await G.msgCommand(cwd,rest[0],{type:str(a.type),contract:str(a.contract),key:str(a.key),text:rest.slice(1).join(" ")})),0}case"invite":{let G=await import("./chunks/github-VLG5D4GL.mjs");return print(await G.inviteCommand(cwd,rest[0],str(a.lane))),0}case"autopilot":{let G=await import("./chunks/github-VLG5D4GL.mjs");return print(await G.autopilotCommand(cwd,rest[0])),0}case"watch":return(await import("./chunks/watch-N6BFAOYR.mjs")).watch(cwd,{lane:str(a.lane),once:!!a.once,maxMinutes:num(a["max-minutes"]),interval:num(a.interval)});case"fix":return(await import("./chunks/fix-HJIIUC42.mjs")).fixCommand(cwd,rest[0],{submit:!!a.submit,escalate:str(a.escalate),cleanup:!!a.cleanup});case"queue":return(await import("./chunks/queue-C7MXR54O.mjs")).queue(cwd,{budgetMin:num(a["budget-min"])??20});case"status":{let S=await import("./chunks/status-QDTAYQMS.mjs");return print(await S.status(cwd,{json:!!a.json})),0}default:return print(`unknown command "${cmd}"

${HELP}`),2}}catch(e){return e instanceof C.UsageError||e?.name==="UsageError"?(process.stderr.write(`lanes: ${e.message}
`),2):(process.stderr.write(`lanes: ${e?.stack??e}
`),1)}}main(process.argv.slice(2)).then(code=>{process.exitCode=code},e=>{process.stderr.write(String(e?.stack??e)+`
`),process.exitCode=1});
