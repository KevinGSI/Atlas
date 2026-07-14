const storageKey='atlas-template-studio-v2';

const defaults=Object.freeze({
  preset:'harbor',brandName:'Atlas',firmName:'Atlas Demo Law',firmPlan:'Pilot firm · 10 seats',
  navigation:'Home\nWorkspace\nEvents\nCases\nEmail\nCalendar\nTasks\nLegal Research\nContacts\nDocuments\nCommunications\nAccounting',
  pageTitle:'Home',systemStatus:'Native firm intelligence active',
  heroEyebrow:'Continuously aware digital twin',heroTitle:'Good morning, Kevin.',
  heroDescription:'Atlas has reviewed the firm’s authorized activity and prepared the work that needs your attention.',
  readinessOne:'Firm knowledge connected',readinessTwo:'Canonical work synchronized',readinessThree:'Human approval enforced',
  assistantEyebrow:'Atlas command workspace',assistantTitle:'What do you need?',
  assistantDescription:'Ask a question, open a case, or have Atlas prepare work for your review.',assistantPlaceholder:'Ask or request anything…',assistantButton:'Ask Atlas',
  suggestionOne:'Prioritize today',suggestionTwo:'Summarize recent cases',suggestionThree:'Find motions to compel',suggestionFour:'Prepare legal work',
  inboxEyebrow:'Attorney inbox',inboxTitle:'While You Were Gone',inboxBadge:'3 to review',inboxMessage:'Atlas prepared a discovery response, identified a new deadline, and drafted a client follow-up.',
  signalsEyebrow:'Live canonical signals',signalsTitle:'Firm pulse',signalsBadge:'Live',
  signalOneValue:'18',signalOneLabel:'Open cases',signalTwoValue:'7',signalTwoLabel:'Active tasks',signalThreeValue:'4',signalThreeLabel:'Deadlines',signalFourValue:'3',signalFourLabel:'Needs review',
  accountLabel:'Account Info',settingsLabel:'Settings',panelOrder:'inbox',
  sidebar:'#102a43',sidebarText:'#eff6ff',accent:'#2f6fed',accentSoft:'#eaf1ff',background:'#eef3f8',surface:'#ffffff',text:'#122033',muted:'#617188',line:'#d5deea',success:'#1b8a63',heroText:'#ffffff',
  font:'modern',headingFont:'editorial',radius:'18',spacing:'comfortable',sidebarWidth:'228',shadow:'soft',layout:'split',heroStyle:'gradient',navStyle:'pill',cardStyle:'bordered'
});

const presets={
  harbor:{
    ...defaults,preset:'harbor',sidebar:'#102a43',accent:'#2f6fed',accentSoft:'#eaf1ff',background:'#eef3f8',surface:'#ffffff',text:'#122033',muted:'#617188',line:'#d5deea',success:'#1b8a63',heroText:'#ffffff',font:'modern',headingFont:'editorial',radius:'18',spacing:'comfortable',sidebarWidth:'228',shadow:'soft',layout:'split',heroStyle:'gradient',navStyle:'pill',cardStyle:'bordered'
  },
  kinetic:{
    ...defaults,preset:'kinetic',heroEyebrow:'Atlas is already working',heroTitle:'Your firm, in motion.',heroDescription:'A brighter command center for fast-moving practices. Review what changed, decide what matters, and keep work moving.',sidebar:'#17142b',sidebarText:'#fff7ef',accent:'#ff5a36',accentSoft:'#fff0eb',background:'#fff8f1',surface:'#ffffff',text:'#211b2f',muted:'#756b80',line:'#eadbd1',success:'#1b966e',heroText:'#fffaf6',font:'modern',headingFont:'modern',radius:'22',spacing:'airy',sidebarWidth:'236',shadow:'bold',layout:'bento',heroStyle:'spotlight',navStyle:'blocks',cardStyle:'lifted'
  },
  nocturne:{
    ...defaults,preset:'nocturne',heroEyebrow:'Private firm intelligence',heroTitle:'Everything important. One view.',heroDescription:'A focused, high-contrast workspace that keeps the firm’s signals, decisions, and legal work connected.',sidebar:'#080d17',sidebarText:'#eaf8f3',accent:'#25c69a',accentSoft:'#153a35',background:'#0e1522',surface:'#151f2e',text:'#edf5ff',muted:'#9babc0',line:'#2b3a4e',success:'#38d7a6',heroText:'#effff9',font:'modern',headingFont:'modern',radius:'14',spacing:'compact',sidebarWidth:'220',shadow:'none',layout:'split',heroStyle:'solid',navStyle:'line',cardStyle:'glass'
  },
  editorial:{
    ...defaults,preset:'editorial',heroEyebrow:'The daily brief',heroTitle:'Clarity for the work ahead.',heroDescription:'A calm legal workspace with an editorial rhythm, strong hierarchy, and fewer visual distractions.',sidebar:'#3b2030',sidebarText:'#fff8f1',accent:'#b76545',accentSoft:'#f5e8df',background:'#f4efe8',surface:'#fffdf9',text:'#2d2425',muted:'#756969',line:'#ded2c7',success:'#587a62',heroText:'#fffaf4',font:'classic',headingFont:'classic',radius:'8',spacing:'airy',sidebarWidth:'242',shadow:'none',layout:'editorial',heroStyle:'editorial',navStyle:'line',cardStyle:'minimal'
  }
};

