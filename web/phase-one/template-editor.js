const storageKey='atlas-template-studio-v1';
const defaults=Object.freeze({
  brandName:'Atlas',firmName:'Atlas Demo Law',
  navigation:'Home\nWorkspace\nCases\nEmail\nCalendar\nTasks\nClients\nDocuments\nCommunications\nAccounting',
  heroEyebrow:'AI Command Center',heroTitle:'Atlas Command',
  heroDescription:'Your continuously aware digital twin can navigate the platform, analyze authorized firm knowledge, and prepare legal work for attorney approval.',
  assistantEyebrow:'Primary AI workspace',assistantTitle:'What do you need?',
  assistantDescription:'Navigate Atlas, ask a question, or request work.',assistantPlaceholder:'Ask or request anything',assistantButton:'Ask Atlas',
  inboxEyebrow:'Attorney inbox',inboxTitle:'While You Were Gone',inboxMessage:'No unreviewed activity needs your attention.',
  signalsEyebrow:'Live canonical signals',signalsTitle:'Firm pulse',panelOrder:'inbox',
  navy:'#14375c',accent:'#315d8a',background:'#f3f6fa',font:'editorial',radius:'18'
});
const icons=['◈','✦','▣','@','◷','✓','◎','≡','↔'];
const form=document.getElementById('editorForm');
const preview=document.getElementById('preview');
const status=document.getElementById('saveState');
const radiusOutput=document.getElementById('radiusOutput');
let settings=load();

function clean(value){return String(value??'').replace(/[<>]/g,'').slice(0,2000);}
function normalized(input={}){const result={...defaults};for(const key of Object.keys(defaults)){if(input[key]!==undefined)result[key]=clean(input[key]);}if(!/^#[0-9a-f]{6}$/i.test(result.navy))result.navy=defaults.navy;if(!/^#[0-9a-f]{6}$/i.test(result.accent))result.accent=defaults.accent;if(!/^#[0-9a-f]{6}$/i.test(result.background))result.background=defaults.background;if(!['editorial','modern','classic'].includes(result.font))result.font=defaults.font;if(!['inbox','signals'].includes(result.panelOrder))result.panelOrder=defaults.panelOrder;result.radius=String(Math.min(28,Math.max(4,Number(result.radius)||18)));return result;}
function storedValue(){try{return localStorage.getItem(storageKey);}catch{return null;}}
function load(){try{return normalized(JSON.parse(storedValue()||'{}'));}catch{return {...defaults};}}
function announce(message,saved=false){status.innerHTML=`<i></i><span>${message}</span>`;status.querySelector('i').style.background=saved?'#44a077':'#d69a3a';}
function fontValue(name){if(name==='modern')return 'Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';if(name==='classic')return 'Georgia,"Times New Roman",serif';return 'Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';}
function fillForm(){for(const [key,value] of Object.entries(settings)){const field=form.elements.namedItem(key);if(field)field.value=value;}}
function renderNavigation(){const labels=settings.navigation.split(/\n|,/).map(item=>item.trim()).filter(Boolean).slice(0,12);document.getElementById('previewNav').innerHTML=labels.map((label,index)=>`<button type="button"><span class="nav-dot">${icons[index%icons.length]}</span><span>${clean(label)}</span></button>`).join('');}
function render(){
  document.documentElement.style.setProperty('--preview-navy',settings.navy);document.documentElement.style.setProperty('--preview-accent',settings.accent);document.documentElement.style.setProperty('--preview-bg',settings.background);document.documentElement.style.setProperty('--preview-radius',`${settings.radius}px`);document.documentElement.style.setProperty('--preview-font',fontValue(settings.font));
  preview.dataset.font=settings.font;document.querySelectorAll('[data-edit]').forEach(element=>{const key=element.dataset.edit;if(document.activeElement!==element)element.textContent=settings[key]??'';});
  document.getElementById('previewInbox').style.order=settings.panelOrder==='inbox'?'-1':'1';document.getElementById('previewSignals').style.order=settings.panelOrder==='signals'?'-1':'1';radiusOutput.textContent=`${settings.radius}px`;renderNavigation();
}
function updateFromForm(){const data=new FormData(form);settings=normalized({...settings,...Object.fromEntries(data.entries())});render();announce('Unsaved changes');}
function save(){try{localStorage.setItem(storageKey,JSON.stringify(settings));announce('Template saved on this Mac',true);}catch{announce('Browser storage is unavailable — use Download JSON');}}
function download(){const blob=new Blob([JSON.stringify(settings,null,2)],{type:'application/json'});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='atlas-template-settings.json';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),0);announce('Settings downloaded',true);}
async function copy(){try{await navigator.clipboard.writeText(JSON.stringify(settings,null,2));announce('Settings copied',true);}catch{announce('Clipboard unavailable — use Download JSON');}}
function reset(){settings={...defaults};fillForm();render();try{localStorage.removeItem(storageKey);}catch{}announce('Restored Atlas defaults');}
async function importFile(file){try{settings=normalized(JSON.parse(await file.text()));fillForm();render();save();}catch{announce('That file is not a valid Atlas template');}}

form.addEventListener('input',updateFromForm);form.addEventListener('change',updateFromForm);
document.querySelectorAll('[data-edit]').forEach(element=>element.addEventListener('input',()=>{const key=element.dataset.edit;settings=normalized({...settings,[key]:element.textContent});const field=form.elements.namedItem(key);if(field)field.value=settings[key];announce('Unsaved changes');}));
document.getElementById('saveTemplate').addEventListener('click',save);document.getElementById('exportTemplate').addEventListener('click',download);document.getElementById('copyTemplate').addEventListener('click',copy);document.getElementById('resetTemplate').addEventListener('click',reset);document.getElementById('importTemplate').addEventListener('change',event=>{const [file]=event.target.files;if(file)void importFile(file);event.target.value='';});
fillForm();render();announce(storedValue()?'Saved template loaded':'Changes are local to this browser',Boolean(storedValue()));