const icons=['⌂','✦','◫','▣','@','◷','✓','§','◎','▤','↔','◉'];
const form=document.getElementById('editorForm');
const preview=document.getElementById('preview');
const status=document.getElementById('saveState');
const radiusOutput=document.getElementById('radiusOutput');
const sidebarOutput=document.getElementById('sidebarOutput');
let settings=load();

function clean(value){return String(value??'').replace(/[<>]/g,'').slice(0,4000);}
function validColor(value,fallback){return /^#[0-9a-f]{6}$/i.test(value)?value:fallback;}
function normalized(input={}){
  const result={...defaults};
  for(const key of Object.keys(defaults)){if(input[key]!==undefined)result[key]=clean(input[key]);}
  for(const key of ['sidebar','sidebarText','accent','accentSoft','background','surface','text','muted','line','success','heroText'])result[key]=validColor(result[key],defaults[key]);
  if(!['modern','classic','humanist'].includes(result.font))result.font=defaults.font;
  if(!['modern','classic','editorial'].includes(result.headingFont))result.headingFont=defaults.headingFont;
  if(!['compact','comfortable','airy'].includes(result.spacing))result.spacing=defaults.spacing;
  if(!['none','soft','bold'].includes(result.shadow))result.shadow=defaults.shadow;
  if(!['split','bento','editorial'].includes(result.layout))result.layout=defaults.layout;
  if(!['gradient','spotlight','solid','editorial'].includes(result.heroStyle))result.heroStyle=defaults.heroStyle;
  if(!['pill','blocks','line'].includes(result.navStyle))result.navStyle=defaults.navStyle;
  if(!['bordered','lifted','glass','minimal'].includes(result.cardStyle))result.cardStyle=defaults.cardStyle;
  if(!['inbox','signals'].includes(result.panelOrder))result.panelOrder=defaults.panelOrder;
  result.radius=String(Math.min(34,Math.max(0,Number(result.radius)||18)));
  result.sidebarWidth=String(Math.min(310,Math.max(180,Number(result.sidebarWidth)||228)));
  return result;
}
function storedValue(){try{return localStorage.getItem(storageKey);}catch{return null;}}
function load(){try{return normalized(JSON.parse(storedValue()||'{}'));}catch{return {...defaults};}}
function announce(message,saved=false){status.innerHTML='<i></i><span></span>';status.querySelector('span').textContent=message;status.querySelector('i').style.background=saved?'#44a077':'#d69a3a';}
function bodyFont(name){if(name==='classic')return 'Georgia,"Times New Roman",serif';if(name==='humanist')return 'Avenir Next,Avenir,"Segoe UI",sans-serif';return 'Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';}
function headingFont(name){if(name==='classic')return 'Georgia,"Times New Roman",serif';if(name==='editorial')return 'Iowan Old Style,Palatino Linotype,Georgia,serif';return 'Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';}
function fillForm(){for(const [key,value] of Object.entries(settings)){const field=form.elements.namedItem(key);if(field)field.value=value;}}
function renderNavigation(){
  const host=document.getElementById('previewNav');host.replaceChildren();
  const labels=settings.navigation.split(/\n|,/).map(item=>item.trim()).filter(Boolean).slice(0,16);
  labels.forEach((label,index)=>{const button=document.createElement('button');button.type='button';const icon=document.createElement('span');icon.className='nav-dot';icon.textContent=icons[index%icons.length];const text=document.createElement('span');text.textContent=label;button.append(icon,text);host.append(button);});
}
function render(){
  const root=document.documentElement;
  for(const [variable,key] of [['--preview-sidebar','sidebar'],['--preview-sidebar-text','sidebarText'],['--preview-accent','accent'],['--preview-accent-soft','accentSoft'],['--preview-bg','background'],['--preview-surface','surface'],['--preview-text','text'],['--preview-muted','muted'],['--preview-line','line'],['--preview-success','success'],['--preview-hero-text','heroText']])root.style.setProperty(variable,settings[key]);
  root.style.setProperty('--preview-radius',`${settings.radius}px`);root.style.setProperty('--preview-sidebar-width',`${settings.sidebarWidth}px`);root.style.setProperty('--preview-font',bodyFont(settings.font));root.style.setProperty('--preview-heading-font',headingFont(settings.headingFont));
  preview.dataset.spacing=settings.spacing;preview.dataset.shadow=settings.shadow;preview.dataset.layout=settings.layout;preview.dataset.hero=settings.heroStyle;preview.dataset.nav=settings.navStyle;preview.dataset.cards=settings.cardStyle;
  document.querySelectorAll('[data-edit]').forEach(element=>{const key=element.dataset.edit;if(document.activeElement!==element)element.textContent=settings[key]??'';});
  document.getElementById('previewInbox').style.order=settings.panelOrder==='inbox'?'-1':'1';document.getElementById('previewSignals').style.order=settings.panelOrder==='signals'?'-1':'1';
  radiusOutput.textContent=`${settings.radius}px`;sidebarOutput.textContent=`${settings.sidebarWidth}px`;renderNavigation();
  document.querySelectorAll('[data-preset]').forEach(button=>button.classList.toggle('active',button.dataset.preset===settings.preset));
}
function updateFromForm(){const data=new FormData(form);settings=normalized({...settings,...Object.fromEntries(data.entries()),preset:'custom'});render();announce('Unsaved changes');}
function applyPreset(name){if(!presets[name])return;settings=normalized({...presets[name]});fillForm();render();announce(`${name[0].toUpperCase()+name.slice(1)} sample loaded — customize anything`);}
function save(){try{localStorage.setItem(storageKey,JSON.stringify(settings));announce('Template saved on this Mac',true);}catch{announce('Browser storage is unavailable — use Download JSON');}}
function download(){const blob=new Blob([JSON.stringify(settings,null,2)],{type:'application/json'});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='atlas-template-settings.json';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),0);announce('Editable settings downloaded',true);}
async function copy(){try{await navigator.clipboard.writeText(JSON.stringify(settings,null,2));announce('Settings copied',true);}catch{announce('Clipboard unavailable — use Download JSON');}}
function reset(){settings={...defaults};fillForm();render();try{localStorage.removeItem(storageKey);}catch{}announce('Restored Atlas defaults');}
async function importFile(file){try{settings=normalized(JSON.parse(await file.text()));fillForm();render();save();}catch{announce('That file is not a valid Atlas template');}}

form.addEventListener('input',updateFromForm);form.addEventListener('change',updateFromForm);
document.querySelectorAll('[data-edit]').forEach(element=>element.addEventListener('input',()=>{const key=element.dataset.edit;settings=normalized({...settings,[key]:element.textContent,preset:'custom'});const field=form.elements.namedItem(key);if(field)field.value=settings[key];announce('Unsaved changes');}));
document.querySelectorAll('[data-preset]').forEach(button=>button.addEventListener('click',()=>applyPreset(button.dataset.preset)));
document.getElementById('saveTemplate').addEventListener('click',save);document.getElementById('exportTemplate').addEventListener('click',download);document.getElementById('copyTemplate').addEventListener('click',copy);document.getElementById('resetTemplate').addEventListener('click',reset);document.getElementById('importTemplate').addEventListener('change',event=>{const [file]=event.target.files;if(file)void importFile(file);event.target.value='';});
fillForm();render();announce(storedValue()?'Saved template loaded':'Choose a sample or edit every detail',Boolean(storedValue()));
